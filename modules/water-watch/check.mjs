import { loadContent } from './publication.mjs';
const content = await loadContent();
console.log(`Validated ${content.articles.length} articles and ${content.sources.length} registered sources`);
