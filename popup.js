'use strict';
const t = key => chrome.i18n.getMessage(key);
document.documentElement.lang = chrome.i18n.getUILanguage();
document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
const button = document.getElementById('modify-button');
const status = document.getElementById('status');
let tabId;
function show(key) { status.textContent = t(key); }

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab?.url || 'about:blank');
    if (!['http:', 'https:'].includes(url.protocol) || !(url.hostname === 'nrk.no' || url.hostname.endsWith('.nrk.no'))) {
      show('unsupportedSite'); return;
    }
    tabId = tab.id;
    const result = await chrome.tabs.sendMessage(tabId, { message: 'reader_status' });
    if (!result?.supported) { show('unsupportedArticle'); return; }
    button.disabled = false;
    show(result.state === 'open' ? 'readerOpened' : 'ready');
  } catch { show('reloadPage'); }
}
button.addEventListener('click', async () => {
  button.disabled = true;
  show('converting');
  try {
    const result = await chrome.tabs.sendMessage(tabId, { message: 'modify_article' });
    show(result?.ok ? 'readerOpened' : result?.error || 'conversionFailed');
  } catch { show('reloadPage'); }
  finally { button.disabled = false; }
});
initialize();
