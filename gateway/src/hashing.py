"""Keccak-256 hashing helpers — match the Solidity-side encoding exactly."""

from __future__ import annotations

import os
import time

from eth_utils import keccak


def keccak256(data: bytes) -> bytes:
    """Return the raw 32-byte keccak256 digest."""
    return keccak(data)


def keccak256_hex(data: bytes) -> str:
    """0x-prefixed hex form, suitable for transport / display."""
    return "0x" + keccak256(data).hex()


def model_hash(canonical_name: str) -> bytes:
    """Placeholder hash for a model: keccak256(canonical_name).

    Production swaps this for keccak256(weights file bytes).
    """
    return keccak256(canonical_name.encode("utf-8"))


def text_hash(text: str) -> bytes:
    """Hash a UTF-8 string."""
    return keccak256(text.encode("utf-8"))


def attestation_id(input_hash: bytes, final_output_hash: bytes, nonce: bytes | None = None) -> bytes:
    """Deterministic per-reply id; nonce defaults to (timestamp_ns || os.urandom(8))."""
    if nonce is None:
        nonce = time.time_ns().to_bytes(8, "big") + os.urandom(8)
    return keccak256(input_hash + final_output_hash + nonce)


def to_hex32(b: bytes) -> str:
    """Pad / truncate to bytes32 hex string."""
    if len(b) > 32:
        b = b[:32]
    if len(b) < 32:
        b = b + b"\x00" * (32 - len(b))
    return "0x" + b.hex()


ZERO32 = b"\x00" * 32
