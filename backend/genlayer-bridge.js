let realClient = null;
let writeClient = null;
let mockMode = true;
let contractAddress = null;
let networkName = 'localnet';
let log = null;
let initError = null;

let mockContractId = 0;
const mockLedger = [];

function logger() {
  return log || { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
}

function cleanEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveNetworkFromEnv() {
  const explicitNetwork = cleanEnv(process.env.GENLAYER_NETWORK).toLowerCase();
  if (explicitNetwork) return explicitNetwork;
  if (cleanEnv(process.env.GENLAYER_CONTRACT_ADDRESS)) return 'bradbury';
  return process.env.VERCEL_ENV === 'production' ? 'bradbury' : 'localnet';
}

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
  const network = resolveNetworkFromEnv();
  networkName = network;

  try {
    const { createClient, createAccount } = await import('genlayer-js');
    const chain = await buildChainConfig(network);
    realClient = createClient({ chain });

    const counter = await realClient.readContract({
      address: contractAddress,
      functionName: 'get_task_count',
      args: [],
    });
    logger().info({ network, taskCount: Number(counter) }, `Connected to ${network}. Task count: ${counter}`);

    const privateKey = process.env.GENLAYER_PRIVATE_KEY || null;
    const accountStr = process.env.GENLAYER_ACCOUNT_ADDRESS || null;

    if (privateKey) {
      const account = createAccount(privateKey);
      writeClient = createClient({ chain, account });
      logger().info({ account: account.address }, 'Write client ready');
    } else if (accountStr) {
      writeClient = createClient({ chain, account: accountStr, provider: undefined });
      logger().info({ address: accountStr }, 'Write client ready');
    } else {
      logger().warn('No private key — writes will use mock fallback');
    }

    return true;
  } catch (err) {
    initError = err.message + (err.stack ? '\n' + err.stack : '');
    logger().error({ err, network }, `Bridge init failed for ${network}, falling back to mock mode`);
    return false;
  }
}

async function buildChainConfig(network) {
  try {
    const chainsModule = await import('genlayer-js/chains');
    const chainName = network === 'studionet' ? 'studionet' : network === 'bradbury' ? 'testnetBradbury' : network;
    const known = chainsModule?.[chainName] || chainsModule?.chains?.[chainName];
    if (known) return { ...known };
  } catch {}

  const rpcUrl = process.env.GENLAYER_RPC_URL;
  const rpcMap = {
    localnet: 'http://127.0.0.1:8545',
    bradbury: 'https://rpc-bradbury.genlayer.com',
    testnet: 'https://testnet.genlayer.net',
    mainnet: 'https://mainnet.genlayer.net',
  };

  return {
    id: (network === 'studionet' || network === 'bradbury') ? 4221 : 61123n,
    name: network,
    rpc: { default: rpcUrl || rpcMap[network] || `https://${network}.genlayer.net` },
  };
}

async function init(customLogger) {
  if (customLogger) log = customLogger;
  contractAddress = cleanEnv(process.env.GENLAYER_CONTRACT_ADDRESS) || null;
  const mode = cleanEnv(process.env.GENLAYER_MODE) || (contractAddress ? 'real' : 'mock');

  if (contractAddress && mode === 'real') {
    console.log(`\n  ⚡ Initializing GenLayer Bridge...`);
    console.log(`  → Contract: ${contractAddress}`);
    const ok = await initRealBridge();
    if (ok) {
      mockMode = false;
      console.log(`  → ${networkName} mode active`);
    } else {
      throw new Error(`Failed to initialize GenLayer Bridge in real mode on ${networkName}. Check your GENLAYER_CONTRACT_ADDRESS, private keys, or RPC status.`);
    }
  }

  if (mockMode) {
    console.log(`  → Mock Bridge active (contract: ${contractAddress || 'none'})`);
  }
}

async function postTask(title, description, reward, constraints, deadline) {
  if (!mockMode && writeClient) {
    const { TransactionStatus, ExecutionResult } = await import('genlayer-js/types');
    const txHash = await writeClient.writeContract({
      address: contractAddress,
      functionName: 'post_task',
      args: [title, description, String(Math.floor(reward || 0))],
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
      functionName: 'get_task_count',
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
  logger().info({ contractId: mockContractId, txId: receipt.txId }, 'Task posted (mock)');
  return receipt;
}

async function submitExecution(contractTaskId, output, reasoning, confidence, agentId) {
  if (!mockMode && writeClient) {
    const { TransactionStatus, ExecutionResult } = await import('genlayer-js/types');
    const txHash = await writeClient.writeContract({
      address: contractAddress,
      functionName: 'submit_execution',
      args: [String(contractTaskId), output || '', agentId || 'agent-default'],
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
  logger().info({ taskId: contractTaskId, txId: receipt.txId }, 'Execution submitted (mock)');
  return receipt;
}

async function getTaskCount() {
  if (!mockMode && realClient) {
    try {
      const result = await realClient.readContract({
        address: contractAddress,
        functionName: 'get_task_count',
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
      const [title, status, output] = await Promise.all([
        realClient.readContract({ address: contractAddress, functionName: 'get_task_title', args: [String(taskId)] }),
        realClient.readContract({ address: contractAddress, functionName: 'get_task_status', args: [String(taskId)] }),
        realClient.readContract({ address: contractAddress, functionName: 'get_task_output', args: [String(taskId)] }),
      ]);
      return { title, status, output };
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
  getInitError: () => initError,
  buildChainConfig,
  setMockContractId: (id) => { mockContractId = id; },
};
