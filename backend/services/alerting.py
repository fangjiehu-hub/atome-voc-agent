"""Alerting service: Slack + Lark + Email. Immediate / Queue / Digest."""

import logging
from datetime import datetime, timedelta

import httpx
from sqlalchemy import and_, select

from backend.config import settings
from backend.database import async_session
from backend.models.alert import Alert
from backend.models.incident import Incident
from backend.models.lark_bot import LarkBot
from backend.models.routing import RoutingRule

logger = logging.getLogger(__name__)

SEVERITY_CADENCE = {
    "critical": "immediate",
    "high": "immediate",
    "medium": "queue",
    "low": "digest",
    "none": "digest",
}


async def _resolve_lark_webhooks(recipients: list[str], db) -> list[tuple[str, str]]:
    """Return list of (team_name, webhook_url) for each recipient with an active Lark bot."""
    if not recipients:
        return []
    bots = (
        await db.execute(
            select(LarkBot).where(
                LarkBot.team_name.in_(recipients), LarkBot.is_active == True
            )
        )
    ).scalars().all()
    return [(b.team_name, b.webhook_url) for b in bots]


async def check_and_send_alerts():
    """Check for new/updated incidents and send alerts based on routing rules."""
    async with async_session() as db:
        # Find incidents that need alerting (new incidents without alerts)
        incidents = (
            await db.execute(
                select(Incident).where(
                    and_(
                        Incident.status == "new",
                        Incident.severity.in_(["critical", "high", "medium"]),
                    )
                )
            )
        ).scalars().all()

        for incident in incidents:
            # Get routing rules for this category
            rules = (
                await db.execute(
                    select(RoutingRule).where(
                        and_(
                            RoutingRule.category == incident.category,
                            RoutingRule.is_active == True,
                        )
                    )
                )
            ).scalars().all()

            cadence = SEVERITY_CADENCE.get(incident.severity, "digest")

            for rule in rules:
                recipients = [rule.primary_owner] if rule.primary_owner else []
                recipients.extend(rule.departments)
                if incident.severity == "critical" and rule.escalate_to:
                    recipients.extend(rule.escalate_to)

                for channel in rule.channels:
                    if channel == "lark":
                        # Fan-out: one alert per team with a Lark bot
                        matched_bots = await _resolve_lark_webhooks(recipients, db)

                        for team_name, webhook_url in matched_bots:
                            # Dedup: skip if alert already exists for this incident+team
                            existing = (
                                await db.execute(
                                    select(Alert).where(
                                        and_(
                                            Alert.incident_id == incident.id,
                                            Alert.channel == "lark",
                                            Alert.recipients.contains([team_name]),
                                        )
                                    )
                                )
                            ).scalar_one_or_none()

                            if existing:
                                continue

                            payload = _build_payload(incident, rule)
                            payload["lark_webhook_url"] = webhook_url

                            alert = Alert(
                                incident_id=incident.id,
                                alert_type=cadence,
                                severity=incident.severity,
                                channel="lark",
                                recipients=[team_name],
                                subject=f"[{incident.severity.upper()}] {incident.title}",
                                body=incident.summary,
                                payload=payload,
                            )
                            db.add(alert)
                            await db.flush()

                            if cadence == "immediate":
                                success = await _send_alert(alert)
                                alert.delivery_status = "sent" if success else "failed"
                                alert.sent_at = datetime.utcnow() if success else None

                        # Fallback: no bots matched, use global webhook
                        if not matched_bots and settings.lark_webhook_url:
                            existing = (
                                await db.execute(
                                    select(Alert).where(
                                        and_(
                                            Alert.incident_id == incident.id,
                                            Alert.channel == "lark",
                                        )
                                    )
                                )
                            ).scalar_one_or_none()

                            if not existing:
                                alert = Alert(
                                    incident_id=incident.id,
                                    alert_type=cadence,
                                    severity=incident.severity,
                                    channel="lark",
                                    recipients=recipients,
                                    subject=f"[{incident.severity.upper()}] {incident.title}",
                                    body=incident.summary,
                                    payload=_build_payload(incident, rule),
                                )
                                db.add(alert)
                                await db.flush()

                                if cadence == "immediate":
                                    success = await _send_alert(alert)
                                    alert.delivery_status = "sent" if success else "failed"
                                    alert.sent_at = datetime.utcnow() if success else None
                    else:
                        # Non-lark channels: original behavior
                        existing = (
                            await db.execute(
                                select(Alert).where(
                                    and_(
                                        Alert.incident_id == incident.id,
                                        Alert.channel == channel,
                                    )
                                )
                            )
                        ).scalar_one_or_none()

                        if existing:
                            continue

                        alert = Alert(
                            incident_id=incident.id,
                            alert_type=cadence,
                            severity=incident.severity,
                            channel=channel,
                            recipients=recipients,
                            subject=f"[{incident.severity.upper()}] {incident.title}",
                            body=incident.summary,
                            payload=_build_payload(incident, rule),
                        )
                        db.add(alert)
                        await db.flush()

                        if cadence == "immediate":
                            success = await _send_alert(alert)
                            alert.delivery_status = "sent" if success else "failed"
                            alert.sent_at = datetime.utcnow() if success else None

            # Mark incident as acknowledged after alerting
            incident.status = "acknowledged"

        await db.commit()


def _build_payload(incident: Incident, rule: RoutingRule) -> dict:
    return {
        "incident_code": incident.incident_code,
        "title": incident.title,
        "summary": incident.summary,
        "category": incident.category,
        "severity": incident.severity,
        "post_count": incident.post_count,
        "platforms": incident.platforms,
        "primary_owner": rule.primary_owner,
        "departments": list(rule.departments),
    }


async def _send_alert(alert: Alert) -> bool:
    """Dispatch alert to the appropriate channel."""
    try:
        if alert.channel == "slack":
            return await _send_slack(alert)
        elif alert.channel == "lark":
            return await _send_lark(alert)
        elif alert.channel == "email":
            return await _send_email(alert)
        return False
    except Exception:
        logger.exception(f"Failed to send alert {alert.id} via {alert.channel}")
        return False


async def _send_slack(alert: Alert) -> bool:
    """Send Slack webhook message."""
    if not settings.slack_webhook_url:
        logger.warning("Slack webhook not configured")
        return False

    sev_emoji = {
        "critical": ":rotating_light:",
        "high": ":warning:",
        "medium": ":large_yellow_circle:",
        "low": ":large_blue_circle:",
    }
    emoji = sev_emoji.get(alert.severity, ":information_source:")

    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} {alert.subject}",
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"*Severity:* {alert.severity.upper()}\n"
                        f"*Summary:* {alert.body or 'N/A'}\n"
                        f"*Primary Owner:* {alert.recipients[0] if alert.recipients else 'N/A'}\n"
                        f"*Also notified:* {', '.join(alert.recipients[1:]) if alert.recipients and len(alert.recipients) > 1 else '-'}"
                    ),
                },
            },
        ]
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(settings.slack_webhook_url, json=payload)
        return resp.status_code == 200


async def _send_lark(alert: Alert) -> bool:
    """Send Lark webhook card message."""
    # Prefer per-alert webhook from payload, fall back to global setting
    webhook_url = (alert.payload or {}).get("lark_webhook_url") or settings.lark_webhook_url
    if not webhook_url:
        logger.warning("No Lark webhook for alert %s", alert.id)
        return False

    color_map = {"critical": "red", "high": "orange", "medium": "yellow", "low": "blue"}

    payload = {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": alert.subject or ""},
                "template": color_map.get(alert.severity, "blue"),
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": (
                            f"**Severity:** {alert.severity.upper()}\n"
                            f"**Summary:** {alert.body or 'N/A'}\n"
                            f"**Team:** {alert.recipients[0] if alert.recipients else 'N/A'}\n"
                            f"**Also notified:** {', '.join(alert.recipients[1:]) if alert.recipients and len(alert.recipients) > 1 else '-'}"
                        ),
                    },
                }
            ],
        },
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(webhook_url, json=payload)
        return resp.status_code == 200


async def _send_email(alert: Alert) -> bool:
    """Send email via SMTP."""
    if not settings.smtp_user:
        logger.warning("SMTP not configured")
        return False

    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = alert.subject or "Atome VoC Alert"
        msg["From"] = settings.alert_email_from
        msg["To"] = settings.alert_email_to

        html = f"""
        <html><body>
        <h2 style="color: #DC2626;">{alert.subject}</h2>
        <p><strong>Severity:</strong> {alert.severity.upper()}</p>
        <p><strong>Summary:</strong> {alert.body or 'N/A'}</p>
        <p><strong>Primary Owner:</strong> {alert.recipients[0] if alert.recipients else 'N/A'}</p>
        <p><strong>Also notified:</strong> {', '.join(alert.recipients[1:]) if alert.recipients and len(alert.recipients) > 1 else '-'}</p>
        <hr>
        <p style="color: #666;">Atome VoC Early Warning Agent</p>
        </body></html>
        """
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=True,
        )
        return True
    except Exception:
        logger.exception("Email send failed")
        return False


async def send_daily_digest():
    """Send aggregated daily digest of all incidents from the past 24h."""
    async with async_session() as db:
        since = datetime.utcnow() - timedelta(hours=24)
        incidents = (
            await db.execute(
                select(Incident).where(Incident.created_at >= since).order_by(Incident.severity)
            )
        ).scalars().all()

        if not incidents:
            logger.info("No incidents for daily digest")
            return

        summary_lines = []
        for inc in incidents:
            summary_lines.append(
                f"- [{inc.severity.upper()}] {inc.title} ({inc.post_count} posts)"
            )

        digest_body = f"Daily VoC Digest - {len(incidents)} incidents in last 24h:\n\n"
        digest_body += "\n".join(summary_lines)

        alert = Alert(
            alert_type="digest",
            severity="low",
            channel="email",
            subject=f"Atome VoC Daily Digest - {datetime.utcnow().strftime('%Y-%m-%d')}",
            body=digest_body,
        )
        db.add(alert)
        await db.flush()

        await _send_email(alert)
        alert.delivery_status = "sent"
        alert.sent_at = datetime.utcnow()
        await db.commit()
