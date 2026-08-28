import { ARRIVAL_MOTION } from "../chegada/arrival-scene-profile.js";

/**
 * Perfil da cena final, dentro do Palácio Potala.
 *
 * A cena é interior, e isso invalida dois padrões do motor:
 *
 * 1. Sem céu. `skyMaskUrl` vazio faz `uHasSkyMask` cair para 0 e a camada de
 *    nuvem se apagar sozinha, sem tocar no shader.
 * 2. A luz vem do vão da porta, não de cima. O shader calcula o brilho do sol
 *    sobre `smoothstep(0.48, 0.16, sceneUv.y)`, e como `uv.y = 1` é o topo da
 *    tela esse termo vale 1 no rodapé do quadro — num corredor ele acenderia a
 *    laje em vez do fundo. Zerar `sun` desliga esse caminho, e a luz da cena
 *    passa a vir do facho recortado pela máscara.
 */
export const PALACE_PROFILE = {
  id: "palacio-interior",
  plate: { width: 2048, height: 1152 },
  assets: {
    imageUrl: "media/palacio-master.webp",
    depthUrl: "media/palacio-depth.webp",
    mistMaskUrl: "media/palacio-light-mask.webp",
    skyMaskUrl: "",
    waterMaskUrl: "",
    waterfallMaskUrl: "",
    canopyMaskUrl: "",
  },
  motion: {
    ...ARRIVAL_MOTION,
    cloudAmount: 0,
    // O corredor é fundo e estreito: paralaxe mais forte que a paisagem vende a
    // profundidade das colunas sem precisar de câmera nova.
    nearParallax: 0.011,
    farParallax: 0.0015,
    cameraZoom: 0.018,
  },
  world: {
    wind: 0,
    water: 0,
    sun: 0,
    mist: 0.42,
    path: 0,
    attention: 0,
    windDir: [0, 0],
    attentionUv: [0.5, 0.45],
  },
};

export function selectPalaceAssets() {
  return { ...PALACE_PROFILE.assets };
}
