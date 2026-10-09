import {spawn} from 'node:child_process';
import {join} from 'node:path';

const recoverableErrors=new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','UND_ERR_CONNECT_TIMEOUT']);
export function errorDetail(error) {
  const parts=[];
  for(let item=error;item && parts.length<4;item=item.cause) parts.push([item.code,item.message].filter(Boolean).join(': '));
  return parts.join(' → ').slice(0,500);
}

// Schannel builds missing intermediate chains using Windows' trusted certificate store.
// Keep redirects manual: readPublic validates the destination before another request.
export function windowsFetch(url,options={},spawnFn=spawn) {
  if(new URL(url).protocol!=='https:') return Promise.reject(new Error('Expected HTTPS'));
  const args=['--disable','--silent','--show-error','--proto','=https','--max-time','25','--connect-timeout','10','--max-filesize','2000000',
    '--user-agent',options.headers?.['User-Agent'] ?? 'MalaysiaWaterWatch/1.0',
    '--header',`Accept: ${options.headers?.Accept ?? 'text/html,application/json;q=0.9'}`,
    '--write-out','\n%{json}','--url',url];
  return new Promise((resolve,reject)=>{
    const child=spawnFn(join(process.env.SystemRoot ?? 'C:/Windows','System32','curl.exe'),args,{windowsHide:true,stdio:['ignore','pipe','pipe'],signal:options.signal});
    const chunks=[];let bytes=0,stderr='';
    child.stdout.on('data',chunk=>{
      bytes+=chunk.length;
      if(bytes>2_100_000) {child.kill();reject(new Error('Response exceeds 2 MB'));return;}
      chunks.push(chunk);
    });
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(0,500);});
    child.on('error',reject);
    child.on('close',code=>{
      if(code!==0) {reject(new Error(`Windows HTTPS client ${code}: ${stderr.trim()}`));return;}
      try {
        const raw=Buffer.concat(chunks);
        const split=raw.lastIndexOf(10);
        const meta=JSON.parse(raw.subarray(split+1).toString('utf8'));
        const body=raw.subarray(0,split);
        if(body.length>2_000_000) throw new Error('Response exceeds 2 MB');
        if(!Number.isInteger(meta.http_code) || meta.http_code<200 || meta.http_code>599) throw new Error('Invalid HTTPS response');
        const headers={'content-type':meta.content_type ?? ''};
        if(meta.redirect_url) headers.location=meta.redirect_url;
        resolve(new Response([204,205,304].includes(meta.http_code) ? null : body,{status:meta.http_code,headers}));
      } catch(error) {reject(error);}
    });
  });
}

export function createPublicFetch({fetchFn=fetch,platform=process.platform,windowsFetchFn=windowsFetch}={}) {
  return async(url,options)=>{
    try {return await fetchFn(url,options);}
    catch(error) {
      const code=error.cause?.code;
      if(platform!=='win32' || !recoverableErrors.has(code)) throw error;
      // Never fall back for HTTP denial, expired/self-signed certificates or hostname mismatch.
      try {return await windowsFetchFn(url,options);}
      catch(fallbackError) {throw new Error(errorDetail(fallbackError),{cause:error});}
    }
  };
}

export const publicFetch=createPublicFetch();
