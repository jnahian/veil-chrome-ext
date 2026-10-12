import { getCollection, type CollectionEntry } from 'astro:content';
import { pageHref } from './mdLinks';

const SOURCE = 'site/src/content/use-cases/';

export async function getUseCases() {
  return (await getCollection('useCases')).sort((a, b) => a.data.order - b.data.order);
}

export const sourcePath = (entry: CollectionEntry<'useCases'>) => `${SOURCE}${entry.id}.md`;

// The page's Markdown as served at /use-cases/<slug>.md, with links made absolute so it reads correctly anywhere.
// Images point at the file in the GitHub repository.
export function rawMarkdown(entry: CollectionEntry<'useCases'>, site: URL) {
  const files = `https://raw.githubusercontent.com/jnahian/veil-chrome-ext/main/${SOURCE}`;
  return entry.body!.replace(/\]\(([^)\s]+)\)/g, (link, href: string) => {
    if (/^[a-z]+:|^#/.test(href)) return link;
    const page = pageHref(href);
    return `](${page ? new URL(page, site) : new URL(href, files)})`;
  });
}
