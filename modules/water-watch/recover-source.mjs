import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadContent} from './publication.mjs';
import {recoverSource} from './source-recovery.mjs';
import {publicCollection,buildIntake} from './collector.mjs';

const id=process.argv[2];
if(!id || process.argv.length!==3)throw new Error('Usage: node modules/water-watch/recover-source.mjs <registered-source-id>');
const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
const content=await loadContent(),config=await read('./collection-config.json'),previous=await read('./collection-state.json');
const {state,changed,row}=await recoverSource(content,config,previous,id,{onProgress:console.log,reader:process.env.GITHUB_ACTIONS==='true'?'github-actions':'local'});
const save=(name,value)=>writeFile(new URL(name,import.meta.url),JSON.stringify(value,null,2)+'\n');
await save('./collection-state.json',state);
await save('./collection.json',publicCollection(state));
await mkdir(new URL('../../.data/',import.meta.url),{recursive:true});
await save('../../.data/water-watch-intake.json',{checkedAt:row.checkedAt,candidates:buildIntake(content,{...state,changed})});
console.log(`Recovery: ${id}, ${row.status}, ${row.observedCount ?? 0} candidates. Editorial dates and government/observation snapshots unchanged.`);
if(row.status==='error')process.exitCode=1;
