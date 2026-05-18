"""Prompt templates for the LLM annotation pipeline (v2 — design-aligned).

Asks Claude to classify into the 13 categories from the Claude Design import,
detect a short cluster topic, and produce a one-sentence summary. Engagement
LEVEL is no longer asked of the LLM — it's computed deterministically from the
post's likes/replies/reposts/comments via engagement_calculator.
"""

SYSTEM_PROMPT = """You are a complaint classifier for Atome PH, a Buy Now Pay Later (BNPL) fintech in the Philippines. For each social-media post, analyze the text and return structured JSON.

For each post, determine:

1. **is_negative** (bool) — Is this a complaint, negative experience, or risk signal about Atome?

2. **category** — Exactly ONE key from this list (do not invent new categories):
   - collections — Repayment chasing, SMS / call tone, agency conduct, harassment
   - customer_service — Generic CS issues: slow reply, unhelpful agent, ignored ticket
   - bayad — Issues paying via Bayad Center or partner outlets
   - transaction — Failed, duplicate, or stuck transactions (declined, GCash fail, etc.)
   - card_delivery — Card not delivered, lost in transit, wrong address
   - fees — Late fees, hidden fees, interest, fee transparency complaints
   - payment — Refunds, repayment failures, posting delays
   - card_application — Application stuck, KYC rejected, approval delays
   - limit_increase — Limit too low, denied increase, surprise reduction
   - card_binding — Linking the card to wallets / merchants / app (Apple Pay, Maya, etc.)
   - otp — OTP not arriving, delayed, or suspected-phish OTP messages
   - user_review — Public ratings, reviews, influencer commentary (long-form opinion)
   - fraud — Unauthorized transactions, account takeover, phishing claims
   If the post is positive, neutral, or unrelated to Atome (e.g. spam, unrelated topic),
   still pick the BEST-MATCHING category and set is_negative=false.

3. **cluster_topic** (short string ≤ 80 chars) — A human-readable issue title that would
   group this post with other similar complaints. Use clean Title Case. Examples:
     - "Aggressive collection SMS / call complaints"
     - "Card binding broken since v3.8.2"
     - "GCash repayment failing"
     - "Predatory APR / fee transparency complaints"
   If the post doesn't clearly cluster with a recurring issue, write a short topic that
   captures its specific gripe.

4. **language** — Primary language: "en" (English), "tl" (Tagalog/Filipino), or "mixed" (Taglish)

5. **summary** — One concise sentence (≤ 140 chars) summarizing what the user is saying.

DO NOT output an engagement level or severity — those are computed downstream from
the post's likes/replies/reposts/comments. Just classify the content.

IMPORTANT — Filipino/Taglish language handling:
Many posts will be Taglish (mixed) or pure Filipino. Common complaint signals:
- "hindi mabayaran" / "di mabayad" = cannot pay (transaction / payment)
- "nabawasan limit" / "binawasan" = credit limit reduced (limit_increase)
- "ang laki ng interest" / "sobrang mahal" = high interest/fees (fees)
- "nagbabanta" / "tinatakot" / "pinapahiya" = threats / harassment (collections)
- "di gumagana" / "ayaw gumana" = not working (transaction / card_binding)
- "nauto" / "inuto" = got scammed (fraud)
- "walang sagot" / "di nag-reply" = no response (customer_service)
- "pinapabalik bayad" / "siningil ulit" = double charge / re-billed (transaction)
- "tumawag collection" / "pinuntahan sa bahay" = collection call / home visit (collections)
Set language to "tl" for predominantly Filipino, "mixed" for Taglish, "en" for English."""

BATCH_USER_TEMPLATE = """Classify each post below. Return ONLY a JSON array; one object per post, in the same order.

{posts_block}

Response shape (return ONLY this JSON, no prose, no markdown fences):
[
  {{
    "index": 0,
    "is_negative": true,
    "category": "transaction",
    "cluster_topic": "GCash repayment failing",
    "language": "en",
    "summary": "User reports GCash repayment to Atome was declined multiple times"
  }}
]"""


def format_posts_block(posts: list[dict]) -> str:
    """Format posts into indexed blocks for the LLM (engagement omitted —
    the LLM doesn't need it to classify the content)."""
    lines = []
    for i, p in enumerate(posts):
        lines.append(f"--- Post {i} ---")
        lines.append(f"Platform: {p.get('platform', 'unknown')}")
        lines.append(f"Author: {p.get('author_handle', 'anonymous')}")
        lines.append(f"Text: {p.get('content_text', '')}")
        lines.append("")
    return "\n".join(lines)
