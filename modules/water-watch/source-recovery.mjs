import {collect} from './collector.mjs';

export async function recoverSource(content,config,previous,id,options={}) {
  const source=content.sources.find(source=>source.id===id);
  const entry=config.sources.find(entry=>entry.id===id);
  if(!source || !entry || !previous.sources?.some(row=>row.id===id))throw new Error('Recovery requires a registered source and an existing baseline');
  const result=await collect({...content,sources:[source]},{...config,sources:[entry],datasets:[]},previous,options);
  const row={...result.sources[0],reader:options.reader ?? 'local'};
  // Preserve the full-cycle timestamp and every unrelated source/data snapshot.
  // A one-source recovery must not claim that the whole edition was rechecked.
  const state={...previous,sources:previous.sources.map(old=>old.id===id?row:old)};
  return {state,changed:result.changed,row};
}
