"""Tests for dedup utilities."""

from backend.services.dedup import content_hash, is_too_short, mentions_brand, is_official_account


def test_content_hash_normalized():
    h1 = content_hash("Atome is a SCAM!!!")
    h2 = content_hash("atome is a scam")
    assert h1 == h2


def test_content_hash_different():
    h1 = content_hash("Atome charged me twice")
    h2 = content_hash("GCash is not working")
    assert h1 != h2


def test_is_too_short():
    assert is_too_short("short") is True
    assert is_too_short("a" * 30) is False
    assert is_too_short("a" * 29) is True


def test_mentions_brand():
    assert mentions_brand("I hate Atome so much") is True
    assert mentions_brand("@atome_ph fix your app") is True
    assert mentions_brand("GCash is broken") is False


def test_is_official_account():
    assert is_official_account("atome_ph") is True
    assert is_official_account("@AtomePH") is True
    assert is_official_account("randomuser") is False
