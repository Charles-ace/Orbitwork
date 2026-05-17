let realClient = null;
let writeClient = null;
let mockMode = true;
let contractAddress = null;
let networkName = 'localnet';

let mockContractId = 0;
const mockLedger = [];

function simLatency(ms = 2000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mockTx(type, data) {
  const tx = {
    txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type, data,
    blockTimestamp: new Date().toISOString(),
    blockNumber: Math.floor(Math.random() * 999999) + 1,
  };
  mockLedger.push(tx);
  return tx;
}

async function initRealBridge() {
  const network = (process.env.GENLAYER_NETWORK || 'localnet').toLowerCase();
  networkName = network;

  try {
    const { createClient, createAccount } = await import('genlayer-js');

    const chain = await buildChainConfig(network);

    realClient = createClient({ chain });

    const counter = await realClient.readContract({
      address: contractAddress,
      functionName: 'get_task_counter',
      args: [],
    });
    console.log(`  → [GenLayer Bridge] Connected to ${network}. Task counter: ${counter}`);

    const privateKey = process.env.GENLAYER_PRIVATE_KEY || null;
    const accountStr = process.env.GENLAYER_ACCOUNT_ADDRESS || null;

    if (privateKey) {
      const account = createAccount(privateKey);
      writeClient = createClient({ chain, account });
      console.log(`  → [GenLayer Bridge] Write client ready (account: ${account.address})`);
    } else if (accountStr) {
      writeClient = createClient({ chain, account: accountStr, provider: undefined });
      console.log(`  → [GenLayer Bridge] Write client ready (address: ${accountStr})`);
    } else {
      console.log(`  → [GenLayer Bridge] No private key — writes will use mock fallback`);
    }

    return true;
  } catch (err) {
    console.error(`  → [GenLayer Bridge] Init failed: ${err.message}`);
    console.error(`  → [GenLayer Bridge] Falling back to mock mode`);
    return false;
  }
}

async function buildChainConfig(network) {
  try {
    const chainsModule = await import('genlayer-js/chains');
    const known = chainsModule?.[network] || chainsModule?.chains?.[network];
    if (known) return { ...known };
  } catch {}

  const rpcUrl = process.env.GENLAYER_RPC_URL;
  const rpcMap = {
    localnet: 'http://127.0.0.1:8545',
    bradbury: 'https://bradbury.genlayer.net',
    testnet: 'https://testnet.genlayer.net',
    mainnet: 'https://mainnet.genlayer.net',
  };

  return {
    id: 61123n,
    name: network,
    rpc: { default: rpcUrl || rpcMap[network] || `https://${network}.genlayer.net` },
  };
}

async function init() {
  contractAddress = process.env.GENLAYER_CONTRACT_ADDRESS || null;
  const mode = process.env.GENLAYER_MODE || 'mock';

  if (contractAddress && mode === 'real') {
    console.log(`\n  ⚡ Initializing GenLayer Bridge...`);
    console.log(`  → Contract: ${contractAddress}`);
    const ok = await initRealBridge();
    if (ok) {
      mockMode = false;
      console.log(`  → ${networkName} mode active`);
    }
  }

  if (mockMode) {
    console.log(`  → Mock Bridge active`);
  }
}

async function postTask(title, description, reward, constraints, deadline) {
  if (!mockMode && writeClient) {
    const { TransactionStatus, ExecutionResult } = await import('genlayer-js/types');
    const txHash = await writeClient.writeContract({
      address: contractAddress,
      functionName: 'post_task',
      args: [title, description, Math.floor(reward), constraints || '', deadline || ''],
      value: BigInt(0),
    });
    const receipt = await writeClient.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: true,
    });
    if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
      const decoded = receipt.txDataDecoded || receipt.data || {};
      throw new Error(`Contract execution failed: ${receipt.txExecutionResultName} — ${JSON.stringify(decoded)}`);
    }
    const taskCounter = await realClient.readContract({
      address: contractAddress,
      functionName: 'get_task_counter',
      args: [],
    });
    return {
      txId: txHash,
      contractId: Number(taskCounter),
      status: 'FINALIZED',
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : Math.floor(Math.random() * 999999) + 1,
    };
  }

  await simLatency();
  mockContractId++;
  const receipt = {
    txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    contractId: mockContractId,
    status: 'FINALIZED',
    blockNumber: Math.floor(Math.random() * 999999) + 1,
  };
  mockTx('post_task', { contractId: mockContractId, title, description, reward, constraints, deadline });
  console.log(`  → [Mock Bridge] Task posted — contract ID: ${mockContractId} | tx: ${receipt.txId}`);
  return receipt;
}

async function submitExecution(contractTaskId, output, reasoning, confidence, agentId) {
  if (!mockMode && writeClient) {
    const { TransactionStatus, ExecutionResult } = await import('genlayer-js/types');
    const txHash = await writeClient.writeContract({
      address: contractAddress,
      functionName: 'submit_execution',
      args: [contractTaskId, output, reasoning, confidence, agentId],
      value: BigInt(0),
    });
    const receipt = await writeClient.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.FINALIZED,
      fullTransaction: true,
    });
    return {
      txId: txHash,
      status: 'FINALIZED',
      verificationStatus: receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN ? 'VERIFIED' : 'FAILED',
      blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : Math.floor(Math.random() * 999999) + 1,
    };
  }

  await simLatency();
  const receipt = {
    txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'FINALIZED',
    verificationStatus: 'VERIFIED',
    blockNumber: Math.floor(Math.random() * 999999) + 1,
  };
  mockTx('submit_execution', { contractTaskId, output, reasoning, confidence, agentId, verdict: 'VERIFIED' });
  console.log(`  → [Mock Bridge] Execution submitted — task ID: ${contractTaskId} | tx: ${receipt.txId}`);
  return receipt;
}

async function getTaskCount() {
  if (!mockMode && realClient) {
    try {
      const result = await realClient.readContract({
        address: contractAddress,
        functionName: 'get_task_counter',
        args: [],
      });
      return Number(result);
    } catch { return mockContractId; }
  }
  return mockContractId;
}

async function getOnchainTask(taskId) {
  if (!mockMode && realClient) {
    try {
      const result = await realClient.readContract({
        address: contractAddress,
        functionName: 'get_task',
        args: [taskId],
      });
      return result;
    } catch { return null; }
  }
  return null;
}

module.exports = {
  init,
  postTask,
  submitExecution,
  getTaskCount,
  getOnchainTask,
  isMockMode: () => mockMode,
  getLedger: () => mockLedger,
  getNetworkName: () => networkName,
  getContractAddress: () => contractAddress,
  buildChainConfig,
};
