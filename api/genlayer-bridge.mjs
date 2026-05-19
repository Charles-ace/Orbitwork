import { createClient, createAccount } from 'genlayer-js';
import * as chains from 'genlayer-js/chains';

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

export function simLatency(ms = 2000) {
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
    const known = chains[network] || chains.chains?.[network];
    if (known) return { ...known };
  } catch {}

  const rpcUrl = process.env.GENLAYER_RPC_URL;
  const rpcMap = {
    localnet: 'http://127.0.0.1:8545',
    bradbury: 'https://rpc-bradbury.genlayer.com',
    studionet: 'https://studio.genlayer.com/api',
    testnet: 'https://testnet.genlayer.net',
    mainnet: 'https://mainnet.genlayer.net',
  };

  const chainName = network === 'studionet' ? 'studionet' : network === 'bradbury' ? 'testnetBradbury' : network;
  const chainObj = chains[chainName] || chains.chains?.[chainName];
  if (chainObj) return chainObj;

  return {
    id: (network === 'studionet' || network === 'bradbury') ? 4221 : 61123n,
    name: network,
    rpc: { default: rpcUrl || rpcMap[network] || `https://${network}.genlayer.net` },
  };
}

export async function init(customLogger) {
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
      console.log(`  → Real bridge init failed, falling back to mock mode`);
    }
  } else {
    console.log(`\n  ⚡ Initializing Mock GenLayer Bridge...`);
    mockMode = true;
  }
}

export async function postTask(title, description, reward) {
  if (!mockMode && writeClient) {
    try {
      const txHash = await writeClient.writeContract({
        address: contractAddress,
        functionName: 'post_task',
        args: [title, description, reward],
      });
      return txHash;
    } catch { return mockTx('POST_TASK', { title, description, reward }).txId; }
  }
  return mockTx('POST_TASK', { title, description, reward }).txId;
}

export async function submitExecution(taskId, output, agentId) {
  if (!mockMode && writeClient) {
    try {
      const txHash = await writeClient.writeContract({
        address: contractAddress,
        functionName: 'submit_execution',
        args: [String(taskId), output, agentId],
      });
      return txHash;
    } catch { return mockTx('SUBMIT_EXECUTION', { taskId, output, agentId }).txId; }
  }
  return mockTx('SUBMIT_EXECUTION', { taskId, output, agentId }).txId;
}

export async function getTaskCount() {
  if (!mockMode && realClient) {
    try {
      const counter = await realClient.readContract({
        address: contractAddress,
        functionName: 'get_task_count',
        args: [],
      });
      return Number(counter);
    } catch { return mockContractId; }
  }
  return mockContractId;
}

export async function getOnchainTask(taskId) {
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

export const isMockMode = () => mockMode;
export const getLedger = () => mockLedger;
export const getNetworkName = () => networkName;
export const getContractAddress = () => contractAddress;
export const getInitError = () => initError;
export { buildChainConfig };
export const setMockContractId = (id) => { mockContractId = id; };
