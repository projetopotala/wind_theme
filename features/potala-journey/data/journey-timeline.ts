import type { JourneyCheckpoint, JourneyMediaManifest } from "../types/journey";

export const JOURNEY_MEDIA: JourneyMediaManifest = {
  src: "/media/potala-journey.mp4",
  poster: "/media/potala-journey-poster.webp",
  duration: 155,
  fps: 24,
  development: true,
};

export const LAST_SAFE_FRAME_TIME = JOURNEY_MEDIA.duration - 1 / JOURNEY_MEDIA.fps;

const checkpoint = (
  id: string,
  contentId: string,
  videoStart: number,
  videoFocus: number,
  videoEnd: number,
  scrollWeight: number,
  importance: JourneyCheckpoint["importance"],
): JourneyCheckpoint => ({ id, contentId, videoStart, videoFocus, videoEnd, scrollWeight, importance });

// Configuração provisória: o master V2 poderá substituir apenas este manifesto.
export const JOURNEY_CHECKPOINTS: readonly JourneyCheckpoint[] = [
  checkpoint("cp-prologo", "prologo", 0, 1.8, 4, 1.2, "passive"),
  checkpoint("cp-tempo", "chegada-tempo", 4, 4.5, 5, 0.22, "passive"),
  checkpoint("cp-presenca", "chegada-presenca", 5, 5.5, 6, 0.22, "passive"),
  checkpoint("cp-fluxo", "chegada-fluxo", 6, 6.5, 7, 0.22, "passive"),
  checkpoint("cp-pausa", "chegada-pausa", 7, 7.5, 8, 0.22, "passive"),
  checkpoint("cp-horizonte", "chegada-horizonte", 8, 8.5, 9, 0.22, "passive"),
  checkpoint("cp-caminho", "chegada-caminho", 9, 9.5, 10, 0.22, "passive"),
  checkpoint("cp-escuta", "chegada-escuta", 10, 10.5, 11, 0.22, "passive"),
  checkpoint("cp-entrada", "chegada-entrada", 11, 11.5, 12, 0.22, "passive"),
  checkpoint("cp-quem-somos", "quem-somos", 12, 18.5, 25, 1.55, "primary"),
  checkpoint("cp-transicao-chegada", "transicao-chegada", 25, 27, 29, 0.42, "passive"),
  checkpoint("cp-atendimentos", "atendimentos", 29, 35.5, 42, 1.55, "primary"),
  checkpoint("cp-transicao-cuidado", "transicao-cuidado", 42, 44, 46, 0.42, "passive"),
  checkpoint("cp-cursos", "cursos", 46, 52.5, 59, 1.5, "primary"),
  checkpoint("cp-transicao-conhecimento", "transicao-conhecimento", 59, 61, 63, 0.42, "passive"),
  checkpoint("cp-atividades", "atividades", 63, 70, 77, 1.5, "primary"),
  checkpoint("cp-profissionais", "profissionais", 77, 84.5, 92, 1.5, "primary"),
  checkpoint("cp-programacao", "programacao", 92, 100, 108, 1.65, "primary"),
  checkpoint("cp-arte-cultura", "arte-cultura", 108, 116.5, 125, 1.5, "primary"),
  checkpoint("cp-transicao-pausa", "transicao-pausa", 125, 127, 129, 0.42, "passive"),
  checkpoint("cp-inspiracao", "inspiracao", 129, 137, 145, 1.55, "primary"),
  checkpoint("cp-epilogo", "epilogo", 145, 150, LAST_SAFE_FRAME_TIME, 1.8, "passive"),
];

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

const totalWeight = JOURNEY_CHECKPOINTS.reduce((sum, item) => sum + item.scrollWeight, 0);

export function timeForJourneyProgress(progress: number): number {
  const weightedPosition = clamp(progress) * totalWeight;
  let consumed = 0;
  for (const item of JOURNEY_CHECKPOINTS) {
    const end = consumed + item.scrollWeight;
    if (weightedPosition <= end || item === JOURNEY_CHECKPOINTS.at(-1)) {
      const local = clamp((weightedPosition - consumed) / item.scrollWeight);
      return Math.min(LAST_SAFE_FRAME_TIME, item.videoStart + (item.videoEnd - item.videoStart) * local);
    }
    consumed = end;
  }
  return LAST_SAFE_FRAME_TIME;
}

export function activeCheckpointForProgress(progress: number): JourneyCheckpoint {
  const weightedPosition = clamp(progress) * totalWeight;
  let consumed = 0;
  for (const item of JOURNEY_CHECKPOINTS) {
    consumed += item.scrollWeight;
    if (weightedPosition <= consumed) return item;
  }
  return JOURNEY_CHECKPOINTS[JOURNEY_CHECKPOINTS.length - 1];
}

export function progressForCheckpoint(contentId: string): number {
  let consumed = 0;
  for (const item of JOURNEY_CHECKPOINTS) {
    if (item.contentId === contentId) {
      return clamp((consumed + item.scrollWeight / 2) / totalWeight);
    }
    consumed += item.scrollWeight;
  }
  return 0;
}
