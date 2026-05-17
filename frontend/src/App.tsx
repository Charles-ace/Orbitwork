import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import {
  Plus, Search, Terminal, Clock, Zap, Target, Bot, Sun, Moon,
  CheckCircle, BarChart3, Code, PenLine, Shield, Cpu, Sparkles, Rocket, Users,
  X, Book, GitFork, Wallet, Menu, Copy, ExternalLink
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

interface NetworkInfo {
  mode: string;
  network: string;
  contractAddress: string | null;
}

interface Skill {
  id: string;
  label: string;
  description: string;
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
  skills: string[];
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
  const [page, setPage] = useState<'landing' | 'tasks' | 'agents' | 'register-agent' | 'resources'>('landing');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [wallet, setWallet] = useState<{ address: string; balance: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', reward: 0, deadline: '', selectedAgent: '' });
  const [newAgent, setNewAgent] = useState({ name: '', model: '', specialty: '', description: '', icon: 'cpu', accent: 'purple', selectedSkills: [] as string[] });
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('orbitjob-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const fetchTasks = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/tasks`);
      setTasks(res.data.items || res.data);
    } catch (err) { console.error('Failed to fetch tasks', err); }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/agents`);
      setAgents(res.data);
    } catch (err) { console.error('Failed to fetch agents', err); }
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/skills`);
      setSkills(res.data);
    } catch (err) { console.error('Failed to fetch skills', err); }
  }, []);

  const fetchNetworkInfo = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/`);
      setNetworkInfo(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchAgents();
    fetchSkills();
    fetchNetworkInfo();
  }, [fetchTasks, fetchAgents, fetchSkills, fetchNetworkInfo]);

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
        const items: Task[] = res.data.items || res.data;
        const task = items.find((t: Task) => t.id === id);
        if (task && (task.status === 'COMPLETED' || task.status === 'FAILED')) {
          setTasks(items);
          clearInterval(interval);
        }
      }, 1000);
    } catch (err) { console.error('Failed to execute task', err); }
  };

  const GENLAYER_CHAIN_ID = '0xEEBB'; // 61123
  const GENLAYER_RPC = networkInfo?.network === 'bradbury'
    ? 'https://bradbury.genlayer.net'
    : 'http://127.0.0.1:8545';

  const switchToGenLayer = async (provider: ethers.providers.Web3Provider) => {
    try {
      await provider.send('wallet_switchEthereumChain', [{ chainId: GENLAYER_CHAIN_ID }]);
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await provider.send('wallet_addEthereumChain', [{
          chainId: GENLAYER_CHAIN_ID,
          chainName: networkInfo?.network === 'bradbury' ? 'GenLayer Bradbury' : 'GenLayer Localnet',
          rpcUrls: [GENLAYER_RPC],
          nativeCurrency: { name: 'GLR', symbol: 'GLR', decimals: 18 },
        }]);
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask to connect.');
      return;
    }
    setConnecting(true);
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum as any);
      await provider.send('eth_requestAccounts', []);

      try { await switchToGenLayer(provider); } catch {}

      const signer = provider.getSigner();
      const address = await signer.getAddress();

      const challengeRes = await axios.get(`${API_BASE}/auth/challenge`, { params: { address } });
      const { nonce } = challengeRes.data;
      const signature = await signer.signMessage(nonce);
      const signinRes = await axios.post(`${API_BASE}/auth/signin`, { address, signature, nonce });
      const { token } = signinRes.data;

      // Fetch GLR balance from backend faucet system instead of ETH balance
      let balance = '0.0';
      try {
        const balRes = await axios.get(`${API_BASE}/balances/${address.toLowerCase()}`);
        balance = String(balRes.data.balance);
      } catch {}

      setAuthToken(token);
      setWallet({ address, balance });
    } catch (err) {
      console.error('Wallet connection failed:', err);
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAuthToken(null);
    setWallet(null);
  };

  const registerAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/agents`, newAgent);
      setAgents(prev => [...prev, res.data]);
      setNewAgent({ name: '', model: '', specialty: '', description: '', icon: 'cpu', accent: 'purple', selectedSkills: [] });
    } catch (err) { console.error('Failed to register agent', err); }
  };

  const closeMobile = () => setMobileMenuOpen(false);
  const goToTasks = () => { setPage('tasks'); setSelectedTask(null); closeMobile(); };
  const goToAgents = () => { setPage('agents'); setSelectedTask(null); closeMobile(); };
  const goToLanding = () => { setPage('landing'); setSelectedTask(null); closeMobile(); };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const blockExplorerUrl = networkInfo?.network === 'bradbury'
    ? `https://bradbury.genlayer.net/address/${networkInfo?.contractAddress}`
    : null;

  return (
    <>
      <div className="app-container">
        {/* ── Navbar ───────────────────────────────────── */}
        <nav className="navbar fade-in-down">
          <button onClick={goToLanding} className="navbar-logo" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Zap size={22} color="var(--accent-primary)" className="icon-float" />
            <span>Orbitjob</span>
          </button>
          <div className={`navbar-links${mobileMenuOpen ? ' open' : ''}`}>
            <button className="navbar-link" onClick={goToTasks}>PRODUCTS</button>
            <button className="navbar-link" onClick={goToAgents}>AGENTS</button>
            <button className="navbar-link" onClick={() => { setPage('resources'); setSelectedTask(null); closeMobile(); }}>RESOURCES</button>
          </div>
          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(v => !v)}>
            {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
          <div className="navbar-actions">
            {networkInfo && (
              <div className="network-badge" data-mode={networkInfo.mode}>
                <span className="network-badge-dot" />
                <span className="network-badge-name">
                  {networkInfo.mode === 'live' ? 'GenLayer ' + networkInfo.network : 'Mock Mode'}
                </span>
                {networkInfo.contractAddress && (
                  <span className="network-badge-contract" onClick={() => copyToClipboard(networkInfo.contractAddress!)} title="Copy contract address">
                    <span className="network-badge-sep">|</span>
                    {networkInfo.contractAddress.slice(0, 8)}...{networkInfo.contractAddress.slice(-4)}
                    <Copy size={11} style={{ opacity: 0.6 }} />
                  </span>
                )}
              </div>
            )}
            <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {page === 'tasks' && (
              <button className="btn btn-ghost" onClick={() => { goToTasks(); setShowForm(true); }}>
                <Plus size={17} /> Post Task
              </button>
            )}
            {wallet ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: authToken ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)', display: 'inline-block' }} />
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{wallet.balance} GLR</span>
                  <span>|</span>
                  {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                </span>
                <button className="btn btn-ghost" onClick={disconnectWallet}>
                  <Wallet size={17} /> Disconnect
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={connectWallet} disabled={connecting}>
                <Wallet size={17} /> {connecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
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
                  <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>The GenLayer network confirms the result onchain. Tasks get a "VERIFIED" status with a transaction hash and block number.</p>
                </div>
              </div>
            </section>

            <section className="stats-row fade-in-up">
              <div className="stat-item">
                <div className="stat-number">{agents.length}+</div>
                <div className="stat-label">AI Agents</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{tasks.filter(t => t.status === 'COMPLETED').length}+</div>
                <div className="stat-label">Tasks Completed</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{networkInfo?.mode || 'mock'}</div>
                <div className="stat-label">Network Mode</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{networkInfo?.network || 'local'}</div>
                <div className="stat-label">Network</div>
              </div>
            </section>

            <section className="cta-section fade-in-up">
              <h2 style={{ marginBottom: '1rem' }}>Ready to Deploy Intelligent Agents?</h2>
              <p style={{ marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem' }}>
                Post a task, assign an AI agent, and get onchain-verified results in seconds.
              </p>
              <div className="hero-actions" style={{ justifyContent: 'center' }}>
                <button className="btn btn-green" onClick={() => { goToTasks(); setShowForm(true); }}>
                  <Rocket size={18} /> Get Started
                </button>
                <button className="btn btn-ghost" onClick={goToAgents}>
                  <Bot size={18} /> Browse Agents
                </button>
              </div>
            </section>
          </>
        )}

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
            <div className="task-layout" style={{ display: 'grid', gridTemplateColumns: selectedTask ? '1fr 1.5fr' : '1fr', gap: '2rem' }}>
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
                    {(selectedTask.txId || networkInfo?.contractAddress) && (
                      <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', background: 'var(--card-bg)', padding: '0.5rem 0.75rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid var(--border)' }}>
                        {networkInfo?.contractAddress && (
                          <div>Contract: <span style={{ color: 'var(--accent-primary)' }}>{networkInfo.contractAddress.slice(0, 10)}...{networkInfo.contractAddress.slice(-6)}</span></div>
                        )}
                        {selectedTask.txId && (
                          <div style={{ marginTop: '0.2rem' }}>TX: <span style={{ color: 'var(--accent-primary)' }}>{selectedTask.txId}</span></div>
                        )}
                        {selectedTask.blockNumber && (
                          <div style={{ marginTop: '0.2rem' }}>Block: <span style={{ color: 'var(--accent-primary)' }}>#{selectedTask.blockNumber}</span></div>
                        )}
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
                    {selectedTask.status === 'FAILED' && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Execution Failed</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{selectedTask.result?.summary || 'No error details available'}</div>
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
                <button className="btn btn-primary" onClick={() => setPage('register-agent')}>
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
                    <div className="agent-tags">
                      <span className={`agent-tag ${agent.accent}`}>{agent.specialty}</span>
                      {agent.skills?.map(skillId => {
                        const skill = skills.find(s => s.id === skillId);
                        return skill ? (
                          <span key={skillId} className={`agent-tag ${agent.accent}`} title={skill.description}>{skill.label}</span>
                        ) : null;
                      })}
                    </div>
                    {agent.skills && agent.skills.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', fontSize: '0.75rem', color: 'var(--accent-primary)' }}>
                        <Zap size={13} fill="var(--accent-primary)" />
                        <span style={{ fontWeight: 600 }}>Expert Skills Active</span>
                        <span style={{ opacity: 0.6 }}>({agent.skills.length})</span>
                      </div>
                    )}
                    <p className="agent-description">{agent.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── Register Agent Page ─────────────────────────── */}
      {page === 'register-agent' && (
        <>
          <div className="nav-tabs">
            <button className="nav-tab" onClick={goToTasks}><Target size={16} /> Tasks</button>
            <button className="nav-tab" onClick={goToAgents}><Bot size={16} /> Agents</button>
            <button className="nav-tab active" onClick={() => {}}><Plus size={16} /> Register Agent</button>
          </div>
          <section style={{ maxWidth: '520px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>Register New Agent</h2>
            <div className="card glass" style={{ padding: '2rem' }}>
              <form onSubmit={registerAgent}>
                <label>Agent Name *</label>
                <input placeholder="e.g. Nova AI" value={newAgent.name} onChange={e => setNewAgent({ ...newAgent, name: e.target.value })} required />
                <label>Model ID *</label>
                <input placeholder="e.g. gpt-4-turbo" value={newAgent.model} onChange={e => setNewAgent({ ...newAgent, model: e.target.value })} required />
                <label>Specialty</label>
                <input placeholder="e.g. Data Analysis" value={newAgent.specialty} onChange={e => setNewAgent({ ...newAgent, specialty: e.target.value })} />
                <label>Description</label>
                <textarea rows={3} placeholder="Describe what this agent does..." value={newAgent.description} onChange={e => setNewAgent({ ...newAgent, description: e.target.value })} />
                <label style={{ marginTop: '1rem' }}>Expert Skills</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  {skills.map(s => (
                    <label key={s.id} className={`skill-chip ${newAgent.selectedSkills.includes(s.id) ? 'active' : ''}`}
                      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.7rem', borderRadius: '6px', fontSize: '0.78rem', border: '1px solid var(--border-color)', background: newAgent.selectedSkills.includes(s.id) ? 'var(--accent-primary)' : 'var(--card-bg)', color: newAgent.selectedSkills.includes(s.id) ? '#000' : 'var(--text-secondary)', transition: 'all 0.2s', fontWeight: 500 }}>
                      <input type="checkbox" checked={newAgent.selectedSkills.includes(s.id)}
                        onChange={e => setNewAgent({
                          ...newAgent,
                          selectedSkills: e.target.checked
                            ? [...newAgent.selectedSkills, s.id]
                            : newAgent.selectedSkills.filter(id => id !== s.id)
                        })}
                        style={{ display: 'none' }} />
                      {s.label}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Register</button>
                  <button type="button" className="btn btn-ghost" onClick={goToAgents}>Cancel</button>
                </div>
              </form>
            </div>
          </section>
        </>
      )}

      {/* ── Post Task Modal ──────────────────────────────── */}
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
              <label style={{ marginTop: '0.5rem' }}>Assign Agent</label>
              <select value={newTask.selectedAgent} onChange={e => setNewTask({ ...newTask, selectedAgent: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit' }}>
                <option value="">Auto-assign (first available)</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name} — {a.specialty}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Task</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

        {/* ── Footer ─────────────────────────────────────── */}
        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-left">
              <span className="footer-brand">
                <Zap size={16} color="var(--accent-primary)" />
                Orbitjob
              </span>
              <span className="footer-sep">·</span>
              <span className="footer-text">AI Task Marketplace on GenLayer</span>
            </div>
            <div className="footer-right">
              {networkInfo && (
                <>
                  <span className="footer-network-badge" data-mode={networkInfo.mode}>
                    <span className="footer-network-dot" />
                    {networkInfo.mode === 'live' ? networkInfo.network : 'mock'}
                  </span>
                  {networkInfo.contractAddress && (
                    <span className="footer-contract" onClick={() => copyToClipboard(networkInfo.contractAddress!)} title="Copy contract address">
                      <span className="footer-contract-label">Contract</span>
                      <code className="footer-contract-address">
                        {networkInfo.contractAddress.slice(0, 10)}...{networkInfo.contractAddress.slice(-8)}
                      </code>
                      <Copy size={12} className="footer-copy-icon" />
                      {blockExplorerUrl && (
                        <a href={blockExplorerUrl} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="View on block explorer">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </footer>
    </>
  );
}

export default App;
