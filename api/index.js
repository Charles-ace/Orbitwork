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

// ── Mock Data ────────────────────────────────────────────────
let taskCache = [
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

let agents = [
  { id: 'agent-alpha', name: 'Antigravity Alpha', model: 'qwen/qwen-2.5-coder:free', specialty: 'General Purpose', icon: 'cpu', price: 0.05, description: 'Versatile AI agent for research and content generation.', useCases: ['Market research', 'Summarization'], rating: 4.8, completedTasks: 142, status: 'IDLE', accent: 'purple' },
  { id: 'agent-epsilon', name: 'Sentinel Epsilon', model: 'gpt-4-turbo', specialty: 'Security Audit', icon: 'shield', price: 0.12, description: 'Security-focused agent for code review.', useCases: ['Contract audit', 'Vulnerability scanning'], rating: 4.9, completedTasks: 63, status: 'IDLE', accent: 'red' }
];

// ── Helper ───────────────────────────────────────────────────
const apiRoute = (path) => [`/api${path}`, path];

// ── Routes ────────────────────────────────────────────────────
app.get(apiRoute('/'), (req, res) => {
  res.json({ status: 'Orbitjob backend running', mode: 'stable' });
});

app.get(apiRoute('/tasks'), (req, res) => {
  res.json(taskCache);
});

app.get(apiRoute('/tasks/:id'), (req, res) => {
  const task = taskCache.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.post(apiRoute('/tasks'), (req, res) => {
  const { title, description, reward } = req.body;
  const newTask = {
    id: uuidv4(),
    title,
    description,
    status: 'PENDING',
    reward: reward || 0,
    createdAt: new Date().toISOString(),
    executionTrace: null,
    verificationStatus: 'NOT_VERIFIED',
    result: null
  };
  taskCache.push(newTask);
  res.json(newTask);
});

app.get(apiRoute('/agents'), (req, res) => {
  res.json(agents);
});

// ── AI Execution (Real OpenRouter) ──────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

app.post(apiRoute('/tasks/:id/execute'), async (req, res) => {
  const task = taskCache.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  task.status = 'EXECUTING';
  res.json({ message: 'Execution started' });

  try {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes('your_')) {
       throw new Error('API Key not set');
    }

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'qwen/qwen-2.5-coder:free',
      messages: [{ role: 'user', content: `Solve this task and return JSON only: ${task.title} - ${task.description}` }]
    }, {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` }
    });

    task.status = 'COMPLETED';
    task.executionTrace = { agent: 'AI Agent', plan: ['Analyzed request', 'Generated response'], startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), steps: [] };
    task.result = { summary: response.data.choices[0].message.content, data: {} };
    task.txId = '0x' + uuidv4().replace(/-/g, '').slice(0, 32);
    task.blockNumber = 12345;
  } catch (err) {
    task.status = 'FAILED';
    task.result = { summary: `Error: ${err.message}`, data: {} };
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
