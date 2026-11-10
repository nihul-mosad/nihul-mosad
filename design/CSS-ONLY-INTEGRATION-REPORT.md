# AURA CSS-only integration candidate — 2026-11-10

Branch: `design/aura-css-only-main-2026-11-10`.
Baseline: `bf023ad9dcc3145c8d50aeb6043f242e2153fb9e` (main, verified against remote again after validation).
Approved design source: `603eb2356852b03e5f39028e785da904e54f3ad7` on `design-aura-3-students-design`, preserved separately.

## Scope and source integrity

The only runtime change is one `<style id="aura-css-only">` appended to the head of `index.html`. Removing this block reproduces the baseline file byte for byte. Original HTML, scripts, rendering functions, calculations, permissions, Firebase configuration, service worker, and existing styles are unchanged. Run `python3 design/verify-css-only.py` from any directory to check this invariant.

The layer carries AURA colors, fine borders, spacing, responsive typography and embedded Heebo (OFL license included) onto existing main screens. Navigation icons use CSS masks while preserving original labels and handlers. Theme follows the operating system using CSS; no new theme-switching JavaScript is included. The layer is screen-only, preserving original print styles.

Coverage includes all 17 administrator tabs: dashboard, student review, students, mapping, attendance, events, grades, schedule, duty, tasks, meetings, day log, assistant, reports, analytics, staff and settings. Existing student cards and attendance subviews are also styled.

## Explicit exclusions

The experimental student analytics markup, additional event overview widgets, replacement dashboard/navigation rendering and manual theme-switching controls require HTML or JavaScript changes. They are excluded. This is an adaptation of the approved visual language to current main, not an exact transfer of every experimental demo screen. No production logic fixes from prior design handoffs were attempted.

## Validation

All browser work used the repository safety-net staging build, fake Firebase and fake student records. External requests were blocked. No production Firebase, deployment, remote write or real records were used.

- Baseline: 41/41 existing automated tests passed.
- Final styled build: 41/41 existing automated tests passed, including save flows, permissions, mapping, student summaries and cards.
- Baseline versus styled browser comparison: 592 total cases, 296 styled cases; roles administrator, homeroom teacher and subject teacher; widths 1440, 1024, 390 and 320; native light and dark themes. All available tabs were visited per role. Zero differences in main text or control signatures, zero styled page-width overflows, zero JavaScript errors. Mobile drawer navigation was exercised.
- Additional 30 styled detail states: existing student card, daily attendance, attendance gaps, event cards and open mapping form at 1440/390/320 in both themes. No page overflow or script errors. Mapping form remained accessible.
- Print isolation checked at all six detail viewport/theme combinations. The inserted style layer only applies to screen media.
- Representative desktop and mobile screenshots inspected. Screenshots and raw audit data are retained in the current workspace under `/tmp/aura-css-integration/` (temporary artifacts, not durable repository files).

These checks reduce regression risk; text/control equality alone does not prove every interactive state or browser is visually perfect. Validation used Chromium and seeded fixtures; empty/error/loading states and every possible production data length were not exhaustively reviewed.

## Release review

No push, merge, PR or deployment is part of this work. The original experimental branch remains intact. Review this candidate against the stated main SHA. If Claude advances main, reapply only this CSS block to that new source and repeat integrity and isolated regression checks before publishing. Do not merge the experimental branch wholesale: it includes separately developed rendering changes.

The service worker and cache version were deliberately unchanged. A future deployment should verify first load and refresh on an already-installed client as well as a fresh browser. Existing native print behavior is retained.

Rollback: remove the single `aura-css-only` style block (or revert this candidate commit). No data migration is involved.
