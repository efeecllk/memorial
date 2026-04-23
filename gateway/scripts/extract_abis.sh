#!/usr/bin/env bash
# Extract the contract ABIs from a freshly-built Foundry project and copy them
# into the gateway. Run this whenever you change the Solidity source.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTRACTS_DIR="$ROOT/contracts"
GATEWAY_ABI_DIR="$ROOT/gateway/src/abi"

cd "$CONTRACTS_DIR"
forge build >/dev/null

mkdir -p "$GATEWAY_ABI_DIR"

for c in InferenceAttestation ConsentRegistry ModelRegistry CredentialSBT DriftMonitor; do
    src="out/${c}.sol/${c}.json"
    if [[ ! -f "$src" ]]; then
        echo "warn: $src not found (did forge build succeed?)" >&2
        continue
    fi
    # Keep only the ABI array — the gateway never needs the bytecode.
    python3 -c "
import json, sys, pathlib
art = json.loads(pathlib.Path('$src').read_text())
out = art.get('abi', [])
pathlib.Path('$GATEWAY_ABI_DIR/${c}.json').write_text(json.dumps(out, indent=2) + '\n')
print('  → ${c}.json (' + str(len(out)) + ' entries)')
"
done

echo "ABIs copied to $GATEWAY_ABI_DIR"
