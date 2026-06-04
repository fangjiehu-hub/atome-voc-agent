"""SSRF-safe outbound HTTP for webhooks.

All server-initiated webhook POSTs (Lark group webhooks, Slack, etc.) must go
through `safe_webhook_post` so a user-supplied URL can never be used to reach
internal/cloud-metadata addresses (SSRF — audit finding C-2).

Defense in depth:
  1. Scheme must be https.
  2. Host must match an allowlist of known webhook providers.
  3. The resolved IP must not fall in any private / loopback / link-local range
     (blocks DNS-rebinding-to-internal and raw-IP hosts).
  4. Redirects are disabled (an allowed host must not 30x us to an internal one).
"""
from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# Hosts (and their subdomains) we are allowed to POST webhooks to.
WEBHOOK_HOST_ALLOWLIST: tuple[str, ...] = (
    "open.larksuite.com",
    "open.feishu.cn",
    "hooks.slack.com",
)


class WebhookValidationError(Exception):
    """Raised when a webhook URL fails SSRF validation."""


def _host_allowed(host: str) -> bool:
    host = host.lower()
    return any(host == d or host.endswith("." + d) for d in WEBHOOK_HOST_ALLOWLIST)


def _all_ips_public(host: str) -> bool:
    """Resolve host and ensure every resolved IP is a public address."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise WebhookValidationError(f"cannot resolve host: {host}") from exc

    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            raise WebhookValidationError(f"invalid resolved IP for {host}")
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise WebhookValidationError(f"host {host} resolves to non-public IP {ip}")
    return True


def validate_webhook_url(url: str | None) -> str:
    """Validate a webhook URL for SSRF safety. Returns the URL or raises."""
    if not url:
        raise WebhookValidationError("empty webhook URL")
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise WebhookValidationError("webhook URL must use https")
    host = parsed.hostname or ""
    if not host:
        raise WebhookValidationError("webhook URL has no host")
    if not _host_allowed(host):
        raise WebhookValidationError(f"host not in webhook allowlist: {host}")
    _all_ips_public(host)
    return url


async def safe_webhook_post(
    url: str | None,
    *,
    json: dict,
    timeout: float = 10.0,
) -> tuple[bool, str]:
    """POST to an allowlisted webhook URL with SSRF protection.

    Returns (success, message). `message` is a safe, generic string suitable for
    returning to API callers — it never contains internal host/stack details.
    """
    try:
        safe_url = validate_webhook_url(url)
    except WebhookValidationError as exc:
        logger.warning("Webhook URL rejected: %s", exc)
        return False, "Webhook URL is not allowed."

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            resp = await client.post(safe_url, json=json)
            resp.raise_for_status()
        return True, "Delivered successfully."
    except httpx.HTTPStatusError as exc:
        logger.warning("Webhook delivery HTTP error: %s", exc.response.status_code)
        return False, f"Webhook endpoint returned status {exc.response.status_code}."
    except Exception:
        logger.exception("Webhook delivery failed")
        return False, "Webhook delivery failed."
