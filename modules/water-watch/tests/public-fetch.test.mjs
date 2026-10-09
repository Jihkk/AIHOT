import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createPublicFetch,windowsFetch,errorDetail} from '../public-fetch.mjs';
import {readPublic} from '../collector.mjs';

const url='https://water.selangor.gov.my/';
const networkError=code=>new TypeError('fetch failed',{cause:Object.assign(new Error('connection failed'),{code})});

test('Windows can recover incomplete intermediate chains and connection timeouts with verified HTTPS',async()=>{
  for(const code of ['UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','UND_ERR_CONNECT_TIMEOUT']) {
    let calls=0;
    const signal=AbortSignal.timeout(1000);
    const fetchFn=createPublicFetch({platform:'win32',fetchFn:async()=>{throw networkError(code);},windowsFetchFn:async(target,options)=>{
      calls++;assert.equal(target,url);assert.equal(options.signal,signal);return new Response('Official source');
    }});
    assert.equal(await (await fetchFn(url,{signal})).text(),'Official source');
    assert.equal(calls,1);
  }
});

test('access denials and invalid certificates are never retried with another client',async()=>{
  let fallbackCalls=0;
  const fallback=async()=>{fallbackCalls++;};
  const denied=createPublicFetch({platform:'win32',fetchFn:async()=>new Response('Denied',{status:403}),windowsFetchFn:fallback});
  assert.equal((await denied(url)).status,403);
  for(const code of ['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID','ABORT_ERR']) {
    const error=networkError(code);
    await assert.rejects(createPublicFetch({platform:'win32',fetchFn:async()=>{throw error;},windowsFetchFn:fallback})(url),e=>e===error);
  }
  await assert.rejects(createPublicFetch({platform:'linux',fetchFn:async()=>{throw networkError('UNABLE_TO_VERIFY_LEAF_SIGNATURE');},windowsFetchFn:fallback})(url));
  assert.equal(fallbackCalls,0);
});

function mockCurl(body,metadata,{exitCode=0,stderr=''}={}) {
  return (executable,args,options)=>{
    assert.match(executable,/System32[\\/]curl\.exe$/);
    assert.equal(args[0],'--disable','ignore user curl configuration');
    assert.ok(!args.includes('--insecure') && !args.includes('-k'));
    assert.ok(!args.includes('--location') && !args.includes('-L'),'redirects stay under allowlist validation');
    assert.equal(args[args.indexOf('--proto')+1],'=https');
    assert.equal(args[args.indexOf('--max-filesize')+1],'2000000');
    assert.equal(options.windowsHide,true);
    const child=new EventEmitter();
    child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
    queueMicrotask(()=>{
      child.stdout.end(Buffer.concat([Buffer.from(body),Buffer.from('\n'+JSON.stringify(metadata))]));
      child.stderr.end(stderr);child.emit('close',exitCode);
    });
    return child;
  };
}

test('Windows client preserves binary attachments and manually exposes redirects',async()=>{
  const binary=Buffer.from([37,80,68,70,45,255,0,10]);
  const response=await windowsFetch(url,{},mockCurl(binary,{http_code:200,content_type:'application/pdf'}));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),binary);
  const redirect=await windowsFetch(url,{},mockCurl('',{http_code:302,content_type:'text/html',redirect_url:'https://evil.example/'}));
  let calls=0;
  await assert.rejects(readPublic(url,['water.selangor.gov.my'],async()=>{calls++;return redirect;}),/HTTPS link/);
  assert.equal(calls,1);
});

test('Windows client rejects oversized bodies, failed certificate verification and invalid response metadata',async()=>{
  await assert.rejects(windowsFetch(url,{},mockCurl(Buffer.alloc(2_000_001),{http_code:200})),/2 MB/);
  await assert.rejects(windowsFetch(url,{},mockCurl('',{http_code:0},{exitCode:60,stderr:'certificate validation failed'})),/60.*certificate validation failed/);
  await assert.rejects(windowsFetch(url,{},mockCurl('',{http_code:0})),/Invalid HTTPS response/);
  await assert.rejects(windowsFetch('http://water.selangor.gov.my/'),/Expected HTTPS/);
});

test('both transport errors retain their diagnostic causes',async()=>{
  const fetchFn=createPublicFetch({platform:'win32',fetchFn:async()=>{throw networkError('UNABLE_TO_VERIFY_LEAF_SIGNATURE');},windowsFetchFn:async()=>{throw new Error('Windows HTTPS client 60: validation failed');}});
  await assert.rejects(fetchFn(url),error=>/Windows HTTPS client 60/.test(errorDetail(error)) && /UNABLE_TO_VERIFY_LEAF_SIGNATURE/.test(errorDetail(error)));
});
