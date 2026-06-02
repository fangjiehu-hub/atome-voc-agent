"""Simple async email sender for VoC alerts via SMTP (aiosmtplib)."""

from __future__ import annotations

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from backend.config import settings

logger = logging.getLogger(__name__)


async def send_alert_email(
    *,
    to_address: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> tuple[bool, str]:
    """Send a VoC alert email.

    Returns (success: bool, message: str).
    Gracefully returns (False, reason) if SMTP is not configured.
    """
    if not settings.smtp_user or not settings.smtp_password:
        return False, "SMTP not configured (SMTP_USER / SMTP_PASSWORD not set)"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.alert_email_from or settings.smtp_user
    msg["To"] = to_address

    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    port = int(settings.smtp_port or 465)
    use_tls = port == 465  # 465 = implicit TLS; 587 = STARTTLS

    try:
        if use_tls:
            await aiosmtplib.send(
                msg,
                hostname=settings.smtp_host,
                port=port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                use_tls=True,
            )
        else:
            await aiosmtplib.send(
                msg,
                hostname=settings.smtp_host,
                port=port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                start_tls=True,
            )
        logger.info("Alert email sent to %s — %s", to_address, subject)
        return True, "Email sent successfully"
    except Exception as exc:
        logger.exception("Failed to send alert email to %s", to_address)
        return False, str(exc)


def build_alert_html(
    *,
    title: str,
    taxonomy_label: str,
    body: str,
    dashboard_url: str = "https://atome-voc-v2-frontend.fly.dev/design",
) -> str:
    """Build a clean HTML email body for VoC alerts."""
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white;
              border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #141c30; padding: 24px 28px;">
      <div style="color: #f0ff5f; font-size: 18px; font-weight: 700;">Atome VoC</div>
      <div style="color: rgba(255,255,255,0.6); font-size: 13px; margin-top: 2px;">
        Early Warning Agent · {taxonomy_label}
      </div>
    </div>
    <div style="padding: 28px;">
      <h2 style="margin: 0 0 16px; font-size: 16px; color: #111;">{title}</h2>
      <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;
                  color: #374151; background: #f9fafb; border-radius: 8px;
                  padding: 16px; border: 1px solid #e5e7eb;">
{body}
      </div>
      <div style="margin-top: 20px;">
        <a href="{dashboard_url}"
           style="display: inline-block; background: #141c30; color: #f0ff5f;
                  padding: 10px 20px; border-radius: 8px; text-decoration: none;
                  font-size: 13px; font-weight: 600;">
          Open Dashboard →
        </a>
      </div>
    </div>
    <div style="padding: 16px 28px; border-top: 1px solid #f0f0f0;
                font-size: 11px; color: #9ca3af;">
      Atome VoC Early Warning Agent · Sent automatically by the monitoring system
    </div>
  </div>
</body>
</html>
"""
