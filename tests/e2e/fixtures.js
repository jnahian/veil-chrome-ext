const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test: base, expect, chromium } = require('@playwright/test');

const EXTENSION = path.resolve(__dirname, '../../extension');
const PAGES = path.join(__dirname, 'pages');
const HOST = 'veil.test';
// A second origin, for pages that embed a cross-origin iframe.
const EMBED_HOST = 'embed.test';

const test = base.extend({
  // A fresh Chromium profile with Veil loaded. Pages under http://veil.test/
  // and http://embed.test/ are served from tests/e2e/pages, so no web server is needed.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    for (const host of [HOST, EMBED_HOST]) {
      await context.route(`http://${host}/**`, (route) => {
        const name = new URL(route.request().url()).pathname.slice(1);
        return route.fulfill({ path: path.join(PAGES, name) });
      });
    }
    await use(context);
    await context.close();
  },

  // The extension's service worker, which can read and write chrome.storage.
  worker: async ({ context }, use) => {
    const [worker] = context.serviceWorkers();
    await use(worker || (await context.waitForEvent('serviceworker')));
  },

  // Writes to chrome.storage.local, as the popup does.
  store: async ({ worker }, use) => {
    await use((items) => worker.evaluate((i) => chrome.storage.local.set(i), items));
  },
});

// Chrome removes an extension loaded with --load-extension when it reloads,
// so this browser loads Veil through the DevTools protocol pipe instead.
// reloadExtension() then loads the folder again, as an update does.
async function launchReloadable() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'veil-'));
  const proc = spawn(chromium.executablePath(), [
    '--headless', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-pipe', '--remote-debugging-port=0', '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });

  // The pipe carries JSON messages that end with a NUL character.
  const pending = new Map();
  let buffer = '';
  let seq = 0;
  proc.stdio[4].on('data', (chunk) => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf('\0')) >= 0; buffer = buffer.slice(end + 1)) {
      const msg = JSON.parse(buffer.slice(0, end));
      const p = pending.get(msg.id);
      if (!p) continue;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  });
  const send = (method, params) => new Promise((resolve, reject) => {
    pending.set(++seq, { resolve, reject });
    proc.stdio[3].write(JSON.stringify({ id: seq, method, params }) + '\0');
  });

  const port = await new Promise((resolve) => {
    let log = '';
    proc.stderr.on('data', (chunk) => {
      log += chunk;
      const m = log.match(/ws:\/\/127\.0\.0\.1:(\d+)/);
      if (m) resolve(m[1]);
    });
  });
  const { id } = await send('Extensions.loadUnpacked', { path: EXTENSION });
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  await context.route(`http://${HOST}/**`, (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    return route.fulfill({ path: path.join(PAGES, name) });
  });

  // Chromium runs its own component extensions too, so match Veil by ID.
  const veilWorker = async () => {
    await expect.poll(() => context.serviceWorkers().some((w) => w.url().includes(id))).toBe(true);
    return context.serviceWorkers().find((w) => w.url().includes(id));
  };

  return {
    context,
    veilWorker,
    reloadExtension: () => send('Extensions.loadUnpacked', { path: EXTENSION }),
    close: async () => {
      await browser.close();
      const exited = new Promise((resolve) => proc.once('exit', resolve));
      proc.kill();
      await exited;
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

// The sensitive data configuration for the test host, with defaults filled in.
const dataConfig = (patch) => ({
  [`money:${HOST}`]: { enabled: true, style: 'mask', bare: false, blur: 6, excludes: [], types: ['money'], custom: [], ...patch },
});

module.exports = { test, expect, HOST, EMBED_HOST, dataConfig, launchReloadable };
