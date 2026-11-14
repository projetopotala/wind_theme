import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACOES, MODALIDADES, FORMATOS, formatarPreco, temCobranca, passosDoFluxo, rotuloDaAcao,
  filtrarOfertas, validarDados, gerarProtocolo, textoDaConfirmacao, linkDaRecepcao,
} from "../../outputs/js/ofertas/ofertas-modelo.js";

const catalogo = JSON.parse(readFileSync(new URL("../../outputs/ofertas/catalogo-demonstracao.json", import.meta.url), "utf8"));
const ofertas = catalogo.ofertas;
const porId = (id) => ofertas.find((o) => o.id === id);

test("catálogo: cada oferta tem modalidade, formato e ação válidos e ids únicos", () => {
  const modalidades = new Set(MODALIDADES.map((m) => m.id));
  const formatos = new Set(FORMATOS.map((f) => f.id));
  const ids = new Set();
  for (const o of ofertas) {
    assert.ok(o.id && !ids.has(o.id), `id repetido ou vazio: ${o.id}`);
    ids.add(o.id);
    assert.ok(modalidades.has(o.modalidade) && o.modalidade !== "todas", `modalidade inválida em ${o.id}`);
    assert.ok(formatos.has(o.formato) && o.formato !== "todos", `formato inválido em ${o.id}`);
    assert.ok(ACOES[o.acao], `ação inválida em ${o.id}`);
    assert.ok(o.titulo && o.quando && o.responsavel, `campos obrigatórios em ${o.id}`);
  }
  assert.match(catalogo.aviso, /DEMONSTRAÇÃO/);
});

test("catálogo: todas as modalidades e todas as ações aparecem na vitrine", () => {
  for (const m of MODALIDADES.filter((x) => x.id !== "todas")) assert.ok(ofertas.some((o) => o.modalidade === m.id), m.id);
  for (const a of Object.keys(ACOES)) assert.ok(ofertas.some((o) => o.acao === a), a);
});

test("pagamento só entra no caminho quando há preço", () => {
  for (const o of ofertas) {
    const passos = passosDoFluxo(o);
    assert.equal(passos.includes("pagamento"), temCobranca(o) && ACOES[o.acao].passos.includes("pagamento"), o.id);
    if (!temCobranca(o)) assert.ok(!passos.includes("pagamento"), `gratuito com pagamento: ${o.id}`);
  }
  assert.deepEqual(passosDoFluxo(porId("curso-taro-arcanos-maiores")), ["detalhes", "dados", "pagamento", "confirmacao"]);
  assert.deepEqual(passosDoFluxo(porId("solidario-cirurgias-espirituais")), ["detalhes", "dados", "confirmacao"]);
  assert.deepEqual(passosDoFluxo(porId("atendimento-leitura-buzios")), ["detalhes", "horario", "dados", "confirmacao"]);
  assert.deepEqual(passosDoFluxo(porId("produto-marketplace")), ["detalhes"]);
});

test("o Marketplace não tem fluxo de compra no portal", () => {
  const p = porId("produto-marketplace");
  assert.equal(p.acao, "marketplace");
  assert.deepEqual(passosDoFluxo(p), ["detalhes"]);
  assert.equal(textoDaConfirmacao(p), "");
});

test("formatarPreco cobre valor, recorrência, gratuito, contrapartida e a combinar", () => {
  assert.match(formatarPreco(porId("curso-taro-arcanos-maiores")), /380,00/);
  assert.match(formatarPreco(porId("yoga-hatha")), /190,00.*por mês/);
  assert.equal(formatarPreco(porId("solidario-regeneracao-celular")), "Gratuito");
  assert.equal(formatarPreco(porId("solidario-benzimento")), "Contrapartida: 1 kg de alimento");
  assert.equal(formatarPreco(porId("evento-green-friday")), "Valores promocionais");
  assert.equal(formatarPreco({}), "Valor a combinar");
});

test("rótulo da ação segue a ação da oferta", () => {
  assert.equal(rotuloDaAcao({ acao: "inscrever" }), "Inscrever-se");
  assert.equal(rotuloDaAcao({ acao: "participar" }), "Participar gratuitamente");
  assert.equal(rotuloDaAcao({ acao: "xyz" }), "Falar com a Recepção");
});

test("filtrarOfertas combina modalidade, formato e busca sem acento", () => {
  assert.equal(filtrarOfertas(ofertas).length, ofertas.length);
  assert.ok(filtrarOfertas(ofertas, { modalidade: "curso" }).every((o) => o.modalidade === "curso"));
  assert.ok(filtrarOfertas(ofertas, { formato: "online" }).every((o) => o.formato === "online"));
  assert.deepEqual(filtrarOfertas(ofertas, { termo: "debora barbosa" }).map((o) => o.id).sort(), ["curso-taro-arcanos-maiores", "roda-presenca-harmonica"]);
  assert.equal(filtrarOfertas(ofertas, { termo: "inexistente" }).length, 0);
});

test("validarDados exige nome, e-mail e, quando pedido, horário e preferência", () => {
  assert.deepEqual(validarDados({ nome: "Ana Souza", email: "ana@exemplo.com" }), {});
  const erros = validarDados({ nome: "A", email: "x" }, { exigeHorario: true, exigePreferencia: true });
  assert.deepEqual(Object.keys(erros).sort(), ["email", "horario", "nome", "preferencia"]);
});

test("protocolo é demonstrativo e determinístico para o mesmo instante", () => {
  const p = gerarProtocolo({ id: "a" }, 1, 0.5);
  assert.match(p, /^DEMO-[0-9A-Z]{6}$/);
  assert.equal(p, gerarProtocolo({ id: "a" }, 1, 0.5));
  assert.notEqual(p, gerarProtocolo({ id: "b" }, 1, 0.5));
});

test("link da Recepção usa só dígitos e codifica o texto", () => {
  const link = linkDaRecepcao(catalogo.whatsapp, porId("danca-cigana"));
  assert.ok(link.startsWith("https://wa.me/5519997766131?text="));
  assert.ok(!/\s/.test(link));
});

test("página ofertas.html: avisa que é demonstração e não carrega nada de pagamento", () => {
  const html = readFileSync(new URL("../../outputs/ofertas.html", import.meta.url), "utf8");
  assert.match(html, /Protótipo de demonstração/);
  assert.match(html, /noindex/);
  assert.ok(!/mercadopago|access_token|service_role/i.test(html));
  const js = readFileSync(new URL("../../outputs/js/ofertas/ofertas.js", import.meta.url), "utf8");
  assert.ok(!/innerHTML|mercadopago|service_role|fetch\(\s*["'`]https?:/i.test(js));
});

test("confirmação demonstrativa nunca afirma que algo aconteceu de verdade", async () => {
  const modelo = await import("../../outputs/js/ofertas/ofertas-modelo.js");
  assert.match(modelo.AVISO_SIMULACAO, /^SIMULAÇÃO: nada foi registrado, reservado, cobrado nem enviado\.$/);
  const comPreco = porId("curso-taro-arcanos-maiores");
  for (const acao of Object.keys(modelo.ACOES)) {
    for (const oferta of [{ ...comPreco, acao }, { id: "x", acao }]) {
      const t = modelo.textoDaConfirmacao(oferta);
      if (!t) continue;
      assert.match(t, /^No ambiente real, /, `${acao}: texto condicional`);
      assert.doesNotMatch(t, /^(Inscrição|Vaga|Pagamento|Pedido|Horário|Participação)/, `${acao}: não afirma fato consumado`);
    }
  }
});
