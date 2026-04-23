"""Hashing helpers must match Solidity-side encoding bit-for-bit."""

from __future__ import annotations

from src.hashing import attestation_id, keccak256, model_hash, text_hash, to_hex32


def test_keccak256_known_vector() -> None:
    # Known: keccak256("") == c5d2460186...
    digest = keccak256(b"")
    assert digest.hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"


def test_model_hash_uses_canonical_name() -> None:
    h = model_hash("openai/whisper-large-v3-turbo")
    assert len(h) == 32
    assert h == keccak256(b"openai/whisper-large-v3-turbo")


def test_text_hash_round_trips() -> None:
    s = "Patient is post-op day 1."
    assert text_hash(s) == keccak256(s.encode("utf-8"))


def test_to_hex32_pads_short_bytes() -> None:
    h = to_hex32(b"\x01\x02")
    assert h == "0x" + "0102" + "00" * 30
    assert len(h) == 66


def test_to_hex32_truncates_long_bytes() -> None:
    h = to_hex32(b"\xff" * 40)
    assert h == "0x" + "ff" * 32


def test_attestation_id_is_deterministic_with_nonce() -> None:
    nonce = b"\x00" * 16
    a = attestation_id(b"\x01" * 32, b"\x02" * 32, nonce)
    b = attestation_id(b"\x01" * 32, b"\x02" * 32, nonce)
    assert a == b


def test_attestation_id_changes_with_inputs() -> None:
    nonce = b"\x00" * 16
    a = attestation_id(b"\x01" * 32, b"\x02" * 32, nonce)
    b = attestation_id(b"\x03" * 32, b"\x02" * 32, nonce)
    assert a != b
