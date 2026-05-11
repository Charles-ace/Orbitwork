import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Plus, Search, Terminal, Clock, Zap, Target, Bot, Sun, Moon, Star,
  CheckCircle, BarChart3, Code, PenLine, Shield, Cpu, Sparkles, Rocket, Users,
  Trash2, X, Network, Wallet, LogOut
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

const API_BASE = 'http://localhost:5005/api';

const iconMap: Record<string, React.ReactNode> = {
  cpu: <Cpu size={18} />,
  barChart: <BarChart3 size={18} />,
  code: <Code size={18} />,
  penLine: <PenLine size={18} />,
  shield: <Shield size={18} />,
  search: <Search size={18} />,
};

const iconOptions = [
  { value: 'cpu', label: 'CPU' },
  { value: 'barChart', label: 'Data' },
  { value: 'code', label: 'Code' },
  { value: 'penLine', label: 'Write' },
  { value: 'shield', label: 'Shield' },
  { value: 'search', label: 'Research' },
];

declare global {
  interface Window {
    ethereum?: { isMetaMask?: boolean; request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, cb: (...args: unknown[]) => void) => void; removeListener?: (event: string, cb: (...args: unknown[]) => void) => void };
  }
}

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('orbitwork-theme') as 'dark' | 'light') || 'dark'
  );
  const [page, setPage] = useState<'landing' | 'tasks' | 'agents'>('landing');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [cookieConsent, setCookieConsent] = useState(true);
  const [newTask, setNewTask] = useState({ title: '', description: '', reward: 0, deadline: '', selectedAgent: '' });
  const [newAgent, setNewAgent] = useState({
    name: '', model: 'qwen/qwen-2.5-coder:free', specialty: '',
    icon: 'cpu', price: 0, description: '', useCases: '',
  });
  const [wallet, setWallet] = useState<{ account: string; balance: string } | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('orbitwork-theme', theme);
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
    const load = async () => {
      try { const r = await axios.get(`${API_BASE}/tasks`); setTasks(r.data); }
      catch (e) { console.error(e); }
    };
    load();
  }, []);
  useEffect(() => {
    const load = async () => {
      try { const r = await axios.get(`${API_BASE}/agents`); setAgents(r.data); }
      catch (e) { console.error(e); }
    };
    load();
  }, []);

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

  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/agents`, {
        ...newAgent,
        price: Number(newAgent.price),
        useCases: newAgent.useCases.split('\n').filter(Boolean),
      });
      setShowAgentForm(false);
      setNewAgent({ name: '', model: 'qwen/qwen-2.5-coder:free', specialty: '', icon: 'cpu', price: 0, description: '', useCases: '' });
      fetchAgents();
    } catch (err) { console.error('Failed to register agent', err); }
  };

  const connectWallet = useCallback(async () => {
    if (!window.ethereum?.isMetaMask) { alert('Please install MetaMask'); return; }
    setWalletConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const balanceWei = await window.ethereum.request({ method: 'eth_getBalance', params: [accounts[0], 'latest'] }) as string;
      const balanceEth = (parseInt(balanceWei, 16) / 1e18).toFixed(4);

      // Get challenge (nonce) from backend
      const chal = await axios.get(`${API_BASE}/auth/challenge`, { params: { address: accounts[0] } });
      const { nonce } = chal.data;

      // Prompt user to sign the GenLayer auth message
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [nonce, accounts[0]],
      });

      // Verify signature on backend
      await axios.post(`${API_BASE}/auth/signin`, { address: accounts[0], signature });

      setWallet({ account: accounts[0], balance: balanceEth });
    } catch { /* user rejected */ }
    finally { setWalletConnecting(false); }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWallet(null);
  }, []);

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) setWallet(null);
      else connectWallet();
    };
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => { window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged); };
  }, [connectWallet]);

  const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const deleteAgent = async (id: string) => {
    try {
      await axios.delete(`${API_BASE}/agents/${id}`);
      fetchAgents();
    } catch (err) { console.error('Failed to delete agent', err); }
  };

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
            <span>Orbitwork</span>
          </button>
          <div className="navbar-links">
            <button className="navbar-link" onClick={goToTasks}>Products</button>
            <button className="navbar-link" onClick={goToAgents}>Solutions</button>
            <button className="navbar-link" onClick={goToLanding}>Resources</button>
          </div>
          <div className="navbar-actions">
            <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="btn btn-ghost" onClick={() => { goToTasks(); setShowForm(true); }}>
              <Plus size={17} /> Post Task
            </button>
            {wallet ? (
              <div className="wallet-connected">
                <Wallet size={15} color="var(--accent-primary)" />
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{shortAddress(wallet.account)}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{wallet.balance} ETH</span>
                <button className="btn btn-ghost" onClick={disconnectWallet} style={{ padding: '0.3rem', width: '28px', height: '28px' }} title="Disconnect">
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={connectWallet} disabled={walletConnecting}>
                <Wallet size={16} /> {walletConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </nav>

        {/* ── Landing Page ─────────────────────────────── */}
        {page === 'landing' && (
          <section className="hero fade-in-up">
            <div className="hero-badge">
              <Sparkles size={14} />
              Orbitwork Alpha — AI Task Marketplace
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
                          {task.assignedAgent && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Bot size={14} /> <span>{agents.find(a => a.id === task.assignedAgent)?.name || task.assignedAgent}</span>
                            </div>
                          )}
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
                        <div style={{ marginTop: '0.2rem' }}>Block: <span style={{ color: 'var(--accent-primary)' }}>#{selectedTask.blockNumber}</span> | Contract ID: <span style={{ color: 'var(--accent-primary)' }}>#{selectedTask.contractTaskId}</span></div>
                      </div>
                    )}
                    {selectedTask.assignedAgent && !['COMPLETED','FAILED','EXECUTING'].includes(selectedTask.status) && (
                      <div style={{ fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                        <Bot size={16} /> Agent: <strong>{agents.find(a => a.id === selectedTask.assignedAgent)?.name || selectedTask.assignedAgent}</strong>
                      </div>
                    )}
                    {selectedTask.status === 'PENDING' && (
                      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => executeTask(selectedTask.id)}>
                        <Terminal size={18} /> Execute with {agents.find(a => a.id === selectedTask.assignedAgent)?.name || 'Agent'}
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
                          <svg className="checkmark-svg" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3">
                            <path className="checkmark-path" d="M5 13l4 4L19 7" />
                          </svg>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>GenLayer Verified</span>
                          <span className="verification-score" style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.85rem' }}>Score: {selectedTask.confidenceScore}</span>
                        </div>
                        <div className="card" style={{ background: '#0a0a0a', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', padding: 0 }}>
                          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0.65rem 0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff5f56' }}></div>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffbd2e' }}></div>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#27c93f' }}></div>
                            <span style={{ marginLeft: '0.75rem', fontSize: '0.7rem', color: '#555', fontFamily: 'monospace' }}>execution_trace.log</span>
                          </div>
                          <div style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {selectedTask.executionTrace?.plan.map((line: string, i: number) => (
                              <div key={i} className="execution-line" style={{ marginBottom: '0.4rem' }}>
                                <span style={{ color: '#555' }}>[{i + 1}]</span> <span style={{ color: 'var(--accent-primary)' }}>$</span> {line}
                              </div>
                            ))}
                            <div style={{ color: 'var(--success)', marginTop: '0.75rem' }}>✓ {selectedTask.result?.summary}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {selectedTask.status === 'FAILED' && (
                      <div className="card glass" style={{ borderColor: 'rgba(239, 68, 68, 0.2)', textAlign: 'center', padding: '2rem' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✕</div>
                        <p style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '0.5rem' }}>Execution Failed</p>
                        <p style={{ fontSize: '0.85rem' }}>{selectedTask.result?.summary || 'An unknown error occurred.'}</p>
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
              {agents.length === 0 ? (
                <div className="card glass" style={{ textAlign: 'center', padding: '3rem' }}>
                  <Network size={44} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                  <p>No agents registered yet. Be the first to register one!</p>
                </div>
              ) : (
                <div className="agent-grid stagger">
                  {agents.map(agent => (
                    <div key={agent.id} className={`card glass agent-card accent-${agent.accent}`}>
                      <button className="btn btn-ghost" style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', padding: '0.3rem', width: '30px', height: '30px', zIndex: 2, color: 'var(--danger)' }}
                        onClick={() => deleteAgent(agent.id)} title="Remove agent">
                        <Trash2 size={14} />
                      </button>
                      <div className="agent-header">
                        <div className={`agent-avatar ${agent.accent}`}>{iconMap[agent.icon] || <Cpu size={18} />}</div>
                        <div className="agent-info">
                          <div className="agent-name">
                            {agent.name}
                            {agent.rating >= 4.8 && <Star size={11} color="var(--warning)" style={{ marginLeft: '0.3rem', display: 'inline', verticalAlign: 'middle' }} />}
                          </div>
                          <div className="agent-model">{agent.model}</div>
                        </div>
                      </div>
                      <div className="agent-tags"><span className={`agent-tag ${agent.accent}`}>{agent.specialty}</span></div>
                      <p className="agent-description">{agent.description}</p>
                      <ul className="agent-use-cases">
                        {agent.useCases.map((uc, i) => (<li key={i}>{uc}</li>))}
                      </ul>
                      <div className="agent-stats">
                        <div className="agent-stat">
                          <CheckCircle size={13} color="var(--success)" />
                          <span className="agent-stat-value">{agent.completedTasks}</span> tasks
                        </div>
                        <div className="agent-stat">
                          <Star size={13} color="var(--warning)" />
                          <span className="agent-stat-value">{agent.rating}</span> rating
                        </div>
                      </div>
                      <div className="agent-action-row">
                        <div className="agent-price">
                          <Zap size={13} />
                          <span className="agent-price-value">${agent.price.toFixed(2)}</span>
                          <span style={{ fontWeight: 400, opacity: 0.6, fontSize: '0.75rem' }}>/ task</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span className={`agent-status-badge ${agent.status.toLowerCase()}`}>{agent.status}</span>
                          <button className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                            onClick={() => { setPage('tasks'); setShowForm(true); }}>Assign</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* ── Post Task Modal ──────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card glass modal-content" style={{ width: '100%', maxWidth: '480px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem' }}>Post New Task</h2>
            <form onSubmit={handleSubmit}>
              <label>Task Title</label>
              <input placeholder="e.g. Analyze latest market trends for GLR" value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })} />
              <label>Description</label>
              <textarea rows={4} placeholder="Detailed instructions for the AI agent..." value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label>Reward (GLR)</label>
                  <input type="number" value={newTask.reward}
                    onChange={e => setNewTask({ ...newTask, reward: Number(e.target.value) })} />
                </div>
                <div>
                  <label>Deadline</label>
                  <input type="date" value={newTask.deadline}
                    onChange={e => setNewTask({ ...newTask, deadline: e.target.value })} />
                </div>
              </div>
              <label>Assign Agent</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {agents.map(a => (
                  <button key={a.id} type="button"
                    className={`btn ${newTask.selectedAgent === a.id ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    onClick={() => setNewTask({ ...newTask, selectedAgent: a.id })}>
                    {iconMap[a.icon]} {a.name}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit to Orbit</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Register Agent Modal ──────────────────────────── */}
      {showAgentForm && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card glass modal-content" style={{ width: '100%', maxWidth: '520px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem' }}>Register Your Agent</h2>
            <form onSubmit={handleRegisterAgent}>
              <label>Agent Name *</label>
              <input placeholder="e.g. My Custom Agent" value={newAgent.name}
                onChange={e => setNewAgent({ ...newAgent, name: e.target.value })} required />

              <label>Model</label>
              <input placeholder="e.g. qwen/qwen-2.5-coder:free" value={newAgent.model}
                onChange={e => setNewAgent({ ...newAgent, model: e.target.value })} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label>Specialty</label>
                  <input placeholder="e.g. Data Analysis" value={newAgent.specialty}
                    onChange={e => setNewAgent({ ...newAgent, specialty: e.target.value })} />
                </div>
                <div>
                  <label>Price ($/task)</label>
                  <input type="number" step="0.01" value={newAgent.price}
                    onChange={e => setNewAgent({ ...newAgent, price: Number(e.target.value) })} />
                </div>
              </div>

              <label>Icon</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {iconOptions.map(opt => (
                  <button key={opt.value} type="button"
                    className={`btn ${newAgent.icon === opt.value ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                    onClick={() => setNewAgent({ ...newAgent, icon: opt.value })}>
                    {iconMap[opt.value]} {opt.label}
                  </button>
                ))}
              </div>

              <label>Description *</label>
              <textarea rows={3} placeholder="Describe what your agent does..." value={newAgent.description}
                onChange={e => setNewAgent({ ...newAgent, description: e.target.value })} required />

              <label>Use Cases (one per line)</label>
              <textarea rows={3} placeholder="Market research&#10;Data processing&#10;Content generation" value={newAgent.useCases}
                onChange={e => setNewAgent({ ...newAgent, useCases: e.target.value })} />

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Register Agent</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAgentForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Cookie Consent Banner ────────────────────────── */}
      {cookieConsent && (
        <div className="cookie-banner fade-in-up">
          <p>
            We use cookies to enhance your experience. By continuing, you agree to our{' '}
            <a href="#">Privacy Policy</a> and <a href="#">Terms of Service</a>.
          </p>
          <button className="btn btn-primary" onClick={() => setCookieConsent(false)}>Accept All</button>
          <button className="btn btn-ghost" onClick={() => setCookieConsent(false)}>Decline</button>
        </div>
      )}
    </>
  );
}

export default App;
