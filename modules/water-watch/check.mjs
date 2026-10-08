import { loadContent } from './publication.mjs';
import { loadMonitoring } from './monitoring.mjs';
const content = await loadContent();
await loadMonitoring(content);
console.log(`Validated ${content.articles.length} articles and ${content.sources.length} registered sources`);
