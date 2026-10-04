// Veil content script.
// Runs at document_start on every http(s) page: re-applies saved rules,
// and provides the element picker, action panel and in-place text editor.
(() => {
  // After Veil is updated or reloaded, open tabs keep the old copy of this
  // script, which can no longer reach the extension. A new copy tells it to
  // undo its changes, then takes over.
  if (window.__veilAlive?.()) return;
  document.dispatchEvent(new Event('veil:takeover'));

  // Inside an iframe, rules and settings belong to the top page's site, so the
  // popup lists them. Rules made in a frame record that frame's address.
  const IN_FRAME = window !== top;
  let HOST = location.hostname;
  if (IN_FRAME) {
    try { HOST = new URL(location.ancestorOrigins[location.ancestorOrigins.length - 1]).hostname; } catch { return; }
  }
  const FRAME = IN_FRAME ? location.origin + location.pathname : undefined;
  const KEY = `rules:${HOST}`;
  const ATTR = 'data-veil';
  const UI_ID = 'veil-ui-host';

  let rules = [];
  let paused = false;
  let defaultScope = 'page';
  let lastHref = location.href;
  let lastContextTarget = null;
  let topPage = ''; // top page's address, asked from the background when in a frame
  const setTopPage = (url) => { const u = new URL(url); topPage = u.origin + u.pathname; };

  // ruleId -> { el, original, lastTC, text } for text replacements
  const textApplied = new Map();

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
  const pageKey = () => (IN_FRAME ? topPage : location.origin + location.pathname);
  const alive = () => {
    try { return !!chrome.runtime?.id; } catch { return false; }
  };
  window.__veilAlive = alive;

  // ---------------------------------------------------------------------------
  // Selector generation
  // ---------------------------------------------------------------------------
  const GENERATED_CLASS = [
    /\d{3,}/,                                   // lots of digits
    /^(css|sc|jsx|emotion|svelte|astro|tw)-/,   // CSS-in-JS prefixes
    /^_/,                                       // CSS modules often start with _
    /__[\w-]{5,}$/,                             // module hash suffix
    /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{5,10}$/, // random hash like aB3xYz
  ];
  const stableId = (id) =>
    !!id && id.length < 60 && !/\d{4,}|^[:_\d]|:/.test(id) && !/^[a-f0-9-]{16,}$/i.test(id);
  const stableClass = (c) =>
    c.length <= 40 && /^[a-zA-Z][\w-]*$/.test(c) &&
    !GENERATED_CLASS.some((re) => re.test(c)) &&
    !/^(hover|active|focus|focused|selected|open|is-|has-)/.test(c);
  const cssStr = (v) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');

  function unique(sel) {
    try { return document.querySelectorAll(sel).length === 1; } catch { return false; }
  }

  function buildSelector(el) {
    const tag = el.tagName.toLowerCase();
    if (stableId(el.id) && unique('#' + CSS.escape(el.id))) return '#' + CSS.escape(el.id);

    for (const a of ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy', 'aria-label', 'name', 'title', 'alt']) {
      const v = el.getAttribute(a);
      if (v && v.length < 100) {
        const s = `${tag}[${a}="${cssStr(v)}"]`;
        if (unique(s)) return s;
      }
    }

    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node !== el && stableId(node.id)) {
        parts.unshift('#' + CSS.escape(node.id));
        const s = parts.join(' > ');
        if (unique(s)) return s;
        node = node.parentElement;
        continue;
      }
      let part = node.tagName.toLowerCase();
      const cls = [...node.classList].filter(stableClass).slice(0, 2);
      if (cls.length) part += cls.map((c) => '.' + CSS.escape(c)).join('');

      let s = [part, ...parts].join(' > ');
      if (unique(s)) return s;

      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) {
          part += `:nth-of-type(${same.indexOf(node) + 1})`;
          s = [part, ...parts].join(' > ');
          if (unique(s)) return s;
        }
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = [...el.classList].slice(0, 2);
    if (c.length) s += '.' + c.join('.');
    return s.slice(0, 80);
  }

  // ---------------------------------------------------------------------------
  // Applying rules
  // ---------------------------------------------------------------------------
  let styleEl = null;
  let staticStyle = null;

  function ensureStyles() {
    const parent = document.head || document.documentElement;
    if (!staticStyle) {
      staticStyle = document.createElement('style');
      staticStyle.id = 'veil-static';
      staticStyle.textContent =
        'html.veil-picking, html.veil-picking * { cursor: crosshair !important; }';
    }
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'veil-rules';
    }
    if (!staticStyle.isConnected) parent.appendChild(staticStyle);
    if (!styleEl.isConnected) parent.appendChild(styleEl);
  }

  // Rules for this page in any frame.
  function pageRules() {
    if (paused) return [];
    const pk = pageKey();
    return rules.filter((r) => r.enabled !== false && (r.scope === 'site' || r.page === pk));
  }

  function activeRules() {
    return pageRules().filter((r) => r.frame === FRAME);
  }

  function validSelector(sel) {
    try { document.querySelector(sel); return true; } catch { return false; }
  }

  function ruleCSS(r) {
    const targets = [`[${ATTR}~="${r.id}"]`];
    if (validSelector(r.selector)) targets.unshift(r.selector);
    const out = [];
    for (const sel of targets) {
      if (r.action === 'blur') {
        out.push(`${sel}{filter:blur(${Number(r.blur) || 8}px)!important;transition:filter .18s ease!important}`);
        if (r.reveal) out.push(`${sel}:hover{filter:none!important}`);
      } else if (r.action === 'hide') {
        if (r.hideMode === 'collapse') out.push(`${sel}{display:none!important}`);
        else out.push(`${sel},${sel} *{visibility:hidden!important}`);
      }
    }
    return out.join('\n');
  }

  function renderCSS() {
    ensureStyles();
    const act = activeRules();
    styleEl.textContent = act.filter((r) => r.action !== 'text').map(ruleCSS).join('\n');
    if (!IN_FRAME && alive()) {
      try { chrome.runtime.sendMessage({ type: 'veil:count', n: pageRules().length }).catch(() => {}); } catch {}
    }
  }

  function queryFirst(sel) {
    try { return document.querySelector(sel); } catch { return null; }
  }

  // Fallback when the selector no longer matches: find the smallest element
  // of the same tag whose text starts with the saved fingerprint.
  function byFingerprint(r) {
    if (!r.fingerprint || r.fingerprint.length < 3) return null;
    let best = null;
    let bestLen = Infinity;
    for (const c of document.getElementsByTagName(r.tag || '*')) {
      if (c.id === UI_ID) continue;
      const t = norm(c.textContent);
      if (t.length < bestLen && t.startsWith(r.fingerprint)) {
        best = c;
        bestLen = t.length;
      }
    }
    return best;
  }

  function restoreText(rec) {
    try { rec.el.innerHTML = rec.original; } catch {}
  }

  function applyDom() {
    const act = activeRules();

    // Blur/hide: mark fallback matches so the CSS attribute rule catches them.
    const marks = new Map();
    for (const r of act) {
      if (r.action === 'text' || queryFirst(r.selector)) continue;
      const el = byFingerprint(r);
      if (!el) continue;
      if (!marks.has(el)) marks.set(el, []);
      marks.get(el).push(r.id);
    }
    for (const el of document.querySelectorAll(`[${ATTR}]`)) {
      if (!marks.has(el)) el.removeAttribute(ATTR);
    }
    for (const [el, ids] of marks) {
      const v = ids.join(' ');
      if (el.getAttribute(ATTR) !== v) el.setAttribute(ATTR, v);
    }

    // Text replacements.
    const want = new Set();
    for (const r of act) {
      if (r.action !== 'text') continue;
      want.add(r.id);
      let rec = textApplied.get(r.id);
      let el = queryFirst(r.selector);
      if (!el && rec && rec.el.isConnected) el = rec.el;
      if (!el) el = byFingerprint(r);

      if (rec && rec.el !== el) {
        if (rec.el.isConnected) restoreText(rec);
        textApplied.delete(r.id);
        rec = null;
      }
      if (!el || (editing && editing.el === el)) continue;
      if (!rec) {
        rec = { el, original: el.innerHTML, lastTC: null, text: null };
        textApplied.set(r.id, rec);
      }
      if (el.textContent !== rec.lastTC || rec.text !== r.text) {
        el.innerText = r.text;
        rec.lastTC = el.textContent;
        rec.text = r.text;
      }
    }
    for (const [id, rec] of textApplied) {
      if (!want.has(id)) {
        if (rec.el.isConnected) restoreText(rec);
        textApplied.delete(id);
      }
    }
  }

  function applyAll() {
    renderCSS();
    applyDom();
  }

  let timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (location.href !== lastHref) {
        lastHref = location.href;
        renderCSS();
        // Frames use the top page's address for page rules.
        if (!IN_FRAME && alive()) {
          try { chrome.runtime.sendMessage({ type: 'veil:navigated', url: location.href }).catch(() => {}); } catch {}
        }
      } else if (!styleEl || !styleEl.isConnected) {
        ensureStyles();
      }
      applyDom();
    }, 60);
  }

  // ---------------------------------------------------------------------------
  // UI (shadow DOM so page styles can't touch it)
  // ---------------------------------------------------------------------------
  const UI_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .ui { font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: #1E2340; }

    .box { position: fixed; pointer-events: none; border: 2px solid #0F766E; border-radius: 4px;
      background: rgba(15, 118, 110, .08); box-shadow: 0 0 0 4000px rgba(30, 35, 64, .10);
      transition: left .05s, top .05s, width .05s, height .05s; }
    .box.locked { background: transparent; }
    .box.edit { background: transparent; border-style: dashed; box-shadow: none; }
    .box.flash { background: rgba(15, 118, 110, .18); box-shadow: none; animation: pulse 1.2s ease-out; }
    @keyframes pulse { 0% { outline: 0 solid rgba(15, 118, 110,.5); } 100% { outline: 18px solid rgba(15, 118, 110,0); } }

    .tag { position: fixed; pointer-events: none; display: flex; gap: 8px; align-items: baseline;
      max-width: 70vw; padding: 4px 9px; border-radius: 6px; background: #0F766E; color: #fff;
      font-size: 12px; white-space: nowrap; overflow: hidden; }
    .tag .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
    .tag .dim { opacity: .75; }

    .glass { background: rgba(238, 241, 246, .82); -webkit-backdrop-filter: blur(18px) saturate(1.4);
      backdrop-filter: blur(18px) saturate(1.4); border: 1px solid rgba(255,255,255,.7);
      box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 18px 50px -12px rgba(30, 35, 64, .35), 0 0 0 1px rgba(30,35,64,.08); }

    .hint { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); pointer-events: none;
      padding: 10px 16px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .hint strong { font-weight: 600; font-size: 13px; }
    .hint span { color: #6A7190; font-size: 12px; }

    kbd { font: inherit; font-size: 11px; padding: 1px 5px; border-radius: 4px; background: #fff;
      border: 1px solid #C9CFDC; color: #1E2340; }

    .panel { position: fixed; pointer-events: auto; width: min(292px, calc(100vw - 20px)); max-height: calc(100vh - 20px);
      overflow: auto; border-radius: 16px; padding: 12px; }
    .head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .head .title { font-weight: 650; font-size: 14px; }
    .head .el { flex: 1; min-width: 0; color: #6A7190; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
    button:focus-visible, input:focus-visible { outline: 2px solid #0F766E; outline-offset: 2px; }
    .icon-btn { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #6A7190; }
    .icon-btn:hover { background: rgba(30,35,64,.07); color: #1E2340; }

    .row { display: flex; gap: 6px; align-items: center; }
    .seg { display: flex; padding: 3px; border-radius: 10px; background: rgba(30,35,64,.06); flex: 1; }
    .seg button { flex: 1; padding: 5px 6px; border-radius: 7px; font-size: 12px; color: #6A7190; }
    .seg button[aria-pressed="true"] { background: #fff; color: #1E2340; font-weight: 600; box-shadow: 0 1px 2px rgba(30,35,64,.15); }

    .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
    .act { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 11px 4px 9px;
      border-radius: 11px; background: #fff; border: 1px solid rgba(201,207,220,.8); font-size: 12px; font-weight: 550; }
    .act:hover { border-color: #0F766E; color: #0F766E; }
    .act[aria-pressed="true"] { border-color: #0F766E; background: #0F766E; color: #fff; }
    .act svg { width: 20px; height: 20px; }

    .keep { width: 100%; margin-top: 6px; padding: 7px 10px; border-radius: 10px; font-size: 12px; color: #0F766E;
      background: rgba(15, 118, 110,.08); text-align: left; }
    .keep:hover { background: rgba(15, 118, 110,.15); }
    .sub { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(201,207,220,.9); display: grid; gap: 9px; }
    .sub label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #1E2340; }
    .sub input[type=range] { flex: 1; accent-color: #0F766E; }
    .sub input[type=checkbox] { accent-color: #0F766E; margin: 0; }
    .val { min-width: 34px; text-align: right; color: #6A7190; font-variant-numeric: tabular-nums; }
    .choice { text-align: left; padding: 9px 10px; border-radius: 10px; background: #fff; border: 1px solid rgba(201,207,220,.8); }
    .choice:hover { border-color: #0F766E; }
    .choice b { display: block; font-weight: 600; font-size: 12px; }
    .choice span { color: #6A7190; font-size: 11.5px; }

    .nav { display: flex; justify-content: space-between; margin-top: 10px; color: #6A7190; font-size: 12px; }
    .nav button { padding: 3px 6px; border-radius: 6px; }
    .nav button:hover { background: rgba(30,35,64,.07); color: #1E2340; }

    .primary { padding: 8px 14px; border-radius: 10px; background: #0F766E; color: #fff; font-weight: 600; }
    .primary:hover { background: #115E59; }
    .ghost { padding: 8px 12px; border-radius: 10px; color: #6A7190; }
    .ghost:hover { background: rgba(30,35,64,.07); color: #1E2340; }

    .edit-help { color: #6A7190; font-size: 12px; margin-bottom: 10px; }
    .warn { margin-bottom: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(194,58,75,.08);
      color: #8E2433; font-size: 12px; }
    .end { justify-content: flex-end; }

    .toast { position: fixed; right: 20px; bottom: 20px; pointer-events: auto; padding: 8px 8px 8px 14px;
      border-radius: 12px; display: flex; align-items: center; gap: 12px; font-weight: 550; }
    .toast button { padding: 5px 10px; border-radius: 8px; color: #0F766E; font-weight: 600; }
    .toast button:hover { background: rgba(15, 118, 110,.1); }

    @media (prefers-reduced-motion: reduce) { .box { transition: none; } .box.flash { animation: none; } }
  `;

  const ICONS = {
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V5h16v2M12 5v14M9 19h6"/></svg>',
    blur: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="3.5"/></svg>',
    hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 5 10 7a17 17 0 0 1-3 3.8M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2 5 7 10 7 1.8 0 3.4-.6 4.8-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  let host = null;
  let root = null;

  function ensureUI() {
    if (!host) {
      host = document.createElement('div');
      host.id = UI_ID;
      host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;';
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${UI_CSS}</style>
        <div class="ui">
          <div class="box" hidden></div>
          <div class="tag" hidden><span class="name"></span><span class="dim"></span></div>
          <div class="hint glass" hidden><strong></strong><span></span></div>
          <div class="panel glass" hidden role="dialog" aria-label="Veil"></div>
          <div class="toast glass" hidden role="status"><span class="msg"></span><button type="button">Undo</button></div>
        </div>`;
    }
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    return root;
  }
  const $ = (s) => ensureUI().querySelector(s);
  const inUI = (e) => !!host && e.composedPath().includes(host);

  function drawBox(el, mode = '', withTag = true) {
    const r = el.getBoundingClientRect();
    const box = $('.box');
    box.hidden = false;
    box.className = 'box ' + mode;
    Object.assign(box.style, {
      left: r.left - 2 + 'px', top: r.top - 2 + 'px',
      width: r.width + 4 + 'px', height: r.height + 4 + 'px',
    });
    const tag = $('.tag');
    tag.hidden = !withTag;
    if (withTag) {
      tag.querySelector('.name').textContent = describe(el);
      tag.querySelector('.dim').textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
      const top = r.top > 30 ? r.top - 28 : Math.min(r.bottom + 6, innerHeight - 26);
      Object.assign(tag.style, { left: Math.max(4, Math.min(r.left, innerWidth - 200)) + 'px', top: top + 'px' });
    }
  }

  function hideBox() {
    if (!root) return;
    $('.box').hidden = true;
    $('.tag').hidden = true;
  }

  function showHint(title, sub) {
    const h = $('.hint');
    h.querySelector('strong').textContent = title;
    h.querySelector('span').innerHTML = sub;
    h.hidden = false;
  }

  let toastTimer = null;
  function toast(msg, undo) {
    const t = $('.toast');
    t.querySelector('.msg').textContent = msg;
    const btn = t.querySelector('button');
    btn.hidden = !undo;
    btn.onclick = async () => {
      t.hidden = true;
      if (undo) await undo();
    };
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
  }

  function reposition() {
    if (picking && hovered) drawBox(hovered);
    else if (editing) { drawBox(editing.el, 'edit', false); placeNear($('.panel'), editing.el); }
    else if (panelTarget) { drawBox(panelTarget, 'locked', false); placeNear($('.panel'), panelTarget); }
  }
  addEventListener('scroll', () => { if (picking || editing || panelTarget) reposition(); }, { capture: true, passive: true });
  addEventListener('resize', () => { if (picking || editing || panelTarget) reposition(); }, { passive: true });

  function placeNear(panel, el) {
    const r = el.getBoundingClientRect();
    const w = panel.offsetWidth || 292;
    const h = panel.offsetHeight || 200;
    let top;
    if (r.bottom + 10 + h < innerHeight) top = r.bottom + 10;
    else if (r.top - 10 - h > 0) top = r.top - 10 - h;
    else top = Math.max(10, innerHeight - h - 10);
    const left = Math.max(10, Math.min(r.left, innerWidth - w - 10));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  // ---------------------------------------------------------------------------
  // Picker
  // ---------------------------------------------------------------------------
  let picking = false;
  let hovered = null;
  let pointerEl = null;
  let downStack = [];
  const BLOCKED = ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'auxclick', 'contextmenu', 'touchstart'];

  function startPicker() {
    if (picking) return;
    closePanel();
    cancelEdit();
    ensureUI();
    ensureStyles();
    picking = true;
    hovered = null;
    pointerEl = null;
    downStack = [];
    document.documentElement.classList.add('veil-picking');
    if (!IN_FRAME) showHint('Click an element to select it', '<kbd>↑</kbd> <kbd>↓</kbd> parent or child, <kbd>Enter</kbd> select, <kbd>Esc</kbd> cancel');
    addEventListener('mousemove', onPickMove, true);
    addEventListener('mouseout', onPickOut, true);
    for (const t of BLOCKED) addEventListener(t, onPickBlock, { capture: true, passive: false });
    addEventListener('keydown', onPickKey, true);
  }

  // Every frame runs its own picker, so stopping one stops the others too.
  function stopPicker(relay = true) {
    if (!picking) return;
    picking = false;
    if (relay && alive()) {
      try { chrome.runtime.sendMessage({ type: 'veil:stopPick' }).catch(() => {}); } catch {}
    }
    document.documentElement.classList.remove('veil-picking');
    removeEventListener('mousemove', onPickMove, true);
    removeEventListener('mouseout', onPickOut, true);
    for (const t of BLOCKED) removeEventListener(t, onPickBlock, true);
    removeEventListener('keydown', onPickKey, true);
    $('.hint').hidden = true;
    hideBox();
  }

  function onPickMove(e) {
    if (inUI(e)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host || el === document.documentElement || el === pointerEl) return;
    pointerEl = el;
    // The frame's own picker highlights what is inside it.
    if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
      hovered = null;
      hideBox();
      return;
    }
    hovered = el;
    downStack = [];
    drawBox(el);
  }

  // The pointer left this frame for another one.
  function onPickOut(e) {
    if (e.relatedTarget) return;
    hovered = null;
    pointerEl = null;
    hideBox();
  }

  function onPickBlock(e) {
    if (inUI(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type === 'contextmenu') { stopPicker(); return; }
    if (e.type === 'click' && e.button === 0) {
      const el = hovered || e.target;
      if (el && el.nodeType === 1) openPanel(el);
    }
  }

  function onPickKey(e) {
    const handled = ['Escape', 'ArrowUp', 'ArrowDown', 'Enter'];
    if (!handled.includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') return stopPicker();
    if (!hovered) return;
    if (e.key === 'ArrowUp') {
      const p = hovered.parentElement;
      if (p && p !== document.documentElement) { downStack.push(hovered); hovered = p; }
    } else if (e.key === 'ArrowDown') {
      hovered = downStack.pop() || hovered.firstElementChild || hovered;
    } else if (e.key === 'Enter') {
      return openPanel(hovered);
    }
    drawBox(hovered);
  }

  // ---------------------------------------------------------------------------
  // Action panel
  // ---------------------------------------------------------------------------
  let panelTarget = null;
  let panelStack = [];
  let preview = null;

  const PANEL_HTML = `
    <div class="head">
      <span class="title">Veil</span>
      <span class="el"></span>
      <button class="icon-btn" data-close type="button" aria-label="Close">${ICONS.close}</button>
    </div>
    <div class="row">
      <div class="seg" role="group" aria-label="Where this applies">
        <button type="button" data-scope="page">This page</button>
        <button type="button" data-scope="site">Whole site</button>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="act" data-act="text">${ICONS.text}Replace text</button>
      <button type="button" class="act" data-act="blur">${ICONS.blur}Blur</button>
      <button type="button" class="act" data-act="hide">${ICONS.hide}Hide</button>
    </div>
    <button type="button" class="keep" data-keep hidden>Keep this visible when hiding sensitive data</button>
    <div class="sub" data-sub="blur" hidden>
      <label>Strength <input type="range" min="2" max="30" value="8" data-blur><span class="val" data-blur-val>8px</span></label>
      <label><input type="checkbox" data-reveal checked> Show clearly on hover</label>
      <div class="row end"><button type="button" class="primary" data-save-blur>Save blur</button></div>
    </div>
    <div class="sub" data-sub="hide" hidden>
      <button type="button" class="choice" data-hide="keep"><b>Hide and keep the space</b><span>Leaves a blank gap so the layout stays put</span></button>
      <button type="button" class="choice" data-hide="collapse"><b>Remove from the layout</b><span>The page closes up around it</span></button>
    </div>
    <div class="nav">
      <button type="button" data-nav="up">↑ Select parent</button>
      <button type="button" data-nav="down">Select child ↓</button>
    </div>`;

  function openPanel(el, keepStack = false) {
    stopPicker();
    cancelEdit();
    clearPreview();
    if (!keepStack) panelStack = [];
    panelTarget = el;
    ensureUI();
    const p = $('.panel');
    p.innerHTML = PANEL_HTML;
    p.hidden = false;
    p.querySelector('.el').textContent = describe(el);
    p.querySelector('.el').title = describe(el);
    syncScope(p);
    drawBox(el, 'locked', false);
    placeNear(p, el);

    p.querySelector('[data-close]').onclick = closePanel;
    p.querySelectorAll('[data-scope]').forEach((b) => {
      b.onclick = () => {
        defaultScope = b.dataset.scope;
        chrome.storage.local.set({ defaultScope }).catch(() => {});
        syncScope(p);
      };
    });

    const showSub = (name) => {
      p.querySelectorAll('[data-sub]').forEach((s) => { s.hidden = s.dataset.sub !== name; });
      p.querySelectorAll('[data-act]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.act === name)));
      if (name === 'blur') setPreview(el, Number(p.querySelector('[data-blur]').value));
      else clearPreview();
      placeNear(p, el);
    };

    p.querySelector('[data-act="text"]').onclick = () => { closePanel(); startEdit(el); };
    const keep = p.querySelector('[data-keep]');
    keep.hidden = !money.enabled;
    keep.onclick = () => { closePanel(); keepAmountVisible(el); };
    p.querySelector('[data-act="blur"]').onclick = () => showSub('blur');
    p.querySelector('[data-act="hide"]').onclick = () => showSub('hide');

    const range = p.querySelector('[data-blur]');
    range.oninput = () => {
      p.querySelector('[data-blur-val]').textContent = range.value + 'px';
      setPreview(el, Number(range.value));
    };
    p.querySelector('[data-save-blur]').onclick = () => {
      const rule = { ...baseRule(el, 'blur'), blur: Number(range.value), reveal: p.querySelector('[data-reveal]').checked };
      closePanel();
      saveRule(rule, 'Blur saved');
    };
    p.querySelectorAll('[data-hide]').forEach((b) => {
      b.onclick = () => {
        const rule = { ...baseRule(el, 'hide'), hideMode: b.dataset.hide };
        closePanel();
        saveRule(rule, 'Element hidden');
      };
    });

    p.querySelector('[data-nav="up"]').onclick = () => {
      const parent = el.parentElement;
      if (parent && parent !== document.documentElement) {
        panelStack.push(el);
        openPanel(parent, true);
      }
    };
    p.querySelector('[data-nav="down"]').onclick = () => {
      const child = panelStack.pop() || el.firstElementChild;
      if (child) openPanel(child, true);
    };

    addEventListener('mousedown', onPanelOutside, true);
    addEventListener('keydown', onPanelKey, true);
    p.querySelector('[data-act="text"]').focus({ preventScroll: true });
  }

  function syncScope(p) {
    p.querySelectorAll('[data-scope]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scope === defaultScope)));
  }

  function closePanel() {
    if (!panelTarget) return;
    clearPreview();
    panelTarget = null;
    $('.panel').hidden = true;
    $('.panel').innerHTML = '';
    hideBox();
    removeEventListener('mousedown', onPanelOutside, true);
    removeEventListener('keydown', onPanelKey, true);
  }

  function onPanelOutside(e) { if (!inUI(e)) closePanel(); }
  function onPanelKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closePanel(); }
  }

  function setPreview(el, px) {
    if (!preview || preview.el !== el) {
      clearPreview();
      preview = { el, value: el.style.getPropertyValue('filter'), priority: el.style.getPropertyPriority('filter') };
    }
    el.style.setProperty('filter', `blur(${px}px)`, 'important');
  }

  function clearPreview() {
    if (!preview) return;
    const { el, value, priority } = preview;
    if (value) el.style.setProperty('filter', value, priority);
    else el.style.removeProperty('filter');
    if (!el.getAttribute('style')) el.removeAttribute('style');
    preview = null;
  }

  function baseRule(el, action, selector, fingerprint) {
    return {
      id: uid(),
      action,
      selector: selector || buildSelector(el),
      tag: el.tagName.toLowerCase(),
      fingerprint: fingerprint ?? norm(el.textContent).slice(0, 80),
      label: describe(el),
      scope: defaultScope,
      page: pageKey(),
      frame: FRAME,
      enabled: true,
      createdAt: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // In-place text editing
  // ---------------------------------------------------------------------------
  let editing = null;
  const EDIT_KEYS = ['keydown', 'keyup', 'keypress'];

  function startEdit(el) {
    const existing = rules.find((r) => r.action === 'text' && textApplied.get(r.id)?.el === el);
    const rec = existing ? textApplied.get(existing.id) : null;
    editing = {
      el,
      existing,
      selector: existing ? existing.selector : buildSelector(el),
      fingerprint: existing ? existing.fingerprint : norm(el.textContent).slice(0, 80),
      trueOriginal: rec ? rec.original : el.innerHTML,
      before: el.innerHTML,
      beforeText: el.innerText,
      ce: el.getAttribute('contenteditable'),
    };
    const hasKids = !rec && [...el.children].some((c) => c.tagName !== 'BR');

    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    ensureUI();
    const p = $('.panel');
    p.innerHTML = `
      <div class="head"><span class="title">Replace text</span><span class="el"></span></div>
      ${hasKids ? '<div class="warn">This element contains links, icons or other elements. Saving replaces all of it with plain text. Select a smaller element if you want to keep them.</div>' : ''}
      <div class="edit-help">Type directly on the page. <kbd>Enter</kbd> saves, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line, <kbd>Esc</kbd> cancels.</div>
      <div class="row end">
        <button type="button" class="ghost" data-cancel>Cancel</button>
        <button type="button" class="primary" data-save>Save text</button>
      </div>`;
    p.querySelector('.el').textContent = describe(el);
    p.hidden = false;
    p.querySelector('[data-cancel]').onclick = cancelEdit;
    p.querySelector('[data-save]').onmousedown = (e) => e.preventDefault(); // keep focus in the element
    p.querySelector('[data-save]').onclick = finishEdit;
    drawBox(el, 'edit', false);
    placeNear(p, el);
    for (const t of EDIT_KEYS) addEventListener(t, onEditKey, true);
  }

  function onEditKey(e) {
    if (inUI(e)) return;
    // Stop the site's own shortcuts from firing while typing.
    e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finishEdit(); }
  }

  function endEditUI(ed) {
    for (const t of EDIT_KEYS) removeEventListener(t, onEditKey, true);
    if (ed.ce == null) ed.el.removeAttribute('contenteditable');
    else ed.el.setAttribute('contenteditable', ed.ce);
    ed.el.blur();
    getSelection()?.removeAllRanges();
    $('.panel').hidden = true;
    $('.panel').innerHTML = '';
    hideBox();
  }

  function cancelEdit() {
    const ed = editing;
    if (!ed) return;
    editing = null;
    endEditUI(ed);
    if (ed.el.innerHTML !== ed.before) ed.el.innerHTML = ed.before;
  }

  async function finishEdit() {
    const ed = editing;
    if (!ed) return;
    const text = ed.el.innerText.replace(/\n+$/, '');
    editing = null;
    endEditUI(ed);

    if (text === ed.beforeText) {
      if (ed.el.innerHTML !== ed.before) ed.el.innerHTML = ed.before;
      toast('No changes to save');
      return;
    }
    const rule = ed.existing
      ? { ...ed.existing, text }
      : { ...baseRule(ed.el, 'text', ed.selector, ed.fingerprint), text };
    const rec = { el: ed.el, original: ed.trueOriginal, lastTC: null, text: null };
    await saveRule(rule, 'Text saved', rec);
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  async function saveRule(rule, message, textRec) {
    if (!alive()) return toast('Veil was updated. Reload the page to keep using it.');
    const cur = (await chrome.storage.local.get(KEY))[KEY] || [];
    const snapshot = cur.slice();
    const list = cur.slice();
    let i = list.findIndex((r) => r.id === rule.id);
    if (i < 0) {
      i = list.findIndex((r) =>
        r.selector === rule.selector && r.action === rule.action && r.scope === rule.scope && r.frame === rule.frame &&
        (r.scope === 'site' || r.page === rule.page));
    }
    if (i >= 0) {
      rule = { ...list[i], ...rule, id: list[i].id };
      list[i] = rule;
    } else {
      list.push(rule);
    }
    if (textRec) textApplied.set(rule.id, textRec);
    rules = list;
    applyAll();
    await chrome.storage.local.set({ [KEY]: list });
    toast(message, async () => {
      await chrome.storage.local.set({ [KEY]: snapshot });
    });
    return rule.id;
  }

  function findElementForRule(r) {
    return queryFirst(r.selector) ||
      document.querySelector(`[${ATTR}~="${r.id}"]`) ||
      (textApplied.get(r.id)?.el?.isConnected ? textApplied.get(r.id).el : null) ||
      byFingerprint(r);
  }

  function locate(id) {
    const r = rules.find((x) => x.id === id);
    const el = r && findElementForRule(r);
    if (!el) return { found: false };
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return { found: true, visible: false };
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    ensureUI();
    setTimeout(() => {
      if (picking || panelTarget || editing) return;
      drawBox(el, 'flash');
      setTimeout(() => { if (!picking && !panelTarget && !editing) hideBox(); }, 1500);
    }, 450);
    return { found: true, visible: true };
  }

  // ---------------------------------------------------------------------------
  // Sensitive data mode: find amounts, emails, phone numbers and similar data
  // on the page and mask, blur or hide them. Stored under money:<host>.
  // ---------------------------------------------------------------------------
  const MKEY = `money:${HOST}`;
  const MONEY_DEFAULTS = { enabled: false, style: 'mask', bare: false, blur: 6, hoverReveal: false, excludes: [], types: ['money'], custom: [] };
  let money = { ...MONEY_DEFAULTS };
  let moneyRevealed = false;
  let moneyStyle = null;
  let moneyObserver = null;
  let moneyHL = null;
  let skipSel = '';
  let matcher = VeilDetect.compile(); // built from the configuration in startMoney
  let codeMatcher = matcher;          // the same, for text inside code elements
  const HAS_HL = typeof Highlight === 'function' && typeof CSS !== 'undefined' && !!CSS.highlights;
  const nodeRanges = new Map(); // Text node or Element -> Range[]
  const moneyEls = new Set();   // elements and inputs carrying data-veil-money
  const MATTR = 'data-veil-money';

  const { FULL_RE, PART_RE, WORDS: MONEY_WORDS, BARE_NUM_RE, PURE_BARE_RE } = VeilDetect.money;
  const BASE_SKIP = 'script,style,noscript,textarea,template,title,veil-money,#veil-ui-host,[contenteditable="plaintext-only"]';
  // Code often holds numbers and addresses that are not private, but it is
  // also where pages show API keys, so only the key detector runs there.
  const CODE_SEL = 'code,pre,kbd,samp';

  function normalizeMoney(v) {
    const m = { ...MONEY_DEFAULTS, ...(v || {}) };
    if (!['mask', 'blur', 'hide'].includes(m.style)) m.style = 'mask';
    if (!HAS_HL) m.style = 'blur';
    m.excludes = Array.isArray(m.excludes) ? m.excludes : [];
    m.types = Array.isArray(m.types) ? m.types.filter((t) => VeilDetect.TYPES.includes(t)) : ['money'];
    m.custom = Array.isArray(m.custom) ? m.custom : [];
    return m;
  }

  function buildMatchers() {
    // Exclusions made in a frame are { selector, frame }; plain strings belong to the top page.
    const ok = money.excludes
      .filter((x) => (typeof x === 'string' ? !IN_FRAME : x.frame === FRAME))
      .map((x) => x.selector ?? x)
      .filter(validSelector);
    skipSel = [BASE_SKIP, ...ok].join(',');
    matcher = VeilDetect.compile(money);
    codeMatcher = VeilDetect.compile({ types: money.types.filter((t) => t === 'key') });
  }

  function moneyCSS() {
    if (!money.enabled || moneyRevealed) return '';
    if (money.style === 'blur') {
      const b = Number(money.blur) || 6;
      const hover = money.hoverReveal ? `
veil-money:hover,[${MATTR}]:hover{filter:none!important}` : '';
      return `veil-money,[${MATTR}]{filter:blur(${b}px)!important;transition:filter .15s ease!important}
veil-money{display:inline-block!important}${hover}`;
    }
    const bg = money.style === 'mask' ? 'rgba(106,113,144,.6)' : 'transparent';
    const input = money.style === 'mask' ? '-webkit-text-security:disc!important' : 'color:transparent!important';
    return `::highlight(veil-money){color:transparent;background-color:${bg};text-shadow:none;text-decoration-color:transparent}
input[${MATTR}]{${input}}`;
  }

  function renderMoneyCSS() {
    if (!moneyStyle) {
      moneyStyle = document.createElement('style');
      moneyStyle.id = 'veil-money';
    }
    if (!moneyStyle.isConnected) (document.head || document.documentElement).appendChild(moneyStyle);
    moneyStyle.textContent = moneyCSS();
  }

  function addRanges(key, ranges) {
    const old = nodeRanges.get(key);
    if (old) old.forEach((r) => moneyHL.delete(r));
    nodeRanges.set(key, ranges);
    ranges.forEach((r) => moneyHL.add(r));
  }

  function clearKey(key) {
    const old = nodeRanges.get(key);
    if (!old) return;
    old.forEach((r) => moneyHL?.delete(r));
    nodeRanges.delete(key);
  }

  function markElement(el) {
    if (moneyEls.has(el)) return;
    moneyEls.add(el);
    el.setAttribute(MATTR, '');
    if (money.style !== 'blur' && moneyHL) {
      const r = document.createRange();
      r.selectNodeContents(el);
      addRanges(el, [r]);
    }
  }

  function unmarkElement(el) {
    moneyEls.delete(el);
    el.removeAttribute(MATTR);
    clearKey(el);
  }

  function labelHasMoney(inp) {
    const bits = [inp.getAttribute('aria-label'), inp.name, inp.id, inp.placeholder];
    try { for (const l of inp.labels || []) bits.push(l.textContent); } catch {}
    return MONEY_WORDS.test(bits.filter(Boolean).join(' ').replace(/[_-]/g, ' '));
  }

  function scanInput(inp) {
    const t = (inp.getAttribute('type') || 'text').toLowerCase();
    if (!['text', 'number', 'tel', 'search', 'email'].includes(t)) return;
    const v = String(inp.value || '').trim();
    const isMoney = !inp.closest(skipSel) && !!v && (
      (money.types.includes('money') && /^[-−]?\d[\d,.]*$/.test(v) && labelHasMoney(inp)) ||
      matcher.find(v).some(([s, e]) => s === 0 && e === v.length));
    if (isMoney && !moneyEls.has(inp)) { moneyEls.add(inp); inp.setAttribute(MATTR, ''); }
    else if (!isMoney && moneyEls.has(inp)) { moneyEls.delete(inp); inp.removeAttribute(MATTR); }
  }

  // A label right before the number, e.g. "Total: <b>1,240</b>" or
  // <td>Balance</td><td>5,000</td>. Only climbs while the number is the sole
  // element in its container, so a label in a neighbouring row never counts.
  function labelNearby(node) {
    let cur = node;
    for (let level = 0; level < 3 && cur; level++) {
      let sib = cur.previousSibling;
      for (let i = 0; i < 2 && sib; i++, sib = sib.previousSibling) {
        const t = sib.textContent || '';
        if (t.length <= 60 && MONEY_WORDS.test(t)) return true;
      }
      const parent = cur.parentElement;
      if (!parent || parent === document.body) return false;
      if (level > 0 && parent.childElementCount > 1) return false;
      if (level === 0) { cur = parent; continue; }
      cur = parent;
    }
    return false;
  }

  function bareSpans(node, text, spans) {
    const overlaps = (s, e) => spans.some(([a, b]) => s < b && e > a);
    let add = false;
    if (MONEY_WORDS.test(text)) add = true;
    else if (PURE_BARE_RE.test(text.trim())) add = labelNearby(node);
    if (!add) return;
    for (const m of text.matchAll(BARE_NUM_RE)) {
      const s = m.index, e = s + m[0].length;
      if (!overlaps(s, e)) spans.push([s, e]);
    }
    spans.sort((a, b) => a[0] - b[0]);
  }

  function scanText(node) {
    clearKey(node);
    const text = node.data;
    if (!text || text.length > 5000 || !matcher.test(text)) return;
    const parent = node.parentElement;
    if (!parent || parent.closest(skipSel)) return;
    const inCode = !!parent.closest(CODE_SEL);
    if (inCode && !codeMatcher.test(text)) return;

    const marked = parent.closest(`[${MATTR}]`);
    if (marked) {
      if (FULL_RE.test(norm(marked.textContent))) return;
      unmarkElement(marked);
    }

    const spans = (inCode ? codeMatcher : matcher).find(text);
    if (!inCode && money.bare && money.types.includes('money')) bareSpans(node, text, spans);

    if (spans.length) {
      if (money.style === 'blur') {
        for (let i = spans.length - 1; i >= 0; i--) {
          const r = document.createRange();
          r.setStart(node, spans[i][0]);
          r.setEnd(node, spans[i][1]);
          try { r.surroundContents(document.createElement('veil-money')); } catch {}
        }
      } else {
        addRanges(node, spans.map(([s, e]) => {
          const r = document.createRange();
          r.setStart(node, s);
          r.setEnd(node, e);
          return r;
        }));
      }
      return;
    }

    // Amount split across elements, e.g. <span>$</span><span>1,240</span>
    if (!inCode && money.types.includes('money') && PART_RE.test(text.trim())) {
      let el = parent;
      for (let i = 0; i < 3 && el && el !== document.body && el !== document.documentElement; i++, el = el.parentElement) {
        const t = norm(el.textContent);
        if (t.length > 40) break;
        if (FULL_RE.test(t)) { markElement(el); break; }
      }
    }
  }

  function scanTree(root) {
    if (!root) return;
    if (root.nodeType === 3) return scanText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (root.closest(skipSel)) return;
      if (root.tagName === 'INPUT') return scanInput(root);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (matcher.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(scanText);
    root.querySelectorAll?.('input').forEach(scanInput);
  }

  let pruneTimer = null;
  function schedulePrune() {
    if (pruneTimer) return;
    pruneTimer = setTimeout(() => {
      pruneTimer = null;
      for (const key of nodeRanges.keys()) if (!key.isConnected) clearKey(key);
      for (const el of moneyEls) if (!el.isConnected) moneyEls.delete(el);
    }, 1000);
  }

  function onMoneyMutations(records) {
    if (!money.enabled) return;
    for (const rec of records) {
      if (rec.type === 'characterData') {
        if (rec.target.nodeType === 3) scanText(rec.target);
      } else {
        rec.addedNodes.forEach(scanTree);
        if (rec.removedNodes.length) schedulePrune();
        // A changed child can turn a split amount's container into or out of money.
        const mk = rec.target.nodeType === 1 ? rec.target.closest(`[${MATTR}]`) : null;
        if (mk && mk.tagName !== 'INPUT' && !FULL_RE.test(norm(mk.textContent))) unmarkElement(mk);
      }
    }
  }

  function onMoneyInput(e) {
    const t = e.composedPath()[0];
    if (t && t.tagName === 'INPUT') scanInput(t);
  }

  function stopMoney() {
    moneyObserver?.disconnect();
    removeEventListener('input', onMoneyInput, true);
    removeEventListener('change', onMoneyInput, true);
    moneyHL?.clear();
    if (HAS_HL) CSS.highlights.delete('veil-money');
    moneyHL = null;
    nodeRanges.clear();
    for (const el of moneyEls) el.removeAttribute(MATTR);
    moneyEls.clear();
    for (const w of document.querySelectorAll('veil-money')) w.replaceWith(...w.childNodes);
    if (moneyStyle) moneyStyle.textContent = '';
  }

  function fullMoneyScan() {
    if (money.enabled && !paused && !matcher.empty) scanTree(document.body || document.documentElement);
  }

  function startMoney() {
    stopMoney();
    if (!money.enabled || paused) return;
    buildMatchers();
    if (matcher.empty) return;
    if (HAS_HL && money.style !== 'blur') {
      moneyHL = new Highlight();
      CSS.highlights.set('veil-money', moneyHL);
    }
    renderMoneyCSS();
    fullMoneyScan();
    if (!moneyObserver) moneyObserver = new MutationObserver(onMoneyMutations);
    moneyObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    addEventListener('input', onMoneyInput, true);
    addEventListener('change', onMoneyInput, true);
  }

  function toggleMoneyReveal() {
    if (!money.enabled) {
      ensureUI();
      toast('Sensitive data hiding is off on this site. Turn it on from the Veil popup.');
      return;
    }
    moneyRevealed = !moneyRevealed;
    renderMoneyCSS();
    ensureUI();
    toast(moneyRevealed ? 'Hidden data shown. Press the shortcut again to hide it.' : 'Data hidden again');
  }

  async function keepAmountVisible(el) {
    const sel = buildSelector(el);
    const entry = IN_FRAME ? { selector: sel, frame: FRAME } : sel;
    const cur = normalizeMoney((await chrome.storage.local.get(MKEY))[MKEY]);
    const before = cur.excludes.slice();
    if (!cur.excludes.some((x) => JSON.stringify(x) === JSON.stringify(entry))) cur.excludes.push(entry);
    await chrome.storage.local.set({ [MKEY]: cur });
    toast('This will always stay visible', async () => {
      const now = normalizeMoney((await chrome.storage.local.get(MKEY))[MKEY]);
      now.excludes = before;
      await chrome.storage.local.set({ [MKEY]: now });
    });
  }

  addEventListener('DOMContentLoaded', fullMoneyScan);
  addEventListener('load', fullMoneyScan);

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    switch (msg?.type) {
      case 'veil:ping':
        reply(true);
        break;
      case 'veil:pick':
        startPicker();
        reply(true);
        break;
      case 'veil:pickContext':
        if (lastContextTarget?.isConnected && lastContextTarget !== document.documentElement) openPanel(lastContextTarget);
        else startPicker();
        reply(true);
        break;
      case 'veil:stopPick':
        stopPicker(false);
        break;
      case 'veil:navigated':
        if (IN_FRAME) { setTopPage(msg.url); applyAll(); }
        break;
      case 'veil:locate': {
        // Only the frame that owns the rule answers. The top frame answers
        // last, in case no frame on this page owns it.
        const r = rules.find((x) => x.id === msg.id);
        if (!r || r.frame === FRAME) reply(locate(msg.id));
        else if (!IN_FRAME) { setTimeout(() => reply({ found: false }), 500); return true; }
        break;
      }
      case 'veil:moneyReveal':
        toggleMoneyReveal();
        reply(true);
        break;
    }
  });

  addEventListener('contextmenu', (e) => {
    if (picking || inUI(e)) return;
    const t = e.composedPath()[0];
    lastContextTarget = t && t.nodeType === 1 ? t : e.target;
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let dirty = false;
    if (KEY in changes) { rules = changes[KEY].newValue || []; dirty = true; }
    if ('paused' in changes) { paused = !!changes.paused.newValue; dirty = true; startMoney(); }
    if ('defaultScope' in changes) defaultScope = changes.defaultScope.newValue || 'page';
    if (MKEY in changes) {
      money = normalizeMoney(changes[MKEY].newValue);
      if (!money.enabled) moneyRevealed = false;
      startMoney();
    }
    if (dirty) applyAll();
  });

  Promise.all([
    chrome.storage.local.get([KEY, MKEY, 'paused', 'defaultScope']),
    IN_FRAME && chrome.runtime.sendMessage({ type: 'veil:topUrl' }).then(setTopPage).catch(() => {}),
  ]).then(([d]) => {
    rules = d[KEY] || [];
    paused = !!d.paused;
    defaultScope = d.defaultScope || 'page';
    money = normalizeMoney(d[MKEY]);
    applyAll();
    if (money.enabled) startMoney();
  });

  const pageObserver = new MutationObserver(schedule);
  pageObserver.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
  });
  addEventListener('popstate', schedule);
  addEventListener('DOMContentLoaded', schedule);

  document.addEventListener('veil:takeover', () => {
    cancelEdit();
    closePanel();
    stopPicker();
    paused = true;
    applyDom(); // restores replaced text and removes fallback markers
    stopMoney();
    pageObserver.disconnect();
    clearTimeout(timer);
    removeEventListener('popstate', schedule);
    removeEventListener('DOMContentLoaded', schedule);
    for (const el of [styleEl, staticStyle, moneyStyle, host]) el?.remove();
  }, { once: true });
})();
