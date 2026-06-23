"""Scheduled data-sync entry point (for cron / systemd timer).

Runs the Lark Bitable sync → annotate → cluster → alert pipeline once and exits.
More reliable than the in-process APScheduler for a once-daily job: the OS cron
fires regardless of app restarts and won't be paused by idle machine stop.

Usage (run from the repo root, with the app's env, e.g. DATABASE_URL / LARK_*):
    python -m scripts.run_sync

Example crontab (daily 10:30, after Octo's 09:00-10:00 Bitable refresh):
    30 10 * * * cd /home/sysop/atome-voc-agent && \
      /home/sysop/atome-voc-agent/.venv/bin/python -m scripts.run_sync \
      >> /var/log/voc-sync.log 2>&1
"""
import asyncio

from backend.services.crawler_lark_bitable import crawl_lark_bitable

if __name__ == "__main__":
    asyncio.run(crawl_lark_bitable())
