# VaiPizza — Mobile/PWA Readiness Implementation Plan

**Scope:** Customer install affordance and courier iPhone viewport stabilization. Production remains untouched; work stays on `feat/pre-production-readiness` until CI and staging QA are green.

## Customer install affordance

- Add a reusable install component that captures `beforeinstallprompt` on supported Chromium browsers.
- Hide the control when already running in standalone mode.
- On iOS/iPadOS Safari, show a compact instruction sheet for Partilhar → Adicionar ao ecrã principal.
- Render it in the cinema home navigation and the normal customer top bar.
- Keep the PWA manifest unchanged because it is already configured as `standalone`.

## Courier iPhone viewport

- Normalize document/body/app shell around `100dvh` with a `100vh` fallback.
- Apply safe-area top/bottom insets consistently.
- Avoid competing root/body scroll and active-delivery inner viewport jumps.
- Keep the action dock in normal grid flow instead of fixed positioning.
- Preserve Android and desktop layouts.

## Verification

- Extend branch CI to build Customer and Courier workspaces in addition to API/Admin/Restaurant.
- Require all API tests and all five affected builds to pass before staging promotion.
- Manual iPhone Safari + installed-PWA QA happens only after the branch is promoted to staging.
