const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('ethers');
const db = require('./db');
const bridge = require('../backend/genlayer-bridge');

bridge.init().catch(err => console.error('Bridge init failed:', err.message));

// ── Skills Loader (cache at init) ──
const SKILLS_FILE = path.join(__dirname, '..', 'docs', 'expert-skills.md');

function loadSkillsFromFile() {
  try {
    if (fs.existsSync(SKILLS_FILE)) {
      const raw = fs.readFileSync(SKILLS_FILE, 'utf-8');
      const skills = [];
      const skillBlocks = raw.match(/### Skill: .*?(?=### Skill:|$)/gs) || [];
      for (const block of skillBlocks) {
        const idMatch = block.match(/### Skill:\s*(\S+)/);
        const labelMatch = block.match(/\*\*Label\*\*:\s*(.+)/);
        const descMatch = block.match(/\*\*Description\*\*:\s*(.+)/);
        const directiveMatch = block.match(/\*\*Prompt Directive\*\*:\s*(.+)/);
        if (idMatch) {
          skills.push({
            id: idMatch[1].trim(),
            label: labelMatch ? labelMatch[1].trim() : idMatch[1].trim(),
            description: descMatch ? descMatch[1].trim() : '',
            promptDirective: directiveMatch ? directiveMatch[1].trim() : '',
          });
        }
      }
      return { raw, skills };
    }
  } catch (e) {
    console.error('Failed to load skills file:', e.message);
  }
  return { raw: '', skills: [] };
}

let skillsCache = null;
function getSkills() {
  if (!skillsCache) skillsCache = loadSkillsFromFile();
  return skillsCache;
}

// ── Onchain Bridge ──
// Uses shared genlayer-bridge from backend/ — falls back to mock when no contract configured

// ── Seed Data (only in mock mode — live mode uses onchain state) ──
const seedTasks = [
  {
    id: 'seed-1',
    title: 'Analyze Orbitjob Market Fit',
    description: 'Provide a detailed report on how Orbitjob compares to traditional freelancer platforms like Upwork.',
    status: 'COMPLETED',
    reward: 150,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    executionTrace: { agent: 'Antigravity Alpha', plan: ['Search competitors', 'Analyze fee structures', 'Summarize USPs'], startedAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 86300000).toISOString(), steps: [] },
    verificationStatus: 'VERIFIED',
    result: { summary: 'Orbitjob offers 90% lower fees via GenLayer consensus.', data: {} },
    confidenceScore: 0.95,
    assignedAgent: 'agent-alpha',
    txId: '0x7d...a1f',
    blockNumber: 42069,
    contractTaskId: 1
  },
  {
    id: 'seed-2',
    title: 'Smart Contract Security Audit',
    description: 'Review the Orbitjob intelligent contract for potential reentrancy or logic flaws.',
    status: 'PENDING',
    reward: 500,
    createdAt: new Date().toISOString(),
    executionTrace: null,
    verificationStatus: 'NOT_VERIFIED',
    result: null,
    confidenceScore: 0,
    assignedAgent: 'agent-epsilon'
  }
];

const seedAgents = [
  { id: 'agent-alpha', name: 'Antigravity Alpha', model: 'qwen/qwen-2.5-coder:free', specialty: 'General Purpose', icon: 'cpu', price: 0.05, description: 'Versatile AI agent capable of handling a wide range of tasks from research to content generation.', useCases: ['Market research & trend analysis', 'General data processing', 'Document summarization', 'Multi-domain Q&A'], rating: 4.8, completedTasks: 142, status: 'IDLE', accent: 'purple', skills: ['web-research', 'content-gen'] },
  { id: 'agent-beta', name: 'DataForge Beta', model: 'gpt-4-turbo', specialty: 'Data Analysis', icon: 'barChart', price: 0.08, description: 'Specialized in structured data analysis, statistical modeling, and visualization recommendations.', useCases: ['Dataset analysis & visualization', 'Statistical modeling', 'Financial report generation', 'Trend forecasting'], rating: 4.9, completedTasks: 89, status: 'IDLE', accent: 'blue', skills: ['data-analysis', 'content-gen'] },
  { id: 'agent-gamma', name: 'CodeWeaver Gamma', model: 'gpt-4-turbo', specialty: 'Code Generation', icon: 'code', price: 0.10, description: 'Expert-level code generation and review agent supporting multiple languages and frameworks.', useCases: ['Code generation & review', 'Bug fixing & debugging', 'Test writing', 'Architecture & refactoring advice'], rating: 4.7, completedTasks: 214, status: 'BUSY', accent: 'green', skills: ['code-analysis'] },
  { id: 'agent-delta', name: 'Synthia Delta', model: 'gpt-4-turbo', specialty: 'Content Creation', icon: 'penLine', price: 0.06, description: 'Creative writing specialist with a flair for compelling narratives and marketing copy.', useCases: ['Copywriting & marketing content', 'Blog posts & articles', 'Social media content', 'Brand voice development'], rating: 4.6, completedTasks: 176, status: 'IDLE', accent: 'orange', skills: ['content-gen'] },
  { id: 'agent-epsilon', name: 'Sentinel Epsilon', model: 'gpt-4-turbo', specialty: 'Security Audit', icon: 'shield', price: 0.12, description: 'Security-focused agent trained on OWASP top 10, CVE databases, and secure coding practices.', useCases: ['Smart contract security review', 'Code vulnerability scanning', 'Compliance checklist generation', 'Threat modeling'], rating: 4.9, completedTasks: 63, status: 'IDLE', accent: 'red', skills: ['code-analysis', 'security-audit'] },
  { id: 'agent-zeta', name: 'Nexus Zeta', model: 'gpt-4-turbo', specialty: 'Deep Research', icon: 'search', price: 0.07, description: 'Deep research agent with advanced reasoning capabilities for synthesizing complex information.', useCases: ['Competitive analysis', 'Academic literature review', 'Technical deep dives', 'Feasibility studies'], rating: 4.8, completedTasks: 98, status: 'IDLE', accent: 'cyan', skills: ['web-research', 'data-analysis'] }
];

// ── Persistent Storage ──
let taskCache = [];

let ready = bridge.init().then(() => {
  if (bridge.isMockMode()) {
    taskCache.push(...seedTasks);
    db.setTasks(taskCache);
  }
}).catch(err => console.error('Bridge init failed:', err.message));
let agents = db.loadAgents(seedAgents);

// ── Auth Sessions ──
let sessions = {};

// ── Helpers ──
const accentColors = ['purple', 'blue', 'green', 'orange', 'red', 'cyan'];

const send = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
};

const parseBody = (req) => new Promise((resolve) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try { resolve(JSON.parse(body || '{}')); }
    catch { resolve({}); }
  });
});

const matchPath = (url) => {
  const p = new URL(url, 'http://localhost').pathname;
  const apiMatch = p.match(/^\/api(?:\/(.*))?$/);
  const base = apiMatch ? apiMatch[1] : p.slice(1);
  return { base, isApi: !!apiMatch };
};

// ── Handler ──
module.exports = async (req, res) => {
  await ready;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const { base } = matchPath(req.url);

  try {
    // GET /api/
    if (req.method === 'GET' && (base === '' || base === 'index.js')) {
      return send(res, 200, {
        status: 'Orbitjob backend running',
        mode: bridge.isMockMode() ? 'mock' : 'live',
        network: bridge.getNetworkName(),
        contractAddress: bridge.getContractAddress(),
      });
    }

    // ── Auth Routes ──
    // GET /api/auth/challenge?address=0x...
    if (req.method === 'GET' && base === 'auth/challenge') {
      const url = new URL(req.url, 'http://localhost');
      const address = url.searchParams.get('address');
      if (!address) return send(res, 400, { error: 'Address required' });
      const nonce = `Sign into Orbitjob on GenLayer\nAddress: ${address.toLowerCase()}\nNonce: ${Date.now()}`;
      sessions[address.toLowerCase()] = { nonce, expiresAt: Date.now() + 60000 };
      return send(res, 200, { nonce, address });
    }

    // POST /api/auth/signin
    if (req.method === 'POST' && base === 'auth/signin') {
      const { address, signature } = await parseBody(req);
      if (!address || !signature) return send(res, 400, { error: 'Address and signature required' });
      const session = sessions[address.toLowerCase()];
      if (!session || Date.now() > session.expiresAt) return send(res, 401, { error: 'Challenge expired, request a new one' });
      try {
        const recovered = ethers.utils.verifyMessage(session.nonce, signature);
        if (recovered.toLowerCase() !== address.toLowerCase()) return send(res, 401, { error: 'Signature does not match address' });
      } catch {
        return send(res, 401, { error: 'Invalid signature' });
      }
      delete sessions[address.toLowerCase()];
      const token = randomUUID();
      sessions[token] = { address: address.toLowerCase(), signedInAt: Date.now() };
      return send(res, 200, { token, address: address.toLowerCase(), message: 'Signed in successfully' });
    }

    // GET /api/auth/me
    if (req.method === 'GET' && base === 'auth/me') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      if (!token || !sessions[token]) return send(res, 401, { error: 'Not authenticated' });
      return send(res, 200, { address: sessions[token].address });
    }

    // ── Skills Routes ──
    // GET /api/skills
    if (req.method === 'GET' && base === 'skills') {
      const { skills } = getSkills();
      return send(res, 200, skills);
    }

    // GET /api/skills/raw
    if (req.method === 'GET' && base === 'skills/raw') {
      const { raw } = getSkills();
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      return res.end(raw);
    }

    // ── Skills CRUD ──
    // POST /api/skills
    if (req.method === 'POST' && base === 'skills') {
      const { id, label, description: skillDesc, promptDirective } = await parseBody(req);
      if (!id || !label) return send(res, 400, { error: 'id and label are required' });
      const { skills, raw } = getSkills();
      if (skills.find(s => s.id === id)) return send(res, 409, { error: 'Skill already exists' });
      const newSkill = { id, label, description: skillDesc || '', promptDirective: promptDirective || '' };
      skills.push(newSkill);
      skillsCache = { raw, skills };
      return send(res, 201, newSkill);
    }

    // PUT /api/skills/:id
    const skillById = base.match(/^skills\/(.+)$/);
    if (req.method === 'PUT' && skillById) {
      const { skills, raw } = getSkills();
      const idx = skills.findIndex(s => s.id === skillById[1]);
      if (idx === -1) return send(res, 404, { error: 'Skill not found' });
      const updates = await parseBody(req);
      if (updates.label) skills[idx].label = updates.label;
      if (updates.description !== undefined) skills[idx].description = updates.description;
      if (updates.promptDirective !== undefined) skills[idx].promptDirective = updates.promptDirective;
      skillsCache = { raw, skills };
      return send(res, 200, skills[idx]);
    }

    // DELETE /api/skills/:id
    if (req.method === 'DELETE' && skillById) {
      const { skills, raw } = getSkills();
      const idx = skills.findIndex(s => s.id === skillById[1]);
      if (idx === -1) return send(res, 404, { error: 'Skill not found' });
      const removed = skills.splice(idx, 1)[0];
      skillsCache = { raw, skills };
      return send(res, 200, { message: 'Skill removed', skill: removed });
    }

    // ── Task Routes ──
    // GET /api/tasks
    if (req.method === 'GET' && base === 'tasks') {
      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status');
      const assignedAgent = url.searchParams.get('assignedAgent');
      const search = url.searchParams.get('search')?.toLowerCase();
      const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit')) || 50));

      let filtered = taskCache;

      if (status) {
        filtered = filtered.filter(t => t.status === status.toUpperCase());
      }
      if (assignedAgent) {
        filtered = filtered.filter(t => t.assignedAgent === assignedAgent);
      }
      if (search) {
        filtered = filtered.filter(t =>
          t.title?.toLowerCase().includes(search) ||
          t.description?.toLowerCase().includes(search)
        );
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit);

      return send(res, 200, { items, total, page, totalPages, limit });
    }

    // GET /api/tasks/:id
    const taskById = base.match(/^tasks\/(.+)$/);
    if (req.method === 'GET' && taskById) {
      const task = taskCache.find(t => t.id === taskById[1] || t.contractTaskId === Number(taskById[1]));
      if (!task) return send(res, 404, { error: 'Task not found' });
      return send(res, 200, task);
    }

    // PUT /api/tasks/:id — update a task
    if (req.method === 'PUT' && taskById) {
      const idx = taskCache.findIndex(t => t.id === taskById[1] || t.contractTaskId === Number(taskById[1]));
      if (idx === -1) return send(res, 404, { error: 'Task not found' });

      const updates = await parseBody(req);
      const allowed = ['title', 'description', 'constraints', 'reward', 'deadline', 'assignedAgent'];
      for (const key of allowed) {
        if (updates[key] !== undefined) {
          if (key === 'reward') taskCache[idx][key] = parseFloat(updates[key]);
          else taskCache[idx][key] = updates[key];
        }
      }
      db.setTasks(taskCache);
      return send(res, 200, taskCache[idx]);
    }

    // DELETE /api/tasks/:id — delete a task
    if (req.method === 'DELETE' && taskById) {
      const idx = taskCache.findIndex(t => t.id === taskById[1] || t.contractTaskId === Number(taskById[1]));
      if (idx === -1) return send(res, 404, { error: 'Task not found' });
      const removed = taskCache.splice(idx, 1)[0];
      db.setTasks(taskCache);
      return send(res, 200, { message: 'Task removed', task: removed });
    }

    // POST /api/tasks
    if (req.method === 'POST' && base === 'tasks') {
      const { title, description, constraints, reward, deadline, assignedAgent } = await parseBody(req);
      if (!title || !description) return send(res, 400, { error: 'Title and description are required' });

      const receipt = await bridge.postTask(title, description, Math.floor(reward) || 0, constraints || '', deadline || '');
      const agentObj = agents.find(a => a.id === assignedAgent) || agents[0];

      const newTask = {
        id: randomUUID(),
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
      db.setTasks(taskCache);
      return send(res, 200, newTask);
    }

    // ── Agent Execution ──
    // POST /api/tasks/:id/execute
    const execMatch = base.match(/^tasks\/(.+)\/execute$/);
    if (req.method === 'POST' && execMatch) {
      const taskIndex = taskCache.findIndex(t => t.id === execMatch[1]);
      if (taskIndex === -1) return send(res, 404, { error: 'Task not found' });

      const task = taskCache[taskIndex];
      if (task.status !== 'PENDING') return send(res, 400, { error: 'Task is not in PENDING state' });

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
      db.setTasks(taskCache);
      send(res, 200, { message: 'Execution started', taskId: task.id, agent: agent.name });

      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

      try {
        if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes('your_')) {
          throw new Error('OPENROUTER_API_KEY is not set.');
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

        const { data } = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: 'qwen/qwen-2.5-coder:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Title: ${task.title}\n\nDescription: ${task.description}\n\nConstraints: ${task.constraints || 'None'}` }
          ],
          temperature: 0.3,
          max_tokens: 1024
        }, {
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:5005',
            'X-Title': 'Orbitjob'
          }
        });

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
        task.result = { summary: aiResult.summary, data: aiResult.data };
        task.confidenceScore = confidence;
        task.verificationStatus = verified ? 'VERIFIED' : 'REJECTED';
        agent.status = 'IDLE';
        agent.completedTasks += 1;

        if (task.contractTaskId) {
          const outputStr = JSON.stringify(aiResult);
          const reasoningStr = JSON.stringify(reasoningTrace);
          const bridgeReceipt = await bridge.submitExecution(task.contractTaskId, outputStr, reasoningStr, confidence, agent.id);
          task.verificationStatus = bridgeReceipt.verificationStatus;
          task.txId = bridgeReceipt.txId;
          task.blockNumber = bridgeReceipt.blockNumber;
        }

        db.setTasks(taskCache);
      } catch (err) {
        task.status = 'FAILED';
        if (task.executionTrace) {
          task.executionTrace.completedAt = new Date().toISOString();
          task.executionTrace.plan = task.executionTrace.plan || [];
          task.executionTrace.steps = [
            ...(task.executionTrace.steps || []),
            { step: (task.executionTrace.steps?.length || 0) + 1, action: `[ERROR] ${err.message}`, timestamp: new Date().toISOString() }
          ];
        }
        task.result = { summary: `Execution failed: ${err.message}`, data: { analysis: '', findings: '', recommendation: '' } };
        task.confidenceScore = 0;
        task.verificationStatus = 'FAILED';
        agent.status = 'IDLE';
        db.setTasks(taskCache);
      }
      return;
    }

    // ── Agent Routes ──
    // GET /api/agents
    if (req.method === 'GET' && base === 'agents') {
      return send(res, 200, agents);
    }

    // GET /api/agents/:id
    const agentById = base.match(/^agents\/(.+)$/);
    if (req.method === 'GET' && agentById) {
      const agent = agents.find(a => a.id === agentById[1]);
      if (!agent) return send(res, 404, { error: 'Agent not found' });
      return send(res, 200, agent);
    }

    // POST /api/agents
    if (req.method === 'POST' && base === 'agents') {
      const { name, model, specialty, description, icon, accent, selectedSkills } = await parseBody(req);
      if (!name || !description) return send(res, 400, { error: 'Name and description are required' });

      const newAgent = {
        id: 'agent-' + randomUUID().slice(0, 8),
        name,
        model: model || 'qwen/qwen-2.5-coder:free',
        specialty: specialty || 'General',
        icon: icon || 'cpu',
        price: 0.05,
        description,
        useCases: [],
        rating: 0,
        completedTasks: 0,
        status: 'IDLE',
        accent: accent || accentColors[agents.length % accentColors.length],
        skills: Array.isArray(selectedSkills) ? selectedSkills : []
      };
      agents.push(newAgent);
      db.setAgents(agents);
      return send(res, 200, newAgent);
    }

    // PUT /api/agents/:id
    if (req.method === 'PUT' && agentById) {
      const idx = agents.findIndex(a => a.id === agentById[1]);
      if (idx === -1) return send(res, 404, { error: 'Agent not found' });

      const { name, model, specialty, icon, price, description, useCases } = await parseBody(req);
      if (name) agents[idx].name = name;
      if (model) agents[idx].model = model;
      if (specialty) agents[idx].specialty = specialty;
      if (icon) agents[idx].icon = icon;
      if (price !== undefined) agents[idx].price = parseFloat(price);
      if (description) agents[idx].description = description;
      if (useCases) agents[idx].useCases = Array.isArray(useCases) ? useCases : agents[idx].useCases;
      db.setAgents(agents);
      return send(res, 200, agents[idx]);
    }

    // DELETE /api/agents/:id
    if (req.method === 'DELETE' && agentById) {
      const idx = agents.findIndex(a => a.id === agentById[1]);
      if (idx === -1) return send(res, 404, { error: 'Agent not found' });
      const removed = agents.splice(idx, 1)[0];
      db.setAgents(agents);
      return send(res, 200, { message: 'Agent removed', agent: removed });
    }

    // ── Payment / Token System ──
    let balances = {};
    function ensureBalance(address) {
      if (!balances[address]) balances[address] = 0;
      return balances[address];
    }

    // GET /api/balances
    if (req.method === 'GET' && base === 'balances') {
      return send(res, 200, Object.entries(balances).map(([address, balance]) => ({ address, balance })));
    }

    // GET /api/balances/:address
    const balanceByAddr = base.match(/^balances\/(.+)$/);
    if (req.method === 'GET' && balanceByAddr) {
      const balance = ensureBalance(balanceByAddr[1]);
      return send(res, 200, { address: balanceByAddr[1], balance });
    }

    // POST /api/faucet
    if (req.method === 'POST' && base === 'faucet') {
      const { address } = await parseBody(req);
      if (!address) return send(res, 400, { error: 'Address required' });
      ensureBalance(address);
      balances[address] += 1000;
      return send(res, 200, { address, balance: balances[address], message: '1000 GLR claimed' });
    }

    // POST /api/transfer
    if (req.method === 'POST' && base === 'transfer') {
      const { from, to, amount } = await parseBody(req);
      if (!from || !to || !amount) return send(res, 400, { error: 'from, to, and amount required' });
      ensureBalance(from);
      ensureBalance(to);
      const amt = parseFloat(amount);
      if (balances[from] < amt) return send(res, 400, { error: 'Insufficient balance' });
      balances[from] -= amt;
      balances[to] += amt;
      return send(res, 200, { from, to, amount: amt, fromBalance: balances[from], toBalance: balances[to] });
    }

    // 404
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
};
