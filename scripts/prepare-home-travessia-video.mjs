import { spawnSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * O VÍDEO DE FUNDO DA JORNADA.
 *
 * Este script existe para a receita do encode não se perder. Ela não é óbvia, e
 * cada número aqui foi decidido medindo — refazer o arquivo "no olho" produz um
 * vídeo que não serve, e o defeito só aparece depois, rolando a página.
 *
 * NÃO roda no build. `ffmpeg` não é dependência do projeto, e o resultado é um
 * binário versionado: só se roda de novo quando o vídeo de origem muda.
 *
 *   node scripts/prepare-home-travessia-video.mjs
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origem = path.join(raiz, "assets-source", "home-travessia", "home-travessia-source.mp4");
const destino = path.join(raiz, "outputs", "media", "home-travessia.mp4");

/*
 * TODO QUADRO É KEYFRAME, e é isto que torna o vídeo rebobinável.
 *
 * Rolar a página escreve `currentTime`, e o navegador só consegue pousar num
 * keyframe. O arquivo original tinha DOIS em quinze segundos: a jornada
 * inteira mostraria o quadro 0 na primeira metade e o quadro 180 na segunda —
 * dois estados, e nada entre eles. Não é uma questão de suavidade; sem isto o
 * efeito simplesmente não existe.
 */
const TODO_QUADRO_KEYFRAME = [
  "-g", "1",
  "-keyint_min", "1",
  "-sc_threshold", "0",
  "-x264-params", "keyint=1:min-keyint=1:scenecut=0",
];

/*
 * 2048 de largura, contra os 1280 da origem.
 *
 * Ampliar não inventa detalhe, mas evita que o navegador estique um vídeo já
 * comprimido — que é onde a imagem realmente desmancha. Comparado a 1:1 contra
 * a `home-travessia.webp` (2048×1152, que é o fundo que este vídeo substitui):
 * o 1280 esticado empapa as pedras do caminho, e o 2048 com lanczos e um realce
 * leve chega perto da webp. A referência é ela, porque trocar o fundo por algo
 * mais mole que o de hoje seria uma piora.
 *
 * O `unsharp` é o que compensa a ampliação — em dose discreta, pelo motivo
 * anotado junto dele.
 */
const ESCALA_E_REALCE = [
  "scale=2048:1152:flags=lanczos+accurate_rnd+full_chroma_int",
  /*
   * Realce DISCRETO, e a primeira versão errou a mão aqui.
   *
   * Com `0.8:...:0.4` a imagem parecia melhor no quadro isolado e saía pior do
   * encoder: realce antes de comprimir cria detalhe artificial que o codec
   * precisa pagar em bits — bits que deixam de descrever a pedra de verdade —
   * e ainda deixa halo nas bordas. Metade da força devolveu nitidez, não tirou.
   */
  "unsharp=5:5:0.5:3:3:0.2",
].join(",");

/*
 * 10 quadros por segundo.
 *
 * A jornada tem 12.096px de rolagem. A 10fps são 152 quadros, um a cada 80px —
 * contínuo ao olho, porque quem controla o ritmo é a mão de quem rola, e não um
 * relógio. Subir para 24fps só dobraria o peso para adiantar quadros que
 * ninguém pediu.
 */
const QUADROS_POR_SEGUNDO = "10";

/*
 * CRF 26, e não 32.
 *
 * O 32 foi escolhido comparando recortes contra a webp, e a comparação estava
 * mal montada: faltava a referência que importa, que é o SOURCE ampliado sem
 * compressão nenhuma. Contra ele ficou claro que a perda não era do vídeo de
 * origem — era do encode. Comparados no mesmo recorte, o 26 fica quase
 * indistinguível desse teto e o 32 é visivelmente o mais mole.
 *
 * Medidos, todos all-intra a 2048 e 10fps: CRF32 7,3MB · CRF28 11,5MB ·
 * CRF26 14,2MB · CRF24 17,6MB. O ganho do 24 sobre o 26 é difícil de ver.
 *
 * VP9 foi testado esperando comprimir melhor e deu 41,7MB: a força dele é a
 * predição entre quadros, e aqui todo quadro é independente por construção.
 */
const CRF = "26";

function ffmpeg() {
  /* `winget` instala o binário sem colocá-lo no PATH da sessão em curso, então
     o caminho dele entra por variável quando preciso. */
  return process.env.FFMPEG_PATH || "ffmpeg";
}

await mkdir(path.dirname(destino), { recursive: true });
await stat(origem);

const resultado = spawnSync(ffmpeg(), [
  "-y", "-v", "error",
  "-i", origem,
  "-an",                       // o fundo é mudo; a trilha só pesaria
  "-vf", ESCALA_E_REALCE,
  "-c:v", "libx264",
  /* Sem movimento a estimar entre quadros, o preset mexe pouco no tempo e
     ainda espreme melhor cada quadro isolado. */
  "-preset", "veryslow",
  "-pix_fmt", "yuv420p",       // sem isto, Safari recusa o arquivo
  "-r", QUADROS_POR_SEGUNDO,
  "-crf", CRF,
  ...TODO_QUADRO_KEYFRAME,
  "-movflags", "+faststart",   // o índice vem antes dos dados: dá para começar a ler sem baixar tudo
  destino,
], { stdio: "inherit" });

if (resultado.error) {
  throw new Error(
    `não consegui rodar o ffmpeg (${resultado.error.message}). `
    + "Ele não é dependência do projeto; instale-o ou aponte FFMPEG_PATH para o binário.",
  );
}
if (resultado.status !== 0) throw new Error(`ffmpeg terminou com código ${resultado.status}`);

const { size } = await stat(destino);
console.log(`home-travessia.mp4 — ${(size / 1048576).toFixed(1)} MB`);
