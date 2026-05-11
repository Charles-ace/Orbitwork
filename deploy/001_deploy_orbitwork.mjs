// Mock Onchain Deploy
// This script simulates deployment for MVP development.
// Replace with real genlayer-js deploy when targeting GenLayer Testnet.

export default async function main() {
  const mockAddress = `0x${Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
  const mockTxId = `tx_mock_deploy_${Date.now()}`;

  console.log(`\n  ⚡ Orbitwork [Mock Onchain Mode]`);
  console.log(`  → Simulated contract deployment`);
  console.log(`  → Contract address: ${mockAddress}`);
  console.log(`  → Deployment TX:    ${mockTxId}`);
  console.log(`  → Set GENLAYER_CONTRACT_ADDRESS=${mockAddress} in .env to connect (optional in Mock Mode)\n`);

  return mockAddress;
}
