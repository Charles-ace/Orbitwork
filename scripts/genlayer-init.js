const { spawn } = require('child_process');

const genlayer = spawn('node', [
  'C:/Users/akpan/AppData/Roaming/npm/node_modules/genlayer/dist/index.js',
  'init', '--headless', '--ollama'
], {
  stdio: ['pipe', 'inherit', 'inherit'],
});

// Answer "Y" for confirmation prompt
genlayer.stdin.write('Y\n');

// After a brief delay, select ollama and submit the checkbox
setTimeout(() => {
  // Space to select the first item (Ollama) + Enter to submit
  genlayer.stdin.write(' \n');
}, 1000);

genlayer.on('close', (code) => {
  process.exit(code);
});
