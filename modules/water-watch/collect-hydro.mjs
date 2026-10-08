import {readFile,writeFile,rename} from 'node:fs/promises';
import {hydroUrl,parseHydro,mergeHydro,validateHydro} from './hydro.mjs';

const config=JSON.parse(await readFile(new URL('./hydro-config.json',import.meta.url),'utf8'));
if(config.version!==1 || config.retentionDays!==7 || !config.regions.length || config.regions.some(r=>!['SEL','WLH'].includes(r.id))) throw new Error('Unsupported hydrology configuration');
const destination=new URL('./hydro.json',import.meta.url);
let previous=null;
try {previous=validateHydro(JSON.parse(await readFile(destination,'utf8')));} catch(error) {if(error.code!=='ENOENT')throw error;}
const results=[];
for(const region of config.regions) {
  // Two requests per region; no per-station polling or authentication is needed.
  const batch=await Promise.all(['rain','level'].map(async type=>{
    const url=hydroUrl(region.id,type);
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'error',headers:{'User-Agent':'MalaysiaWaterWatch/1.0 (+https://github.com/Jihkk/AIHOT)'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const reader=response.body.getReader(),chunks=[];
      let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw new Error('Source response exceeds 2 MB');}chunks.push(value);}
      const html=Buffer.concat(chunks).toString('utf8');
      const stations=parseHydro(html,region.id,type);
      console.log(`${region.id} ${type}: ${stations.length} stations`);
      return {region:region.id,type,stations};
    } catch(error) {
      // Persist the failure, but never replace the last successful data with an empty list.
      const message=error.message.slice(0,200);
      console.error(`${region.id} ${type}: ${message}`);
      return {region:region.id,type,error:message};
    }
  }));
  results.push(...batch);
}
const data=validateHydro(mergeHydro(previous,config,results));
const temporary=new URL('./hydro.json.tmp',import.meta.url);
await writeFile(temporary,JSON.stringify(data)+'\n');
await rename(temporary,destination);
const failed=results.filter(r=>r.error);
console.log(`Saved ${data.stations.length} stations; ${failed.length}/${results.length} source requests failed`);
if(failed.length===results.length)process.exitCode=1;
