import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, outputDirectory } from './publication.mjs';

await build();
const files = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/client.js':'client.js','/logo.svg':'logo.svg','/content.json':'content.json','/collection.json':'collection.json','/data.json':'data.json'};
const types = {html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml',json:'application/json'};
const server = createServer(async (request, response) => {
  const file = files[new URL(request.url, 'http://localhost').pathname];
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await readFile(resolve(outputDirectory,file));
    response.writeHead(200, {'Content-Type':`${types[file.split('.').at(-1)]}; charset=utf-8`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    response.end(content);
  } catch { response.writeHead(500); response.end('Preview file unavailable'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
