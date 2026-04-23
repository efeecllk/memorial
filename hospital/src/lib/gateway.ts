/// <reference types="vite/client" />

// Gateway client — talks to the hospital-side FastAPI gateway.
//
// Security note: the browser NEVER handles the hospital private key. That
// lives server-side in gateway/.env (chmod 600, gitignored). All chain
// submissions go through the gateway; the frontend sees only public data
// (tx hashes, block numbers, contract addresses).

export const GATEWAY_URL =
  (import.meta.env.VITE_GATEWAY_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:8000" : "");

// Default demo identities — public info only; lives in the bootstrap manifest.
export const DEMO_DOCTOR_ADDRESS =
  "0xbe58cC5E2ceF05958EdCb9DE46c07116Af0Dc8E7";

// Demo consent ref = keccak256(abi.encode("demo-consent-001")) — the value
// BootstrapDemo.s.sol actually recorded on-chain. Verified live via
// `cast call ConsentRegistry.isActive(ref)` → true.
export const DEMO_CONSENT_REF_REAL =
  "0x06106b48d6ddacbdf7d210b430d660ffb850015a2b119bcd7fcd9841774ad086";

// ── request / response shapes ─────────────────────────────────────────────

export type ProvenanceModelWire = {
  role: string;
  name: string;
  hash: string;
  invoked: boolean;
};

export type AttestationReceiptWire = {
  id: string;
  tx_hash: string;
  block_number: number | null;
  finality_seconds: number | null;
  explorer_url: string | null;
};

export type RoutingResultWire = {
  region: string;
  confidence: number;
  alternatives: Record<string, number>;
};

export type DiagnoseResponseWire = {
  transcript: string | null;
  routing: RoutingResultWire | null;
  vision_output: string | null;
  reasoning_output: string | null;
  final_output: string;
  provenance: ProvenanceModelWire[];
  attestation: AttestationReceiptWire;
  elapsed_ms: number;
};

export type DiagnoseRequestWire = {
  text?: string;
  audio_b64?: string;
  image_b64?: string;
  consent_ref: string;
  doctor_address: string;
};

// ── RPC ───────────────────────────────────────────────────────────────────

export class GatewayError extends Error {
  constructor(
    public readonly kind: "network" | "timeout" | "http" | "parse",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export async function postDiagnose(
  body: DiagnoseRequestWire,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<DiagnoseResponseWire> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const res = await fetch(`${GATEWAY_URL}/diagnose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal ?? controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayError("http", `gateway ${res.status}: ${text.slice(0, 200)}`, res.status);
    }
    return (await res.json()) as DiagnoseResponseWire;
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new GatewayError("timeout", `gateway did not respond within ${timeoutMs}ms`);
    }
    throw new GatewayError("network", `gateway unreachable at ${GATEWAY_URL}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkGatewayHealth(): Promise<{ mock_mode: boolean; chain_connected: boolean } | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { mock_mode: !!data.mock_mode, chain_connected: !!data.chain_connected };
  } catch {
    return null;
  }
}
