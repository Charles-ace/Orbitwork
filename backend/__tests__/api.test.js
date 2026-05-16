const request = require('supertest');

let app;

beforeAll(async () => {
  process.env.OPENROUTER_API_KEY = 'test-skip';
  process.env.GENLAYER_MODE = 'mock';
  app = require('../server');
});

describe('GET /api/', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/api/');
    expect(res.status).toBe(200);
    expect(res.body.status).toMatch(/Orbitjob/);
  });
});

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

describe('GET /api/tasks', () => {
  it('returns task array', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
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
  });

  it('rejects missing title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'no title' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/agents', () => {
  it('returns agent array', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('name');
  });
});

describe('POST /api/agents', () => {
  it('creates a new agent', async () => {
    const res = await request(app)
      .post('/api/agents')
      .send({ name: 'TestBot', description: 'A test agent' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('TestBot');
    expect(res.body).toHaveProperty('id');
    expect(res.body.skills).toEqual([]);
  });

  it('rejects missing name', async () => {
    const res = await request(app)
      .post('/api/agents')
      .send({ description: 'no name' });
    expect(res.status).toBe(400);
  });
});

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
});

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
});

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
});
