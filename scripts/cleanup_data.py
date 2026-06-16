"""One-off data cleanup for any environment (idempotent + safe to re-run).

Applies the same hygiene fixes we made for the Octo Agent / Lark Bitable data:

  1. Relevance   — mark posts that never mention the brand ("atome" not in
                   content_text) as "Not Relevant" (non-destructive).
  2. Platform    — merge platform 'x' into 'twitter'; delete exact duplicates
                   (same brand + post_id that already exist as 'twitter').
  3. AI Analysis — backfill posts.ai_analysis from the live Bitable for rows
                   that don't have it yet.

Run from the repo root, with the same env (DATABASE_URL etc.) as the app:

    python -m scripts.cleanup_data            # apply all steps
    python -m scripts.cleanup_data --dry-run  # report only, change nothing

Requires migrations to be up to date (alembic upgrade head) so the
ai_analysis column exists.
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import and_, delete, func, select, update

from backend.database import async_session
from backend.models.post import Post

DRY_RUN = "--dry-run" in sys.argv


async def _count(db, *conds) -> int:
    return (await db.execute(select(func.count()).select_from(Post).where(*conds))).scalar() or 0


async def step_relevance(db) -> None:
    """Mark posts with no brand mention in content_text as Not Relevant."""
    no_brand = ~func.lower(func.coalesce(Post.content_text, "")).like("%atome%")
    cond = and_(no_brand, Post.mention_status != "Not Relevant")
    n = await _count(db, cond)
    print(f"[relevance] {n} posts have no brand mention and aren't yet Not Relevant")
    if n and not DRY_RUN:
        await db.execute(update(Post).where(cond).values(mention_status="Not Relevant"))
        print(f"[relevance] marked {n} as Not Relevant")


async def step_merge_x(db) -> None:
    """Merge platform 'x' into 'twitter', deleting exact (brand, post_id) dups."""
    xs = (await db.execute(select(Post).where(Post.platform == "x"))).scalars().all()
    print(f"[platform] {len(xs)} posts on platform 'x'")
    deleted = merged = 0
    for p in xs:
        dup = (
            await db.execute(
                select(Post.id).where(
                    and_(
                        Post.platform == "twitter",
                        Post.brand == p.brand,
                        Post.post_id == p.post_id,
                    )
                )
            )
        ).scalar_one_or_none()
        if dup:
            if not DRY_RUN:
                await db.execute(delete(Post).where(Post.id == p.id))
            deleted += 1
        else:
            if not DRY_RUN:
                p.platform = "twitter"
            merged += 1
    print(f"[platform] {'would ' if DRY_RUN else ''}delete {deleted} dup(s), merge {merged} into twitter")


async def step_backfill_ai_analysis(db) -> None:
    """Backfill posts.ai_analysis from the live Bitable where missing."""
    missing = await _count(db, Post.ai_analysis.is_(None))
    print(f"[ai_analysis] {missing} posts currently without ai_analysis")
    if not missing:
        return
    try:
        from backend.services.crawler_lark_bitable import _map_record, fetch_bitable_records
    except Exception as exc:
        print(f"[ai_analysis] skipped (Bitable module unavailable): {exc}")
        return

    records = await fetch_bitable_records()
    if not records:
        print("[ai_analysis] Bitable returned no records (check LARK_APP_ID/SECRET) — skipped")
        return

    updated = 0
    for rec in records:
        m = _map_record(rec.get("fields", {}))
        if not m or not m.get("ai_analysis"):
            continue
        if DRY_RUN:
            updated += 1
            continue
        res = await db.execute(
            update(Post)
            .where(Post.post_id == m["post_id"], Post.ai_analysis.is_(None))
            .values(ai_analysis=m["ai_analysis"])
        )
        updated += res.rowcount
    print(f"[ai_analysis] {'would backfill' if DRY_RUN else 'backfilled'} {updated} posts")


async def main() -> None:
    mode = "DRY RUN (no changes)" if DRY_RUN else "APPLYING CHANGES"
    print(f"=== Atome VoC data cleanup — {mode} ===")
    async with async_session() as db:
        await step_relevance(db)
        await step_merge_x(db)
        await step_backfill_ai_analysis(db)
        if not DRY_RUN:
            await db.commit()
            print("=== committed ===")
        else:
            print("=== dry run complete (nothing committed) ===")


if __name__ == "__main__":
    asyncio.run(main())
