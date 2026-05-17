const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenvSafe = require('dotenv-safe');
const path = require('path');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const pino = require('pino');
const promClient = require('prom-client');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const bridge = require('./genlayer-bridge');

dotenvSafe.config({
  path: path.resolve(__dirname, '..', '.env'),
  example: path.resolve(__dirname, '.env.example'),
});

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  }),
});

// ── Input Validation Schemas ──────────────────────────────────
const taskCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  constraints: z.string().max(2000).optional().default(''),
  reward: z.coerce.number().min(0).max(1_000_000).optional().default(0),
  deadline: z.string().datetime().nullable().optional(),
  assignedAgent: z.string().optional(),
  creator: z.string().optional(),
});

const taskUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(5000).optional(),
  constraints: z.string().max(2000).optional(),
  reward: z.coerce.number().min(0).max(1_000_000).optional(),
  deadline: z.string().datetime().nullable().optional(),
  assignedAgent: z.string().optional(),
});

const agentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  model: z.string().max(200).optional(),
  specialty: z.string().max(200).optional(),
  icon: z.string().max(50).optional(),
  price: z.coerce.number().min(0).max(10_000).optional(),
  useCases: z.array(z.string()).optional(),
  selectedSkills: z.array(z.string()).optional(),
});

const agentUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  model: z.string().max(200).optional(),
  specialty: z.string().max(200).optional(),
  icon: z.string().max(50).optional(),
  price: z.coerce.number().min(0).max(10_000).optional(),
  useCases: z.array(z.string()).optional(),
});

const skillCreateSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  promptDirective: z.string().max(2000).optional(),
});

const skillUpdateSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  promptDirective: z.string().max(2000).optional(),
});

const faucetSchema = z.object({
  address: z.string().min(1).max(100),
});

const transferSchema = z.object({
  from: z.string().min(1).max(100),
  to: z.string().min(1).max(100),
  amount: z.coerce.number().positive(),
});

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.validatedBody = result.data;
    next();
  };
}

// ── Auth Middleware ───────────────────────────────────────────
const isTestMode = process.env.NODE_ENV === 'test';

async function requireAuth(req, res, next) {
  if (isTestMode) return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired token' });
  req.session = session;
  next();
}

const app = express();
const PORT = process.env.PORT || 5005;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

promClient.collectDefaultMetrics({ register: promClient.register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const httpErrorsTotal = new promClient.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP 5xx errors',
  labelNames: ['method', 'path'],
});

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-Id', req.id);
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const routePath = req.route ? req.route.path : req.path;
    httpRequestDuration.observe({ method: req.method, path: routePath, status: res.statusCode }, duration / 1000);
    httpRequestsTotal.inc({ method: req.method, path: routePath, status: res.statusCode });
    if (res.statusCode >= 500) {
      httpErrorsTotal.inc({ method: req.method, path: routePath });
    }
    logger.info({ reqId: req.id, method: req.method, path: req.path, status: res.statusCode, duration: `${duration}ms` }, 'request completed');
  });
  next();
});

// ── Rate Limiters (lazy Redis store) ──
let rateLimitersInitialized = false;

function createLazyLimiter(options) {
  let limiter = null;
  return (req, res, next) => {
    if (!limiter) {
      let store;
      if (redis) {
        const { default: RedisStore } = require('rate-limit-redis');
        store = new RedisStore({ sendCommand: (...args) => redis.call(...args) });
      }
      limiter = rateLimit({ ...options, store });
    }
    return limiter(req, res, next);
  };
}

const apiLimiter = createLazyLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

const authLimiter = createLazyLimiter({
  windowMs: 60000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});
app.use(['/api/auth', '/auth'], authLimiter);

const executeLimiter = createLazyLimiter({
  windowMs: 30000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many execution requests, please slow down.' },
});
app.use(['/api/tasks/*/execute', '/tasks/*/execute'], executeLimiter);

// ── Central error handler ──
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  logger.error({ reqId: req.id, err, status }, 'Unhandled error');
  if (status >= 500) {
    httpErrorsTotal.inc({ method: req.method, path: req.route ? req.route.path : req.path });
  }
  const knownCodes = [400, 401, 403, 404, 409, 422, 429];
  const safeStatus = knownCodes.includes(status) ? status : 500;
  res.status(safeStatus).json({
    error: safeStatus === 500 ? 'Internal server error' : err.message,
    ...(err.code && { code: err.code }),
  });
});

// ── OpenAPI / Swagger ──
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Orbitjob API',
      version: '1.0.0',
      description: 'AI Task Marketplace on GenLayer',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'UUID' },
      },
    },
  },
  apis: [__filename],
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

app.get('/healthz', async (req, res) => {
  let redisStatus = 'unavailable';
  if (redisAvailable) {
    try {
      await redis.ping();
      redisStatus = 'connected';
    } catch {
      redisStatus = 'error';
    }
  }
  res.json({
    status: 'ok',
    mode: bridge.isMockMode() ? 'mock' : 'live',
    uptime: process.uptime(),
    redis: redisStatus,
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// ── Skills System ──────────────────────────────────────────────
const fs = require('fs');
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
    logger.error({ err: e }, 'Failed to load skills');
  }
  return [];
}

function getSkills() {
  if (!skillsCache) skillsCache = loadSkills();
  return skillsCache;
}

// ── Redis Sessions ─────────────────────────────────────────────
let redis;
let redisAvailable = false;

async function initRedis() {
  const redisUrl = process.env.REDIS_URL;
  try {
    const Redis = require('ioredis');
    if (redisUrl) {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) { return times > 3 ? null : Math.min(times * 200, 2000); },
        lazyConnect: true,
      });
    } else {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 3,
        retryStrategy(times) { return times > 3 ? null : Math.min(times * 200, 2000); },
        lazyConnect: true,
      });
    }
    await redis.connect();
    await redis.ping();
    redisAvailable = true;
    logger.info('Redis connected');
  } catch (err) {
    logger.warn({ err }, 'Redis unavailable, falling back to in-memory sessions');
    redis = null;
    redisAvailable = false;
  }
}

// ── Seed Tasks ───────────────────────────────────────────────
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
const crypto = require('crypto');
let sessions = {};

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function generateToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getRedisClient() { return redis; }

async function getSession(tokenOrAddress) {
  // If it's a JWT token, verify and return it statelessly
  const decoded = verifyToken(tokenOrAddress);
  if (decoded) {
    return { address: decoded.address, signedInAt: decoded.signedInAt || Date.now() };
  }

  // Fallback to Redis or in-memory session store
  if (redisAvailable) {
    const data = await redis.get(`session:${tokenOrAddress}`);
    return data ? JSON.parse(data) : null;
  }
  return sessions[tokenOrAddress] || null;
}

async function setSession(key, value) {
  if (redisAvailable) {
    await redis.setex(`session:${key}`, 3600, JSON.stringify(value));
    return;
  }
  sessions[key] = value;
}

async function delSession(key) {
  if (redisAvailable) {
    await redis.del(`session:${key}`);
    return;
  }
  delete sessions[key];
}

/**
 * @openapi
 * /auth/challenge:
 *   get:
 *     tags: [Auth]
 *     summary: Get a signing challenge nonce
 *     parameters:
 *       - in: query
 *         name: address
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200:
 *         description: Nonce for signing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nonce: { type: string }
 *                 address: { type: string }
 *       400:
 *         description: Address required
 */
app.get(['/api/auth/challenge', '/auth/challenge'], async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'Address required' });
  const nonce = `Sign into Orbitjob on GenLayer\nAddress: ${address.toLowerCase()}\nNonce: ${Date.now()}`;
  await setSession(address.toLowerCase(), { nonce, expiresAt: Date.now() + 60000 });
  res.json({ nonce, address });
});

/**
 * @openapi
 * /auth/signin:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with a signed nonce
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address: { type: string }
 *               signature: { type: string }
 *     responses:
 *       200:
 *         description: Auth token
 *       401:
 *         description: Invalid signature
 */
app.post(['/api/auth/signin', '/auth/signin'], async (req, res) => {
  const { address, signature, nonce } = req.body;
  if (!address || !signature) return res.status(400).json({ error: 'Address and signature required' });

  let activeNonce = nonce;
  if (!activeNonce) {
    const session = await getSession(address.toLowerCase());
    if (!session || Date.now() > session.expiresAt) return res.status(401).json({ error: 'Challenge expired, request a new one' });
    activeNonce = session.nonce;
    await delSession(address.toLowerCase());
  } else {
    // Stateless cryptographic validation of nonce
    const addressMatch = activeNonce.match(/Address:\s*(0x[a-fA-F0-9]+)/i);
    if (!addressMatch || addressMatch[1].toLowerCase() !== address.toLowerCase()) {
      return res.status(400).json({ error: 'Invalid challenge address constraint' });
    }
    const nonceMatch = activeNonce.match(/Nonce:\s*(\d+)/i);
    if (!nonceMatch) {
      return res.status(400).json({ error: 'Invalid challenge timestamp format' });
    }
    const timestamp = parseInt(nonceMatch[1], 10);
    const age = Date.now() - timestamp;
    if (age < 0 || age > 300000) { // 5 minutes validity
      return res.status(401).json({ error: 'Challenge expired, request a new one' });
    }
  }

  try {
    const recovered = ethers.verifyMessage(activeNonce, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) return res.status(401).json({ error: 'Signature does not match address' });
  } catch {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Generate stateless JWT token (valid for 24h)
  const token = generateToken({
    address: address.toLowerCase(),
    signedInAt: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000
  });

  res.json({ token, address: address.toLowerCase(), message: 'Signed in successfully' });
});

const apiRoute = (path) => [`/api${path}`, path];

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current session info
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session info
 *       401:
 *         description: Not authenticated
 */
app.get(apiRoute('/auth/me'), async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ address: session.address });
});

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh auth token expiry (resets 1h TTL)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Not authenticated
 */
app.post(['/api/auth/refresh', '/api/auth/refresh'], async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const decoded = verifyToken(token);
  if (decoded) {
    const newToken = generateToken({
      address: decoded.address,
      signedInAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000
    });
    return res.json({ token: newToken, message: 'Token refreshed' });
  }

  await setSession(token, session);
  res.json({ token, message: 'Token refreshed' });
});

/**
 * @openapi
 * /:
 *   get:
 *     tags: [Health]
 *     summary: Backend health check
 *     responses:
 *       200:
 *         description: Health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string }
 *                 mode: { type: string }
 *                 network: { type: string }
 *                 contractAddress: { type: string, nullable: true }
 */
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
/**
 * @openapi
 * /skills:
 *   get:
 *     tags: [Skills]
 *     summary: List all skills
 *     responses:
 *       200:
 *         description: Skills array
 */
app.get(apiRoute('/skills'), (req, res) => {
  res.json(getSkills());
});

/**
 * @openapi
 * /skills:
 *   post:
 *     tags: [Skills]
 *     summary: Create a new skill
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id: { type: string }
 *               label: { type: string }
 *               description: { type: string }
 *               promptDirective: { type: string }
 *     responses:
 *       201:
 *         description: Created
 *       409:
 *         description: Duplicate
 */
app.post(apiRoute('/skills'), requireAuth, validate(skillCreateSchema), (req, res) => {
  const { id, label, description, promptDirective } = req.validatedBody;
  const skills = getSkills();
  if (skills.find(s => s.id === id)) return res.status(409).json({ error: 'Skill already exists' });
  const newSkill = { id, label, description: description || '', promptDirective: promptDirective || '' };
  skills.push(newSkill);
  skillsCache = skills;
  res.status(201).json(newSkill);
});

app.put(apiRoute('/skills/:id'), requireAuth, validate(skillUpdateSchema), (req, res) => {
  const skills = getSkills();
  const skill = skills.find(s => s.id === req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const { label, description, promptDirective } = req.validatedBody;
  if (label) skill.label = label;
  if (description !== undefined) skill.description = description;
  if (promptDirective !== undefined) skill.promptDirective = promptDirective;
  skillsCache = skills;
  res.json(skill);
});

app.delete(apiRoute('/skills/:id'), requireAuth, (req, res) => {
  const skills = getSkills();
  const idx = skills.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Skill not found' });
  const removed = skills.splice(idx, 1)[0];
  skillsCache = skills;
  res.json({ message: 'Skill removed', skill: removed });
});

// ── Task Routes ──────────────────────────────────────────────
/**
 * @openapi
 * /tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks with filtering and pagination
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: assignedAgent
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated task list
 */
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

/**
 * @openapi
 * /tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get a single task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Task object
 *       404:
 *         description: Not found
 */
app.get(apiRoute('/tasks/:id'), (req, res) => {
  const task = taskCache.find(t => t.id === req.params.id || t.contractTaskId === Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.put(apiRoute('/tasks/:id'), requireAuth, validate(taskUpdateSchema), (req, res) => {
  const task = taskCache.find(t => t.id === req.params.id || t.contractTaskId === Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { title, description, constraints, reward, deadline, assignedAgent } = req.validatedBody;
  if (title) task.title = title;
  if (description) task.description = description;
  if (constraints !== undefined) task.constraints = constraints;
  if (reward !== undefined) task.reward = parseFloat(reward);
  if (deadline !== undefined) task.deadline = deadline;
  if (assignedAgent) task.assignedAgent = assignedAgent;
  res.json(task);
});

app.delete(apiRoute('/tasks/:id'), requireAuth, (req, res) => {
  const idx = taskCache.findIndex(t => t.id === req.params.id || t.contractTaskId === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  const removed = taskCache.splice(idx, 1)[0];
  res.json({ message: 'Task removed', task: removed });
});

/**
 * @openapi
 * /tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a new task
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               constraints: { type: string }
 *               reward: { type: number }
 *               deadline: { type: string }
 *               assignedAgent: { type: string }
 *               creator: { type: string }
 *     responses:
 *       201:
 *         description: Created
 */
app.post(apiRoute('/tasks'), requireAuth, validate(taskCreateSchema), async (req, res) => {
  const { title, description, constraints, reward, deadline, assignedAgent, creator } = req.validatedBody;
  const receipt = await bridge.postTask(title, description, Math.floor(reward) || 0, constraints || '', deadline || '');
  const agentObj = agents.find(a => a.id === assignedAgent) || agents[0];
  const newTask = {
    id: `contract-${receipt.contractId}`,
    title, description,
    constraints: constraints || '',
    reward: parseFloat(reward) || 0,
    deadline: deadline || null,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    executionTrace: null,
    verificationStatus: 'NOT_VERIFIED',
    result: null, confidenceScore: null,
    assignedAgent: agentObj.id,
    contractTaskId: receipt.contractId,
    txId: receipt.txId,
    blockNumber: receipt.blockNumber,
    subtasks: [],
    creator: creator || null,
  };
  taskCache.push(newTask);
  res.status(201).json(newTask);
});

// ── Agent Execution ──────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = 'qwen/qwen-2.5-coder:free';

/**
 * @openapi
 * /tasks/{id}/execute:
 *   post:
 *     tags: [Tasks]
 *     summary: Execute a task via AI agent
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Execution started
 *       404:
 *         description: Task not found
 */
app.post(apiRoute('/tasks/:id/execute'), requireAuth, async (req, res) => {
  const { id } = req.params;
  const taskIndex = taskCache.findIndex(t => t.id === id);
  if (taskIndex === -1) return res.status(404).json({ error: 'Task not found' });
  if (taskCache[taskIndex].status !== 'PENDING') return res.status(400).json({ error: 'Task is not in PENDING state' });

  const task = taskCache[taskIndex];
  const agent = agents.find(a => a.id === task.assignedAgent) || agents[0];
  task.status = 'EXECUTING';
  task.executionTrace = { agent: agent.name, plan: [], startedAt: new Date().toISOString(), completedAt: null, steps: [] };
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
    "data": { "analysis": "detailed analysis", "findings": "key findings", "recommendation": "recommendation" }
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
        temperature: 0.3, max_tokens: 1024
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
    task.executionTrace.steps = reasoningTrace.map((action, i) => ({ step: i + 1, action, timestamp: new Date(Date.now() - (reasoningTrace.length - i) * 500).toISOString() }));
    task.result = { summary: aiResult.summary, data: aiResult.data };
    task.confidenceScore = confidence;
    task.verificationStatus = verified ? 'VERIFIED' : 'REJECTED';
    agent.status = 'IDLE';
    agent.completedTasks += 1;

    logger.info({ taskId: id, agent: agent.name, confidence, verified }, 'Task executed');

    if (verified && task.reward > 0) {
      const creatorAddr = task.creator || '0xdefault';
      const agentAddr = `agent:${agent.id}`;
      ensureBalance(creatorAddr);
      ensureBalance(agentAddr);
      if (balances[creatorAddr] >= task.reward) {
        balances[creatorAddr] -= task.reward;
        balances[agentAddr] += task.reward;
        logger.info({ reward: task.reward, from: creatorAddr, to: agent.name }, 'Payment transferred');
      } else {
        logger.warn({ reward: task.reward, from: creatorAddr, to: agent.name }, 'Insufficient balance for payment');
        if (!task.pendingReward) task.pendingReward = { from: creatorAddr, to: agentAddr, amount: task.reward };
      }
    }

    if (task.contractTaskId) {
      const outputStr = JSON.stringify(aiResult);
      const reasoningStr = JSON.stringify(reasoningTrace);
      const bridgeReceipt = await bridge.submitExecution(task.contractTaskId, outputStr, reasoningStr, confidence, agent.id);
      task.verificationStatus = bridgeReceipt.verificationStatus;
      task.txId = bridgeReceipt.txId;
      task.blockNumber = bridgeReceipt.blockNumber;
    }
  } catch (err) {
    logger.error({ err, taskId: id, task: task.title }, 'Task execution failed');
    task.status = 'FAILED';
    task.executionTrace.completedAt = new Date().toISOString();
    task.executionTrace.plan = task.executionTrace.plan || [];
    task.executionTrace.steps = [...(task.executionTrace.steps || []), { step: (task.executionTrace.steps?.length || 0) + 1, action: `[ERROR] ${err.message}`, timestamp: new Date().toISOString() }];
    task.result = { summary: `Execution failed: ${err.message}`, data: { analysis: '', findings: '', recommendation: '' } };
    task.confidenceScore = 0;
    task.verificationStatus = 'FAILED';
    agent.status = 'IDLE';
  }
});

// ── Agent Routes ─────────────────────────────────────────────
/**
 * @openapi
 * /agents:
 *   get:
 *     tags: [Agents]
 *     summary: List all agents
 *     responses:
 *       200:
 *         description: Agents array
 */
app.get(apiRoute('/agents'), (req, res) => {
  res.json(agents);
});

app.get(apiRoute('/agents/:id'), (req, res) => {
  const agent = agents.find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

app.post(apiRoute('/agents'), requireAuth, validate(agentCreateSchema), (req, res) => {
  const { name, model, specialty, icon, price, description, useCases, selectedSkills } = req.validatedBody;
  const accent = accentColors[agents.length % accentColors.length];
  const newAgent = {
    id: uuidv4(), name, model: model || 'qwen/qwen-2.5-coder:free', specialty: specialty || 'General',
    icon: icon || 'cpu', price: parseFloat(price) || 0, description,
    useCases: Array.isArray(useCases) ? useCases : [], rating: 0, completedTasks: 0, status: 'IDLE', accent,
    skills: Array.isArray(selectedSkills) ? selectedSkills : [],
  };
  agents.push(newAgent);
  res.status(201).json(newAgent);
});

app.put(apiRoute('/agents/:id'), requireAuth, validate(agentUpdateSchema), (req, res) => {
  const idx = agents.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Agent not found' });
  const { name, model, specialty, icon, price, description, useCases } = req.validatedBody;
  if (name) agents[idx].name = name;
  if (model) agents[idx].model = model;
  if (specialty) agents[idx].specialty = specialty;
  if (icon) agents[idx].icon = icon;
  if (price !== undefined) agents[idx].price = parseFloat(price);
  if (description) agents[idx].description = description;
  if (useCases) agents[idx].useCases = Array.isArray(useCases) ? useCases : agents[idx].useCases;
  res.json(agents[idx]);
});

app.delete(apiRoute('/agents/:id'), requireAuth, (req, res) => {
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

/**
 * @openapi
 * /balances:
 *   get:
 *     tags: [Balances]
 *     summary: List all balances
 *     responses:
 *       200:
 *         description: Balances array
 */
app.get(apiRoute('/balances'), (req, res) => {
  res.json(Object.entries(balances).map(([address, balance]) => ({ address, balance })));
});

app.get(apiRoute('/balances/:address'), (req, res) => {
  const balance = ensureBalance(req.params.address);
  res.json({ address: req.params.address, balance });
});

app.post(apiRoute('/faucet'), validate(faucetSchema), (req, res) => {
  const { address } = req.validatedBody;
  ensureBalance(address);
  balances[address] += 1000;
  logger.info({ address, amount: 1000 }, 'Faucet claimed');
  res.json({ address, balance: balances[address], message: '1000 GLR claimed' });
});

app.post(apiRoute('/transfer'), validate(transferSchema), (req, res) => {
  const { from, to, amount } = req.validatedBody;
  ensureBalance(from); ensureBalance(to);
  const amt = parseFloat(amount);
  if (balances[from] < amt) return res.status(400).json({ error: 'Insufficient balance' });
  balances[from] -= amt;
  balances[to] += amt;
  logger.info({ from, to, amount: amt }, 'Transfer completed');
  res.json({ from, to, amount: amt, fromBalance: balances[from], toBalance: balances[to] });
});

// ── Agent-to-Agent Task Routing ───────────────────────────────
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
  const subtask = { id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, description: description || '', reward: parseFloat(reward) || 0, assignedAgent, status: 'PENDING', parentTaskId: id, createdAt: new Date().toISOString(), result: null };
  task.subtasks.push(subtask);
  logger.info({ subtaskId: subtask.id, taskId: id, assignedTo: subtaskAgent.name }, 'Subtask delegated');
  res.status(201).json(subtask);
});

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
  const allDone = task.subtasks.every(s => s.status === 'COMPLETED');
  if (allDone && task.status === 'EXECUTING') task.status = 'PENDING';
  logger.info({ subtaskId: subId, taskId: id }, 'Subtask completed');
  res.json(subtask);
});

app.get(apiRoute('/tasks/:id/subtasks'), (req, res) => {
  const { id } = req.params;
  const task = taskCache.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task.subtasks || []);
});

// ── Start Server ─────────────────────────────────────────────

let serverInstance;
const appReady = new Promise((resolve) => {
  app.once('ready', resolve);
});

async function start() {
  await initRedis();
  await bridge.init(logger);

  if (bridge.isMockMode() && process.env.GENLAYER_MODE === 'real') {
    const msg = 'FATAL: bridge.init() failed to connect to GenLayer — deployment cannot proceed without a real contract. Check GENLAYER_CONTRACT_ADDRESS and GENLAYER_NETWORK.';
    logger.fatal({ contractAddress: process.env.GENLAYER_CONTRACT_ADDRESS, network: process.env.GENLAYER_NETWORK }, msg);
    process.exit(1);
  }

  const modeLabel = bridge.isMockMode() ? 'Mock Onchain Mode' : 'GenLayer Live Mode';
  logger.info({ mode: modeLabel }, 'Bridge initialized');
  if (bridge.isMockMode()) {
    taskCache.push(...seedTasks);
  }

  if (bridge.isMockMode()) {
    logger.warn('Running in mock mode — no real GenLayer connection established');
  } else {
    logger.info(`Connected to ${bridge.getNetworkName()} — Task count: ${taskCache.length}`);
  }

  if (!process.env.VERCEL) {
    serverInstance = app.listen(PORT, () => {
      logger.info({ port: PORT, mode: modeLabel, tasks: taskCache.length, agents: agents.length }, 'Server started');
      app.emit('ready');
    });
  } else {
    app.emit('ready');
  }
}

start().catch(err => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});

// ── Graceful Shutdown ─────────────────────────────────────────
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown initiated');

  if (serverInstance) {
    serverInstance.close(() => {
      logger.info('HTTP server closed');
    });
  }

  if (redis) {
    try {
      await redis.quit();
      logger.info('Redis connection closed');
    } catch (err) {
      logger.warn({ err }, 'Error closing Redis connection');
    }
  }

  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
module.exports.appReady = appReady;
module.exports.closeServer = () => serverInstance?.close();
module.exports.getRedisClient = getRedisClient;
