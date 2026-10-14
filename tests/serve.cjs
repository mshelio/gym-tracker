const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  const relative = decodeURIComponent(url.pathname).replace(/^\/gym-tracker\/?/,'').replace(/^\/+/, '') || 'index.html';
  const filename = path.resolve(root,relative);
  if (filename !== root && !filename.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
  fs.readFile(filename,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');res.end(data);});
}).listen(8765,'127.0.0.1');
