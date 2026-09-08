/**
 * As imagens das 22 aulas de Atividades.
 *
 * Cada aula abre um painel com dias, horários e o que levar. A imagem entra ao
 * lado desses dados, e é natureza-morta do objeto da prática — o violino e o
 * arco, o tabuleiro a meio jogo, o tapete enrolado. Sem pessoas: a 200px um
 * rosto gerado não acrescenta nada e erra com frequência, enquanto o objeto diz
 * de que aula se trata antes de alguém ler o nome.
 *
 * Este script NÃO gera as imagens. Ele pega o que está em `assets-source/aulas`
 * e prepara o que vai ao ar. A geração é um passo à parte porque custa dinheiro
 * por chamada: um script que gera no build refaria as 22 a cada rodada.
 *
 * Os prompts e os textos alternativos moram em `scripts/aulas-imagens.json`,
 * versionados junto do resto. Uma imagem some, e o que ela era continua escrito.
 *
 *   node scripts/prepare-aulas-assets.mjs
 */
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const raiz = path.resolve(import.meta.dirname, "..");
const origem = path.join(raiz, "assets-source", "aulas");
const destino = path.join(raiz, "outputs", "media", "aulas");

/*
 * 560px de lado para uma imagem exibida a ~200px.
 *
 * Não é exagero: é a mesma imagem numa tela de densidade dupla, que é a maioria
 * dos celulares. Servir 200px reais deixaria a foto visivelmente mole justo em
 * quem lê a página no ônibus.
 */
const LADO = 560;
const QUALIDADE = 72;

export async function prepararAulas() {
  const manifesto = JSON.parse(await readFile(path.join(raiz, "scripts", "aulas-imagens.json"), "utf8"));
  await mkdir(destino, { recursive: true });

  const existentes = new Set(
    await readdir(origem).catch(() => []),
  );

  const feitas = [];
  const faltando = [];
  for (const aula of manifesto.aulas) {
    const arquivo = `${aula.id}.png`;
    if (!existentes.has(arquivo)) {
      faltando.push(aula.id);
      continue;
    }
    const saida = path.join(destino, `${aula.id}.webp`);
    await sharp(path.join(origem, arquivo))
      /* `cover` e não `contain`: a fonte é quadrada e o destino também, então
         nada é cortado — mas se um dia entrar uma fonte fora de proporção, é
         melhor perder borda do que ganhar tarja. */
      .resize(LADO, LADO, { fit: "cover", position: "centre" })
      .webp({ quality: QUALIDADE })
      .toFile(saida);
    const { size } = await stat(saida);
    feitas.push({ id: aula.id, kb: Math.round(size / 1024) });
  }

  return { feitas, faltando };
}

if (import.meta.filename === process.argv[1]) {
  const { feitas, faltando } = await prepararAulas();
  const total = feitas.reduce((soma, f) => soma + f.kb, 0);
  console.log(`aulas: ${feitas.length} imagens, ${total} KB no total`);
  if (faltando.length) {
    console.log(`sem fonte em assets-source/aulas: ${faltando.join(", ")}`);
  }
}
