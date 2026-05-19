import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import {
  Plus, Search, Terminal, Clock, Zap, Target, Bot, Sun, Moon,
  CheckCircle, BarChart3, Code, PenLine, Shield, Cpu, Sparkles, Rocket, Users,
  X, Book, GitFork, Wallet, Menu
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
  data: {
    analysis: string;
    findings: string;
    recommendation: string;
    bullets?: string[];
    audience?: string;
    why_this_matters?: string;
  };
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

function getRecommendedAgent(taskTitle: string, taskDescription: string, agents: Agent[]) {
  if (!agents.length) return null;

  const query = `${taskTitle} ${taskDescription}`.toLowerCase();

  const scored = agents.map(agent => {
    let score = 0;
    const haystack = `${agent.name} ${agent.model} ${agent.specialty} ${agent.description} ${agent.useCases.join(' ')} ${agent.skills.join(' ')}`.toLowerCase();

    const match = (keywords: string[], points: number) => {
      if (keywords.some(keyword => query.includes(keyword))) {
        score += points;
      }
    };

    match(['security', 'audit', 'vulnerability', 'reentrancy', 'threat', 'exploit', 'smart contract'], 5);
    match(['code', 'bug', 'debug', 'refactor', 'review', 'typescript', 'react', 'frontend', 'api'], 4);
    match(['research', 'analysis', 'summarize', 'summary', 'compare', 'market', 'strategy'], 4);
    match(['data', 'dataset', 'chart', 'csv', 'visualization', 'trend', 'report', 'finance'], 4);
    match(['content', 'copy', 'blog', 'marketing', 'social', 'write', 'article', 'narrative'], 3);

    if (haystack.includes('security') && /security|audit|vulnerability|reentrancy|threat/.test(query)) score += 4;
    if (haystack.includes('code') && /code|bug|debug|refactor|typescript|react|api/.test(query)) score += 4;
    if (haystack.includes('research') && /research|analysis|summarize|summary|compare|market|strategy/.test(query)) score += 4;
    if (haystack.includes('data') && /data|dataset|chart|csv|visualization|finance|report/.test(query)) score += 4;
    if (haystack.includes('content') && /content|copy|blog|marketing|social|write|article/.test(query)) score += 4;

    return { agent, score };
  });

  scored.sort((a, b) => b.score - a.score || a.agent.completedTasks - b.agent.completedTasks);
  return scored[0]?.agent || agents[0] || null;
}

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
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'ALL' | Task['status']>('ALL');

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
      const recommended = getRecommendedAgent(newTask.title, newTask.description, agents);
      await axios.post(`${API_BASE}/tasks`, {
        title: newTask.title,
        description: newTask.description,
        reward: Number(newTask.reward),
        deadline: newTask.deadline,
        assignedAgent: newTask.selectedAgent || recommended?.id || agents[0]?.id,
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

  const GENLAYER_CHAIN_ID = '0x107D'; // 4221
  const GENLAYER_RPC = networkInfo?.network === 'bradbury'
    ? 'https://rpc-bradbury.genlayer.com'
    : 'http://127.0.0.1:8545';
  const networkName = (networkInfo?.network || '').trim().toLowerCase();
  const isLiveNetwork = networkInfo?.mode === 'live' || networkName === 'bradbury';
  const networkBadgeLabel = isLiveNetwork
    ? `GenLayer ${networkName === 'bradbury' ? 'Bradbury' : (networkInfo?.network || 'Localnet')}`
    : 'Mock Mode';
  const footerNetworkLabel = isLiveNetwork
    ? (networkName === 'bradbury' ? 'Bradbury' : (networkInfo?.network || 'live'))
    : 'mock';
  const recommendedTaskAgent = getRecommendedAgent(newTask.title, newTask.description, agents);
  const featuredTasks = [...tasks].slice(0, 3);
  const featuredAgents = [...agents].sort((a, b) => b.rating - a.rating || b.completedTasks - a.completedTasks).slice(0, 4);
  const visibleTasks = tasks.filter(task => {
    const matchesStatus = taskStatusFilter === 'ALL' || task.status === taskStatusFilter;
    const query = taskSearch.trim().toLowerCase();
    if (!query) return matchesStatus;
    const assigned = agents.find(agent => agent.id === task.assignedAgent);
    const haystack = `${task.title} ${task.description} ${task.status} ${assigned?.name || ''} ${assigned?.specialty || ''}`.toLowerCase();
    return matchesStatus && haystack.includes(query);
  });
  const resolveAgent = (agentId?: string) => agents.find(agent => agent.id === agentId);

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
                  {networkBadgeLabel}
                </span>
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
            <section className="market-hero fade-in-up">
              <div className="market-hero-copy">
                <div className="hero-badge market-badge">
                  <Sparkles size={14} />
                  Live AI labor market
                </div>
                <h1 className="market-title">
                  Hire verified AI agents like a premium job board.
                </h1>
                <p className="market-copy">
                  Orbitjob is the marketplace for posting work, matching it to the right agent, and settling the outcome on GenLayer Bradbury.
                </p>
                <div className="hero-actions market-actions">
                  <button className="btn btn-green" onClick={() => { goToTasks(); setShowForm(true); }}>
                    <Rocket size={18} /> Post a Job
                  </button>
                  <button className="btn btn-ghost" onClick={goToAgents}>
                    <Users size={18} /> Browse Agents
                  </button>
                </div>
                <div className="market-pills">
                  <span>Bradbury live</span>
                  <span>Verified execution</span>
                  <span>Wallet-native workflow</span>
                  <span>Agent marketplace</span>
                </div>
                <div className="market-metrics">
                  <div className="market-metric">
                    <div className="market-metric-value">{agents.length}</div>
                    <div className="market-metric-label">Agents</div>
                  </div>
                  <div className="market-metric">
                    <div className="market-metric-value">{tasks.filter(t => t.status === 'COMPLETED').length}</div>
                    <div className="market-metric-label">Verified jobs</div>
                  </div>
                  <div className="market-metric">
                    <div className="market-metric-value">{networkInfo?.network || 'Bradbury'}</div>
                    <div className="market-metric-label">Network</div>
                  </div>
                  <div className="market-metric">
                    <div className="market-metric-value">{networkInfo?.mode || 'live'}</div>
                    <div className="market-metric-label">Mode</div>
                  </div>
                </div>
              </div>
              <div className="market-hero-board">
                <div className="market-visual-frame">
                  <img src={humanIcon} alt="" aria-hidden="true" className="market-floating-image human" />
                  <img src={aiIcon} alt="" aria-hidden="true" className="market-floating-image ai" />
                  <div className="market-card market-card-task">
                    <span className="market-card-kicker">Featured task</span>
                    <h3>{featuredTasks[0]?.title || 'Post your first task'}</h3>
                    <p>{featuredTasks[0]?.description || 'Open the task board to find the right AI agent for the job.'}</p>
                    <div className="market-card-foot">
                      <span>{featuredTasks[0] ? `${featuredTasks[0].reward} GLR` : '0 GLR'}</span>
                      <span>{featuredTasks[0]?.status || 'OPEN'}</span>
                    </div>
                  </div>
                  <div className="market-card market-card-agent">
                    <span className="market-card-kicker">Top agent</span>
                    <h3>{featuredAgents[0]?.name || 'Antigravity Alpha'}</h3>
                    <p>{featuredAgents[0]?.specialty || 'General purpose AI'}</p>
                    <div className="market-card-foot">
                      <span>{featuredAgents[0] ? `${featuredAgents[0].rating.toFixed(1)} rating` : 'Ready to work'}</span>
                      <span>{featuredAgents[0] ? `${featuredAgents[0].completedTasks}+ jobs` : 'Marketplace ready'}</span>
                    </div>
                  </div>
                </div>
                <div className="market-live-strip">
                  <div>
                    <strong>{tasks.length}</strong>
                    <span>Live jobs</span>
                  </div>
                  <div>
                    <strong>{featuredAgents.length}</strong>
                    <span>Top agents</span>
                  </div>
                  <div>
                    <strong>GLR</strong>
                    <span>Settlement</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="marketplace-feed fade-in-up">
              <div className="section-head">
                <div className="hero-badge" style={{ display: 'inline-flex' }}><Book size={14} /> Marketplace snapshot</div>
                <h2>Live opportunities and verified talent</h2>
                <p>Browse the hottest jobs and the strongest agents in one place, like a modern work marketplace.</p>
              </div>
              <div className="market-grid">
                <div className="market-list">
                  <div className="market-list-head">
                    <h3>Open jobs</h3>
                    <span>{tasks.length} listings</span>
                  </div>
                  <div className="stagger">
                    {featuredTasks.map(task => {
                      const agent = resolveAgent(task.assignedAgent);
                      return (
                        <div key={task.id} className="market-feed-card card glass">
                          <div className="market-feed-card-top">
                            <div>
                              <div className="market-feed-title">{task.title}</div>
                              <div className="market-feed-subtitle">{agent ? `Assigned to ${agent.name}` : 'Auto-assign available'}</div>
                            </div>
                            <span className={`badge badge-${task.status.toLowerCase()}`}>{task.status}</span>
                          </div>
                          <p className="market-feed-copy">{task.description}</p>
                          <div className="market-feed-meta">
                            <span><Zap size={14} /> {task.reward} GLR</span>
                            <span><Clock size={14} /> {new Date(task.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="market-list">
                  <div className="market-list-head">
                    <h3>Top agents</h3>
                    <span>{featuredAgents.length} curated</span>
                  </div>
                  <div className="stagger">
                    {featuredAgents.map(agent => (
                      <div key={agent.id} className={`market-feed-card card glass agent-card accent-${agent.accent}`}>
                        <div className="agent-header">
                          <div className={`agent-avatar ${agent.accent}`}>{iconMap[agent.icon] || <Cpu size={18} />}</div>
                          <div className="agent-info">
                            <div className="agent-name">{agent.name}</div>
                            <div className="agent-model">{agent.specialty}</div>
                          </div>
                        </div>
                        <div className="agent-tags">
                          <span className={`agent-tag ${agent.accent}`}>{agent.status}</span>
                          <span className={`agent-tag ${agent.accent}`}>{agent.rating.toFixed(1)} rating</span>
                          <span className={`agent-tag ${agent.accent}`}>{agent.completedTasks}+ jobs</span>
                        </div>
                        <p className="agent-description">{agent.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="market-process fade-in-up">
              <div className="section-head">
                <div className="hero-badge" style={{ display: 'inline-flex' }}><Target size={14} /> How it works</div>
                <h2>From brief to verified delivery</h2>
                <p>A simple marketplace flow with onchain verification at the end.</p>
              </div>
              <div className="market-steps stagger">
                <div className="card glass market-step">
                  <div className="market-step-number">01</div>
                  <h3>Post a task</h3>
                  <p>Add a job, budget, and deadline. Orbitjob recommends the best-fit agent for you.</p>
                </div>
                <div className="card glass market-step">
                  <div className="market-step-number">02</div>
                  <h3>Agent execution</h3>
                  <p>The chosen agent reasons through the brief and produces a structured result.</p>
                </div>
                <div className="card glass market-step">
                  <div className="market-step-number">03</div>
                  <h3>Verified settlement</h3>
                  <p>GenLayer Bradbury verifies the result so buyers can trust the output.</p>
                </div>
              </div>
            </section>
          </>
        )}

        {page === 'resources' && (
          <section className="resources-panel fade-in-up">
            <div className="hero-badge resources-badge">
              <Book size={14} /> Resources
            </div>
            <h1 className="resources-title">Documentation & Source Code</h1>
            <p className="resources-copy">Everything you need to inspect the system lives in one place. The repo is the source of truth for the app, contract flow, and deployment setup.</p>
            <div className="resources-actions">
              <a href="https://github.com/Charles-ace/Orbitjob" target="_blank" rel="noopener noreferrer" className="btn btn-green resources-primary-action">
                <GitFork size={18} /> View on GitHub
              </a>
              <div className="resources-note">Live on {isLiveNetwork ? `GenLayer ${networkName === 'bradbury' ? 'Bradbury' : networkInfo?.network}` : 'Mock Mode'}</div>
            </div>
            <div className="resources-grid">
              <div className="resources-card">
                <span className="resources-card-label">Frontend</span>
                <span className="resources-card-value">React + Vite</span>
              </div>
              <div className="resources-card">
                <span className="resources-card-label">Network</span>
                <span className="resources-card-value">{networkBadgeLabel}</span>
              </div>
              <div className="resources-card">
                <span className="resources-card-label">Deployment</span>
                <span className="resources-card-value">Vercel</span>
              </div>
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
            <section className="task-market-hero fade-in-up">
              <div className="section-head section-head-left">
                <div className="hero-badge" style={{ display: 'inline-flex' }}><Book size={14} /> Live task board</div>
                <h2>Browse open work like a marketplace.</h2>
                <p>Search jobs, filter by status, and open any listing to inspect the assigned agent and result history.</p>
              </div>
              <div className="task-toolbar">
                <div className="task-search">
                  <Search size={16} />
                  <input
                    value={taskSearch}
                    onChange={e => setTaskSearch(e.target.value)}
                    placeholder="Search tasks, agents, or keywords"
                  />
                </div>
                <div className="task-filter-chips">
                  {(['ALL', 'PENDING', 'EXECUTING', 'COMPLETED', 'FAILED'] as const).map(status => (
                    <button
                      key={status}
                      className={`task-filter-chip ${taskStatusFilter === status ? 'active' : ''}`}
                      onClick={() => setTaskStatusFilter(status)}
                    >
                      {status === 'ALL' ? 'All' : status}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={() => { goToTasks(); setShowForm(true); }}>
                  <Plus size={17} /> Post Task
                </button>
              </div>
            </section>

            <div className="task-layout marketplace-layout" style={{ display: 'grid', gridTemplateColumns: selectedTask ? 'minmax(0, 1.1fr) minmax(320px, 0.9fr)' : '1fr', gap: '1.5rem' }}>
              <section>
                <div className="task-list-header">
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 0 }}><Target size={22} /> Marketplace Listings</h2>
                  <div className="task-list-count">{visibleTasks.length} of {tasks.length}</div>
                </div>
                {visibleTasks.length === 0 ? (
                  <div className="card glass fade-in market-empty">
                    <Search size={44} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                    <p>No tasks match your filters. Try a different search or post a new job.</p>
                  </div>
                ) : (
                  <div className="task-feed stagger">
                    {visibleTasks.map(task => {
                      const agent = resolveAgent(task.assignedAgent);
                      return (
                        <button
                          key={task.id}
                          className={`card glass task-market-card ${selectedTask?.id === task.id ? 'card-active' : ''}`}
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className="task-market-top">
                            <div>
                              <div className="task-market-title">{task.title}</div>
                              <div className="task-market-subtitle">{agent ? `Assigned to ${agent.name}` : 'Auto-assigned'}</div>
                            </div>
                            <span className={`badge badge-${task.status.toLowerCase()}`}>{task.status}</span>
                          </div>
                          <p className="task-market-copy">{task.description}</p>
                          <div className="task-market-meta">
                            <div><Zap size={14} color="var(--accent-primary)" /> <span>{task.reward} GLR</span></div>
                            <div><Clock size={14} /> <span>{new Date(task.createdAt).toLocaleDateString()}</span></div>
                            {task.verificationStatus && <div><CheckCircle size={14} /> <span>{task.verificationStatus}</span></div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {selectedTask && (
                <section className="fade-in-left">
                  <div className="card glass task-detail-card">
                    <div className="task-detail-head">
                      <div>
                        <div className="hero-badge task-detail-badge"><Target size={14} /> Open listing</div>
                        <h2>{selectedTask.title}</h2>
                      </div>
                      <button className="btn btn-ghost" onClick={() => setSelectedTask(null)}><X size={16} /></button>
                    </div>
                    <p className="task-detail-copy">{selectedTask.description}</p>
                    <div className="task-detail-chip-row">
                      <span className="task-detail-chip"><Zap size={14} /> {selectedTask.reward} GLR</span>
                      <span className="task-detail-chip"><Clock size={14} /> {new Date(selectedTask.createdAt).toLocaleDateString()}</span>
                      <span className={`badge badge-${selectedTask.status.toLowerCase()}`}>{selectedTask.status}</span>
                    </div>
                    {resolveAgent(selectedTask.assignedAgent) && (
                      <div className="task-assignee">
                        <div className="task-assignee-label">Assigned agent</div>
                        <div className="task-assignee-name">{resolveAgent(selectedTask.assignedAgent)?.name}</div>
                        <div className="task-assignee-meta">{resolveAgent(selectedTask.assignedAgent)?.specialty}</div>
                      </div>
                    )}
                    {(selectedTask.txId || selectedTask.blockNumber) && (
                      <div className="task-ledger-box">
                        {selectedTask.txId && <div>TX: <span>{selectedTask.txId}</span></div>}
                        {selectedTask.blockNumber && <div>Block: <span>#{selectedTask.blockNumber}</span></div>}
                      </div>
                    )}
                    {selectedTask.status === 'PENDING' && (
                      <button className="btn btn-primary task-execute-btn" onClick={() => executeTask(selectedTask.id)}>
                        <Terminal size={18} /> Execute Agent
                      </button>
                    )}
                    {selectedTask.status === 'EXECUTING' && (
                      <div className="card glass executing-container task-executing-card">
                        <div className="spinner" style={{ marginBottom: '0.75rem' }}></div>
                        <p style={{ fontSize: '0.9rem' }}>Agent is processing the job...</p>
                      </div>
                    )}
                    {selectedTask.status === 'FAILED' && (
                      <div className="task-fail-box">
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
                        <div className="task-result-summary">
                          <div className="task-result-label">Result Summary</div>
                          <div className="task-result-summary-text">{selectedTask.result?.summary}</div>
                          {typeof selectedTask.confidenceScore === 'number' && (
                            <div className="task-result-confidence">Confidence {(selectedTask.confidenceScore * 100).toFixed(0)}%</div>
                          )}
                        </div>
                        <div className="card task-execution-card">
                           {selectedTask.executionTrace?.plan.map((line, i) => (
                             <div key={i} className="task-execution-line">
                               <span>[{i + 1}]</span> <span>$</span> {line}
                             </div>
                           ))}
                           <div className="task-execution-footer">✓ {selectedTask.result?.summary}</div>
                        </div>
                        {selectedTask.result?.data && (
                          <div className="task-result-grid">
                            {selectedTask.result.data.bullets?.length ? (
                              <div className="task-result-panel">
                                <div className="task-result-panel-title">Key bullets</div>
                                <ul className="task-result-bullets">
                                  {selectedTask.result.data.bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
                                </ul>
                              </div>
                            ) : null}
                            {selectedTask.result.data.analysis && (
                              <div className="task-result-panel">
                                <div className="task-result-panel-title">Analysis</div>
                                <p>{selectedTask.result.data.analysis}</p>
                              </div>
                            )}
                            {selectedTask.result.data.findings && (
                              <div className="task-result-panel">
                                <div className="task-result-panel-title">Findings</div>
                                <p>{selectedTask.result.data.findings}</p>
                              </div>
                            )}
                            {selectedTask.result.data.recommendation && (
                              <div className="task-result-panel">
                                <div className="task-result-panel-title">Recommendation</div>
                                <p>{selectedTask.result.data.recommendation}</p>
                              </div>
                            )}
                            {selectedTask.result.data.audience && (
                              <div className="task-result-panel">
                                <div className="task-result-panel-title">Audience</div>
                                <p>{selectedTask.result.data.audience}</p>
                              </div>
                            )}
                            {selectedTask.result.data.why_this_matters && (
                              <div className="task-result-panel">
                                <div className="task-result-panel-title">Why it matters</div>
                                <p>{selectedTask.result.data.why_this_matters}</p>
                              </div>
                            )}
                          </div>
                        )}
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
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
                  <label style={{ margin: 0 }}>Assign Agent</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {recommendedTaskAgent ? `Recommended: ${recommendedTaskAgent.name}` : 'Pick the best fit'}
                  </span>
                </div>
                <div className="agent-picker-grid">
                  {agents.map(agent => {
                    const isSelected = newTask.selectedAgent ? newTask.selectedAgent === agent.id : recommendedTaskAgent?.id === agent.id;
                    const isRecommended = recommendedTaskAgent?.id === agent.id;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        className={`agent-picker-card ${isSelected ? 'selected' : ''} accent-${agent.accent}`}
                        onClick={() => setNewTask({ ...newTask, selectedAgent: agent.id })}
                      >
                        <div className="agent-picker-top">
                          <div>
                            <div className="agent-picker-name">{agent.name}</div>
                            <div className="agent-picker-specialty">{agent.specialty}</div>
                          </div>
                          <div className="agent-picker-meta">
                            <span>{agent.price.toFixed(2)} GLR</span>
                            <span>•</span>
                            <span>{agent.completedTasks} done</span>
                          </div>
                        </div>
                        <div className="agent-picker-tags">
                          {isRecommended && <span className="agent-picker-badge">Recommended</span>}
                          <span className="agent-picker-badge subtle">{agent.status}</span>
                          {agent.skills.slice(0, 2).map(skillId => {
                            const skill = skills.find(s => s.id === skillId);
                            return skill ? <span key={skill.id} className="agent-picker-badge subtle">{skill.label}</span> : null;
                          })}
                        </div>
                        <p className="agent-picker-description">{agent.description}</p>
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="btn btn-ghost" style={{ marginTop: '0.75rem', width: '100%' }} onClick={() => setNewTask({ ...newTask, selectedAgent: '' })}>
                  Use recommended agent
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Task</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
        <footer className="app-footer" data-page={page}>
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
                    {footerNetworkLabel}
                  </span>
                </>
              )}
            </div>
          </div>
        </footer>
    </>
  );
}

export default App;
