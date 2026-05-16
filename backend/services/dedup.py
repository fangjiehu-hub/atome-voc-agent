"""Deduplication logic for crawled posts."""

import hashlib


def content_hash(text: str) -> str:
    """Generate a normalized hash for near-duplicate detection."""
    normalized = text.lower().strip()
    # Remove common noise
    for char in [".", ",", "!", "?", "#", "@"]:
        normalized = normalized.replace(char, "")
    normalized = " ".join(normalized.split())
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def is_too_short(text: str, min_chars: int = 30) -> bool:
    """Discard posts shorter than threshold."""
    return len(text.strip()) < min_chars


def mentions_brand(text: str, brand_terms: list[str] | None = None) -> bool:
    """Check if text mentions Atome or configured brand terms."""
    if brand_terms is None:
        brand_terms = ["atome", "atome ph", "atome_ph", "@atome_ph"]
    lower = text.lower()
    return any(term in lower for term in brand_terms)


def is_official_account(handle: str) -> bool:
    """Discard posts from official brand accounts."""
    official = {"atome_ph", "atomeph", "atomeapp"}
    return handle.lower().strip("@") in official


# Non-PH accounts that match "atome" keyword but are unrelated
NOISE_ACCOUNTS = {
    "atomeplc",      # UK energy company
    "atomee__",      # French science/trivia account
    "atomeindo",     # Atome Indonesia (not PH)
    "kbank_live",    # Thai bank
}


def is_noise_account(handle: str) -> bool:
    """Discard posts from known non-PH noise accounts."""
    return handle.lower().strip("@") in NOISE_ACCOUNTS


def is_ph_relevant(text: str) -> bool:
    """Check if a Twitter/X post is likely PH-relevant (not Malaysian, Thai, French, etc.)."""
    lower = text.lower()
    # Non-PH language/context signals — if ONLY these appear, it's noise
    non_ph = ["🇲🇾", "malaysia", "ringgit", "rm ", "baht", "🇹🇭",
              "l'atome", "nucléaire", "français", "le mexique", "piranha",
              "javascript is not available"]
    # PH signals
    ph = ["₱", "php", "philippines", "filipino", "pinoy", "gcash", "gcredit",
          "ggives", "lazada", "shopee", "spaylater", "grabpay", "peso",
          "atome card", "atome app", "installment", "cashback", "bnpl",
          "bayad", "collection", "hindi", "refund"]

    has_ph = any(s in lower for s in ph)
    has_non_ph = any(s in lower for s in non_ph)

    # If it has PH signals, keep it regardless
    if has_ph:
        return True
    # If it has non-PH signals and no PH signals, it's noise
    if has_non_ph:
        return False
    # Ambiguous — keep it (let LLM classify as not_negative)
    return True
