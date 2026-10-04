// Veil service worker: context menu, keyboard shortcuts, toolbar badge.
const MENU_ID = 'veil-element';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: 'Veil this element', contexts: ['all'] });
  });
  // Open tabs keep the old content script after an update, and it can no
  // longer reach the extension. A fresh copy takes over from it.
  // Tabs that Veil cannot access reject the call, so errors are ignored.
  for (const tab of await chrome.tabs.query({})) {
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['detect.js', 'content.js'] }).catch(() => {});
  }
});

// Tabs opened before install have no content script yet, so inject on demand.
// Without a frameId, every frame in the tab gets the message.
async function sendToTab(tabId, msg, options) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg, options);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['detect.js', 'content.js'] });
      return await chrome.tabs.sendMessage(tabId, msg, options);
    } catch (err) {
      console.warn('Veil cannot run on this tab:', err);
      return null;
    }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id != null) {
    sendToTab(tab.id, { type: 'veil:pickContext' }, { frameId: info.frameId });
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'start-picker') {
    if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) sendToTab(tab.id, { type: 'veil:pick' });
  } else if (command === 'toggle-money-reveal') {
    if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) sendToTab(tab.id, { type: 'veil:moneyReveal' });
  } else if (command === 'toggle-pause') {
    const { paused } = await chrome.storage.local.get('paused');
    await chrome.storage.local.set({ paused: !paused });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Frames can't read the top page's address, so they ask for it here.
  if (msg?.type === 'veil:topUrl') reply(sender.tab?.url);
  // Pass on to every frame: a stopped picker, or in-app navigation in the top page.
  if ((msg?.type === 'veil:stopPick' || msg?.type === 'veil:navigated') && sender.tab?.id != null) {
    chrome.tabs.sendMessage(sender.tab.id, msg).catch(() => {});
  }
  if (msg?.type === 'veil:count' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    chrome.action.setBadgeText({ tabId, text: msg.n ? String(msg.n) : '' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#0F766E' }).catch(() => {});
    chrome.action.setBadgeTextColor?.({ tabId, color: '#FFFFFF' })?.catch?.(() => {});
  }
});
