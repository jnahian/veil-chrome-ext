---
name: release
description: Cut a new Veil release - bump the version, finish the changelog, open the release PR, then tag, package and publish the GitHub release with the zip. Use when the user says "release", "cut a release", "ship 1.x.y", "bump the version", or "publish a new version".
---

# Release Veil

A release is a PR that bumps the version and dates the changelog, then a tag and a GitHub release with the store zip attached. Past releases (`git show v1.1.0`, `gh release view v1.1.0`) show the exact shape.

## 1. Check what ships

1. Start from an up-to-date, clean `main`: `git checkout main && git pull --ff-only && git status --short`.
2. List what merged since the last tag: `git log --oneline $(git describe --tags --abbrev=0)..HEAD` and `gh pr list --state merged --search "merged:>=<last tag date>"`.
3. Compare that list with `## [Unreleased]` in `CHANGELOG.md`. Feature PRs often forget their entry, so write any missing ones. Follow the file's style: Keep a Changelog sections (`Added`, `Changed`, `Fixed`, `Removed`), one plain-language sentence per user-visible change, no internal details.
4. If nothing user-visible merged, stop and say so.

## 2. Pick the version

Semantic versioning, from the changelog sections:

- New capability (`Added`) → minor: 1.1.0 → 1.2.0.
- Only fixes or small changes → patch: 1.1.0 → 1.1.1.
- Removed a feature or broke saved rules or settings → major.

State the version and why in one line. Use the user's version if they gave one.

## 3. Release PR

1. `git checkout -b release-<version>`.
2. Bump the version in all three places, which `npm run package` checks agree:
   - `extension/manifest.json` `"version"`
   - `package.json` and `package-lock.json`: `npm version <version> --no-git-tag-version`
3. In `CHANGELOG.md`, add `## [<version>] - <YYYY-MM-DD>` under `## [Unreleased]`, so the entries move into it. At the bottom, point `[Unreleased]` at `compare/v<version>...HEAD` and add `[<version>]: https://github.com/jnahian/veil-chrome-ext/compare/v<previous>...v<version>`.
4. Check docs for claims the release makes untrue: `README.md` (Known limits, How it works), `site/src/content/docs.md`, `site/src/pages/index.astro` (limits, FAQ), and `store/listing.md` (description, permission justifications). Grep for the feature's keywords. Fix them in this PR or a separate docs PR, and run `npm run build` in `site/` if the site changed.
5. If the manifest description changed, it must stay at most 132 characters.
6. Run `npm test`. Commit as `Release <version>`, with a body that names what the version carries.
7. Push and open a PR titled `Release <version>` whose body holds the changelog section.
8. Wait for CI: `gh pr checks <n> --watch`.
9. **Ask the user to merge.** Do not merge the release PR yourself.

## 4. Tag and publish (after the user merges)

```sh
git checkout main && git pull --ff-only && git branch -D release-<version>
git tag -a v<version> -m "Veil v<version>" && git push origin v<version>
npm run package   # writes dist/veil-<version>.zip, fails on a dirty tree or mismatched versions
unzip -p dist/veil-<version>.zip manifest.json | grep '"version"'
```

Release notes: the changelog section for this version, then its compare link, then the Claude Code attribution line. Build them in the scratchpad, then:

```sh
gh release create v<version> dist/veil-<version>.zip --title "Veil v<version>" --notes-file <notes>
```

## 5. Hand off

Report the release URL, and remind the user of the manual Chrome Web Store steps:

- Upload `dist/veil-<version>.zip` in the developer dashboard.
- If `store/listing.md` changed, paste the new description and justifications into the dashboard.
- If store screenshots should show new UI, run `npm run store:assets` and upload them.
