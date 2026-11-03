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
