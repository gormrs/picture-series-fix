# PicArticleFix 1.0

A small Chrome extension that turns NRK picture series into a readable, scrollable
article. Open the extension on a supported story and choose **Open reader view**.
Return with **Back to original** or **Escape**.

## What's new

- Reversible reader: the original document and its event handlers stay in place.
- Responsive typography, semantic text, accessible controls and isolated styling.
- Images and videos load independently; missing media never stalls conversion.
- Preserves headings, bylines, paragraphs, emphasis and safe HTTP(S) links.
- English and Norwegian popup, reader controls and error messages.
- No account, analytics, remote scripts or external branding requests.

Reader media loads from the article's own URLs. The original page remains running
underneath the reader, so this is not an ad blocker or a privacy isolation tool.

## Install locally

1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Open an NRK picture series, then click the extension icon.

After updating the files, reload the extension and refresh any already-open NRK
pages. There is no build step and no runtime npm dependency.

The previous published version is available in the
[Chrome Web Store](https://chrome.google.com/webstore/detail/picarticlefix/kgkaabedglfpocbpickbflcoejmmbeak).
This repository's v1 changes have not been published there.

## Supported stories

The extractor supports NRK's `dhks__` picture-series markup, including nested
content containers, image/video backgrounds and text-only cards. It reads blocks
in document order. It does not infer visual ordering from absolute positioning or
support every NRK article format. Unsupported pages are left untouched.

Historical examples (current live markup has not been verified for this release):

- https://www.nrk.no/norge/ibsens-skjulte-skattekammer-1.16329018
- https://www.nrk.no/osloogviken/sunshine-effekten-1.16329137

## Development and verification

Requires Node.js 20 or newer. Install development dependencies and Chromium:

```sh
npm ci
npm run test:install
npm run check
npm test
```

`npm run test:unit` checks popup behavior, resource references and localization
without a browser. `npm run test:browser` runs Playwright with the real unpacked
extension in a persistent Chromium context. Fixtures are routed to NRK URLs,
so browser tests do not require live NRK access. The popup harness supplies the
URL metadata normally granted by clicking the toolbar's `activeTab` action;
content-script injection and messaging use real Chrome extension APIs.

The browser suite covers conversion, nested content, safe links, repeat opening,
restoration, missing media, unsupported sites, keyboard focus and narrow layouts.
Screenshots are written to `test-results/` after successful browser checks.
An existing compatible Chromium executable can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

The implementation follows Playwright's
[unpacked extension testing guidance](https://playwright.dev/docs/chrome-extensions).
Run a live NRK smoke test before publishing: check text/media order against the
original, open and close the reader, and verify both historical example stories.

## Permissions and structure

`activeTab` lets the popup communicate with the tab selected by the user.
The content script is limited to HTTP(S) NRK pages. No background service worker,
storage permission or access to other sites is required.

- `content.js`: extraction, safe rendering and reader lifecycle.
- `popup.html`, `popup.css`, `popup.js`: localized controls and status feedback.
- `_locales/`: English and Norwegian messages.
- `tests/`: deterministic fixtures and automated checks.

Original icon credit: Yllnor13.
