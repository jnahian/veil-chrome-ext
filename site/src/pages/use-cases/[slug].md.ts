import type { APIRoute, GetStaticPaths } from 'astro';
import type { CollectionEntry } from 'astro:content';
import { getUseCases, rawMarkdown } from '../../useCases';

export const getStaticPaths = (async () =>
  (await getUseCases()).map((entry) => ({ params: { slug: entry.id }, props: { entry } }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<'useCases'> }> = ({ props, site }) =>
  new Response(rawMarkdown(props.entry, site!), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
