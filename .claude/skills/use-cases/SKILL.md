---
name: use-cases
description: Write or edit a Veil use-case page for the landing site (veil-ce.jnahian.me/use-cases/). Use when the user says "add a use case", "write a use-case page", "new landing page for <job>", or wants a search- and AI-friendly page about one job Veil does, such as hiding data on a Zoom call or recording a tutorial.
---

# Veil use-case pages

Every page lives at `site/src/content/use-cases/<slug>.md` and publishes to `/use-cases/<slug>/`, with the raw Markdown at `/use-cases/<slug>.md` and a Copy .md button. The `/use-cases/` index, every page's sidebar, `llms.txt` and the sitemap pick up a new file automatically, with no other edit.

## 1. Pick the job

One page answers one job, for one search intent. Before writing, list the existing pages (`ls site/src/content/use-cases/`) and read their titles and H2s.

- If the new job is a section of an existing page, extend that page instead, or move the section into its own page and leave a one-line link behind.
- Two pages must never target the same query. Screen sharing on a call and live streaming have different audiences, so they get separate pages. Recording a tutorial and recording a webinar do not.
- The job must rest on a documented feature. If Veil cannot do it, there is no page.

## 2. Frontmatter

```yaml
---
title: Hide Sensitive Data While Screen Sharing   # ≤ ~48 chars, primary keyword first
order: 1                                        # sort position on the index and sidebar
summary: ~150–160 char sentence                 # meta description, og, index card, llms.txt line
icon: monitor-up                                # index card icon, a key of `icons` in src/pages/use-cases/index.astro
related: [hide-sensitive-data-on-a-site, keyboard-shortcuts]  # H2 slugs of site/src/content/docs.md
---
```

- `related` renders as "Related docs" at the end of the page, so do not write a related section yourself. The build fails on an id that is not an H2 slug of `docs.md`.
- `icon` is a [Lucide](https://lucide.dev/icons/) icon name, and each page uses a different one. To use an icon that is not in the map yet, add its name to the `icon` enum in `site/src/content.config.ts` and its SVG elements to `icons` in `site/src/pages/use-cases/index.astro`. Copy them from `https://unpkg.com/lucide-static@0.468.0/icons/<name>.svg`, never from memory.

## 3. Body

```md
# Human-phrased H1 (the title carries the query phrasing)

Intro paragraph: what Veil does for this job, standalone, names "Veil".

![alt text](../../../../store/assets/screenshot-1-mask.png)

## Question as searched?            ← keyword/question sections, repeated
Direct answer (1–2 standalone sentences, the bit a snippet or AI lifts).
Context: how, when, limits, shortcuts as "Label (Alt+Shift+X)".
Proof: a screenshot, or a link to ../docs.md#anchor.

## …more H2s, one idea each (H3 for sub-steps)

## Get Veil                         ← closing CTA, on every page
```

## Rules

- **Section shape:** question → answer → context → proof. Each paragraph stands alone. Put facts in lists or tables, not buried in prose.
- **Links:** use relative `.md` paths. `../docs.md#anchor` becomes `/docs/#anchor` and `other-slug.md` becomes `/use-cases/other-slug/` at build. Each page links to 2 or more existing pages and gets linked from at least 1. End "Get Veil" with a link to a related use case, and link the new page from the closest existing one.
- **Screenshots:** only real captures from `store/assets/`, made by `npm run store:assets` (the extension running in Chromium). Never mock one up. If a page needs a shot that does not exist, extend `store/generate-assets.js` and ask first.
- **Schema:** TechArticle and BreadcrumbList JSON-LD are generated from `title` and `summary`. Never hand-write JSON-LD. Question sections produce no FAQ schema.
- **Truth:** only claim behaviour that `site/src/content/docs.md` documents, and state its Known limits where they matter: screen only, the page's scripts can still read the data, no canvas, images or gradient text, and rules can break after a redesign. When a page names details that docs leave out, such as key vendors, currencies or whether a setting is per site, check them in `extension/detect.js`, `extension/content.js` or `extension/popup.js`. Check shortcuts against `commands` in `extension/manifest.json`: Alt+Shift+V picks an element, Alt+Shift+X pauses all changes, Alt+Shift+M shows or hides sensitive data on the tab. Say free, MIT, Chrome, no account, no network requests.
- **Comparisons:** an optional "Compared with other tools" section must be factual, sourced and free of disparagement. Leave it out rather than guess.
- **Closing CTA:** `## Get Veil` with the Chrome Web Store link, https://chromewebstore.google.com/detail/veil-hide-blur-rewrite/mmgidjpigbhdkdnmjhcbjhlbfhecddkc.

## Check

Run `npm run build` in `site/`. It fails on a bad `related` id or `icon`. Then open `/use-cases/` and the new page with `npm run preview`, and confirm the card icon, the sidebar entry and the line in `dist/llms.txt`.
