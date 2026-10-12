import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { getHeadings } from './content/docs.md';

// Ids of the docs page's sections, which use cases link to in `related`.
const docSections = getHeadings().filter((h) => h.depth === 2).map((h) => h.slug);

const useCases = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/use-cases' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    summary: z.string(),
    // The card icon on the /use-cases/ index, drawn in src/pages/use-cases/index.astro.
    icon: z.enum(['monitor-up', 'presentation', 'video', 'bug', 'wallet', 'radio', 'type', 'eye-off', 'whole-word']),
    related: z.array(z.enum(docSections)),
  }),
});

export const collections = { useCases };
