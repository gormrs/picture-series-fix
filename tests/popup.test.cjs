const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const code = readFileSync(path.join(root, 'popup.js'), 'utf8');
const english = JSON.parse(readFileSync(path.join(root, '_locales/en/messages.json')));

async function popup(url, reply, failure = false) {
  let click;
  const button = { disabled: true, addEventListener: (type, callback) => { click = callback; } };
  const status = { textContent: '' };
  const calls = [];
  const context = vm.createContext({
    URL,
    document: { documentElement: {}, querySelectorAll: () => [], getElementById: id => id === 'status' ? status : button },
    chrome: {
      i18n: { getMessage: key => english[key]?.message || '', getUILanguage: () => 'en' },
      tabs: {
        query: async () => [{ id: 42, url }],
        sendMessage: async (id, request) => {
          calls.push({ id, request });
          if (failure) throw new Error('No receiver');
          return request.message === 'reader_status' ? { supported: true, state: 'closed' } : reply;
        },
      },
    },
  });
  vm.runInContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  return { button, status, calls, click };
}

test('popup only enables conversion on exact NRK hosts and subdomains', async () => {
  for (const url of ['https://nrk.no/a', 'https://www.nrk.no/a']) {
    const view = await popup(url, { ok: true });
    assert.equal(view.button.disabled, false);
    await view.click();
    assert.equal(view.status.textContent, english.readerOpened.message);
    assert.equal(view.calls.at(-1).id, 42);
  }
  for (const url of ['https://nrk.no.evil.example/', 'https://notnrk.no/', 'chrome://extensions/', undefined]) {
    const view = await popup(url);
    assert.equal(view.button.disabled, true);
    assert.equal(view.calls.length, 0);
    assert.equal(view.status.textContent, english.unsupportedSite.message);
  }
});

test('popup recovers from conversion errors and explains missing content scripts', async () => {
  const view = await popup('https://www.nrk.no/a', { ok: false, error: 'conversionFailed' });
  await view.click();
  assert.equal(view.button.disabled, false);
  assert.equal(view.status.textContent, english.conversionFailed.message);
  const missing = await popup('https://www.nrk.no/a', undefined, true);
  assert.equal(missing.button.disabled, true);
  assert.equal(missing.status.textContent, english.reloadPage.message);
});

test('manifest resources exist and both locales cover all UI messages', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.version, '1.0.0');
  for (const file of [manifest.action.default_popup, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon), ...manifest.content_scripts.flatMap(s => s.js)]) {
    assert.ok(readFileSync(path.join(root, file)).length);
  }
  const norwegian = JSON.parse(readFileSync(path.join(root, '_locales/no/messages.json')));
  assert.deepEqual(Object.keys(english).sort(), Object.keys(norwegian).sort());
  const source = code + readFileSync(path.join(root, 'content.js'), 'utf8');
  const keys = [...source.matchAll(/\b(?:t|show|message)\('([^']+)'\)/g)].map(match => match[1]);
  const markup = readFileSync(path.join(root, 'popup.html'), 'utf8');
  keys.push(...[...markup.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1]));
  for (const key of keys) { assert.ok(english[key]?.message, key); assert.ok(norwegian[key]?.message, key); }
});
