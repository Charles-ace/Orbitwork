const request = require('supertest');

let app;

beforeAll(async () => {
  process.env.OPENROUTER_API_KEY = 'test-skip';
  process.env.GENLAYER_MODE = 'mock';
  process.env.GENLAYER_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
  process.env.GENLAYER_NETWORK = 'localnet';
  process.env.PORT = '0';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  app = require('../server');
  await app.appReady;
});

afterAll(() => {
  if (app.closeServer) app.closeServer();
});

// ── Health & Metrics ──

describe('GET /healthz', () => {
  it('returns ok status with mode and uptime', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('mode');
    expect(res.body).toHaveProperty('uptime');
  });
});

describe('GET /metrics', () => {
  it('returns prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('http_errors_total');
  });
});

// ── API Docs ──

describe('GET /api/docs', () => {
  it('returns swagger UI', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger');
  });
});

describe('GET /api/docs.json', () => {
  it('returns OpenAPI spec', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.0');
    expect(res.body.info.title).toMatch(/Orbitjob/);
  });
});

// ── API Status ──

describe('GET /api/', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/api/');
    expect(res.status).toBe(200);
    expect(res.body.status).toMatch(/Orbitjob/);
    expect(res.body).toHaveProperty('mode');
    expect(res.body).toHaveProperty('network');
    expect(res.body).toHaveProperty('contractAddress');
  });
});

// ── Skills ──

describe('GET /api/skills', () => {
  it('returns skills array', async () => {
    const res = await request(app).get('/api/skills');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('label');
    }
  });
});

// ── Tasks ──

describe('GET /api/tasks', () => {
  beforeAll(async () => {
    // Ensure seed tasks are loaded before these tests
    await new Promise(r => setTimeout(r, 100));
  });

  it('returns paginated tasks', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/tasks?status=PENDING');
    expect(res.status).toBe(200);
    expect(res.body.items.every(t => t.status === 'PENDING')).toBe(true);
  });

  it('filters by search', async () => {
    const res = await request(app).get('/api/tasks?search=market');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('supports pagination', async () => {
    const res = await request(app).get('/api/tasks?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(1);
    expect(res.body.totalPages).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/tasks', () => {
  it('creates a new task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test Task', description: 'A test task', reward: 100 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test Task');
    expect(res.body.status).toBe('PENDING');
    expect(res.body.subtasks).toEqual([]);
    expect(res.body).toHaveProperty('contractTaskId');
    expect(res.body).toHaveProperty('txId');
  });

  it('rejects missing title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'no title' });
    expect(res.status).toBe(400);
  });

  it('rejects missing description', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'no desc' });
    expect(res.status).toBe(400);
  });
});

// ── Agents ──

describe('GET /api/agents', () => {
  it('returns agent array', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('skills');
  });
});

describe('POST /api/agents', () => {
  it('creates a new agent', async () => {
    const res = await request(app)
      .post('/api/agents')
      .send({ name: 'TestBot', description: 'A test agent', selectedSkills: ['web-research'] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('TestBot');
    expect(res.body).toHaveProperty('id');
    expect(res.body.skills).toEqual(['web-research']);
  });

  it('rejects missing name', async () => {
    const res = await request(app)
      .post('/api/agents')
      .send({ description: 'no name' });
    expect(res.status).toBe(400);
  });
});

// ── Task CRUD ──

describe('PUT /api/tasks/:id', () => {
  let taskId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Update Test', description: 'Will be updated' });
    taskId = res.body.id;
  });

  it('updates task fields', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .send({ title: 'Updated Title', reward: 999 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.reward).toBe(999);
  });

  it('returns 404 for unknown task', async () => {
    const res = await request(app).put('/api/tasks/nonexistent').send({ title: 'Nope' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/tasks/:id', () => {
  let taskId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Delete Test', description: 'Will be deleted' });
    taskId = res.body.id;
  });

  it('deletes a task', async () => {
    const res = await request(app).delete(`/api/tasks/${taskId}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removed/);
  });

  it('returns 404 for already deleted task', async () => {
    const res = await request(app).delete(`/api/tasks/${taskId}`);
    expect(res.status).toBe(404);
  });
});

// ── Skills CRUD ──

describe('Skills CRUD', () => {
  it('POST /api/skills creates a skill', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ id: 'test-skill', label: 'Test Skill', description: 'A test' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('test-skill');
  });

  it('POST /api/skills rejects duplicate', async () => {
    const res = await request(app)
      .post('/api/skills')
      .send({ id: 'test-skill', label: 'Test Skill' });
    expect(res.status).toBe(409);
  });

  it('PUT /api/skills/:id updates a skill', async () => {
    const res = await request(app)
      .put('/api/skills/test-skill')
      .send({ label: 'Updated Skill' });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Updated Skill');
  });

  it('DELETE /api/skills/:id removes a skill', async () => {
    const res = await request(app).delete('/api/skills/test-skill');
    expect(res.status).toBe(200);
  });

  it('DELETE /api/skills/:id returns 404 for missing skill', async () => {
    const res = await request(app).delete('/api/skills/nonexistent');
    expect(res.status).toBe(404);
  });
});

// ── Auth ──

describe('Auth', () => {
  it('GET /api/auth/challenge requires address', async () => {
    const res = await request(app).get('/api/auth/challenge');
    expect(res.status).toBe(400);
  });

  it('GET /api/auth/challenge returns nonce', async () => {
    const res = await request(app).get('/api/auth/challenge?address=0x1234');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('nonce');
    expect(res.body.address).toBe('0x1234');
  });

  it('POST /api/auth/refresh returns 401 without token', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/refresh returns 401 with bad token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/signin rejects missing body fields', async () => {
    const res = await request(app)
      .post('/api/auth/signin')
      .send({ address: '0x1234' });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/signin rejects invalid signature', async () => {
    // First get a challenge
    await request(app).get('/api/auth/challenge?address=0xabcd');
    const res = await request(app)
      .post('/api/auth/signin')
      .send({ address: '0xabcd', signature: '0xbad' });
    expect(res.status).toBe(401);
  });
});

// ── Balances / Payments ──

describe('Payment / Balances', () => {
  it('GET /api/balances returns array', async () => {
    const res = await request(app).get('/api/balances');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/faucet claims tokens', async () => {
    const res = await request(app)
      .post('/api/faucet')
      .send({ address: '0xuser1' });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(1000);
  });

  it('GET /api/balances/:address returns balance', async () => {
    const res = await request(app).get('/api/balances/0xuser1');
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(1000);
  });

  it('POST /api/faucet rejects missing address', async () => {
    const res = await request(app)
      .post('/api/faucet')
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/transfer sends tokens', async () => {
    await request(app).post('/api/faucet').send({ address: '0xsender' });
    const res = await request(app)
      .post('/api/transfer')
      .send({ from: '0xsender', to: '0xreceiver', amount: 300 });
    expect(res.status).toBe(200);
    expect(res.body.fromBalance).toBe(700);
    expect(res.body.toBalance).toBe(300);
  });

  it('POST /api/transfer rejects insufficient balance', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ from: '0xempty', to: '0xaddr', amount: 999999 });
    expect(res.status).toBe(400);
  });

  it('POST /api/transfer rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/transfer')
      .send({ from: '0xaddr' });
    expect(res.status).toBe(400);
  });
});

// ── Agent Subtask Routing ──

describe('Agent Subtask Routing', () => {
  let taskId;

  beforeAll(async () => {
    const taskRes = await request(app)
      .post('/api/tasks')
      .send({ title: 'Parent Task', description: 'Has subtasks', reward: 50 });
    taskId = taskRes.body.id;
  });

  it('GET /api/tasks/:id/subtasks returns empty array', async () => {
    const res = await request(app).get(`/api/tasks/${taskId}/subtasks`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/tasks/:id/delegate rejects non-EXECUTING task', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/delegate`)
      .send({ title: 'Sub', assignedAgent: 'agent-beta' });
    expect(res.status).toBe(400);
  });

  it('POST /api/tasks/:id/delegate rejects missing agent', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/delegate`)
      .send({ title: 'Sub', assignedAgent: 'agent-nonexistent' });
    expect(res.status).toBe(400);
  });

  it('GET /api/tasks/:id/subtasks returns 404 for unknown task', async () => {
    const res = await request(app).get('/api/tasks/nonexistent/subtasks');
    expect(res.status).toBe(404);
  });

  it('POST /api/tasks/:id/subtasks/:subId/execute returns 404 for unknown task', async () => {
    const res = await request(app)
      .post('/api/tasks/nonexistent/subtasks/sub-1/execute')
      .send({ output: 'done' });
    expect(res.status).toBe(404);
  });
});

// ── E2E: Full Task Creation -> Execution -> Verification Flow ──

describe('E2E: Full Task Flow', () => {
  let createdTaskId;

  it('completes the full task lifecycle', async () => {
    // 1. Create task
    const createRes = await request(app)
      .post('/api/tasks')
      .send({
        title: 'E2E Test Task',
        description: 'Automated end-to-end test task',
        reward: 250,
        assignedAgent: 'agent-alpha',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('PENDING');
    expect(createRes.body.assignedAgent).toBe('agent-alpha');
    createdTaskId = createRes.body.id;

    // 2. Retrieve the task
    const getRes = await request(app).get(`/api/tasks/${createdTaskId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe('E2E Test Task');

    // 3. Execute the task (will return immediately, actual exec is async)
    const executeRes = await request(app)
      .post(`/api/tasks/${createdTaskId}/execute`);
    expect(executeRes.status).toBe(200);
    expect(executeRes.body.message).toMatch(/Execution started/);

    // 4. Task should now be EXECUTING
    const executingRes = await request(app).get(`/api/tasks/${createdTaskId}`);
    expect(executingRes.body.status).toBe('EXECUTING');

    // 5. Wait for execution to complete (mock mode: bridge.postTask has 2s latency)
    await new Promise(r => setTimeout(r, 3000));

    // 6. Task should now be FAILED (no real API key)
    const finalRes = await request(app).get(`/api/tasks/${createdTaskId}`);
    expect(finalRes.body.status).toBe('FAILED');
    expect(finalRes.body.verificationStatus).toBe('FAILED');
    expect(finalRes.body.executionTrace).toBeTruthy();
    expect(finalRes.body.executionTrace.completedAt).toBeTruthy();

    // 7. Get all tasks and verify it appears
    const listRes = await request(app).get('/api/tasks');
    const found = listRes.body.items.find(t => t.id === createdTaskId);
    expect(found).toBeTruthy();
    expect(found.status).toBe('FAILED');
  });
});

// ── CORS Enforcement ──

describe('CORS Enforcement', () => {
  it('blocks requests from disallowed origins', async () => {
    const res = await request(app)
      .get('/api/')
      .set('Origin', 'https://evil.com');
    // The origin header won't match FRONTEND_ORIGIN, so CORS should deny
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.com');
  });
});
