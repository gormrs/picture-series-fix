const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createHash } = require('node:crypto');
const { readFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = readFileSync(path.join(__dirname, 'fixtures/article.html'), 'utf8');
const id = [...createHash('sha256').update(root).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
let context, page, popup;
let html = fixture;
const errors = [];
before(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--lang=en-US'],
  });
  await context.route(/^https?:\/\//, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/image.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#658b80"/></svg>' });
    if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
});
after(async () => { await context?.close(); });
async function load(body = fixture, url = 'https://www.nrk.no/test-story') {
  html = body;
  await page.goto(url);
  await page.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  // An extension popup normally leaves its article tab active. A full-page popup
  // opened for automation must explicitly restore that tab before re-initializing.
  await page.bringToFront();
  await popup.evaluate(async articleURL => {
    // Navigating to popup.html does not simulate the toolbar's activeTab grant.
    // Supply only that URL metadata; tab lookup and runtime messaging remain real.
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async options => (await query(options)).map(tab => ({ ...tab, url: articleURL }));
    await initialize();
  }, url);
  await popup.waitForFunction(() => !document.getElementById('status').textContent.includes('Checking'));
}
async function open() {
  await popup.locator('#modify-button').click();
  await page.locator('#picture-series-reader dialog').waitFor({ state: 'visible' });
}
const reader = () => page.locator('#picture-series-reader');

test('real extension converts in order, preserves semantics and restores original controls', async () => {
  await load();
  assert.equal(await popup.locator('#modify-button').isEnabled(), true);
  await open();
  assert.equal(await reader().locator('h1').textContent(), 'A journey north');
  assert.equal(await reader().locator('img').getAttribute('alt'), 'A coastal landscape');
  assert.equal(await reader().locator('video').getAttribute('controls'), '');
  assert.equal(await reader().locator('strong').textContent(), 'emphasis');
  assert.equal(await reader().locator('a').first().getAttribute('href'), 'https://www.nrk.no/source');
  assert.equal(await reader().locator('a').nth(1).getAttribute('href'), null);
  assert.equal(await reader().locator('script').count(), 0);
  const text = await reader().locator('article').textContent();
  assert.ok(text.includes('Photographer'));
  assert.ok(text.indexOf('First paragraph') < text.indexOf('Second paragraph'));
  assert.ok(text.indexOf('Second paragraph') < text.indexOf('Third paragraph'));
  await popup.locator('#modify-button').click();
  assert.equal(await page.locator('#picture-series-reader').count(), 1);
  mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/reader-desktop.png') });
  await popup.screenshot({ path: path.join(root, 'test-results/popup.png') });
  await reader().getByRole('button', { name: 'Back to original' }).click();
  await page.locator('#original-button').click();
  assert.equal(await page.locator('#original-button').textContent(), 'Still working');
  await open();
  await page.keyboard.press('Escape');
  await reader().waitFor({ state: 'detached' });
});

test('nested content wrappers preserve titles and media without duplicating text', async () => {
  await load('<div class="dhks__content">' + fixture + '</div>');
  await open();
  assert.equal(await reader().locator('h1').count(), 1);
  assert.equal(await reader().locator('img').count(), 1);
  assert.equal((await reader().locator('article').textContent()).split('First paragraph').length - 1, 1);
});

test('text-only stories and missing video sources never block conversion', async () => {
  await load('<div class="dhks__card"><div class="dhks__text">Text without an image</div></div><div class="dhks__background"><video></video></div>');
  await open();
  assert.match(await reader().textContent(), /Text without an image/);
  assert.equal(await reader().locator('video').count(), 0);
});

test('failed images produce feedback without losing article text', async () => {
  await load('<div class="dhks__background"><img src="/missing.jpg"></div><div class="dhks__card"><p class="dhks__text">Still readable</p></div>');
  await open();
  await reader().locator('figcaption').waitFor();
  assert.match(await reader().textContent(), /Still readable/);
});

test('unsupported NRK pages and other sites remain untouched', async () => {
  await load('<h1>Regular article</h1>');
  assert.equal(await popup.locator('#modify-button').isDisabled(), true);
  assert.match(await popup.locator('#status').textContent(), /No supported picture series/);
  assert.equal(await reader().count(), 0);
  await load(fixture, 'https://example.com/');
  assert.equal(await popup.locator('#modify-button').isDisabled(), true);
  assert.match(await popup.locator('#status').textContent(), /Open an NRK picture series/);
});

test('narrow reader fits viewport and keeps close control keyboard-accessible', async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  await load();
  await open();
  assert.equal(await reader().locator('dialog').evaluate(d => d.scrollWidth <= d.clientWidth), true);
  assert.equal(await reader().getByRole('button').evaluate(b => b.getRootNode().activeElement === b), true);
  await page.screenshot({ path: path.join(root, 'test-results/reader-mobile.png') });
  assert.deepEqual(errors, []);
});
