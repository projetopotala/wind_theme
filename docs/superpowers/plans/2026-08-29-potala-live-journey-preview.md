# Potala Live Journey Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a living, scroll-controlled Potala preview with canonical portal navigation and isolated legacy compatibility.

**Architecture:** The scroll controller exclusively drives video journey time and checkpoints. A separate Three.js effect owns ambient time and only reads progress through a ref. Canonical routes remain the public contract; build/Worker infrastructure privately publishes and resolves only mapped legacy pages until React destinations exist.

**Tech Stack:** React 19, TypeScript, Vinext/Vite, Cloudflare Worker, Three.js r185, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-29-potala-live-journey-preview-design.md`

## Global Constraints

- Do not alter `main`, `outputs/`, public Home behavior, or the video scrub contract.
- Do not commit, push, deploy, or introduce a second server/application.
- Journey visual components/data use canonical URLs only; they must not mention physical legacy paths or the private legacy namespace.
- React route takes precedence over compatibility; preserve query strings including `from=journey`.
- Do not copy whole `outputs/`; emit only declared legacy pages and their declared local dependencies.
- Never call `video.play()` for environmental motion and never set React state inside the ambient frame loop.

---

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `features/potala-journey/types/journey.ts` | modify | Portal, focus range, ambient profile types |
| `features/potala-journey/data/journey-content.ts` | modify | Compact canonical portal data, silence, secondary associations |
| `features/potala-journey/data/journey-timeline.ts` | modify | Normalized primary/transition/final zones |
| `features/potala-journey/lib/ambient-profile.ts` | create | Pure automatic quality profile selection |
| `features/potala-journey/lib/ambient-motion.ts` | create | Pure wind/mist/light calculations with separate ambient time |
| `features/potala-journey/lib/journey-navigation.ts` | create | Pure progress-to-scroll and canonical origin URL helpers |
| `features/potala-journey/components/ThreeEnvironment.tsx` | replace | One lifecycle-managed independent atmosphere renderer |
| `features/potala-journey/components/JourneyCheckpoint.tsx` | modify | Compact portal presentation and canonical CTA |
| `features/potala-journey/components/JourneyOverlay.tsx` | modify | Focus-zone visibility, alignment, monumental reduction |
| `features/potala-journey/components/JourneyNavigation.tsx` | modify | Discrete primary progress navigation |
| `features/potala-journey/components/PotalaExperience.tsx` | modify | Separate refs, visible-state wiring, canonical navigation |
| `features/potala-journey/components/potala-experience.module.css` | modify | Layered cinematic composition and responsive/reduced-motion styling |
| `build/legacy-compatibility.ts` | create | Central canonical-to-legacy manifest and dependency resolution |
| `build/legacy-assets-vite-plugin.ts` | create | Emits only manifest-declared legacy assets and serves them in dev |
| `vite.config.ts` | modify | Registers legacy asset plugin |
| `worker/index.ts` | modify | React-first, canonical-preserving private legacy fallback |
| `tests/potala-preview/*.test.ts` | add/modify | Pure journey/ambient/compatibility contracts |
| `tests/rendered-html.test.mjs` | modify | Rendered portal/route contract assertions |

## Task 1: Establish data contracts for portals and focus zones

**Files:**
- Modify: `features/potala-journey/types/journey.ts`
- Modify: `features/potala-journey/data/journey-content.ts`
- Modify: `features/potala-journey/data/journey-timeline.ts`
- Test: `tests/potala-preview/journey-content.test.ts`
- Test: `tests/potala-preview/journey-timeline.test.ts`

**Produces:** `JourneyPortal`, `JourneyFocusRange`, canonical portal records, and `primaryPortalOrder`.

- [ ] Write failing assertions for exactly eight primary records, expected ID order, canonical hrefs, number format, short descriptions, associated secondary IDs, and no `/outputs`, `.html`, or `/_legacy` value.
- [ ] Run `node --test tests/potala-preview/journey-content.test.ts`; expect failure because portal fields and route contract do not yet exist.
- [ ] Add `JourneyPortal` with `number`, `href`, `alignment`, `focus`, and `secondaryIds`; make `JourneyContent` reference it rather than carry long editorial body/tags.
- [ ] Replace the eight region records with short existing phrases and canonical hrefs. Preserve all secondary content only as associations.
- [ ] Define each primary focus zone as normalized `start`, `focus`, `end`; retain arrival, four silence transition records, monumental/Palance range, and epilogue in the timeline.
- [ ] Run both journey tests; expect pass. Run `npm.cmd run typecheck`; expect pass.

## Task 2: Make navigation and checkpoint visibility pure and testable

**Files:**
- Create: `features/potala-journey/lib/journey-navigation.ts`
- Modify: `features/potala-journey/hooks/useActiveCheckpoint.ts`
- Modify: `features/potala-journey/components/JourneyOverlay.tsx`
- Test: `tests/potala-preview/journey-navigation.test.ts`
- Test: `tests/potala-preview/checkpoint-focus.test.ts`

**Consumes:** normalized focus data from Task 1.

**Produces:** `scrollTopForProgress(section, progress)`, `canonicalJourneyHref(href)`, and `checkpointVisibility(progress, range)`.

- [ ] Write failing tests that verify a navigation click computes document scroll from the section’s scrollable height, not video time; `/cursos` becomes `/cursos?from=journey`; and visibility enters/focuses/leaves only at defined boundaries.
- [ ] Run the two tests; expect missing-module failures.
- [ ] Implement clamped scroll and URL helpers. Implement visibility as `{ opacity, translateY, blur, active }` derived solely from journey progress.
- [ ] Update overlay to consume the pure visibility result and use `portal.alignment`; reduce overlay opacity/size in monumental range and suppress it in palace range.
- [ ] Run tests plus existing `journey-timeline` tests; expect pass.

## Task 3: Build compact canonical portal UI and discrete progress navigation

**Files:**
- Modify: `features/potala-journey/components/JourneyCheckpoint.tsx`
- Modify: `features/potala-journey/components/JourneyNavigation.tsx`
- Modify: `features/potala-journey/components/JourneyCheckpointLayer.tsx`
- Modify: `features/potala-journey/components/potala-experience.module.css`
- Test: `tests/rendered-html.test.mjs`

**Consumes:** portal and navigation helpers from Tasks 1–2.

- [ ] Add failing rendered-output tests for number/title/short phrase/CTA, canonical CTA href with `from=journey`, active primary marker, silence fragments, and no legacy namespace/path in journey markup or source.
- [ ] Run `node --test tests/rendered-html.test.mjs`; expect failure.
- [ ] Render only the compact portal shape; use framework-compatible internal anchors currently supported by Vinext and reserve a clear boundary for future route-component replacement.
- [ ] Implement a narrow vertical/circular progress marker that calls `scrollToProgress`; preserve native scroll behavior and keyboard focus.
- [ ] Add editorial alignments, enter/leave transitions, safe negative space, low-contrast glass only where needed, and mobile layout. Keep road/palace image area clear.
- [ ] Run rendered-output and portal tests; expect pass.

## Task 4: Add the ambient model and automatic quality profiles

**Files:**
- Create: `features/potala-journey/lib/ambient-profile.ts`
- Create: `features/potala-journey/lib/ambient-motion.ts`
- Test: `tests/potala-preview/ambient-profile.test.ts`
- Test: `tests/potala-preview/ambient-motion.test.ts`

**Produces:** `selectAmbientProfile(capabilities)`, `ambientFrame(time, journeyProgress, profile)`, and profile budgets.

- [ ] Write failing tests for high/medium/low profile caps (2/1.5/1 DPR and 140/88/40 particles), conservative mobile selection, reduced-motion static selection, and deterministic non-uniform wind/mist/light results for equal inputs.
- [ ] Run those tests; expect missing-module failures.
- [ ] Implement immutable profile constants and pure calculations based on elapsed milliseconds and progress. The function must not accept or return video elements, scroll handles, or React setters.
- [ ] Include checkpoint-aware palette multipliers: warmer Quem Somos, softer Atendimentos, more ordered Cursos, expressive Arte e Cultura, clear Inspiração.
- [ ] Run tests; expect pass.

## Task 5: Replace ThreeEnvironment with an independent live atmosphere

**Files:**
- Modify: `features/potala-journey/components/ThreeEnvironment.tsx`
- Modify: `features/potala-journey/lib/dispose-three-environment.ts`
- Modify: `features/potala-journey/components/PotalaExperience.tsx`
- Test: `tests/potala-preview/three-environment.test.ts`
- Test: `tests/potala-preview/three-cleanup.test.ts`

**Consumes:** ambient profiles/motion from Task 4; `progressRef` from the existing scrub flow.

**Produces:** one `ambientTime`-driven renderer with intersection/visibility lifecycle.

- [ ] Write failing lifecycle tests with mocked rAF/IntersectionObserver/document visibility. Assert: ambient frames advance after 10 seconds without scroll; video `currentTime` and document scroll are never written; no React state callback is called by frame; hidden/out-of-view pauses; visibility resumes one loop; unmount cancels and disposes; reduced motion creates no rAF; WebGL constructor failure sets fallback.
- [ ] Run the Three test files; expect failure against the old points-only implementation.
- [ ] Create transparent antialiased renderer with capped profile DPR, `outputColorSpace`, modest `ACESFilmicToneMapping`, and responsive sizing.
- [ ] Build fog planes/shader material with `uTime` and `uJourneyProgress`; use noise-like combined sine motion. Add separate near/mid/far buffered particle clouds and restrained halo/light layers; update only Three uniforms/object attributes during rAF.
- [ ] Gate one continuous loop by intersection and `document.hidden`; use refs for progress and mutable renderer state. Dispose all scene resources and remove the canvas.
- [ ] Run the Three test files and `npm.cmd run typecheck`; expect pass.

## Task 6: Publish the minimal legacy asset set in a private namespace

**Files:**
- Create: `build/legacy-compatibility.ts`
- Create: `build/legacy-assets-vite-plugin.ts`
- Modify: `vite.config.ts`
- Test: `tests/potala-preview/legacy-compatibility.test.ts`

**Produces:** `LEGACY_ROUTE_MANIFEST`, `legacyAssetRequests()`, and a Vite build/dev plugin.

- [ ] Write failing contract tests defining exactly the eight canonical routes, their permitted source document, required local CSS/JS/media dependency paths, and rejection of unmapped paths/traversal.
- [ ] Run `node --test tests/potala-preview/legacy-compatibility.test.ts`; expect missing-module failure.
- [ ] Implement the manifest as the sole physical-path-aware module. Resolve each HTML page’s local `src`/`href` dependencies recursively only inside `outputs`; include only those assets in the emitted `/_legacy` namespace.
- [ ] Implement a Vite plugin that serves the same namespace during dev and emits the resolved files during build, preserving MIME types and blocking traversal.
- [ ] Register the plugin in `vite.config.ts` without changing the existing `public` asset behavior.
- [ ] Run the contract test and `npm.cmd run build`; inspect build output to confirm only declared legacy assets are emitted.

## Task 7: Add React-first Worker compatibility fallback

**Files:**
- Modify: `worker/index.ts`
- Test: `tests/potala-preview/legacy-worker.test.ts`

**Consumes:** canonical manifest from Task 6.

- [ ] Write failing tests for resolution order: an existing React route returns App Router response; an unresolved mapped canonical route fetches the private asset; unmapped route stays App Router 404; `/cursos?from=journey` preserves query; private path cannot be requested through any journey helper.
- [ ] Run `node --test tests/potala-preview/legacy-worker.test.ts`; expect failure.
- [ ] Add a narrow Worker branch that first delegates/identifies an existing React route, then uses the compatibility manifest only for unresolved canonical paths. Internally fetch `/_legacy/...` while returning the asset response for the original canonical request.
- [ ] Preserve query string and HTTP method semantics; do not expose or redirect clients to `/_legacy`.
- [ ] Run worker contract tests and production build; expect pass.

## Task 8: Integrate atmosphere, portal progress, and fallback experience

**Files:**
- Modify: `features/potala-journey/components/PotalaExperience.tsx`
- Modify: `features/potala-journey/components/JourneyEpilogue.tsx`
- Modify: `features/potala-journey/components/JourneyContentFlow.tsx`
- Modify: `features/potala-journey/components/potala-experience.module.css`
- Test: `tests/potala-preview/experience-contract.test.ts`

- [ ] Write failing integration contract tests asserting scrub rAF and ambient rAF have separate ownership, flow fallback preserves portal content, epilogue exposes contact/secondary associations, and Palace range has no permanent large checkpoint.
- [ ] Run the integration test; expect failure.
- [ ] Wire the existing `progressRef` to Three without coupling disabled scrub to ambient animation. Pass active checkpoint mood through refs/data, not rAF React state.
- [ ] Make reduced motion static and ensure media error retains readable portal flow, canonical links, and epilogue.
- [ ] Run all `tests/potala-preview/*.test.ts` and `npm.cmd run typecheck`; expect pass.

## Task 9: Full validation and visual review

**Files:**
- Modify only if a failed verification identifies a scoped defect in the files above.
- Create: local screenshots under an ignored temporary directory (do not add to Git).

- [ ] Run `npm.cmd run build` and `npm.cmd run lint`; expect successful exit.
- [ ] Start `npm.cmd run dev`, then verify `/potala-preview`, every canonical route, and the existing preview route response.
- [ ] Hold scroll idle for ten seconds: record unchanged video time and changing ambient frame state. Scroll through all eight focus zones and confirm portal order, CTA paths, silence, final UI reduction, Palace, and epilogue.
- [ ] Capture screenshots: start, Quem Somos, Cursos, Profissionais, Arte e Cultura, Inspiração, Palace.
- [ ] Check desktop and a mobile viewport; record observed FPS, selected DPR/profile, particle count, fog/light behavior, visible issues, `git status --short`, and `git diff --stat`.
- [ ] Do not commit, push, deploy, or alter `main`.

## Acceptance checklist

- [ ] Video time changes only from scroll-driven journey progress.
- [ ] Ambient motion continues while scroll is stationary and pauses only for hidden/out-of-view/reduced-motion states.
- [ ] The atmosphere appears integrated with the video: depth, soft fog, restrained light, parallax, and no snow/star/rain effect.
- [ ] All eight portals are compact, ordered, canonical, and navigable via native scroll/direct progress control.
- [ ] The Worker preserves canonical URLs and query params, while React routes always win over fallback.
- [ ] Only required legacy assets are published privately; no journey component mentions legacy paths.
- [ ] Reduced-motion and WebGL/media failure leave usable content and navigation.
