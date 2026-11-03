# Version 1 overhaul

Scope: retain NRK picture-series conversion while making it reversible, accessible,
responsive, localized, and resilient to missing or failed media. No backend or build
step. Support the existing `dhks__` markup; unknown layouts fail without changing the page.

Incremental commits:
1. Clean up Manifest V3 configuration and establish the v1 scope.
2. Replace destructive conversion with an isolated, reversible reader.
3. Add a localized popup with actionable status and error feedback.
4. Add and run Playwright tests against the unpacked extension, then document release usage.

Validation: Chromium persistent context with the actual unpacked extension and
local NRK-shaped fixtures routed to NRK URLs. Cover conversion, document order,
missing/broken media, safe links, restoration, repeated actions, and popup states.
Live NRK checks are separate from deterministic fixture coverage.

## Validation results (2026-11-03)

- Browser suite now runs: 6/6 Playwright tests pass with the real unpacked extension
  (Chromium, headless), stable across repeated runs; 3/3 unit tests pass.
- The earlier session's two "pending" browser tests were broken: they read
  `textContent` from the shadow host, which is always empty.
- Live NRK check of both historical stories passed: every background produced a
  figure and every image loaded after scrolling (Ibsen 40/40, Sunshine 19/19), with
  quote attribution and a single byline.
- Regression found and fixed: NRK background `<img>`s have no `src` in the HTML; the
  URLs live in `<picture><source srcset>` and are filled lazily by the original page.
  Reading `currentSrc` only worked for images Chrome happened to have loaded (Sunshine
  lost 15 of 19). The reader now rebuilds the responsive `<picture>`.
- The fixture was replaced with markup trimmed from the live pages; the new figure
  count and lazy-load tests fail against the previous `content.js`.
- Not verified: video backgrounds (neither reference story contains video).
