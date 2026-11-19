import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { conectarConvites } from "../../outputs/js/assistente/assistente-boot.js";
import { mountAgendamento } from "../../outputs/js/shared/assistente.js";

const ler = (nome) => readFileSync(new URL(`../../outputs/${nome}`, import.meta.url), "utf8");

test("Chegada explica o Instituto e oferece destinos públicos em uma ação", () => {
  const html = ler("transcender.html");
  assert.match(html, /Bem-vindo ao Instituto Potala/);
  assert.match(html, /saúde integrativa e cultura/);
  for (const [rotulo, destino] of [
    ["Receber atendimento", "atendimentos.html"],
    ["Conhecer cursos", "cursos.html"],
    ["Participar de atividades", "atividades.html"],
    ["Conhecer o Instituto", "quem-somos.html"],
    ["Não sei por onde começar", "recepcao.html"],
    ["Percorrer a Travessia", "travessia.html"],
  ]) {
    assert.match(html, new RegExp(`href="${destino}"[^>]*>${rotulo}`));
    assert.ok(existsSync(new URL(`../../outputs/${destino}`, import.meta.url)), destino);
  }
});

test("abertura integra a orientação à paisagem sem restaurar o painel opaco", () => {
  const css = ler("css/chegada-guia.css");
  assert.match(css, /\.arrival-guide\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.arrival-guide::before\s*\{[\s\S]*?linear-gradient/);
  assert.match(css, /\.arrival-guide__journey\s*\{[\s\S]*?border-radius:\s*999px/);
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*?grid-template-columns:\s*repeat\(2/);
  assert.match(css, /@media \(max-width:\s*350px\)[\s\S]*?grid-template-columns:\s*1fr/);
});

test("Recepção e Atividades usam o assistente IA-01 sem formulário de prévia", () => {
  for (const pagina of ["recepcao.html", "atividades.html"]) {
    const html = ler(pagina);
    assert.match(html, /data-abrir-assistente/);
    assert.match(html, /\/js\/assistente\/assistente-boot.js/);
    assert.doesNotMatch(html, /data-assistant-preview|data-assistente>|futura conversa inteligente/);
  }
});

function criarDocumentoDeConvite() {
  const eventos = new Map();
  const destinos = [];
  const doc = {
    defaultView: { location: { assign: (url) => destinos.push(url) } },
    addEventListener: (tipo, fn) => eventos.set(tipo, fn),
    removeEventListener: (tipo) => eventos.delete(tipo),
  };
  const convite = { href: "https://potala.test/recepcao.html#fale-conosco" };
  const clicar = () => {
    let prevenido = false;
    eventos.get("click")({ target: { closest: () => convite }, preventDefault: () => { prevenido = true; } });
    return prevenido;
  };
  return { doc, destinos, clicar, eventos };
}

test("convite aguarda a mesma instância da IA-01 e abre mesmo após abertura anterior", async () => {
  const { doc, destinos, clicar } = criarDocumentoDeConvite();
  let resolver;
  const carregamento = new Promise((resolve) => { resolver = resolve; });
  let aberturas = 0;
  const assistente = { abrir: () => { aberturas += 1; } };
  const desligar = conectarConvites(doc, () => carregamento);
  assert.equal(clicar(), true);
  assert.equal(aberturas, 0, "clique durante o carregamento fica pendente");
  resolver(assistente);
  await carregamento;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(aberturas, 1);
  assert.equal(clicar(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(aberturas, 2);
  assert.deepEqual(destinos, []);
  desligar();
});

test("convite cai no contato humano quando a IA-01 falha", async () => {
  const { doc, destinos, clicar } = criarDocumentoDeConvite();
  conectarConvites(doc, async () => { throw new Error("offline"); });
  assert.equal(clicar(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(destinos, ["https://potala.test/recepcao.html#fale-conosco"]);
});

test("agendamento de aulas continua revelando canais após remover a prévia", () => {
  const html = ler("atividades.html");
  assert.match(html, /src="js\/shared\/assistente.js"/);
  const eventos = new Map();
  let foco = false;
  const canal = { focus: () => { foco = true; } };
  const canais = { hidden: true, querySelector: () => canal };
  const botao = { addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener: (tipo) => eventos.delete(tipo), setAttribute: (_nome, valor) => { botao.expanded = valor; } };
  const bloco = { querySelector: (seletor) => seletor === "[data-agendar-abrir]" ? botao : canais };
  const montagem = mountAgendamento({ querySelector: () => bloco });
  eventos.get("click")();
  assert.equal(canais.hidden, false);
  assert.equal(botao.expanded, "true");
  assert.equal(foco, true);
  montagem.destroy();
  assert.equal(eventos.has("click"), false);
});
