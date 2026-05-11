const axios = require('axios');
const { ethers } = require('ethers');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}
let mockContractId = 0, taskCache = [
  { id: 'seed-1', title: 'Analyze Orbitjob Market Fit', description: 'Provide a detailed report on how Orbitjob compares to traditional freelancer platforms like Upwork.', status: 'COMPLETED', reward: 150, createdAt: new Date(Date.now() - 86400000).toISOString(), executionTrace: { agent: 'Antigravity Alpha', plan: ['Search competitors', 'Analyze fee structures', 'Summarize USPs'], startedAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 86300000).toISOString(), steps: [] }, verificationStatus: 'VERIFIED', result: { summary: 'Orbitjob offers 90% lower fees via GenLayer consensus.', data: {} }, confidenceScore: 0.95, assignedAgent: 'agent-alpha', txId: '0x7d...a1f', blockNumber: 42069, contractTaskId: 1 },
  { id: 'seed-2', title: 'Smart Contract Security Audit', description: 'Review the Orbitjob intelligent contract for potential reentrancy or logic flaws.', status: 'PENDING', reward: 500, createdAt: new Date().toISOString(), executionTrace: null, verificationStatus: 'NOT_VERIFIED', result: null, confidenceScore: 0, assignedAgent: 'agent-epsilon' }
], agents = [
  { id: 'agent-alpha', name: 'Antigravity Alpha', model: 'qwen/qwen-2.5-coder:free', specialty: 'General Purpose', icon: 'cpu', price: 0.05, description: 'Versatile AI agent capable of handling a wide range of tasks from research to content generation.', useCases: ['Market research & trend analysis', 'General data processing', 'Document summarization', 'Multi-domain Q&A'], rating: 4.8, completedTasks: 142, status: 'IDLE', accent: 'purple' },
  { id: 'agent-beta', name: 'DataForge Beta', model: 'gpt-4-turbo', specialty: 'Data Analysis', icon: 'barChart', price: 0.08, description: 'Specialized in structured data analysis, statistical modeling, and visualization recommendations.', useCases: ['Dataset analysis & visualization', 'Statistical modeling', 'Financial report generation', 'Trend forecasting'], rating: 4.9, completedTasks: 89, status: 'IDLE', accent: 'blue' },
  { id: 'agent-gamma', name: 'CodeWeaver Gamma', model: 'gpt-4-turbo', specialty: 'Code Generation', icon: 'code', price: 0.10, description: 'Expert-level code generation and review agent supporting multiple languages and frameworks.', useCases: ['Code generation & review', 'Bug fixing & debugging', 'Test writing', 'Architecture & refactoring advice'], rating: 4.7, completedTasks: 214, status: 'BUSY', accent: 'green' },
  { id: 'agent-delta', name: 'Synthia Delta', model: 'gpt-4-turbo', specialty: 'Content Creation', icon: 'penLine', price: 0.06, description: 'Creative writing specialist with a flair for compelling narratives and marketing copy.', useCases: ['Copywriting & marketing content', 'Blog posts & articles', 'Social media content', 'Brand voice development'], rating: 4.6, completedTasks: 176, status: 'IDLE', accent: 'orange' },
  { id: 'agent-epsilon', name: 'Sentinel Epsilon', model: 'gpt-4-turbo', specialty: 'Security Audit', icon: 'shield', price: 0.12, description: 'Security-focused agent trained on OWASP top 10, CVE databases, and secure coding practices.', useCases: ['Smart contract security review', 'Code vulnerability scanning', 'Compliance checklist generation', 'Threat modeling'], rating: 4.9, completedTasks: 63, status: 'IDLE', accent: 'red' },
  { id: 'agent-zeta', name: 'Nexus Zeta', model: 'gpt-4-turbo', specialty: 'Deep Research', icon: 'search', price: 0.07, description: 'Deep research agent with advanced reasoning capabilities for synthesizing complex information.', useCases: ['Competitive analysis', 'Academic literature review', 'Technical deep dives', 'Feasibility studies'], rating: 4.8, completedTasks: 98, status: 'IDLE', accent: 'cyan' }
];
const accentColors = ['purple', 'blue', 'green', 'orange', 'red', 'cyan'];
const crypto = require('crypto');

function uuid() { return crypto.randomUUID(); }

let mockLedger = [];
function mockTx(type, data) {
  const tx = { txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type, data, blockTimestamp: new Date().toISOString(), blockNumber: Math.floor(Math.random() * 999999) + 1 };
  mockLedger.push(tx); return tx;
}
async function mockPostTask(title, description, reward, constraints, deadline) {
  await new Promise(r => setTimeout(r, 2000));
  mockContractId++;
  const receipt = { txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, contractId: mockContractId, status: 'FINALIZED', blockNumber: Math.floor(Math.random() * 999999) + 1 };
  mockTx('post_task', { contractId: mockContractId, title, description, reward, constraints, deadline });
  return receipt;
}
async function mockSubmitExecution(contractTaskId, output, reasoning, confidence, agentId) {
  await new Promise(r => setTimeout(r, 2000));
  const receipt = { txId: `tx_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, status: 'FINALIZED', verificationStatus: 'VERIFIED', blockNumber: Math.floor(Math.random() * 999999) + 1 };
  mockTx('submit_execution', { contractTaskId, output, reasoning, confidence, agentId, verdict: 'VERIFIED' });
  return receipt;
}

let sessions = {};
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.AGENT_MODEL || 'qwen/qwen-2.5-coder:free';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/\/+$/, '').split('/');
  const seg = parts[1] === 'api' ? parts.slice(2) : parts.slice(1);
  const method = req.method;
  const s = (i) => seg[i] || '';
  const q = Object.fromEntries(url.searchParams);
  try {
    // Auth challenge
    if (method === 'GET' && s(0) === 'auth' && s(1) === 'challenge') {
      if (!q.address) return json(res, { error: 'Address required' }, 400);
      const nonce = `Sign into Orbitjob on GenLayer\nAddress: ${q.address.toLowerCase()}\nNonce: ${Date.now()}`;
      sessions[q.address.toLowerCase()] = { nonce, expiresAt: Date.now() + 60000 };
      return json(res, { nonce, address: q.address });
    }
    // Auth signin
    if (method === 'POST' && s(0) === 'auth' && s(1) === 'signin') {
      const body = await readBody(req);
      if (!body.address || !body.signature) return json(res, { error: 'Address and signature required' }, 400);
      const session = sessions[body.address.toLowerCase()];
      if (!session || Date.now() > session.expiresAt) return json(res, { error: 'Challenge expired' }, 401);
      try {
        const recovered = ethers.utils.verifyMessage(session.nonce, body.signature);
        if (recovered.toLowerCase() !== body.address.toLowerCase()) return json(res, { error: 'Signature mismatch' }, 401);
      } catch { return json(res, { error: 'Invalid signature' }, 401); }
      delete sessions[body.address.toLowerCase()];
      const token = uuid();
      sessions[token] = { address: body.address.toLowerCase(), signedInAt: Date.now() };
      return json(res, { token, address: body.address.toLowerCase(), message: 'Signed in successfully' });
    }
    // Auth me
    if (method === 'GET' && s(0) === 'auth' && s(1) === 'me') {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!token || !sessions[token]) return json(res, { error: 'Not authenticated' }, 401);
      return json(res, { address: sessions[token].address });
    }
    // Health
    if (method === 'GET' && (seg.length === 0 || s(0) === '')) {
      return json(res, { status: 'Orbitjob backend running', seed: true });
    }
    // Execute task (async - returns immediately)
    if (method === 'POST' && s(0) === 'tasks' && s(2) === 'execute') {
      const id = s(1), idx = taskCache.findIndex(t => t.id === id);
      if (idx === -1) return json(res, { error: 'Task not found' }, 404);
      if (taskCache[idx].status !== 'PENDING') return json(res, { error: 'Task is not in PENDING state' }, 400);
      const task = taskCache[idx], agent = agents.find(a => a.id === task.assignedAgent) || agents[0];
      task.status = 'EXECUTING';
      task.executionTrace = { agent: agent.name, plan: [], startedAt: new Date().toISOString(), completedAt: null, steps: [] };
      agent.status = 'BUSY';
      json(res, { message: 'Execution started', taskId: id, agent: agent.name });
      try {
        if (!OPENROUTER_KEY || OPENROUTER_KEY === 'your_openrouter_api_key_here') throw new Error('OPENROUTER_API_KEY is not set.');
        const sys = 'You are an AI agent executing tasks on the Orbitjob marketplace. Analyze the task and respond with valid JSON only (no markdown, no code fences):\n\n{"reasoning_trace":["step 1","step 2",...],"result":{"summary":"...","data":{"analysis":"...","findings":"...","recommendation":"..."}},"confidence":0.0 to 1.0}\n\nThe confidence score should reflect how well you believe you fulfilled the task. Be honest.';
        const { data } = await axios.post('https://openrouter.ai/api/v1/chat/completions', { model: OPENROUTER_MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: `Title: ${task.title}\n\nDescription: ${task.description}\n\nConstraints: ${task.constraints || 'None'}` }], temperature: 0.3, max_tokens: 1024 }, { headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://orbitjob.vercel.app', 'X-Title': 'Orbitjob' } });
        const raw = data.choices?.[0]?.message?.content || '';
        let parsed;
        try { parsed = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()); } catch { throw new Error(`AI returned invalid JSON. Response: ${raw.substring(0, 200)}`); }
        const rt = parsed.reasoning_trace || [];
        const r = parsed.result || { summary: 'No summary provided.', data: { analysis: '', findings: '', recommendation: '' } };
        const conf = Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0));
        const verified = conf >= 0.8;
        task.status = 'COMPLETED'; task.executionTrace.plan = rt; task.executionTrace.completedAt = new Date().toISOString();
        task.executionTrace.steps = rt.map((a, i) => ({ step: i + 1, action: a, timestamp: new Date(Date.now() - (rt.length - i) * 500).toISOString() }));
        task.result = { summary: r.summary, data: r.data }; task.confidenceScore = conf; task.verificationStatus = verified ? 'VERIFIED' : 'REJECTED';
        agent.status = 'IDLE'; agent.completedTasks += 1;
        if (task.contractTaskId) { const br = await mockSubmitExecution(task.contractTaskId, JSON.stringify(r), JSON.stringify(rt), conf, agent.id); task.verificationStatus = br.verificationStatus; task.txId = br.txId; task.blockNumber = br.blockNumber; }
      } catch (err) {
        task.status = 'FAILED'; task.executionTrace.completedAt = new Date().toISOString(); task.executionTrace.plan = task.executionTrace.plan || [];
        task.executionTrace.steps = [...(task.executionTrace.steps || []), { step: (task.executionTrace.steps?.length || 0) + 1, action: `[ERROR] ${err.message}`, timestamp: new Date().toISOString() }];
        task.result = { summary: `Execution failed: ${err.message}`, data: { analysis: '', findings: '', recommendation: '' } };
        task.confidenceScore = 0; task.verificationStatus = 'FAILED'; agent.status = 'IDLE';
      }
      return;
    }
    // GET tasks/:id
    if (method === 'GET' && seg.length === 2 && s(0) === 'tasks') {
      const task = taskCache.find(t => t.id === s(1) || t.contractTaskId === Number(s(1)));
      if (!task) return json(res, { error: 'Task not found' }, 404);
      return json(res, task);
    }
    // GET tasks / POST tasks
    if (s(0) === 'tasks') {
      if (method === 'GET') return json(res, taskCache);
      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.title || !body.description) return json(res, { error: 'Title and description are required' }, 400);
        const receipt = await mockPostTask(body.title, body.description, Math.floor(body.reward) || 0, body.constraints || '', body.deadline || '');
        const ao = agents.find(a => a.id === body.assignedAgent) || agents[0];
        const nt = { id: `contract-${receipt.contractId}`, title: body.title, description: body.description, constraints: body.constraints || '', reward: parseFloat(body.reward) || 0, deadline: body.deadline || null, status: 'PENDING', createdAt: new Date().toISOString(), executionTrace: null, verificationStatus: 'NOT_VERIFIED', result: null, confidenceScore: null, assignedAgent: ao.id, contractTaskId: receipt.contractId, txId: receipt.txId, blockNumber: receipt.blockNumber };
        taskCache.push(nt);
        return json(res, nt, 201);
      }
    }
    // Agents routes
    if (s(0) === 'agents') {
      if (method === 'GET' && seg.length === 2) {
        const a = agents.find(x => x.id === s(1));
        if (!a) return json(res, { error: 'Agent not found' }, 404);
        return json(res, a);
      }
      if (method === 'PUT' && seg.length === 2) {
        const i = agents.findIndex(x => x.id === s(1));
        if (i === -1) return json(res, { error: 'Agent not found' }, 404);
        const b = await readBody(req);
        if (b.name) agents[i].name = b.name; if (b.model) agents[i].model = b.model; if (b.specialty) agents[i].specialty = b.specialty; if (b.icon) agents[i].icon = b.icon; if (b.price !== undefined) agents[i].price = parseFloat(b.price); if (b.description) agents[i].description = b.description; if (b.useCases) agents[i].useCases = Array.isArray(b.useCases) ? b.useCases : agents[i].useCases;
        return json(res, agents[i]);
      }
      if (method === 'DELETE') {
        const i = agents.findIndex(x => x.id === s(1));
        if (i === -1) return json(res, { error: 'Agent not found' }, 404);
        const r = agents.splice(i, 1)[0];
        return json(res, { message: 'Agent removed', agent: r });
      }
      if (method === 'GET') return json(res, agents);
      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.name || !body.description) return json(res, { error: 'Name and description are required' }, 400);
        const na = { id: uuid(), name: body.name, model: body.model || 'qwen/qwen-2.5-coder:free', specialty: body.specialty || 'General', icon: body.icon || 'cpu', price: parseFloat(body.price) || 0, description: body.description, useCases: Array.isArray(body.useCases) ? body.useCases : [], rating: 0, completedTasks: 0, status: 'IDLE', accent: accentColors[agents.length % accentColors.length] };
        agents.push(na);
        return json(res, na, 201);
      }
    }
    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    console.error('Server error:', err);
    json(res, { error: 'Internal server error' }, 500);
  }
};
