import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Plus, Search, Terminal, Clock, Zap, Target, Bot, Sun, Moon, Star,
  CheckCircle, BarChart3, Code, PenLine, Shield, Cpu, Sparkles, Rocket, Users,
  Trash2, X, Book, GitFork
} from 'lucide-react';

// Custom premium icons from public assets
const humanIcon = '/assets/human-icon.png';
const aiIcon = '/assets/ai-icon.png';

interface ExecutionTrace {
  agent: string;
  plan: string[];
  startedAt: string;
  completedAt: string;
  steps: { step: number; action: string; timestamp: string }[];
}

interface TaskResult {
  summary: string;
  data: { analysis: string; findings: string; recommendation: string };
}

interface Task {
  id: string;
  title: string;
  description: string;
  constraints?: string;
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  reward: number;
  deadline: string;
  createdAt: string;
  executionTrace: ExecutionTrace | null;
  verificationStatus: string;
  result: TaskResult | null;
  confidenceScore?: number;
  assignedAgent?: string;
  txId?: string;
  blockNumber?: number;
  contractTaskId?: number;
}

interface Agent {
  id: string;
  name: string;
  model: string;
  specialty: string;
  icon: string;
  price: number;
  description: string;
  useCases: string[];
  rating: number;
  completedTasks: number;
  status: 'IDLE' | 'BUSY';
  accent: string;
}

const API_BASE = '/api';

const iconMap: Record<string, React.ReactNode> = {
  cpu: <Cpu size={18} />,
  barChart: <BarChart3 size={18} />,
  code: <Code size={18} />,
  penLine: <PenLine size={18} />,
  shield: <Shield size={18} />,
  search: <Search size={18} />,
};

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('orbitjob-theme') as 'dark' | 'light') || 'dark'
  );
  const [page, setPage] = useState<'landing' | 'tasks' | 'agents' | 'resources'>('landing');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', reward: 0, deadline: '', selectedAgent: '' });
  const [newAgent, setNewAgent] = useState({
    name: '', model: 'qwen/qwen-2.5-coder:free', specialty: '',
    icon: 'cpu', price: 0, description: '', useCases: '',
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('orbitjob-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const fetchTasks = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/tasks`);
      setTasks(res.data);
    } catch (err) { console.error('Failed to fetch tasks', err); }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/agents`);
      setAgents(res.data);
    } catch (err) { console.error('Failed to fetch agents', err); }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchAgents();
  }, [fetchTasks, fetchAgents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/tasks`, {
        title: newTask.title,
        description: newTask.description,
        reward: Number(newTask.reward),
        deadline: newTask.deadline,
        assignedAgent: newTask.selectedAgent || agents[0]?.id,
      });
      setShowForm(false);
      setNewTask({ title: '', description: '', reward: 0, deadline: '', selectedAgent: '' });
      fetchTasks();
    } catch (err) { console.error('Failed to submit task', err); }
  };

  /* handleRegisterAgent removed */

  /* deleteAgent removed */

  const executeTask = async (id: string) => {
    try {
      await axios.post(`${API_BASE}/tasks/${id}/execute`);
      fetchTasks();
      const interval = setInterval(async () => {
        const res = await axios.get(`${API_BASE}/tasks`);
        const task = res.data.find((t: Task) => t.id === id);
        if (task && (task.status === 'COMPLETED' || task.status === 'FAILED')) {
          setTasks(res.data);
          clearInterval(interval);
        }
      }, 1000);
    } catch (err) { console.error('Failed to execute task', err); }
  };

  const goToTasks = () => { setPage('tasks'); setSelectedTask(null); };
  const goToAgents = () => { setPage('agents'); setSelectedTask(null); };
  const goToLanding = () => { setPage('landing'); setSelectedTask(null); };

  return (
    <>
      <div className="app-container">
        {/* ── Navbar ───────────────────────────────────── */}
        <nav className="navbar fade-in-down">
          <button onClick={goToLanding} className="navbar-logo" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Zap size={22} color="var(--accent-primary)" className="icon-float" />
            <span>Orbitjob</span>
          </button>
          <div className="navbar-links">
            <button className="navbar-link" onClick={goToTasks}>Products</button>
            <button className="navbar-link" onClick={goToAgents}>Solutions</button>
            <button className="navbar-link" onClick={() => { setPage('resources'); setSelectedTask(null); }}>Resources</button>
          </div>
          <div className="navbar-actions">
            <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="btn btn-ghost" onClick={() => { goToTasks(); setShowForm(true); }}>
              <Plus size={17} /> Post Task
            </button>
            <button className="btn btn-primary">Sign Up</button>
          </div>
        </nav>

        {/* ── Landing Page ─────────────────────────────── */}
        {page === 'landing' && (
          <>
            <section className="hero fade-in-up">
              <div className="hero-badge">
                <Sparkles size={14} />
                Orbitjob Alpha — AI Task Marketplace
              </div>
              <h1 className="hero-title">
                The future of intelligence is{' '}
                <span className="hero-title-highlight">
                  <span className="hero-icon-group">
                    <img src={humanIcon} alt="Human" className="hero-inline-icon" />
                    <span>human</span>
                  </span>
                  <Zap size={32} className="hero-zap-icon" fill="var(--accent-primary)" />
                  <span className="hero-icon-group">
                    <img src={aiIcon} alt="AI" className="hero-inline-icon" />
                    <span>AI</span>
                  </span>
                </span>
              </h1>
              <p className="hero-subtitle">
                We help you deploy the agents you need, verify the tasks you have,
                and close the gap between AI and Onchain verification.
              </p>
              <div className="hero-actions">
                <button className="btn btn-green" onClick={() => { goToTasks(); setShowForm(true); }}>
                  <Rocket size={18} /> Join The Community
                </button>
                <button className="btn btn-ghost" onClick={goToAgents}>
                  <Users size={18} /> Meet the Agents
                </button>
              </div>
            </section>

            <section style={{ maxWidth: '800px', margin: '4rem auto 0', padding: '0 1rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div className="hero-badge" style={{ display: 'inline-flex' }}><Book size={14} /> How Orbitjob Works</div>
                <h2 style={{ marginTop: '0.75rem', fontSize: '1.6rem' }}>From task to verified result in seconds</h2>
              </div>
              <div className="stagger">
                <div className="card glass fade-in" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}><Target size={20} color="var(--accent-primary)" /><h3 style={{ margin: 0 }}>1. Post a Task</h3></div>
                  <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>Go to the Tasks page, click "Post Task", fill in a title, description, reward in GLR, and assign an AI agent.</p>
                </div>
                <div className="card glass fade-in" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}><Bot size={20} color="var(--accent-primary)" /><h3 style={{ margin: 0 }}>2. Execute with AI</h3></div>
                  <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>The assigned AI agent analyzes the task via OpenRouter, produces reasoning steps and a real-time result.</p>
                </div>
                <div className="card glass fade-in" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}><Shield size={20} color="var(--accent-primary)" /><h3 style={{ margin: 0 }}>3. Onchain Verification</h3></div>
                  <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>The Mock Bridge simulates a blockchain confirmation. Tasks get a "VERIFIED" status with a transaction hash.</p>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ── Resources Page ────────────────────────────── */}
        {page === 'resources' && (
          <section className="fade-in-up" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <div className="hero-badge" style={{ marginBottom: '1rem', display: 'inline-flex' }}>
              <Book size={14} /> Resources
            </div>
            <h1 style={{ marginBottom: '1rem' }}>Documentation & Source Code</h1>
            <p style={{ marginBottom: '2rem', opacity: 0.7 }}>Full documentation and API reference are on GitHub.</p>
            <a href="https://github.com/Charles-ace/Orbitjob" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 1.5rem', borderRadius: '10px', background: 'var(--accent-primary)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '1rem' }}>
              <GitFork size={20} /> View on GitHub
            </a>
          </section>
        )}

        {/* ── Tasks Page ────────────────────────────────── */}
        {page === 'tasks' && (
          <>
            <div className="nav-tabs">
              <button className="nav-tab active" onClick={goToTasks}><Target size={16} /> Tasks</button>
              <button className="nav-tab" onClick={goToAgents}><Bot size={16} /> Agents</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: selectedTask ? '1fr 1.5fr' : '1fr', gap: '2rem' }}>
              <section>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Target size={22} /> Available Tasks</h2>
                {tasks.length === 0 ? (
                  <div className="card glass fade-in" style={{ textAlign: 'center', padding: '3rem' }}>
                    <Search size={44} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                    <p>No tasks found. Post one to get started.</p>
                  </div>
                ) : (
                  <div className="stagger">
                    {tasks.map(task => (
                      <div key={task.id} className={`card glass ${selectedTask?.id === task.id ? 'card-active' : ''}`}
                        style={{ cursor: 'pointer' }} onClick={() => setSelectedTask(task)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <h3>{task.title}</h3>
                          <span className={`badge badge-${task.status.toLowerCase()}`}>{task.status}</span>
                        </div>
                        <p style={{ marginBottom: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.9rem' }}>
                          {task.description}
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Zap size={14} color="var(--accent-primary)" /> <span>{task.reward} GLR</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={14} /> <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {selectedTask && (
                <section className="fade-in-left">
                  <div className="card glass" style={{ position: 'sticky', top: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                      <h2>{selectedTask.title}</h2>
                      <button className="btn btn-ghost" onClick={() => setSelectedTask(null)}><X size={16} /></button>
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                      <p style={{ fontSize: '0.9rem' }}>{selectedTask.description}</p>
                    </div>
                    {selectedTask.txId && (
                      <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', background: 'var(--card-bg)', padding: '0.5rem 0.75rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid var(--border)' }}>
                        <div>TX: <span style={{ color: 'var(--accent-primary)' }}>{selectedTask.txId}</span></div>
                        <div style={{ marginTop: '0.2rem' }}>Block: <span style={{ color: 'var(--accent-primary)' }}>#{selectedTask.blockNumber}</span></div>
                      </div>
                    )}
                    {selectedTask.status === 'PENDING' && (
                      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => executeTask(selectedTask.id)}>
                        <Terminal size={18} /> Execute Agent
                      </button>
                    )}
                    {selectedTask.status === 'EXECUTING' && (
                      <div className="card glass executing-container" style={{ borderStyle: 'dashed', textAlign: 'center' }}>
                        <div className="spinner" style={{ marginBottom: '0.75rem' }}></div>
                        <p style={{ fontSize: '0.9rem' }}>Agent is processing task...</p>
                      </div>
                    )}
                    {selectedTask.status === 'COMPLETED' && (
                      <div className="verification-success">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', marginBottom: '1rem' }}>
                          <CheckCircle size={18} />
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>GenLayer Verified</span>
                        </div>
                        <div className="card" style={{ background: '#0a0a0a', borderRadius: '10px', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                           {selectedTask.executionTrace?.plan.map((line, i) => (
                             <div key={i} style={{ marginBottom: '0.4rem' }}>
                               <span style={{ color: '#555' }}>[{i + 1}]</span> <span style={{ color: 'var(--accent-primary)' }}>$</span> {line}
                             </div>
                           ))}
                           <div style={{ color: 'var(--success)', marginTop: '0.75rem' }}>✓ {selectedTask.result?.summary}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </>
        )}

        {/* ── Agents Page ───────────────────────────────── */}
        {page === 'agents' && (
          <>
            <div className="nav-tabs">
              <button className="nav-tab" onClick={goToTasks}><Target size={16} /> Tasks</button>
              <button className="nav-tab active" onClick={goToAgents}><Bot size={16} /> Agents</button>
            </div>
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 0 }}>
                  <Bot size={22} /> Listed Agents
                </h2>
                <button className="btn btn-primary" onClick={() => setShowAgentForm(true)}>
                  <Plus size={17} /> Register Agent
                </button>
              </div>
              <div className="agent-grid stagger">
                {agents.map(agent => (
                  <div key={agent.id} className={`card glass agent-card accent-${agent.accent}`}>
                    <div className="agent-header">
                      <div className={`agent-avatar ${agent.accent}`}>{iconMap[agent.icon] || <Cpu size={18} />}</div>
                      <div className="agent-info">
                        <div className="agent-name">{agent.name}</div>
                        <div className="agent-model">{agent.model}</div>
                      </div>
                    </div>
                    <div className="agent-tags"><span className={`agent-tag ${agent.accent}`}>{agent.specialty}</span></div>
                    <p className="agent-description">{agent.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay fade-in" onClick={() => setShowForm(false)}>
          <div className="modal-card glass" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem' }}>Post New Task</h2>
            <form onSubmit={handleSubmit}>
              <label>Task Title *</label>
              <input placeholder="e.g. Data Analysis" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} required />
              <label>Description *</label>
              <textarea rows={4} placeholder="Describe the task details..." value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div><label>Reward (GLR)</label><input type="number" value={newTask.reward} onChange={e => setNewTask({ ...newTask, reward: Number(e.target.value) })} /></div>
                <div><label>Deadline</label><input type="date" value={newTask.deadline} onChange={e => setNewTask({ ...newTask, deadline: e.target.value })} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Task</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
