import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function main(client) {
  const contractPath = path.resolve(__dirname, '..', 'contracts', 'Orbitjob.py');
  const contractCode = new Uint8Array(readFileSync(contractPath));

  console.log('\n  ⚡ Deploying Orbitjob contract...');
  console.log(`  → Contract: ${contractPath}`);

  await client.initializeConsensusSmartContract();

  const deployTransaction = await client.deployContract({
    code: contractCode,
    args: [],
  });

  console.log(`  → Deployment TX: ${deployTransaction}`);
  console.log('  → Waiting for finalization...');

  const receipt = await client.waitForTransactionReceipt({
    hash: deployTransaction,
    retries: 200,
  });

  if (
    receipt.statusName !== 'ACCEPTED' &&
    receipt.statusName !== 'FINALIZED'
  ) {
    throw new Error(`Deployment failed: ${JSON.stringify(receipt)}`);
  }

  const isTestnet = client.chain?.id === 61123n;
  const contractAddress = isTestnet
    ? receipt.txDataDecoded?.contractAddress
    : receipt.data?.contract_address;

  console.log(`  → Contract deployed at: ${contractAddress}`);
  console.log(`  → Add to .env: GENLAYER_CONTRACT_ADDRESS=${contractAddress}`);
  console.log('  → Set GENLAYER_MODE=real to activate\n');

  return contractAddress;
}
