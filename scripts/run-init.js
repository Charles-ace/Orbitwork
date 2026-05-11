// Script to automate genlayer init prompts
const { spawn } = require('child_process');

const genlayer = spawn(
  'C:\\Program Files\\nodejs\\node.exe',
  ['C:\\Users\\akpan\\AppData\\Roaming\\npm\\node_modules\\genlayer\\dist\\index.js', 'init', '--headless', '--ollama'],
  { stdio: ['pipe', 'inherit', 'inherit'] }
);

let buf = '';
genlayer.stdout.on('data', d => buf += d.toString());

// Wait for prompts and respond
setTimeout(() => genlayer.stdin.write('Y\n'), 500);
setTimeout(() => genlayer.stdin.write(' \n'), 2000);  // space + enter for checkbox

genlayer.on('close', (code) => {
  console.log('genlayer init exited with code', code);
  process.exit(code || 0);
});

setTimeout(() => {
  console.error('TIMEOUT - genlayer init took too long');
  genlayer.kill();
  process.exit(1);
}, 600000);
