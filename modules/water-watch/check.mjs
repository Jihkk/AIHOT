import { loadContent } from './publication.mjs';
import { loadMonitoring } from './monitoring.mjs';
import {loadHydro} from './hydro.mjs';
const content = await loadContent();
await loadMonitoring(content);
await loadHydro();
console.log(`Validated ${content.articles.length} articles and ${content.sources.length} registered sources`);
