// Raw Vercel serverless handler — no Express
const ALLOWED_ORIGINS = '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/tasks') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify([
      { id: 'test-1', title: 'Test Task', description: 'A test task from the API', status: 'PENDING', reward: 100 }
    ]));
    return;
  }

  if (pathname === '/api/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify([
      { id: 'agent-test', name: 'Test Agent', model: 'test-model', specialty: 'Testing', status: 'IDLE' }
    ]));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
  res.end(JSON.stringify({ ok: true, path: pathname }));
};
