const http = require('http');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    if (Object.keys(req.headers).length) {
      console.log('  Headers:', JSON.stringify(req.headers, null, 2));
    }
    if (body) {
      console.log('  Body:', body);
    }
    console.log('---');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    });
    res.end(JSON.stringify({ ok: true, path: req.url, method: req.method }));
  });
});

const PORT = process.argv[2] || 4112;
server.listen(PORT, () => {
  console.log(`Test server listening on http://localhost:${PORT}`);
  console.log('Waiting for webhooks...\n');
});
