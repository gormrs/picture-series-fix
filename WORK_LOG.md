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

## Validation results

- JavaScript syntax checks and `git diff --check`: passed.
- Three automated unit tests: passed (host validation, popup success/error recovery,
  missing content script feedback, manifest resources and translation coverage).
- Additional local DOM smoke checks using an already-cached jsdom installation:
  normal, nested, text-only and unsupported stories passed, including safe links,
  deduplication and close/reopen behavior. These are not browser verification.
- Playwright launch attempted with cached Playwright 1.63.0 and installed Chromium
  149 (revision 1224). The sandbox killed Chromium before tests could execute:
  `setsockopt: Operation not permitted`, followed by SIGTRAP. No browser test pass
  or visual screenshot review is claimed. Standard setup installs Playwright's
  matching browser; the cached executable override was used only in this session.
- Live NRK HTTP access failed DNS resolution. Historical article text was readable
  through web search, but current live DOM compatibility remains unverified.

Review found nested content wrappers could swallow media/headings; a separate fix
commit and a browser regression case cover this layout. The full browser suite
must still run in a session that permits Chromium processes before release.
