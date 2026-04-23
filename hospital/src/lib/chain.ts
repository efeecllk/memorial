// Chain manifest for the Polyglot-Attest deployment.
//
// Overwritten by contracts/script/deploy-and-wire.sh once the suite is
// deployed to Monad testnet. Until then, CONTRACTS is filled with zero
// addresses and `isDeployed()` returns false — UI falls back to mock mode.

export const CHAIN = {
  id: 10143,
  name: "Monad Testnet",
  rpc: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadexplorer.com",
} as const;

export const CONTRACTS = {
  CredentialSBT:                "0x9A116B325A82812449C3a224D3Ae55Aa75f2f1dF",
  ConsentRegistry:              "0xF0d99929931efBd287eb44e185d263AB2b1dfd4e",
  ModelRegistry:                "0x46DD81A07E95F2AA2BFc66a365609D2811e7a703",
  InferenceAttestation:         "0xAef8565C85c58b8738386B616FcfC27c061BCa6e",
  DriftMonitor:                 "0x6C590b2fE246dDcEeC617Ce6EF74D11793E3B228",
  ConsensusVault:               "0xFdb05a96498945A4165d411c6190C507424A0424",
  ClinicalDecisionAttestation:  "0xf0987763926eA541022903694ada08396Cf962D5",
} as const;

const ZERO = "0x0000000000000000000000000000000000000000";

export function isDeployed(): boolean {
  return (CONTRACTS.InferenceAttestation as string) !== ZERO;
}

export function deployedCount(): number {
  return Object.values(CONTRACTS).filter((a) => (a as string) !== ZERO).length;
}

export function txUrl(hash: string): string {
  return `${CHAIN.explorer}/tx/${hash}`;
}

export function addressUrl(addr: string): string {
  return `${CHAIN.explorer}/address/${addr}`;
}
