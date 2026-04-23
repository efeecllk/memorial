#!/usr/bin/env bash
# Deploy all 5 Polyglot-Attest Modal apps in order.
#
# Pre-flight (one-time):
#   1. Configure Modal CLI:    modal token set --token-id "$MODAL_TOKEN_ID" \
#                                                --token-secret "$MODAL_TOKEN_SECRET"
#   2. Create the HF secret:   modal secret create polyglot-hf HF_TOKEN="$HF_TOKEN"
#   3. Accept MedGemma terms:  https://huggingface.co/google/medgemma-4b-it
#                              (the HF account behind HF_TOKEN must accept once)
#
# Usage:
#   ./services/modal/deploy.sh             # deploy all 5
#   ./services/modal/deploy.sh whisper     # one app
set -euo pipefail

cd "$(dirname "$0")"

ALL=(whisper router vision reasoning aggregator)

deploy_one() {
    local name="$1"
    local file="${name}_app.py"
    if [[ ! -f "$file" ]]; then
        echo "❌ ${file} not found"; exit 1
    fi
    echo "── deploying ${name} ────────────────────────────────"
    modal deploy "$file"
    echo
}

if [[ $# -gt 0 ]]; then
    for name in "$@"; do deploy_one "$name"; done
else
    for name in "${ALL[@]}"; do deploy_one "$name"; done
fi

echo "All requested apps deployed. URL pattern:"
echo "  https://<modal-username>--polyglot-<role>-<endpoint>.modal.run"
echo
echo "Examples:"
echo "  https://<u>--polyglot-whisper-transcribe.modal.run"
echo "  https://<u>--polyglot-router-classify.modal.run"
echo "  https://<u>--polyglot-vision-analyze.modal.run"
echo "  https://<u>--polyglot-reasoning-think.modal.run"
echo "  https://<u>--polyglot-aggregator-synthesize.modal.run"
echo
echo "Update gateway/.env with these URLs (see services/modal/README.md)."
