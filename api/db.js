const fs = require('fs');
const path = require('path');

// Use /tmp on Vercel (writable), fallback to project dir locally
const DATA_DIR = fs.existsSync('/tmp') ? '/tmp' : __dirname;
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');

let memoryCache = { tasks: null, agents: null };

function loadFromFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`Failed to load ${filePath}:`, e.message);
  }
  return null;
}

function saveToFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error(`Failed to save ${filePath}:`, e.message);
    return false;
  }
}

function loadTasks(seedTasks) {
  if (memoryCache.tasks) return memoryCache.tasks;
  const fromFile = loadFromFile(TASKS_FILE);
  if (fromFile && Array.isArray(fromFile) && fromFile.length > 0) {
    memoryCache.tasks = fromFile;
  } else {
    memoryCache.tasks = seedTasks;
    saveToFile(TASKS_FILE, memoryCache.tasks);
  }
  return memoryCache.tasks;
}

function getTasks() {
  return memoryCache.tasks || [];
}

function setTasks(tasks) {
  memoryCache.tasks = tasks;
  saveToFile(TASKS_FILE, tasks);
}

function loadAgents(seedAgents) {
  if (memoryCache.agents) return memoryCache.agents;
  const fromFile = loadFromFile(AGENTS_FILE);
  if (fromFile && Array.isArray(fromFile) && fromFile.length > 0) {
    memoryCache.agents = fromFile;
  } else {
    memoryCache.agents = seedAgents;
    saveToFile(AGENTS_FILE, memoryCache.agents);
  }
  return memoryCache.agents;
}

function getAgents() {
  return memoryCache.agents || [];
}

function setAgents(agents) {
  memoryCache.agents = agents;
  saveToFile(AGENTS_FILE, agents);
}

module.exports = { loadTasks, getTasks, setTasks, loadAgents, getAgents, setAgents };
