// Loads the Rust/WebAssembly reader (pkg/, built from reader/) and relays popup
// messages to it. Localized strings stay here so chrome.i18n remains in JS.
(() => {
  'use strict';
  const t = key => chrome.i18n.getMessage(key);
  // Load the module only when the popup asks, not on every NRK page.
  let ready;
  const load = () => (ready ??= wasm_bindgen({ module_or_path: chrome.runtime.getURL('pkg/reader_bg.wasm') }));
  const handlers = {
    reader_status: () => wasm_bindgen.readerStatus(),
    modify_article: () => wasm_bindgen.openReader(t('closeReader'), t('readerTitle'), t('mediaUnavailable')),
  };

  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    const handler = handlers[request.message];
    if (!handler) return false;
    load().then(handler)
      .catch(() => request.message === 'reader_status' ? { ok: false, supported: false } : { ok: false, error: 'conversionFailed' })
      .then(respond);
    return true; // respond asynchronously once the module has loaded
  });
})();
