const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { ethers } = require('ethers');

// ── CORS ────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}
function parseURL(req) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/\/+$/, '').split('/');
  return { url, parts, query: Object.fromEntries(url.searchParams) };
}

// ── Mock Onchain Bridge ─────────────────────
let mockContractId = 0;
const mockLedger = [];
function simLatency(ms = 2000) {
  return new Promise(r => setTimeout(r, ms));
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
async function mockPostTask(title, description, reward, constraints, deadline) {
  await simLatency();
  mockContractId++;
  const receipt = {
    txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    contractId: mockContractId, status: 'FINALIZED',
    blockNumber: Math.floor(Math.random() * 999999) + 1,
  };
  mockTx('post_task', { contractId: mockContractId, title, description, reward, constraints, deadline });
  return receipt;
}
async function mockSubmitExecution(contractTaskId, output, reasoning, confidence, agentId) {
  await simLatency();
  const receipt = {
    txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'FINALIZED', verificationStatus: 'VERIFIED',
    blockNumber: Math.floor(Math.random() * 999999) + 1,
  };
  mockTx('submit_execution', { contractTaskId, output, reasoning, confidence, agentId, verdict: 'VERIFIED' });
  return receipt;
}

// ── Data Store ──────────────────────────────
let taskCache = [
  { id: 'seed-1', title: 'Analyze Orbitjob Market Fit', description: 'Provide a detailed report on how Orbitjob compares to traditional freelancer platforms like Upwork.', status: 'COMPLETED', reward: 150, createdAt: new Date(Date.now() - 86400000).toISOString(), executionTrace: { agent: 'Antigravity Alpha', plan: ['Search competitors', 'Analyze fee structures', 'Summarize USPs'], startedAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 86300000).toISOString(), steps: [] }, verificationStatus: 'VERIFIED', result: { summary: 'Orbitjob offers 90% lower fees via GenLayer consensus.', data: {} }, confidenceScore: 0.95, assignedAgent: 'agent-alpha', txId: '0x7d...a1f', blockNumber: 42069, contractTaskId: 1 },
  { id: 'seed-2', title: 'Smart Contract Security Audit', description: 'Review the Orbitjob intelligent contract for potential reentrancy or logic flaws.', status: 'PENDING', reward: 500, createdAt: new Date().toISOString(), executionTrace: null, verificationStatus: 'NOT_VERIFIED', result: null, confidenceScore: 0, assignedAgent: 'agent-epsilon' }
];
const accentColors = ['purple', 'blue', 'green', 'orange', 'red', 'cyan'];
let agents = [
  { id: 'agent-alpha', name: 'Antigravity Alpha', model: 'qwen/qwen-2.5-coder:free', specialty: 'General Purpose', icon: 'cpu', price: 0.05, description: 'Versatile AI agent capable of handling a wide range of tasks from research to content generation.', useCases: ['Market research & trend analysis', 'General data processing', 'Document summarization', 'Multi-domain Q&A'], rating: 4.8, completedTasks: 142, status: 'IDLE', accent: 'purple' },
  { id: 'agent-beta', name: 'DataForge Beta', model: 'gpt-4-turbo', specialty: 'Data Analysis', icon: 'barChart', price: 0.08, description: 'Specialized in structured data analysis, statistical modeling, and visualization recommendations.', useCases: ['Dataset analysis & visualization', 'Statistical modeling', 'Financial report generation', 'Trend forecasting'], rating: 4.9, completedTasks: 89, status: 'IDLE', accent: 'blue' },
  { id: 'agent-gamma', name: 'CodeWeaver Gamma', model: 'gpt-4-turbo', specialty: 'Code Generation', icon: 'code', price: 0.10, description: 'Expert-level code generation and review agent supporting multiple languages and frameworks.', useCases: ['Code generation & review', 'Bug fixing & debugging', 'Test writing', 'Architecture & refactoring advice'], rating: 4.7, completedTasks: 214, status: 'BUSY', accent: 'green' },
  { id: 'agent-delta', name: 'Synthia Delta', model: 'gpt-4-turbo', specialty: 'Content Creation', icon: 'penLine', price: 0.06, description: 'Creative writing specialist with a flair for compelling narratives and marketing copy.', useCases: ['Copywriting & marketing content', 'Blog posts & articles', 'Social media content', 'Brand voice development'], rating: 4.6, completedTasks: 176, status: 'IDLE', accent: 'orange' },
  { id: 'agent-epsilon', name: 'Sentinel Epsilon', model: 'gpt-4-turbo', specialty: 'Security Audit', icon: 'shield', price: 0.12, description: 'Security-focused agent trained on OWASP top 10, CVE databases, and secure coding practices.', useCases: ['Smart contract security review', 'Code vulnerability scanning', 'Compliance checklist generation', 'Threat modeling'], rating: 4.9, completedTasks: 63, status: 'IDLE', accent: 'red' },
  { id: 'agent-zeta', name: 'Nexus Zeta', model: 'gpt-4-turbo', specialty: 'Deep Research', icon: 'search', price: 0.07, description: 'Deep research agent with advanced reasoning capabilities for synthesizing complex information.', useCases: ['Competitive analysis', 'Academic literature review', 'Technical deep dives', 'Feasibility studies'], rating: 4.8, completedTasks: 98, status: 'IDLE', accent: 'cyan' }
];
let sessions = {};

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = 'qwen/qwen-2.5-coder:free';

// ── Router ─────────────────────────────────
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const { parts, query } = parseURL(req);
  // parts: ['', 'api', 'tasks', ...] or ['', 'api'] or just ['', '']

  // Strip leading 'api' segment
  const segments = parts[1] === 'api' ? parts.slice(2) : parts.slice(1);
  const method = req.method;

  try {
    // ── Auth routes ──
    if (method === 'GET' && match(segments, ['auth', 'challenge'])) {
      if (!query.address) return json(res, { error: 'Address required' }, 400);
      const nonce = `Sign into Orbitjob on GenLayer\nAddress: ${query.address.toLowerCase()}\nNonce: ${Date.now()}`;
      sessions[query.address.toLowerCase()] = { nonce, expiresAt: Date.now() + 60000 };
      return json(res, { nonce, address: query.address });
    }

    if (method === 'POST' && match(segments, ['auth', 'signin'])) {
      const body = await readBody(req);
      const { address, signature } = body;
      if (!address || !signature) return json(res, { error: 'Address and signature required' }, 400);
      const session = sessions[address.toLowerCase()];
      if (!session || Date.now() > session.expiresAt) return json(res, { error: 'Challenge expired, request a new one' }, 401);
      try {
        const recovered = ethers.verifyMessage(session.nonce, signature);
        if (recovered.toLowerCase() !== address.toLowerCase()) return json(res, { error: 'Signature does not match address' }, 401);
      } catch {
        return json(res, { error: 'Invalid signature' }, 401);
      }
      delete sessions[address.toLowerCase()];
      const token = uuidv4();
      sessions[token] = { address: address.toLowerCase(), signedInAt: Date.now() };
      return json(res, { token, address: address.toLowerCase(), message: 'Signed in successfully' });
    }

    if (method === 'GET' && match(segments, ['auth', 'me'])) {
      const auth = req.headers.authorization || '';
      const token = auth.replace('Bearer ', '');
      if (!token || !sessions[token]) return json(res, { error: 'Not authenticated' }, 401);
      return json(res, { address: sessions[token].address });
    }

    // ── Health ──
    if (method === 'GET' && (segments.length === 0 || (segments.length === 1 && segments[0] === ''))) {
      return json(res, { status: 'Orbitjob backend running', seed: true });
    }

    // ── POST /tasks/:id/execute ──
    if (method === 'POST' && segments[0] === 'tasks' && segments[2] === 'execute' && segments.length === 3) {
      const id = segments[1];
      const taskIndex = taskCache.findIndex(t => t.id === id);
      if (taskIndex === -1) return json(res, { error: 'Task not found' }, 404);
      if (taskCache[taskIndex].status !== 'PENDING') return json(res, { error: 'Task is not in PENDING state' }, 400);

      const task = taskCache[taskIndex];
      const agent = agents.find(a => a.id === task.assignedAgent) || agents[0];
      task.status = 'EXECUTING';
      task.executionTrace = { agent: agent.name, plan: [], startedAt: new Date().toISOString(), completedAt: null, steps: [] };
      agent.status = 'BUSY';

      json(res, { message: 'Execution started', taskId: id, agent: agent.name });

      try {
        if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
          throw new Error('OPENROUTER_API_KEY is not set. Add it to the root .env file.');
        }

        const systemPrompt = `You are an AI agent executing tasks on the Orbitjob marketplace. Analyze the task and respond with valid JSON only (no markdown, no code fences):

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
          { model: OPENROUTER_MODEL, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Title: ${task.title}\n\nDescription: ${task.description}\n\nConstraints: ${task.constraints || 'None'}` }], temperature: 0.3, max_tokens: 1024 },
          { headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://orbitjob.vercel.app', 'X-Title': 'Orbitjob' } }
        );

        const raw = data.choices?.[0]?.message?.content || '';
        let parsed;
        try {
          parsed = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim());
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
        task.executionTrace.steps = reasoningTrace.map((action, i) => ({ step: i + 1, action, timestamp: new Date(Date.now() - (reasoningTrace.length - i) * 500).toISOString() }));
        task.result = { summary: aiResult.summary, data: aiResult.data };
        task.confidenceScore = confidence;
        task.verificationStatus = verified ? 'VERIFIED' : 'REJECTED';
        agent.status = 'IDLE';
        agent.completedTasks += 1;

        if (task.contractTaskId) {
          const bridgeReceipt = await mockSubmitExecution(task.contractTaskId, JSON.stringify(aiResult), JSON.stringify(reasoningTrace), confidence, agent.id);
          task.verificationStatus = bridgeReceipt.verificationStatus;
          task.txId = bridgeReceipt.txId;
          task.blockNumber = bridgeReceipt.blockNumber;
        }
      } catch (err) {
        task.status = 'FAILED';
        task.executionTrace.completedAt = new Date().toISOString();
        task.executionTrace.plan = task.executionTrace.plan || [];
        task.executionTrace.steps = [...(task.executionTrace.steps || []), { step: (task.executionTrace.steps?.length || 0) + 1, action: `[ERROR] ${err.message}`, timestamp: new Date().toISOString() }];
        task.result = { summary: `Execution failed: ${err.message}`, data: { analysis: '', findings: '', recommendation: '' } };
        task.confidenceScore = 0;
        task.verificationStatus = 'FAILED';
        agent.status = 'IDLE';
      }
      return;
    }

    // ── GET /tasks/:id ──
    if (method === 'GET' && segments.length === 2 && segments[0] === 'tasks') {
      const id = segments[1];
      const task = taskCache.find(t => t.id === id || t.contractTaskId === Number(id));
      if (!task) return json(res, { error: 'Task not found' }, 404);
      return json(res, task);
    }

    // ── GET /tasks ──
    if (method === 'GET' && match(segments, ['tasks'])) {
      return json(res, taskCache);
    }

    // ── POST /tasks ──
    if (method === 'POST' && match(segments, ['tasks'])) {
      const body = await readBody(req);
      const { title, description, constraints, reward, deadline, assignedAgent } = body;
      if (!title || !description) return json(res, { error: 'Title and description are required' }, 400);

      const receipt = await mockPostTask(title, description, Math.floor(reward) || 0, constraints || '', deadline || '');
      const agentObj = agents.find(a => a.id === assignedAgent) || agents[0];
      const newTask = {
        id: `contract-${receipt.contractId}`, title, description, constraints: constraints || '',
        reward: parseFloat(reward) || 0, deadline: deadline || null, status: 'PENDING',
        createdAt: new Date().toISOString(), executionTrace: null, verificationStatus: 'NOT_VERIFIED',
        result: null, confidenceScore: null, assignedAgent: agentObj.id, contractTaskId: receipt.contractId,
        txId: receipt.txId, blockNumber: receipt.blockNumber,
      };
      taskCache.push(newTask);
      return json(res, newTask, 201);
    }

    // ── GET /agents/:id ──
    if (method === 'GET' && segments.length === 2 && segments[0] === 'agents') {
      const agent = agents.find(a => a.id === segments[1]);
      if (!agent) return json(res, { error: 'Agent not found' }, 404);
      return json(res, agent);
    }

    // ── PUT /agents/:id ──
    if (method === 'PUT' && segments.length === 2 && segments[0] === 'agents') {
      const idx = agents.findIndex(a => a.id === segments[1]);
      if (idx === -1) return json(res, { error: 'Agent not found' }, 404);
      const body = await readBody(req);
      const { name, model, specialty, icon, price, description, useCases } = body;
      if (name) agents[idx].name = name;
      if (model) agents[idx].model = model;
      if (specialty) agents[idx].specialty = specialty;
      if (icon) agents[idx].icon = icon;
      if (price !== undefined) agents[idx].price = parseFloat(price);
      if (description) agents[idx].description = description;
      if (useCases) agents[idx].useCases = Array.isArray(useCases) ? useCases : agents[idx].useCases;
      return json(res, agents[idx]);
    }

    // ── DELETE /agents/:id ──
    if (method === 'DELETE' && match(segments, ['agents', '*'])) {
      const id = segments[1];
      const idx = agents.findIndex(a => a.id === id);
      if (idx === -1) return json(res, { error: 'Agent not found' }, 404);
      const removed = agents.splice(idx, 1)[0];
      return json(res, { message: 'Agent removed', agent: removed });
    }

    // ── GET /agents ──
    if (method === 'GET' && match(segments, ['agents'])) {
      return json(res, agents);
    }

    // ── POST /agents ──
    if (method === 'POST' && match(segments, ['agents'])) {
      const body = await readBody(req);
      const { name, model, specialty, icon, price, description, useCases } = body;
      if (!name || !description) return json(res, { error: 'Name and description are required' }, 400);
      const accent = accentColors[agents.length % accentColors.length];
      const newAgent = {
        id: uuidv4(), name, model: model || 'qwen/qwen-2.5-coder:free',
        specialty: specialty || 'General', icon: icon || 'cpu', price: parseFloat(price) || 0,
        description, useCases: Array.isArray(useCases) ? useCases : [],
        rating: 0, completedTasks: 0, status: 'IDLE', accent,
      };
      agents.push(newAgent);
      return json(res, newAgent, 201);
    }

    // ── 404 ──
    json(res, { error: 'Not found', path: parts.join('/') }, 404);
  } catch (err) {
    console.error('Server error:', err);
    json(res, { error: 'Internal server error' }, 500);
  }
};

function match(segments, pattern) {
  if (segments.length !== pattern.length) return false;
  return pattern.every((p, i) => p === '*' || p === segments[i]);
}
