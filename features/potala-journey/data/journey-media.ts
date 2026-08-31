import type { JourneyMediaManifest, JourneyMediaVersion } from "../types/journey";

export const JOURNEY_MEDIA_MANIFEST = {
  v1: {
    src: "/media/potala-journey.mp4",
    poster: "/media/potala-journey-poster.webp",
    duration: 155,
    fps: 24,
    development: true,
  },
  v2: {
    src: "/media/potala-journey-v2.mp4",
    poster: "/media/potala-journey-v2-poster.webp",
    duration: 89.167,
    fps: 24,
    development: true,
  },
} as const satisfies Readonly<Record<JourneyMediaVersion, JourneyMediaManifest>>;

// A selecao e exclusiva da preview. V1 permanece declarada para rollback sem
// condicoes espalhadas por componentes da experiencia.
export const JOURNEY_MEDIA_VERSION: JourneyMediaVersion = "v2";
export const JOURNEY_MEDIA: JourneyMediaManifest = JOURNEY_MEDIA_MANIFEST[JOURNEY_MEDIA_VERSION];
