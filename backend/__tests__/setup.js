// Test setup for SQLite database
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const backendDir = path.join(__dirname, '..');
const testDbPath = path.join(backendDir, 'test.db');

// Set environment variables before loading server
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:' + testDbPath;

// Clean up test database before each run
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Push schema to test database
try {
  execSync('npx prisma db push', {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: 'file:' + testDbPath },
    stdio: 'pipe',
  });
} catch (e) {
  console.error('Failed to push schema:', e.message);
}

module.exports = { testDbPath, backendDir };
