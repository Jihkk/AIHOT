import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, outputDirectory } from './publication.mjs';

await build();
const files = {'/':'index.html','/index.html':'index.html','/terms.html':'terms.html','/privacy.html':'privacy.html','/style.css':'style.css','/client.js':'client.js','/logo.svg':'logo.svg','/content.json':'content.json','/collection.json':'collection.json','/data.json':'data.json'};
const types = {html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml',json:'application/json'};
const prefix=(process.env.WATER_WATCH_BASE_PATH ?? '').replace(/\/$/,'');
const server = createServer(async (request, response) => {
  const path=new URL(request.url, 'http://localhost').pathname;
  const file = (!prefix || path===prefix || path.startsWith(prefix+'/')) ? files[path.slice(prefix.length) || '/'] : null;
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await readFile(resolve(outputDirectory,file));
    response.writeHead(200, {'Content-Type':`${types[file.split('.').at(-1)]}; charset=utf-8`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    response.end(content);
  } catch { response.writeHead(500); response.end('Preview file unavailable'); }
});
const port=Number(process.env.WATER_WATCH_PORT ?? 4173);
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
