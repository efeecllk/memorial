"""On-chain attestation client. Submits to Monad and waits for finality.

In MOCK_MODE returns a synthetic receipt so the rest of the pipeline can be
exercised end-to-end without a Monad RPC or a funded signer.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from eth_account import Account
from web3 import AsyncHTTPProvider, AsyncWeb3
from web3.middleware import ExtraDataToPOAMiddleware

from src.config import settings


@dataclass
class EnsembleAttestation:
    """Mirror of the Solidity struct, ordered identically."""

    stt_hash: bytes
    router_hash: bytes
    base_hash: bytes
    active_lora_hash: bytes
    reasoning_hash: bytes
    aggregator_hash: bytes
    input_hash: bytes
    vision_output_hash: bytes
    reasoning_output_hash: bytes
    final_output_hash: bytes
    consent_ref: bytes
    doctor: str        # 0x-prefixed address
    timestamp: int     # set by contract

    def as_tuple(self) -> tuple:
        """Positional tuple matching the Solidity struct field order."""
        return (
            self.stt_hash,
            self.router_hash,
            self.base_hash,
            self.active_lora_hash,
            self.reasoning_hash,
            self.aggregator_hash,
            self.input_hash,
            self.vision_output_hash,
            self.reasoning_output_hash,
            self.final_output_hash,
            self.consent_ref,
            self.doctor,
            self.timestamp,
        )

    def to_dict_hex(self) -> dict:
        d = asdict(self)
        for k, v in d.items():
            if isinstance(v, bytes):
                d[k] = "0x" + v.hex()
        return d


_ABI_PATH = Path(__file__).parent / "abi" / "InferenceAttestation.json"


class AttestationClient:
    """web3 client wrapping the InferenceAttestation contract on Monad."""

    def __init__(self) -> None:
        self.abi = json.loads(_ABI_PATH.read_text())
        # Chain-mock is separable from model-mock: MOCK_MODE=true + FORCE_REAL_CHAIN=true
        # gives canned model outputs with genuine on-chain attestations (fast demo).
        self._chain_mock = settings.MOCK_MODE and not settings.FORCE_REAL_CHAIN
        if self._chain_mock:
            self.w3 = None
            self.contract = None
            self.account = None
        else:
            self.w3 = AsyncWeb3(AsyncHTTPProvider(settings.MONAD_RPC_URL))
            self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
            self.contract = self.w3.eth.contract(
                address=AsyncWeb3.to_checksum_address(settings.INFERENCE_ATTESTATION_ADDRESS),
                abi=self.abi,
            )
            self.account = Account.from_key(settings.HOSPITAL_PRIVATE_KEY)

    # ── submit ───────────────────────────────────────────────────────────────

    async def submit(self, attestation_id: bytes, ea: EnsembleAttestation) -> dict:
        """Submit one attestation, wait for receipt, return summary."""
        if self._chain_mock:
            await asyncio.sleep(0.8)  # simulate Monad finality
            return {
                "tx_hash": "0x" + secrets.token_hex(32),
                "block_number": 1_847_392 + secrets.randbelow(1000),
                "finality_seconds": 0.8,
                "explorer_url": None,
            }

        t0 = time.time()
        nonce = await self.w3.eth.get_transaction_count(self.account.address)
        # Monad testnet: use legacy gasPrice rather than EIP-1559 fee triple —
        # RPC was rejecting type-2 txs built with tiny priority fees.
        gas_price = await self.w3.eth.gas_price
        tx = await self.contract.functions.attest(attestation_id, ea.as_tuple()).build_transaction(
            {
                "from": self.account.address,
                "nonce": nonce,
                "gas": 800_000,
                "gasPrice": int(gas_price * 1.2),
                "chainId": settings.MONAD_CHAIN_ID,
            }
        )
        signed = self.account.sign_transaction(tx)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
        if raw is None:
            raise RuntimeError("eth-account signed tx has neither raw_transaction nor rawTransaction attribute")
        tx_hash = await self.w3.eth.send_raw_transaction(raw)
        receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        finality = time.time() - t0

        explorer = None
        if "testnet" in settings.MONAD_RPC_URL:
            explorer = f"https://testnet.monadexplorer.com/tx/{tx_hash.hex()}"
        elif "rpc.monad.xyz" in settings.MONAD_RPC_URL:
            explorer = f"https://monadexplorer.com/tx/{tx_hash.hex()}"

        return {
            "tx_hash": "0x" + tx_hash.hex() if not tx_hash.hex().startswith("0x") else tx_hash.hex(),
            "block_number": receipt["blockNumber"],
            "finality_seconds": round(finality, 2),
            "explorer_url": explorer,
        }

    # ── verify ───────────────────────────────────────────────────────────────

    async def verify(self, att_id: bytes, expected_input: bytes, expected_final: bytes) -> bool:
        if self._chain_mock:
            return True
        return await self.contract.functions.verify(att_id, expected_input, expected_final).call()

    async def chain_status(self) -> dict:
        if self._chain_mock:
            return {"connected": True, "chain_id": settings.MONAD_CHAIN_ID, "block_number": 1_847_400}
        try:
            block = await self.w3.eth.block_number
            chain_id = await self.w3.eth.chain_id
            return {"connected": True, "chain_id": chain_id, "block_number": block}
        except Exception:  # noqa: BLE001
            return {"connected": False, "chain_id": settings.MONAD_CHAIN_ID, "block_number": None}
