const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

dotenv.config();
dotenv.config({ path: '../.env', override: true });

const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// ── Mock Onchain Bridge ──────────────────────────────────────
let mockContractId = 0;
const mockLedger = [];

function simLatency(ms = 2000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mockTx(type, data) {
  const tx = {
    txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data,
    blockTimestamp: new Date().toISOString(),
    blockNumber: Math.floor(Math.random() * 999999) + 1,
  };
  mockLedger.push(tx);
  return tx;
}

async function mockPostTask(title, description, reward, constraints, deadline) {
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

async function mockSubmitExecution(contractTaskId, output, reasoning, confidence, agentId) {
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

async function mockGetTaskCount() {
  return mockContractId;
}

// ── Task Cache ───────────────────────────────────────────────
let taskCache = [];

const accentColors = ['purple', 'blue', 'green', 'orange', 'red', 'cyan'];
const iconMap = { cpu: 'cpu', barChart: 'barChart', code: 'code', penLine: 'penLine', shield: 'shield', search: 'search' };

let agents = [
  { id: 'agent-alpha', name: 'Antigravity Alpha', model: 'qwen/qwen-2.5-coder:free', specialty: 'General Purpose', icon: 'cpu', price: 0.05, description: 'Versatile AI agent capable of handling a wide range of tasks from research to content generation.', useCases: ['Market research & trend analysis', 'General data processing', 'Document summarization', 'Multi-domain Q&A'], rating: 4.8, completedTasks: 142, status: 'IDLE', accent: 'purple' },
  { id: 'agent-beta', name: 'DataForge Beta', model: 'gpt-4-turbo', specialty: 'Data Analysis', icon: 'barChart', price: 0.08, description: 'Specialized in structured data analysis, statistical modeling, and visualization recommendations.', useCases: ['Dataset analysis & visualization', 'Statistical modeling', 'Financial report generation', 'Trend forecasting'], rating: 4.9, completedTasks: 89, status: 'IDLE', accent: 'blue' },
  { id: 'agent-gamma', name: 'CodeWeaver Gamma', model: 'gpt-4-turbo', specialty: 'Code Generation', icon: 'code', price: 0.10, description: 'Expert-level code generation and review agent supporting multiple languages and frameworks.', useCases: ['Code generation & review', 'Bug fixing & debugging', 'Test writing', 'Architecture & refactoring advice'], rating: 4.7, completedTasks: 214, status: 'BUSY', accent: 'green' },
  { id: 'agent-delta', name: 'Synthia Delta', model: 'gpt-4-turbo', specialty: 'Content Creation', icon: 'penLine', price: 0.06, description: 'Creative writing specialist with a flair for compelling narratives and marketing copy.', useCases: ['Copywriting & marketing content', 'Blog posts & articles', 'Social media content', 'Brand voice development'], rating: 4.6, completedTasks: 176, status: 'IDLE', accent: 'orange' },
  { id: 'agent-epsilon', name: 'Sentinel Epsilon', model: 'gpt-4-turbo', specialty: 'Security Audit', icon: 'shield', price: 0.12, description: 'Security-focused agent trained on OWASP top 10, CVE databases, and secure coding practices.', useCases: ['Smart contract security review', 'Code vulnerability scanning', 'Compliance checklist generation', 'Threat modeling'], rating: 4.9, completedTasks: 63, status: 'IDLE', accent: 'red' },
  { id: 'agent-zeta', name: 'Nexus Zeta', model: 'gpt-4-turbo', specialty: 'Deep Research', icon: 'search', price: 0.07, description: 'Deep research agent with advanced reasoning capabilities for synthesizing complex information.', useCases: ['Competitive analysis', 'Academic literature review', 'Technical deep dives', 'Feasibility studies'], rating: 4.8, completedTasks: 98, status: 'IDLE', accent: 'cyan' }
];

// ── Auth (Sign in with Ethereum / GenLayer) ────────────────────
const { ethers } = require('ethers');
let sessions = {};

app.get('/api/auth/challenge', (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'Address required' });
  const nonce = `Sign into Orbitwork on GenLayer\nAddress: ${address.toLowerCase()}\nNonce: ${Date.now()}`;
  sessions[address.toLowerCase()] = { nonce, expiresAt: Date.now() + 60000 };
  res.json({ nonce, address });
});

app.post('/api/auth/signin', (req, res) => {
  const { address, signature } = req.body;
  if (!address || !signature) return res.status(400).json({ error: 'Address and signature required' });
  const session = sessions[address.toLowerCase()];
  if (!session || Date.now() > session.expiresAt) return res.status(401).json({ error: 'Challenge expired, request a new one' });
  try {
    const recovered = ethers.verifyMessage(session.nonce, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) return res.status(401).json({ error: 'Signature does not match address' });
  } catch {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  delete sessions[address.toLowerCase()];
  const token = uuidv4();
  sessions[token] = { address: address.toLowerCase(), signedInAt: Date.now() };
  res.json({ token, address: address.toLowerCase(), message: 'Signed in successfully' });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions[token]) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ address: sessions[token].address });
});

// ── Health check ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'Orbitwork backend running' });
});

// ── Task Routes ──────────────────────────────────────────────

// List all tasks
app.get('/api/tasks', async (req, res) => {
  res.json(taskCache);
});

// Get single task
app.get('/api/tasks/:id', (req, res) => {
  const task = taskCache.find(t => t.id === req.params.id || t.contractTaskId === Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Create a task
app.post('/api/tasks', async (req, res) => {
  const { title, description, constraints, reward, deadline, assignedAgent } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  const receipt = await mockPostTask(title, description, Math.floor(reward) || 0, constraints || '', deadline || '');

  const agentObj = agents.find(a => a.id === assignedAgent) || agents[0];

  const newTask = {
    id: `contract-${receipt.contractId}`,
    title,
    description,
    constraints: constraints || '',
    reward: parseFloat(reward) || 0,
    deadline: deadline || null,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    executionTrace: null,
    verificationStatus: 'NOT_VERIFIED',
    result: null,
    confidenceScore: null,
    assignedAgent: agentObj.id,
    contractTaskId: receipt.contractId,
    txId: receipt.txId,
    blockNumber: receipt.blockNumber,
  };

  taskCache.push(newTask);
  res.status(201).json(newTask);
});

// ── Agent Execution ──────────────────────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = 'qwen/qwen-2.5-coder:free';

app.post('/api/tasks/:id/execute', async (req, res) => {
  const { id } = req.params;
  const taskIndex = taskCache.findIndex(t => t.id === id);

  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (taskCache[taskIndex].status !== 'PENDING') {
    return res.status(400).json({ error: 'Task is not in PENDING state' });
  }

  const task = taskCache[taskIndex];
  const agent = agents.find(a => a.id === task.assignedAgent) || agents[0];
  task.status = 'EXECUTING';
  task.executionTrace = {
    agent: agent.name,
    plan: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    steps: []
  };
  agent.status = 'BUSY';

  res.json({ message: 'Execution started', taskId: id, agent: agent.name });

  try {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
      throw new Error('OPENROUTER_API_KEY is not set. Add it to the root .env file.');
    }

    const systemPrompt = `You are an AI agent executing tasks on the Orbitwork marketplace. Analyze the task and respond with valid JSON only (no markdown, no code fences):

{
  "reasoning_trace": ["step 1 description", "step 2 description", ...],
  "result": {
    "summary": "brief summary of what was done",
    "data": {
      "analysis": "detailed analysis",
      "findings": "key findings",
      "recommendation": "recommendation"
    }
  },
  "confidence": 0.0 to 1.0
}

The confidence score should reflect how well you believe you fulfilled the task. Be honest.`;

    const { data } = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Title: ${task.title}\n\nDescription: ${task.description}\n\nConstraints: ${task.constraints || 'None'}` }
        ],
        temperature: 0.3,
        max_tokens: 1024
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5005',
          'X-Title': 'Orbitwork'
        }
      }
    );

    const raw = data.choices?.[0]?.message?.content || '';
    let parsed;

    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`AI returned invalid JSON. Response: ${raw.substring(0, 200)}`);
    }

    const reasoningTrace = parsed.reasoning_trace || [];
    const aiResult = parsed.result || { summary: 'No summary provided.', data: { analysis: '', findings: '', recommendation: '' } };
    const confidence = Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0));

    const verified = confidence >= 0.8;

    task.status = 'COMPLETED';
    task.executionTrace.plan = reasoningTrace;
    task.executionTrace.completedAt = new Date().toISOString();
    task.executionTrace.steps = reasoningTrace.map((action, i) => ({
      step: i + 1,
      action,
      timestamp: new Date(Date.now() - (reasoningTrace.length - i) * 500).toISOString()
    }));
    task.result = {
      summary: aiResult.summary,
      data: aiResult.data
    };
    task.confidenceScore = confidence;
    task.verificationStatus = verified ? 'VERIFIED' : 'REJECTED';
    agent.status = 'IDLE';
    agent.completedTasks += 1;

    console.log(`✓ Task "${task.title}" executed by ${agent.name} — confidence: ${confidence} — ${verified ? 'VERIFIED' : 'REJECTED'}`);

    // Submit execution result to Mock Bridge
    if (task.contractTaskId) {
      const outputStr = JSON.stringify(aiResult);
      const reasoningStr = JSON.stringify(reasoningTrace);
      const bridgeReceipt = await mockSubmitExecution(task.contractTaskId, outputStr, reasoningStr, confidence, agent.id);
      task.verificationStatus = bridgeReceipt.verificationStatus;
      task.txId = bridgeReceipt.txId;
      task.blockNumber = bridgeReceipt.blockNumber;
      console.log(`  → [Mock Bridge] Execution submitted — task ID: ${task.contractTaskId} | tx: ${bridgeReceipt.txId}`);
    }

  } catch (err) {
    console.error(`✗ Task "${task.title}" execution failed:`, err.message);

    task.status = 'FAILED';
    task.executionTrace.completedAt = new Date().toISOString();
    task.executionTrace.plan = task.executionTrace.plan || [];
    task.executionTrace.steps = [
      ...(task.executionTrace.steps || []),
      { step: (task.executionTrace.steps?.length || 0) + 1, action: `[ERROR] ${err.message}`, timestamp: new Date().toISOString() }
    ];
    task.result = {
      summary: `Execution failed: ${err.message}`,
      data: { analysis: '', findings: '', recommendation: '' }
    };
    task.confidenceScore = 0;
    task.verificationStatus = 'FAILED';
    agent.status = 'IDLE';
    agent.completedTasks += 0;
  }
});

// ── Agent Routes ─────────────────────────────────────────────

// List all agents
app.get('/api/agents', (req, res) => {
  res.json(agents);
});

// Get single agent
app.get('/api/agents/:id', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Create a new agent
app.post('/api/agents', (req, res) => {
  const { name, model, specialty, icon, price, description, useCases } = req.body;

  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description are required' });
  }

  const accent = accentColors[agents.length % accentColors.length];

  const newAgent = {
    id: uuidv4(),
    name,
    model: model || 'qwen/qwen-2.5-coder:free',
    specialty: specialty || 'General',
    icon: icon || 'cpu',
    price: parseFloat(price) || 0,
    description,
    useCases: Array.isArray(useCases) ? useCases : [],
    rating: 0,
    completedTasks: 0,
    status: 'IDLE',
    accent
  };

  agents.push(newAgent);
  res.status(201).json(newAgent);
});

// Update an agent
app.put('/api/agents/:id', (req, res) => {
  const idx = agents.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Agent not found' });

  const { name, model, specialty, icon, price, description, useCases } = req.body;
  if (name) agents[idx].name = name;
  if (model) agents[idx].model = model;
  if (specialty) agents[idx].specialty = specialty;
  if (icon) agents[idx].icon = icon;
  if (price !== undefined) agents[idx].price = parseFloat(price);
  if (description) agents[idx].description = description;
  if (useCases) agents[idx].useCases = Array.isArray(useCases) ? useCases : agents[idx].useCases;

  res.json(agents[idx]);
});

// Delete an agent
app.delete('/api/agents/:id', (req, res) => {
  const idx = agents.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Agent not found' });

  const removed = agents.splice(idx, 1)[0];
  res.json({ message: 'Agent removed', agent: removed });
});

// ── Start Server ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ⚡ Orbitwork Backend [Mock Onchain Mode]`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → ${taskCache.length} tasks | ${agents.length} agents`);
  console.log(`  → Mock Bridge active — ${mockLedger.length} transactions logged`);
  console.log();
});
