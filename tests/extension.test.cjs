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
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#658b80"/></svg>';
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
    const type = route.request().resourceType();
    if (type === 'document') return route.fulfill({ contentType: 'text/html', body: html });
    if (type === 'image' && !url.pathname.includes('missing')) return route.fulfill({ contentType: 'image/svg+xml', body: svg });
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
// Playwright locators pierce the open shadow root; the host's own textContent is empty.
const reader = () => page.locator('#picture-series-reader');
const articleText = () => reader().locator('article').textContent();

test('real NRK markup converts in document order with semantics and responsive media', async () => {
  await load();
  assert.equal(await popup.locator('#modify-button').isEnabled(), true);
  await open();
  assert.equal(await reader().locator('h1').textContent(), 'A journey north');
  assert.equal(await reader().locator('.lead').textContent(), 'A quiet story about the coast.');
  assert.equal(await reader().locator('.byline').textContent(), 'Alex Example (Photographer), Sam Sample (Editor) · Publisert: 03.11.2026');
  // Three lazy <picture> backgrounds without img src, one video, one empty spacer.
  assert.equal(await reader().locator('figure:has(picture)').count(), 3);
  assert.equal(await reader().locator('picture source').count(), 6);
  assert.equal(await reader().locator('img').first().getAttribute('alt'), 'A coastal landscape');
  assert.equal(await reader().locator('video').getAttribute('controls'), '');
  assert.equal(await reader().locator('strong').textContent(), 'emphasis');
  assert.equal(await reader().locator('a').first().getAttribute('href'), 'https://www.nrk.no/source');
  assert.equal(await reader().locator('a').nth(1).getAttribute('href'), null);
  assert.equal(await reader().locator('script, button:not(header button)').count(), 0);
  assert.equal(await reader().locator('.quote blockquote').textContent(), '«Forever owned is only what is lost»');
  assert.equal(await reader().locator('.quote figcaption').textContent(), '— Henrik Ibsen');
  assert.deepEqual(await reader().locator('section div').allTextContents(), ['Block one', 'Block two']);
  const text = await articleText();
  const order = ['An intro', 'A journey north', 'First paragraph', 'Second paragraph', 'Block two', 'Forever owned', 'Third paragraph'];
  order.reduce((last, phrase) => { const at = text.indexOf(phrase); assert.ok(at > last, phrase); return at; }, -1);
  assert.doesNotMatch(text, /Ansvarlig redaktør|Kopier lenke/);
  await popup.locator('#modify-button').click();
  assert.equal(await page.locator('#picture-series-reader').count(), 1);
  mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/reader-desktop.png') });
  await popup.screenshot({ path: path.join(root, 'test-results/popup.png') });
  await reader().getByRole('button', { name: 'Back to original' }).click();
  await reader().waitFor({ state: 'detached' });
  await page.locator('#original-button').click();
  assert.equal(await page.locator('#original-button').textContent(), 'Still working');
  await open();
  await page.keyboard.press('Escape');
  await reader().waitFor({ state: 'detached' });
});

test('lazy images load as the reader scrolls, even though the original never loaded them', async () => {
  await load();
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.dhks__background img')].filter(i => i.currentSrc).length < 3), true);
  await open();
  const images = reader().locator('img');
  assert.equal(await images.count(), 3);
  for (let i = 0; i < await images.count(); i++) await images.nth(i).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelector('#picture-series-reader').shadowRoot.querySelectorAll('img')]
    .every(img => img.complete && img.naturalWidth > 0));
});

test('text-only stories and missing video sources never block conversion', async () => {
  await load('<div class="dhks__card dhks__text-card"><div class="dhks__text">Text without an image</div></div><div class="dhks__background"><video></video></div>');
  await open();
  assert.match(await articleText(), /Text without an image/);
  assert.equal(await reader().locator('video, figure').count(), 0);
});

test('failed images produce feedback without losing article text', async () => {
  await load('<div class="dhks__background"><picture><source srcset="https://gfx.nrk.no/missing-1 1280w"><img alt=""></picture></div><div class="dhks__card"><div class="dhks__text"><p>Still readable</p></div></div>');
  await open();
  await reader().locator('figcaption').waitFor();
  assert.match(await articleText(), /Still readable/);
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

test('narrow reader fits viewport, uses portrait crops and keeps close control keyboard-accessible', async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  await load();
  await open();
  assert.equal(await reader().locator('dialog').evaluate(d => d.scrollWidth <= d.clientWidth), true);
  assert.equal(await reader().getByRole('button').evaluate(b => b.getRootNode().activeElement === b), true);
  await reader().locator('img').first().evaluate(img => img.decode());
  assert.match(await reader().locator('img').first().evaluate(img => img.currentSrc), /one-portrait/);
  await page.screenshot({ path: path.join(root, 'test-results/reader-mobile.png') });
  assert.deepEqual(errors, []);
});
