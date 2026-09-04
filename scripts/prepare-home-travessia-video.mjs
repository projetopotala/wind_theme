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
 * 2816 de largura, e o número sai do ELEMENTO, não do source.
 *
 * Ampliar não inventa detalhe. O que ela evita é o navegador esticar por cima,
 * com o escalador barato dele — e é aí que a imagem desmancha. A conta é quantos
 * pixels o elemento pede: `.journey-landscape` mede a largura da janela MAIS a
 * sobra de 680px que a travessia atravessa. Numa tela de 1920 são 2600 pixels.
 *
 * Uma versão anterior mirou em 2048 medindo numa janela de 1440, e o erro só
 * apareceu na tela de verdade: o navegador ampliava 1,27× por cima, e afinar a
 * compressão não tinha como aparecer debaixo dessa segunda ampliação.
 *
 * Conferido no cenário real de 1920 físicos a 125% — viewport de 1536 CSS — o
 * elemento pede 2751px e o vídeo tem 2816: o navegador não amplia nada, com
 * 65px de sobra. Subir mais só custaria bytes que aquela tela não usa.
 */
/*
 * Uma REDUÇÃO, de 3840 para 2816 — e é por isso que não há realce aqui.
 *
 * Enquanto a origem era 720p, o filtro ampliava, e um `unsharp` discreto
 * compensava a moleza da ampliação. Reduzir é outro trabalho: o material já
 * chega com mais detalhe do que o destino comporta, e realçar por cima disso só
 * criaria halo nas bordas e gastaria bits que o codec deveria usar na pedra de
 * verdade.
 */
const ESCALA = "scale=2816:1584:flags=lanczos+accurate_rnd+full_chroma_int";

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
 * CRF 29, casado com a resolução acima e com um source 4K.
 *
 * O número isolado não diz nada: a comparação que vale é na escala em que a
 * tela desenha, e contra o SOURCE sem compressão nenhuma — é essa referência
 * que separa perda de encode de limite do material. Sem ela eu errei duas vezes
 * seguidas, comparando só contra a webp.
 *
 * Com o 4K: 2816/CRF26 19,7MB · CRF29 14,5MB · CRF32 10,9MB. O CRF29 fica quase
 * no teto, e — o que decide — ficou mais nítido que o arquivo anterior de
 * 15,4MB feito a partir do 720p. Melhor imagem em menos bytes, porque o gargalo
 * nunca foi a compressão: era o material.
 *
 * VP9 foi testado esperando comprimir melhor e deu 41,7MB: a força dele é a
 * predição entre quadros, e aqui todo quadro é independente por construção.
 */
const CRF = "29";

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
  "-vf", ESCALA,
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
