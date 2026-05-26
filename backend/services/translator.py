"""Translation service using Claude (Anthropic) as the translation engine.

TODO: Consider replacing with a dedicated translation API (DeepL, Google Translate)
if latency/cost becomes a concern at scale.
"""
from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

# Common Tagalog function words unlikely to appear together in real English text.
# >=2 matches signals Tagalog so we skip the ASCII-ratio bypass.
_TAGALOG_MARKERS = frozenset({
    "ako", "ko", "mo", "siya", "kami", "tayo", "kayo", "sila",
    "ng", "sa", "ang", "mga", "na", "pa", "po", "din", "rin",
    "lang", "daw", "raw", "ba", "ay", "pero", "kasi",
    "hindi", "wala", "naman", "talaga", "yung",
    "pag", "kung", "bayad", "utang", "pera", "presyo", "libre",
})


def _looks_like_tagalog(text: str) -> bool:
    words = set(re.findall(r"\b[a-z]+\b", text.lower()))
    return len(words & _TAGALOG_MARKERS) >= 2


async def translate_to_english(text: str, from_language: str = "auto") -> str:
    """Translate `text` to English using Claude claude-haiku-4-5.

    Returns the English translation string. Raises on hard failure.
    """
    if not text or not text.strip():
        return ""

    # Skip translation for text that's already English.
    # ASCII-ratio heuristic catches CJK/Arabic/etc., but Tagalog uses the Latin
    # alphabet so we check for common Tagalog function words first.
    ascii_ratio = sum(1 for c in text if ord(c) < 128) / max(len(text), 1)
    if ascii_ratio > 0.90 and not _looks_like_tagalog(text):
        return text  # Already English

    try:
        import anthropic  # type: ignore

        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            logger.warning("ANTHROPIC_API_KEY not set — translation skipped")
            return "[Translation unavailable — API key not configured]"

        client = anthropic.AsyncAnthropic(api_key=api_key)

        system = (
            "You are a professional translator. "
            "Translate the following social-media post to natural English. "
            "Preserve emojis. Return only the translation, no preamble."
        )
        if from_language and from_language != "auto":
            system += f" The source language is: {from_language}."

        message = await client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=512,
            system=system,
            messages=[{"role": "user", "content": text.strip()}],
        )
        translation = message.content[0].text.strip()
        logger.debug("Translated %d chars → %d chars", len(text), len(translation))
        return translation

    except Exception as exc:
        logger.error("Translation failed: %s", exc)
        raise
