// A use case's relative Markdown link to its page on the site: ../docs.md#a → /docs/#a, x.md → /use-cases/x/.
// Shared by the Markdown processor in astro.config.mjs and the raw .md pages.
export function pageHref(href: string) {
  const m = /^(\.\.\/)?([a-z0-9-]+)\.md(#.*)?$/.exec(href);
  return m && `/${m[1] ? '' : 'use-cases/'}${m[2]}/${m[3] ?? ''}`;
}
