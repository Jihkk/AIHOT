import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { collect,publicCollection,publicData,buildIntake } from './collector.mjs';
import { loadContent } from './publication.mjs';

const read = async (path, fallback) => {
  try{return JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));}
  catch(error){if(error.code==='ENOENT' && fallback!==undefined)return fallback;throw error;}
};
const content=await loadContent();
const config=await read('./collection-config.json');
const previous=await read('./collection-state.json',{});
const result=await collect(content,config,previous,{onProgress:console.log});
const save=(path,value)=>writeFile(new URL(path,import.meta.url),JSON.stringify(value,null,2)+'\n');
await save('./collection-state.json',{version:1,checkedAt:result.checkedAt,sources:result.sources,datasets:result.datasets});
await save('./collection.json',publicCollection(result));
await save('./data.json',publicData(result));
await mkdir(new URL('../../.data/',import.meta.url),{recursive:true});
await save('../../.data/water-watch-intake.json',{checkedAt:result.checkedAt,candidates:buildIntake(content,result)});
const failures=result.sources.filter(s=>s.status==='error').length+result.datasets.filter(d=>d.status==='error').length;
console.log(`Collected ${result.sources.length} sources and ${result.datasets.length} datasets; ${result.changed.length} new/retitled candidate links; ${failures} connection failures. Candidates are not published articles.`);
