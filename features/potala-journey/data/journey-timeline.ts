import type { JourneyCheckpoint } from "../types/journey";
import { JOURNEY_MEDIA } from "./journey-media";

export { JOURNEY_MEDIA, JOURNEY_MEDIA_MANIFEST, JOURNEY_MEDIA_VERSION } from "./journey-media";

export const LAST_SAFE_FRAME_TIME = JOURNEY_MEDIA.duration - 1 / JOURNEY_MEDIA.fps;

const checkpoint = (
  id: string,
  contentId: string,
  videoStart: number,
  videoFocus: number,
  videoEnd: number,
  scrollWeight: number,
  importance: JourneyCheckpoint["importance"],
): JourneyCheckpoint => ({
  id,
  contentId,
  videoStart,
  videoFocus,
  videoEnd,
  scrollWeight,
  importance,
  focusRange: {
    start: clamp(videoStart / LAST_SAFE_FRAME_TIME),
    focus: clamp(videoFocus / LAST_SAFE_FRAME_TIME),
    end: clamp(videoEnd / LAST_SAFE_FRAME_TIME),
  },
});

// Configuração provisória: o master V2 poderá substituir apenas este manifesto.
export const JOURNEY_CHECKPOINTS: readonly JourneyCheckpoint[] = [
  checkpoint("cp-prologo", "prologo", 0, 1.8, 3.6, 1.1, "passive"),
  checkpoint("cp-tempo", "chegada-tempo", 3.6, 3.95, 4.3, 0.18, "passive"),
  checkpoint("cp-presenca", "chegada-presenca", 4.3, 4.65, 5, 0.18, "passive"),
  checkpoint("cp-fluxo", "chegada-fluxo", 5, 5.35, 5.7, 0.18, "passive"),
  checkpoint("cp-pausa", "chegada-pausa", 5.7, 6.05, 6.4, 0.18, "passive"),
  checkpoint("cp-horizonte", "chegada-horizonte", 6.4, 6.75, 7.1, 0.18, "passive"),
  checkpoint("cp-caminho", "chegada-caminho", 7.1, 7.45, 7.8, 0.18, "passive"),
  checkpoint("cp-escuta", "chegada-escuta", 7.8, 8.15, 8.5, 0.18, "passive"),
  checkpoint("cp-entrada", "chegada-entrada", 8.5, 8.85, 9.2, 0.18, "passive"),
  checkpoint("cp-quem-somos", "quem-somos", 9.2, 13.1, 17, 1.75, "primary"),
  checkpoint("cp-transicao-chegada", "transicao-chegada", 17, 18.15, 19.3, 0.58, "passive"),
  checkpoint("cp-atendimentos", "atendimentos", 19.3, 23.9, 28.5, 1.7, "primary"),
  checkpoint("cp-transicao-cuidado", "transicao-cuidado", 28.5, 29.4, 30.3, 0.55, "passive"),
  checkpoint("cp-cursos", "cursos", 30.3, 34.65, 39, 1.65, "primary"),
  checkpoint("cp-transicao-conhecimento", "transicao-conhecimento", 39, 40, 41, 0.55, "passive"),
  checkpoint("cp-atividades", "atividades", 41, 44.1, 47.2, 1.55, "primary"),
  checkpoint("cp-profissionais", "profissionais", 47.2, 50.6, 54, 1.6, "primary"),
  checkpoint("cp-programacao", "programacao", 54, 57.2, 60.4, 1.6, "primary"),
  checkpoint("cp-transicao-pausa", "transicao-pausa", 60.4, 61.4, 62.4, 0.55, "passive"),
  checkpoint("cp-arte-cultura", "arte-cultura", 62.4, 65.8, 69.2, 1.6, "primary"),
  checkpoint("cp-inspiracao", "inspiracao", 69.2, 72.7, 76.2, 1.75, "primary"),
  checkpoint("cp-regiao-monumental", "epilogo", 76.2, 80, 83.8, 2, "passive"),
  checkpoint("cp-palacio", "epilogo", 83.8, 86, 86.9, 2.3, "passive"),
  checkpoint("cp-epilogo", "epilogo", 86.9, 88, LAST_SAFE_FRAME_TIME, 3, "passive"),
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
