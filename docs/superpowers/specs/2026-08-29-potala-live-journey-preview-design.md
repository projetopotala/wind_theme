# Potala Live Journey Preview — Design Specification

**Status:** approved for planning; no implementation in this document.

## Goal

Expand `/potala-preview` into a live, scroll-driven journey: the video and narrative advance only with document scroll, while a subtle Three.js atmosphere continues independently whenever the experience is visible. The journey exposes eight compact canonical-route portals, transitions, a monumental arrival, and a live epilogue. `outputs/` remains unchanged as the public rollback surface.

## Boundaries

- Work only in the React/Vinext preview and its supporting infrastructure.
- Do not cut over the public Home, remove legacy files, commit, push, or deploy.
- React journey data and visual components may contain only canonical URLs. They must never contain `outputs/`, `/_legacy`, or legacy physical filenames.
- No legacy HTML is copied into React components. Full editorial content remains in its destination page.

## Temporal model

### Journey time

`document scroll -> journeyProgress -> video.currentTime -> active checkpoint`. `journeyProgress` is the only source of video time, narrative position, and direct-navigation destination. Stopped scroll means unchanged `video.currentTime`; no call to `video.play()` is permitted.

### Ambient time

`performance.now -> uTime -> Three atmosphere`. It is independent of journey progress and progresses without React state updates per frame. `uJourneyProgress` is read from a mutable ref and may influence atmosphere, but may never write video time, scroll position, or React state.

The Three rAF runs only while its viewport is intersecting and `document.hidden` is false. Visibility changes resume a single loop. Cleanup cancels that loop, removes listeners, disposes renderer/materials/geometries/textures, and removes the canvas.

## Journey content and timeline

`journey-content.ts` stores only portal metadata for each primary item: `id`, `number`, `title`, a short existing phrase, canonical `href`, `importance`, alignment, and associated secondary IDs. The exact portal order is:

1. Quem somos — `/quem-somos`
2. Atendimentos — `/atendimentos`
3. Cursos — `/cursos`
4. Atividades — `/atividades`
5. Profissionais — `/profissionais`
6. Programação — `/programacao`
7. Arte e cultura — `/cultura`
8. Inspiração — `/inspiracao`

`journey-timeline.ts` remains the only provisional mapping from normalized journey ranges to the video master. It represents arrival, eight primary focus zones, silence transitions, the final monumental zone, Palace, and epilogue. The master V2 may later change this file alone.

Each portal has `enter`, `focus`, and `leave`; it fades/translates with minimal blur while the road stays visible. It contains number, title, short phrase, and a canonical CTA with `?from=journey`. It never blocks scroll or opens a modal. Secondary items remain associations only, surfaced later in contextual UI and epilogue rather than as large checkpoints.

## Canonical routing and legacy compatibility

The app owns canonical paths. A centralized compatibility map is the only place that associates an unresolved canonical route with its specific legacy file and dependency set.

At build time, publish only the eight mapped legacy documents and their resolved local dependencies into a private asset namespace. Do not copy all of `outputs/`. At runtime, the Worker checks canonical React routes first. If no App Router route exists and the canonical path is mapped, it internally fetches the private asset while retaining the canonical URL and full query string. Thus `/cursos?from=journey` remains the address bar URL and future React routes replace only their map entry.

Journey code never sees the private namespace. The compatibility layer does not start a second server and does not duplicate legacy markup inside React.

## ThreeEnvironment V2

The transparent canvas sits between video background and React content/navigation. It renders:

- depth-layered procedural mist that drifts slowly sideways and vertically without covering road or palace;
- sparse dust, pollen, and light motes at near/mid/far depths, with non-uniform wind;
- soft localized light/halo and restrained illumination variation;
- subtle parallax and a progress-dependent palette/intensity response.

The environment is cinematic, natural, spiritual, and restrained: no snow, rain, stars, neon, heavy bloom, or generic particle overlay. Checkpoint mood may alter warmth, mist softness, organization, or clarity; WebGL is never required for navigation.

Quality profiles are automatic and conservative:

| Profile | Intended device | DPR cap | particle budget | fog layers | light layers |
| --- | --- | --- | --- | --- | --- |
| high | capable desktop | 2 | 140 | 3 | 3 |
| medium | default desktop | 1.5 | 88 | 2 | 2 |
| low | mobile/low-power | 1 | 40 | 1 | 1 |

Use `antialias: true`, alpha canvas, capped DPR, correct Three color output, and modest ACES filmic tone mapping. Reduced motion creates a composed static frame with no continuous animation. WebGL failure leaves video, content, navigation, native scrolling, and flow fallback available.

## Composition and responsive behavior

Layer order is video background, Three mid/foreground atmosphere, React content, then React navigation. Checkpoint alignment is editorial and configurable rather than mechanical. As the monumental region approaches, card density and navigation prominence reduce; the Palace has no persistent large overlay. The live epilogue returns contact details, continuation links, and associated secondary content.

On mobile, the low profile, DPR cap, safe text width, simplified nav, and reduced layer count keep the journey viable. Reduced motion and failed media retain static readable content through the existing flow path.

## Verification and acceptance

Automated contract tests must cover: separate ambient/journey clocks; no ambient write to video or scroll; eight primary portals and their order; canonical-only journey hrefs; silence transition representation; checkpoint bounds; navigation-to-scroll calculation; React-route precedence over compatibility; query preservation; only declared legacy assets emitted; hidden/intersection pause; reduced motion; cleanup; WebGL fallback.

Manual visual review at `/potala-preview` records start, Quem Somos, Cursos, Profissionais, Arte e Cultura, Inspiração, and Palace. With scroll idle for ten seconds, video time must remain fixed while mist, light, and motes visibly change. During scroll, road/video advance but the atmosphere remains smooth. Review contrast, depth, text legibility, road/palace visibility, lack of artificial overlay feeling, mobile behavior, and console/runtime errors.

## Non-goals

- Migrating the eight destination pages to React.
- Implementing perfect return-position restoration.
- Replacing the provisional video master.
- Heavy postprocessing or an additional application/server.
