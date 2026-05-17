const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const bridge = require('./genlayer-bridge');

dotenv.config();
dotenv.config({ path: '../.env', override: true });

const app = express();
const PORT = process.env.PORT || 5005;

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// ── Skills System ──────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const SKILLS_FILE = path.join(__dirname, '..', 'docs', 'expert-skills.md');

let skillsCache = null;

function loadSkills() {
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
      return skills;
    }
  } catch (e) {
    console.error('Failed to load skills:', e.message);
  }
  return [];
}

function getSkills() {
  if (!skillsCache) skillsCache = loadSkills();
  return skillsCache;
}

// ── Task Cache ───────────────────────────────────────────────
// Seed tasks only used in mock mode — live mode uses onchain state
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

let taskCache = [];

const accentColors = ['purple', 'blue', 'green', 'orange', 'red', 'cyan'];
const iconMap = { cpu: 'cpu', barChart: 'barChart', code: 'code', penLine: 'penLine', shield: 'shield', search: 'search' };

let agents = [
  { id: 'agent-alpha', name: 'Antigravity Alpha', model: 'qwen/qwen-2.5-coder:free', specialty: 'General Purpose', icon: 'cpu', price: 0.05, description: 'Versatile AI agent capable of handling a wide range of tasks from research to content generation.', useCases: ['Market research & trend analysis', 'General data processing', 'Document summarization', 'Multi-domain Q&A'], rating: 4.8, completedTasks: 142, status: 'IDLE', accent: 'purple', skills: ['web-research', 'content-gen'] },
  { id: 'agent-beta', name: 'DataForge Beta', model: 'gpt-4-turbo', specialty: 'Data Analysis', icon: 'barChart', price: 0.08, description: 'Specialized in structured data analysis, statistical modeling, and visualization recommendations.', useCases: ['Dataset analysis & visualization', 'Statistical modeling', 'Financial report generation', 'Trend forecasting'], rating: 4.9, completedTasks: 89, status: 'IDLE', accent: 'blue', skills: ['data-analysis', 'content-gen'] },
  { id: 'agent-gamma', name: 'CodeWeaver Gamma', model: 'gpt-4-turbo', specialty: 'Code Generation', icon: 'code', price: 0.10, description: 'Expert-level code generation and review agent supporting multiple languages and frameworks.', useCases: ['Code generation & review', 'Bug fixing & debugging', 'Test writing', 'Architecture & refactoring advice'], rating: 4.7, completedTasks: 214, status: 'BUSY', accent: 'green', skills: ['code-analysis'] },
  { id: 'agent-delta', name: 'Synthia Delta', model: 'gpt-4-turbo', specialty: 'Content Creation', icon: 'penLine', price: 0.06, description: 'Creative writing specialist with a flair for compelling narratives and marketing copy.', useCases: ['Copywriting & marketing content', 'Blog posts & articles', 'Social media content', 'Brand voice development'], rating: 4.6, completedTasks: 176, status: 'IDLE', accent: 'orange', skills: ['content-gen'] },
  { id: 'agent-epsilon', name: 'Sentinel Epsilon', model: 'gpt-4-turbo', specialty: 'Security Audit', icon: 'shield', price: 0.12, description: 'Security-focused agent trained on OWASP top 10, CVE databases, and secure coding practices.', useCases: ['Smart contract security review', 'Code vulnerability scanning', 'Compliance checklist generation', 'Threat modeling'], rating: 4.9, completedTasks: 63, status: 'IDLE', accent: 'red', skills: ['code-analysis', 'security-audit'] },
  { id: 'agent-zeta', name: 'Nexus Zeta', model: 'gpt-4-turbo', specialty: 'Deep Research', icon: 'search', price: 0.07, description: 'Deep research agent with advanced reasoning capabilities for synthesizing complex information.', useCases: ['Competitive analysis', 'Academic literature review', 'Technical deep dives', 'Feasibility studies'], rating: 4.8, completedTasks: 98, status: 'IDLE', accent: 'cyan', skills: ['web-research', 'data-analysis'] }
];

// ── Auth (Sign in with Ethereum / GenLayer) ────────────────────
const { ethers } = require('ethers');
let sessions = {};

app.get('/api/auth/challenge', (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'Address required' });
  const nonce = `Sign into Orbitjob on GenLayer\nAddress: ${address.toLowerCase()}\nNonce: ${Date.now()}`;
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

// Helper to handle routes with or without /api prefix
const apiRoute = (path) => [`/api${path}`, path];

app.get(apiRoute('/auth/me'), (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions[token]) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ address: sessions[token].address });
});

// ── Health check ─────────────────────────────────────────────
app.get(apiRoute('/'), (req, res) => {
  res.json({
    status: 'Orbitjob backend running',
    mode: bridge.isMockMode() ? 'mock' : 'live',
    network: bridge.getNetworkName(),
    contractAddress: bridge.getContractAddress(),
    seed: true,
  });
});

// ── Skills Routes ──────────────────────────────────────────────
app.get(apiRoute('/skills'), (req, res) => {
  res.json(getSkills());
});

// Create a skill
app.post(apiRoute('/skills'), (req, res) => {
  const { id, label, description, promptDirective } = req.body;
  if (!id || !label) return res.status(400).json({ error: 'id and label are required' });
  const skills = getSkills();
  if (skills.find(s => s.id === id)) return res.status(409).json({ error: 'Skill already exists' });
  const newSkill = { id, label, description: description || '', promptDirective: promptDirective || '' };
  skills.push(newSkill);
  skillsCache = skills;
  res.status(201).json(newSkill);
});

// Update a skill
app.put(apiRoute('/skills/:id'), (req, res) => {
  const skills = getSkills();
  const skill = skills.find(s => s.id === req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const { label, description, promptDirective } = req.body;
  if (label) skill.label = label;
  if (description !== undefined) skill.description = description;
  if (promptDirective !== undefined) skill.promptDirective = promptDirective;
  skillsCache = skills;
  res.json(skill);
});

// Delete a skill
app.delete(apiRoute('/skills/:id'), (req, res) => {
  const skills = getSkills();
  const idx = skills.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Skill not found' });
  const removed = skills.splice(idx, 1)[0];
  skillsCache = skills;
  res.json({ message: 'Skill removed', skill: removed });
});

// ── Task Routes ──────────────────────────────────────────────

// List all tasks (with filtering & pagination)
app.get(apiRoute('/tasks'), async (req, res) => {
  const { status, assignedAgent, search, page: pageStr, limit: limitStr } = req.query;
  const page = Math.max(1, parseInt(pageStr) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr) || 50));

  let filtered = taskCache;

  if (status) {
    filtered = filtered.filter(t => t.status === status.toUpperCase());
  }
  if (assignedAgent) {
    filtered = filtered.filter(t => t.assignedAgent === assignedAgent);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  res.json({ items, total, page, totalPages, limit });
});

// Get single task
app.get(apiRoute('/tasks/:id'), (req, res) => {
  const task = taskCache.find(t => t.id === req.params.id || t.contractTaskId === Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Update a task
app.put(apiRoute('/tasks/:id'), (req, res) => {
  const task = taskCache.find(t => t.id === req.params.id || t.contractTaskId === Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, constraints, reward, deadline, assignedAgent } = req.body;
  if (title) task.title = title;
  if (description) task.description = description;
  if (constraints !== undefined) task.constraints = constraints;
  if (reward !== undefined) task.reward = parseFloat(reward);
  if (deadline !== undefined) task.deadline = deadline;
  if (assignedAgent) task.assignedAgent = assignedAgent;

  res.json(task);
});

// Delete a task
app.delete(apiRoute('/tasks/:id'), (req, res) => {
  const idx = taskCache.findIndex(t => t.id === req.params.id || t.contractTaskId === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  const removed = taskCache.splice(idx, 1)[0];
  res.json({ message: 'Task removed', task: removed });
});

// Create a task
app.post(apiRoute('/tasks'), async (req, res) => {
  const { title, description, constraints, reward, deadline, assignedAgent } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  const receipt = await bridge.postTask(title, description, Math.floor(reward) || 0, constraints || '', deadline || '');

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
    subtasks: [],
    creator: req.body.creator || null,
  };

  taskCache.push(newTask);
  res.status(201).json(newTask);
});

// ── Agent Execution ──────────────────────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = 'qwen/qwen-2.5-coder:free';

app.post(apiRoute('/tasks/:id/execute'), async (req, res) => {
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

    const allSkills = getSkills();
    const agentSkills = (agent.skills || []).map(sid => allSkills.find(s => s.id === sid)).filter(Boolean);
    let skillsBlock = '';
    if (agentSkills.length > 0) {
      const skillLabels = agentSkills.map(s => s.label).join(', ');
      const skillDirectives = agentSkills.map(s => s.promptDirective).filter(Boolean).join('\n');
      skillsBlock = `You have these expert skills: ${skillLabels}.\n${skillDirectives}\n\n`;
    }

    const systemPrompt = `You are an AI agent executing tasks on the Orbitjob marketplace. ${skillsBlock}Analyze the task and respond with valid JSON only (no markdown, no code fences):

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
          'X-Title': 'Orbitjob'
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

    // Payment: reward agent on successful execution
    if (verified && task.reward > 0) {
      const creatorAddr = task.creator || '0xdefault';
      const agentAddr = `agent:${agent.id}`;
      ensureBalance(creatorAddr);
      ensureBalance(agentAddr);
      if (balances[creatorAddr] >= task.reward) {
        balances[creatorAddr] -= task.reward;
        balances[agentAddr] += task.reward;
        console.log(`  → [Payment] ${task.reward} GLR transferred from ${creatorAddr} to ${agent.name}`);
      } else {
        console.log(`  → [Payment] Insufficient balance for ${creatorAddr} — reward pending`);
        if (!task.pendingReward) task.pendingReward = { from: creatorAddr, to: agentAddr, amount: task.reward };
      }
    }

    // Submit execution result to GenLayer Bridge
    if (task.contractTaskId) {
      const outputStr = JSON.stringify(aiResult);
      const reasoningStr = JSON.stringify(reasoningTrace);
      const bridgeReceipt = await bridge.submitExecution(task.contractTaskId, outputStr, reasoningStr, confidence, agent.id);
      task.verificationStatus = bridgeReceipt.verificationStatus;
      task.txId = bridgeReceipt.txId;
      task.blockNumber = bridgeReceipt.blockNumber;
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
app.get(apiRoute('/agents'), (req, res) => {
  res.json(agents);
});

// Get single agent
app.get(apiRoute('/agents/:id'), (req, res) => {
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Create a new agent
app.post(apiRoute('/agents'), (req, res) => {
  const { name, model, specialty, icon, price, description, useCases, selectedSkills } = req.body;

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
    accent,
    skills: Array.isArray(selectedSkills) ? selectedSkills : [],
  };

  agents.push(newAgent);
  res.status(201).json(newAgent);
});

// Update an agent
app.put(apiRoute('/agents/:id'), (req, res) => {
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

// ── Payment / Token System ─────────────────────────────────────
let balances = {};

function ensureBalance(address) {
  if (!balances[address]) balances[address] = 0;
  return balances[address];
}

// GET /api/balances
app.get(apiRoute('/balances'), (req, res) => {
  res.json(Object.entries(balances).map(([address, balance]) => ({ address, balance })));
});

// GET /api/balances/:address
app.get(apiRoute('/balances/:address'), (req, res) => {
  const balance = ensureBalance(req.params.address);
  res.json({ address: req.params.address, balance });
});

// POST /api/faucet — get free test GLR
app.post(apiRoute('/faucet'), (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });
  ensureBalance(address);
  balances[address] += 1000;
  console.log(`  → [Faucet] 1000 GLR sent to ${address}`);
  res.json({ address, balance: balances[address], message: '1000 GLR claimed' });
});

// POST /api/transfer — send GLR between addresses
app.post(apiRoute('/transfer'), (req, res) => {
  const { from, to, amount } = req.body;
  if (!from || !to || !amount) return res.status(400).json({ error: 'from, to, and amount required' });
  ensureBalance(from);
  ensureBalance(to);
  const amt = parseFloat(amount);
  if (balances[from] < amt) return res.status(400).json({ error: 'Insufficient balance' });
  balances[from] -= amt;
  balances[to] += amt;
  console.log(`  → [Transfer] ${amt} GLR from ${from} to ${to}`);
  res.json({ from, to, amount: amt, fromBalance: balances[from], toBalance: balances[to] });
});

// ── Agent-to-Agent Task Routing ───────────────────────────────
// POST /api/tasks/:id/delegate — agent delegates a subtask to another agent
app.post(apiRoute('/tasks/:id/delegate'), async (req, res) => {
  const { id } = req.params;
  const task = taskCache.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'EXECUTING') return res.status(400).json({ error: 'Task must be in EXECUTING state' });

  const { title, description, assignedAgent, reward } = req.body;
  if (!title || !assignedAgent) return res.status(400).json({ error: 'title and assignedAgent required' });

  const subtaskAgent = agents.find(a => a.id === assignedAgent);
  if (!subtaskAgent) return res.status(404).json({ error: 'Agent not found' });

  if (!task.subtasks) task.subtasks = [];

  const subtask = {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    description: description || '',
    reward: parseFloat(reward) || 0,
    assignedAgent,
    status: 'PENDING',
    parentTaskId: id,
    createdAt: new Date().toISOString(),
    result: null,
  };

  task.subtasks.push(subtask);
  console.log(`  → [Routing] Subtask "${subtask.title}" delegated to ${subtaskAgent.name}`);
  res.status(201).json(subtask);
});

// POST /api/tasks/:id/subtasks/:subId/execute — execute a subtask
app.post(apiRoute('/tasks/:id/subtasks/:subId/execute'), async (req, res) => {
  const { id, subId } = req.params;
  const task = taskCache.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const subtask = task.subtasks?.find(s => s.id === subId);
  if (!subtask) return res.status(404).json({ error: 'Subtask not found' });
  if (subtask.status !== 'PENDING') return res.status(400).json({ error: 'Subtask not PENDING' });

  const { output, summary } = req.body;
  subtask.status = 'COMPLETED';
  subtask.completedAt = new Date().toISOString();
  subtask.result = { output: output || '', summary: summary || 'Subtask completed' };

  // Check if all subtasks complete → mark parent done
  const allDone = task.subtasks.every(s => s.status === 'COMPLETED');
  if (allDone && task.status === 'EXECUTING') {
    task.status = 'PENDING'; // auto-execution will pick it up
  }

  console.log(`  → [Routing] Subtask "${subtask.title}" completed`);
  res.json(subtask);
});

// GET /api/tasks/:id/subtasks — list subtasks
app.get(apiRoute('/tasks/:id/subtasks'), (req, res) => {
  const { id } = req.params;
  const task = taskCache.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task.subtasks || []);
});

// ── Start Server ─────────────────────────────────────────────

bridge.init().then(() => {
  const modeLabel = bridge.isMockMode() ? 'Mock Onchain Mode' : 'GenLayer Live Mode';
  console.log(`  → Bridge mode: ${modeLabel}`);
  if (bridge.isMockMode()) {
    taskCache.push(...seedTasks);
  }
}).catch(err => {
  console.error('  → Bridge init failed:', err.message);
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    const modeLabel = bridge.isMockMode() ? 'Mock Onchain Mode' : 'GenLayer Live';
    console.log(`\n  ⚡ Orbitjob Backend [${modeLabel}]`);
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  → ${taskCache.length} tasks | ${agents.length} agents`);
    console.log();
  });
}

module.exports = app;
