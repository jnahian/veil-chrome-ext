const { test, expect, HOST, EMBED_HOST, dataConfig } = require('./fixtures');

const PAGE = `http://${HOST}/iframe.html`;

// Sends a message to the active tab, as the toolbar shortcut does.
const sendToTab = (worker, msg) => worker.evaluate(async (m) => {
  const [tab] = await chrome.tabs.query({ active: true });
  await chrome.tabs.sendMessage(tab.id, m);
}, msg);

test('the picker can hide an element inside a cross-origin iframe', async ({ page, worker }) => {
  await page.goto(PAGE);
  const frame = page.frameLocator('#embed');
  await expect(frame.locator('#ad')).toBeVisible();

  await sendToTab(worker, { type: 'veil:pick' });
  await frame.locator('#ad').click();
  await frame.getByRole('button', { name: 'Hide' }).click();
  await frame.getByRole('button', { name: /Remove from the layout/ }).click();
  await expect(frame.locator('#ad')).toBeHidden();

  // Saved under the top page's site, so the popup lists it.
  const saved = await worker.evaluate((k) => chrome.storage.local.get(k), `rules:${HOST}`);
  expect(saved[`rules:${HOST}`]).toEqual([
    expect.objectContaining({ selector: '#ad', frame: `http://${EMBED_HOST}/frame.html` }),
  ]);

  await page.reload();
  await expect(frame.locator('#widget')).toBeVisible();
  await expect(frame.locator('#ad')).toBeHidden();
});

// A rule made inside the embedded frame.
const frameRule = (patch) => ({
  id: 'ad', action: 'hide', hideMode: 'collapse', selector: '#ad', tag: 'div', fingerprint: '',
  label: 'div#ad', scope: 'site', page: PAGE, frame: `http://${EMBED_HOST}/frame.html`, enabled: true, createdAt: 1,
  ...patch,
});

test('a frame rule applies only inside its frame', async ({ page, store }) => {
  await store({ [`rules:${HOST}`]: [frameRule({ selector: 'h1, #ad' })] });
  await page.goto(PAGE);
  await expect(page.frameLocator('#embed').locator('#ad')).toBeHidden();
  await expect(page.locator('#title')).toBeVisible();
});

test('a page-scoped frame rule applies only on the page it was made on', async ({ page, store }) => {
  await store({ [`rules:${HOST}`]: [frameRule({ scope: 'page' })] });
  await page.goto(PAGE);
  await expect(page.frameLocator('#embed').locator('#ad')).toBeHidden();

  await page.goto(`http://${HOST}/iframe-copy.html`);
  await expect(page.frameLocator('#embed').locator('#ad')).toBeVisible();
});

test('a page-scoped frame rule follows in-app navigation in the top page', async ({ page, store }) => {
  await store({ [`rules:${HOST}`]: [frameRule({ scope: 'page' })] });
  await page.goto(PAGE);
  const ad = page.frameLocator('#embed').locator('#ad');
  await expect(ad).toBeHidden();

  // A single-page app changes the address and then its content.
  await page.evaluate(() => {
    history.pushState({}, '', '/iframe-copy.html');
    document.body.append(document.createElement('p'));
  });
  await expect(ad).toBeVisible();

  await page.goBack();
  await expect(ad).toBeHidden();
});

test('keeping an element visible inside a frame does not affect the top page', async ({ page, worker, store }) => {
  await store(dataConfig({ style: 'blur' }));
  await page.goto(PAGE);
  const frame = page.frameLocator('#embed');
  await expect(page.locator('veil-money')).toHaveText(['$9.00']);
  await expect(frame.locator('veil-money')).toHaveText(['$5.00']);

  await sendToTab(worker, { type: 'veil:pick' });
  await frame.locator('#amount').click({ position: { x: 300, y: 5 } }); // past the text, on the paragraph
  await frame.getByRole('button', { name: /Keep this visible/ }).click();

  await expect(frame.locator('veil-money')).toHaveCount(0);
  await expect(page.locator('veil-money')).toHaveText(['$9.00']);
  const saved = await worker.evaluate((k) => chrome.storage.local.get(k), `money:${HOST}`);
  expect(saved[`money:${HOST}`].excludes).toEqual([{ selector: '#amount', frame: `http://${EMBED_HOST}/frame.html` }]);
});

test('the panel fits inside a small iframe', async ({ page, worker }) => {
  await page.goto(PAGE);
  await page.locator('#embed').evaluate((f) => { f.width = 220; f.height = 160; });
  const frame = page.frameLocator('#embed');
  await expect(frame.locator('#ad')).toBeVisible();

  await sendToTab(worker, { type: 'veil:pick' });
  await frame.locator('#ad').click();
  const panel = frame.locator('.panel');
  await expect(panel).toBeVisible();

  const outer = await page.locator('#embed').boundingBox();
  const inner = await panel.boundingBox();
  expect(inner.x).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
});

test('pressing Escape stops the picker in every frame', async ({ page, worker }) => {
  await page.goto(PAGE);
  const frame = page.frameLocator('#embed');
  await expect(frame.locator('#ad')).toBeVisible();

  await sendToTab(worker, { type: 'veil:pick' });
  await expect(frame.locator('html')).toHaveClass(/veil-picking/);
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveClass(/veil-picking/);
  await expect(frame.locator('html')).not.toHaveClass(/veil-picking/);
});

test('the badge counts rules in every frame, and locate finds a frame rule', async ({ page, worker, store }) => {
  await store({ [`rules:${HOST}`]: [frameRule(), frameRule({ id: 'title', selector: '#title', frame: undefined })] });
  await page.goto(PAGE);
  await expect(page.frameLocator('#embed').locator('#ad')).toBeHidden();

  const badge = () => worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true });
    return chrome.action.getBadgeText({ tabId: tab.id });
  });
  await expect.poll(badge).toBe('2');

  const located = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true });
    return chrome.tabs.sendMessage(tab.id, { type: 'veil:locate', id: 'ad' });
  });
  expect(located).toEqual({ found: true, visible: false });
});
