const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(process.cwd(), 'skillsmp-skills.txt');
const PORT = 34567;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        fs.writeFileSync(OUTPUT, body, 'utf-8');
        const lines = body.split('\n').filter(l => l.trim()).length;
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('OK: wrote ' + body.length + ' chars, ' + lines + ' lines');
        console.log('File written: ' + body.length + ' chars, ' + lines + ' lines to ' + OUTPUT);
        setTimeout(() => { server.close(); process.exit(0); }, 1000);
      } catch(e) {
        res.writeHead(500);
        res.end('Error: ' + e.message);
        console.error('Error: ' + e.message);
      }
    });
  } else {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('ready');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Server ready on http://127.0.0.1:' + PORT);
  console.log('Waiting for POST data from browser...');
});
