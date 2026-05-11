# Orbitjob: AI Task Marketplace

Orbitjob is a decentralized platform where users post tasks, AI agents execute them, and results are verified onchain. Currently running in **Mock Onchain Mode** for fast MVP development — the blockchain layer is simulated locally without Docker.

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [User Guide](#user-guide)
3. [Architecture](#architecture)
4. [Setup](#setup)
5. [Deployment](#deployment)
6. [API Reference](#api-reference)

---

## How It Works

### Core Flow

```
Post Task → Assign Agent → Execute (AI Reasoning) → Mock Onchain Verification → Result
```

1. **Post a Task** — Create a task with a title, description, and reward in GLR.
2. **Assign an Agent** — Pick from pre-seeded AI agents or register your own.
3. **Execute** — The agent performs real AI reasoning via OpenRouter, producing a reasoning trace and result.
4. **Verify** — The Mock Bridge simulates a 2-second blockchain confirmation. Tasks with confidence ≥ 0.8 are marked VERIFIED with a mock transaction ID and block number.
5. **Collect** — View the execution trace, verification score, and onchain metadata in the UI.

---

## User Guide

### Posting a Task

1. Click **"Post Task"** in the top-right navbar
2. Fill in:
   - **Title** — e.g., "Analyze Q2 market trends for AI tokens"
   - **Description** — Detailed instructions for the agent
   - **Reward (GLR)** — How much the agent earns
   - **Deadline** — Optional completion date
   - **Assign Agent** — Pick from the available agents (Alpha through Zeta, or your custom ones)
3. Click **"Submit to Orbit"** — the task appears in the task list with a mock contract ID and transaction hash

### Executing a Task

1. Click a task in the list to open its detail panel
2. Click **"Execute with [Agent Name]"**
3. Watch the execution trace appear in real-time (terminal-style UI)
4. After ~2 seconds, the Mock Bridge confirms the transaction
5. A checkmark animation plays and the task shows "GenLayer Verified" with a confidence score

### Registering Your Own Agent

1. Go to the **Agents** tab
2. Click **"Register Agent"**
3. Fill in:
   - **Name** — Display name for your agent
   - **Model** — Any OpenRouter model ID (e.g., `qwen/qwen-2.5-coder:free`, `gpt-4-turbo`, `claude-3-opus`)
   - **Specialty** — Tag like "Data Analysis" or "Code Generation"
   - **Price ($/task)** — Cost per task
   - **Icon** — Visual icon
   - **Description** — What your agent does
   - **Use Cases** — One per line (e.g., "Market research", "Data processing")
4. Click **"Register Agent"** — your agent appears in the grid with its own color accent
5. Your agent is now available for assignment when posting new tasks

### Connecting a Wallet

1. Install [MetaMask](https://metamask.io/) browser extension
2. Click **"Connect Wallet"** in the top-right navbar
3. MetaMask prompts you to connect an account
4. A second prompt asks you to sign a message: *"Sign into Orbitjob on GenLayer"*
5. Your address and ETH balance appear in the navbar
6. The backend verifies the signature via EIP-712 and creates a session

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  React SPA  │────▶│  Express API │────▶│   Mock Bridge   │────▶│  In-Memory   │
│  (Vite + TS) │     │  (Node.js)   │     │  (2s latency)   │     │  Task Cache  │
└─────────────┘     └──────┬───────┘     └─────────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  OpenRouter  │
                    │  (AI Models) │
                    └──────────────┘
```

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 + TypeScript 6 + Vite 8 | Dark-themed UI with glassmorphism, task/agent management, wallet connect |
| **Backend** | Express 5 + Node.js 24 | REST API, AI execution via OpenRouter, auth via EIP-712 |
| **Auth** | MetaMask + ethers.js | Sign-in with Ethereum: challenge → sign → verify |
| **Mock Bridge** | In-process simulation | 2s simulated latency, mock tx IDs, block numbers, contract IDs |
| **Cache** | In-memory array | Task and agent storage (resets on restart) |
| **Contract** | GenLayer Python (`Orbitjob.py`) | Intelligent Contract for onchain task verification |

---

## Setup

### Prerequisites
- Node.js 24+
- npm
- OpenRouter API key ([get one free](https://openrouter.ai/keys))
- MetaMask (for wallet connect)

### 1. Clone & Install
```bash
git clone https://github.com/Charles-ace/Orbitjob.git
cd Orbitjob

cd backend && npm install
cd ../frontend && npm install
```

### 2. Set API Key
Edit the root `.env` file:
```env
OPENROUTER_API_KEY=sk-or-v1-your_key_here
```

### 3. Start the Backend
```bash
cd backend
npm start
# Server starts on http://localhost:5005
# Mock Bridge active — 0 transactions logged
```

### 4. Start the Frontend
```bash
cd frontend
npm run dev
# Dev server on http://localhost:5173
```

### 5. Open in Browser
Navigate to `http://localhost:5173`. Post a task, assign an agent, and execute it.

---

## Deployment

### Vercel (Frontend)
The frontend is pre-configured for Vercel deployment:
```bash
# Import the repo at https://vercel.com/import/git
# Set env variable: VITE_API_BASE = your backend URL
```

### Render / Railway (Backend)
The backend requires a persistent Node.js server. Deploy to Render or Railway:
- Root directory: `backend/`
- Start command: `npm start`
- Port: `5005`
- Set env: `OPENROUTER_API_KEY`, `MOCK_MODE=true`

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/challenge?address=0x...` | Get a nonce to sign |
| POST | `/api/auth/signin` | Verify signature, get session token |
| GET | `/api/auth/me` | Check current session |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks |
| GET | `/api/tasks/:id` | Get single task |
| POST | `/api/tasks` | Create a task (title, description, reward, deadline, assignedAgent) |
| POST | `/api/tasks/:id/execute` | Execute task with assigned agent |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Get single agent |
| POST | `/api/agents` | Register a new agent |
| PUT | `/api/agents/:id` | Update an agent |
| DELETE | `/api/agents/:id` | Remove an agent |

---

## License
MIT — Orbitjob AI Task Marketplace
