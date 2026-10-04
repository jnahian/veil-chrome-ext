const $ = (s) => document.querySelector(s);

const ICONS = {
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V5h16v2M12 5v14M9 19h6"/></svg>',
  blur: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="3.5"/></svg>',
  hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 10 7a17 17 0 0 1-3 3.8M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2 5 7 10 7 1.8 0 3.4-.6 4.8-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

let tab;
let url;
let KEY;
let pageKey;
let rules = [];
let money = null; // sensitive data configuration for this site

const MONEY_DEFAULTS = { enabled: false, style: 'mask', bare: false, blur: 6, hoverReveal: false, excludes: [], types: ['money'], custom: [] };
const TYPE_NAMES = {
  money: 'Money', email: 'Emails', phone: 'Phone numbers', card: 'Card numbers',
  iban: 'IBANs', key: 'API keys and tokens', ip: 'IP addresses',
};
const STYLE_WORDS = { mask: 'Masked', blur: 'Blurred', hide: 'Hidden' };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

async function send(msg) {
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['detect.js', 'content.js'] });
    return chrome.tabs.sendMessage(tab.id, msg);
  }
}

async function saveRules(list) {
  rules = list;
  await chrome.storage.local.set({ [KEY]: list });
  render();
}

function describeRule(r) {
  if (r.action === 'text') return `Text: “${r.text.replace(/\s+/g, ' ')}”`;
  if (r.action === 'blur') return `Blurred at ${r.blur || 8}px${r.reveal ? ', clear on hover' : ''}`;
  return r.hideMode === 'collapse' ? 'Removed from layout' : 'Hidden, space kept';
}

function row(r, live) {
  const li = document.createElement('li');
  li.className = 'rule' + (r.enabled === false ? ' off' : '');

  const badge = document.createElement('span');
  badge.className = `badge ${r.action}`;
  badge.innerHTML = ICONS[r.action];

  const body = document.createElement('div');
  body.className = 'body';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = describeRule(r);
  title.title = describeRule(r);
  const meta = document.createElement('div');
  meta.className = 'meta';
  let path = '';
  if (!live) {
    try { path = new URL(r.page).pathname; } catch {}
  }
  meta.textContent = path ? `${r.label} on ${path}` : r.label;
  meta.title = r.selector;
  body.append(title, meta);

  const tools = document.createElement('div');
  tools.className = 'tools';

  const sw = document.createElement('label');
  sw.className = 'switch mini';
  sw.title = r.enabled === false ? 'Turn on' : 'Turn off';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-label', 'Rule enabled');
  input.checked = r.enabled !== false;
  input.onchange = () => saveRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: input.checked } : x)));
  const track = document.createElement('span');
  track.className = 'track';
  sw.append(input, track);
  tools.append(sw);

  if (live) {
    const loc = document.createElement('button');
    loc.type = 'button';
    loc.className = 'tool';
    loc.title = 'Show on page';
    loc.setAttribute('aria-label', 'Show on page');
    loc.innerHTML = ICONS.locate;
    loc.disabled = r.enabled === false;
    loc.onclick = async () => {
      try {
        const res = await send({ type: 'veil:locate', id: r.id });
        if (!res?.found) toast('That element is not on the page right now');
        else if (!res.visible) toast('That element is removed from the layout, so there is nothing to show');
      } catch {
        toast('Reload the page, then try again');
      }
    };
    tools.append(loc);
  }

  tools.append(delButton(() => saveRules(rules.filter((x) => x.id !== r.id))));

  li.append(badge, body, tools);
  return li;
}

function delButton(onclick) {
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'tool del';
  del.title = 'Delete';
  del.setAttribute('aria-label', 'Delete');
  del.innerHTML = ICONS.trash;
  del.onclick = onclick;
  return del;
}

// One row per data type that the sensitive data form hides on this site.
function dataRow(title, drop) {
  const li = document.createElement('li');
  li.className = 'rule';
  const badge = document.createElement('span');
  badge.className = 'badge data';
  badge.innerHTML = ICONS.shield;
  const body = document.createElement('div');
  body.className = 'body';
  const t = document.createElement('div');
  t.className = 'title';
  t.textContent = title;
  t.title = title;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${STYLE_WORDS[money.style] || 'Hidden'} on the whole site`;
  body.append(t, meta);
  const tools = document.createElement('div');
  tools.className = 'tools';
  tools.append(delButton(() => chrome.storage.local.set({ [`money:${url.hostname}`]: { ...money, ...drop } })));
  li.append(badge, body, tools);
  return li;
}

function dataSection() {
  if (!money?.enabled) return null;
  const items = money.types.map((t) => dataRow(TYPE_NAMES[t], { types: money.types.filter((x) => x !== t) }));
  if (money.custom.length) items.push(dataRow(`Custom: ${money.custom.join(', ')}`, { custom: [] }));
  return items.length ? sectionEl('Sensitive data', items) : null;
}

function section(title, list, live) {
  if (!list.length) return null;
  list.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
  return sectionEl(title, list.map((r) => row(r, live)));
}

function sectionEl(title, items) {
  const sec = document.createElement('section');
  const h = document.createElement('h2');
  const a = document.createElement('span');
  a.textContent = title;
  const b = document.createElement('span');
  b.textContent = String(items.length);
  h.append(a, b);
  const ul = document.createElement('ul');
  ul.append(...items);
  sec.append(h, ul);
  return sec;
}

function render() {
  const here = rules.filter((r) => r.scope !== 'site' && r.page === pageKey);
  const site = rules.filter((r) => r.scope === 'site');
  const other = rules.filter((r) => r.scope !== 'site' && r.page !== pageKey);
  const data = dataSection();
  $('#lists').replaceChildren(
    ...[
      data,
      section('This page', here, true),
      section('Whole site', site, true),
      section('Other pages on this site', other, false),
    ].filter(Boolean),
  );
  $('#empty').hidden = rules.length > 0 || !!data;
  $('#clear').hidden = rules.length === 0;
}

function setStateText(on) {
  $('#stateText').textContent = on ? 'On' : 'Paused';
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { url = new URL(tab.url); } catch { url = null; }

  const { paused } = await chrome.storage.local.get('paused');
  $('#active').checked = !paused;
  setStateText(!paused);
  $('#active').onchange = async () => {
    await chrome.storage.local.set({ paused: !$('#active').checked });
    setStateText($('#active').checked);
  };

  const cmds = await chrome.commands.getAll();
  const pickCmd = cmds.find((c) => c.name === 'start-picker');
  $('#kbd').textContent = pickCmd?.shortcut || '';

  const supported = url && /^https?:$/.test(url.protocol) &&
    !['chrome.google.com', 'chromewebstore.google.com'].includes(url.hostname);
  if (!supported) {
    $('#main').hidden = true;
    $('#footer').hidden = true;
    $('#unsupported').hidden = false;
    $('#host').textContent = url ? url.href.slice(0, 60) : '';
    return;
  }

  $('#host').textContent = url.hostname;
  KEY = `rules:${url.hostname}`;
  pageKey = url.origin + url.pathname;
  rules = (await chrome.storage.local.get(KEY))[KEY] || [];
  render();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEY in changes) {
      rules = changes[KEY].newValue || [];
      render();
    }
    if (area === 'local' && 'paused' in changes) {
      $('#active').checked = !changes.paused.newValue;
      setStateText(!changes.paused.newValue);
    }
  });

  setupMoney(cmds);

  $('#pick').onclick = async () => {
    try {
      await send({ type: 'veil:pick' });
      window.close();
    } catch {
      toast('Veil could not start on this page. Reload it and try again.');
    }
  };

  let armed = null;
  $('#clear').onclick = async () => {
    const btn = $('#clear');
    if (!armed) {
      btn.classList.add('armed');
      btn.textContent = 'Click again to clear';
      armed = setTimeout(() => {
        armed = null;
        btn.classList.remove('armed');
        btn.textContent = 'Clear this site';
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    btn.classList.remove('armed');
    btn.textContent = 'Clear this site';
    await chrome.storage.local.remove(KEY);
    rules = [];
    render();
    toast(`Cleared everything on ${url.hostname}`);
  };

  $('#export').onclick = async () => {
    const all = await chrome.storage.local.get(null);
    const data = { app: 'veil', version: 1, exportedAt: new Date().toISOString(), sites: {} };
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('rules:') && Array.isArray(v) && v.length) data.sites[k.slice(6)] = v;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `veil-rules-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  $('#import').onclick = () => $('#file').click();
  $('#file').onchange = async () => {
    const file = $('#file').files[0];
    $('#file').value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'veil' || typeof data.sites !== 'object') throw new Error('bad file');
      const keys = Object.keys(data.sites).map((h) => `rules:${h}`);
      const existing = await chrome.storage.local.get(keys);
      const out = {};
      let added = 0;
      for (const [h, list] of Object.entries(data.sites)) {
        if (!Array.isArray(list)) continue;
        const cur = existing[`rules:${h}`] || [];
        const ids = new Set(cur.map((r) => r.id));
        const fresh = list.filter((r) => r && r.id && r.selector && ['text', 'blur', 'hide'].includes(r.action) && !ids.has(r.id));
        added += fresh.length;
        out[`rules:${h}`] = [...cur, ...fresh];
      }
      await chrome.storage.local.set(out);
      toast(added ? `Imported ${added} rule${added === 1 ? '' : 's'}` : 'Everything in that file is already here');
    } catch {
      toast('That file is not a Veil export');
    }
  };
}

const STYLE_NOTES = {
  mask: 'Covers matches with a solid bar. Safe on every site because the page itself is not changed.',
  blur: 'Blurs matches. This edits the page, which can occasionally upset sites built with React or Vue.',
  hide: 'Makes matches invisible but keeps their space. Safe on every site.',
};

async function setupMoney(cmds) {
  const MKEY = `money:${url.hostname}`;
  money = { ...MONEY_DEFAULTS, ...((await chrome.storage.local.get(MKEY))[MKEY] || {}) };
  const revealCmd = cmds.find((c) => c.name === 'toggle-money-reveal');

  const paint = () => {
    $('#moneyOn').checked = money.enabled;
    $('#moneyOpts').hidden = !money.enabled;
    document.querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === money.style)));
    $('#styleNote').textContent = STYLE_NOTES[money.style] || '';
    document.querySelectorAll('[data-type]').forEach((c) => { c.checked = money.types.includes(c.dataset.type); });
    $('#hoverRow').hidden = money.style !== 'blur';
    $('#moneyHover').checked = !!money.hoverReveal;
    $('#bareRow').hidden = !money.types.includes('money');
    $('#moneyBare').checked = !!money.bare;
    if (document.activeElement !== $('#custom')) $('#custom').value = money.custom.join('\n');
    const n = (money.excludes || []).length;
    $('#exclRow').hidden = n === 0;
    $('#exclText').textContent = `${n} element${n === 1 ? '' : 's'} always kept visible`;
    const note = $('#revealNote');
    note.replaceChildren();
    if (revealCmd?.shortcut) {
      const k = document.createElement('kbd');
      k.textContent = revealCmd.shortcut;
      note.append('Press ', k, ' to show hidden data on this tab for a moment.');
    } else {
      note.textContent = 'Set a shortcut at chrome://extensions/shortcuts to show hidden data for a moment.';
    }
    render();
  };
  const save = async (patch) => {
    money = { ...money, ...patch };
    paint();
    await chrome.storage.local.set({ [MKEY]: money });
  };

  paint();
  $('#moneyOn').onchange = async () => {
    await save({ enabled: $('#moneyOn').checked });
    // Make sure the content script is running in tabs opened before install.
    if (money.enabled) send({ type: 'veil:ping' }).catch(() => {});
  };
  document.querySelectorAll('[data-style]').forEach((b) => { b.onclick = () => save({ style: b.dataset.style }); });
  document.querySelectorAll('[data-type]').forEach((c) => {
    c.onchange = () => save({ types: Object.keys(TYPE_NAMES).filter((t) => $(`[data-type="${t}"]`).checked) });
  });
  $('#moneyHover').onchange = () => save({ hoverReveal: $('#moneyHover').checked });
  $('#moneyBare').onchange = () => save({ bare: $('#moneyBare').checked });
  $('#custom').onchange = () => save({ custom: $('#custom').value.split('\n').map((x) => x.trim()).filter(Boolean) });
  $('#exclReset').onclick = () => save({ excludes: [] });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && MKEY in changes) {
      money = { ...MONEY_DEFAULTS, ...(changes[MKEY].newValue || {}) };
      paint();
    }
  });
}

init();
