/*
 * O HISTÓRICO SE ESCREVE SOZINHO — MAS SÓ PARA QUEM ENTROU.
 *
 * Visitas de quem não tem conta não são guardadas em lugar nenhum, nem para
 * serem enviadas depois do login. Levar para a conta o que a pessoa leu antes de
 * entrar seria usar um passado que ela não autorizou a lembrar. A única exceção
 * é a página onde ela está no momento em que entra: essa ela viu entrando.
 *
 * Voltar à mesma página dentro de meia hora não gera outra linha. Recarregar,
 * abrir um bloco e fechar, ir e voltar pelo histórico do navegador — nada disso
 * é uma visita nova, e um histórico que registra cada recarga vira ruído.
 *
 * Gravar o histórico nunca atrapalha a leitura: qualquer falha é engolida.
 */

import { criarHistorico } from "./modelos.js";

const CHAVE_ULTIMAS = "potala.conta.ultimas-visitas";
export const JANELA_DE_VISITA = 30 * 60 * 1000;

export function deveRegistrar(ultimas = {}, chave, agora = Date.now()) {
  const antes = ultimas?.[chave];
  return typeof antes !== "number" || agora - antes > JANELA_DE_VISITA;
}

/* O artigo declara o próprio item, porque o título dele só existe depois de desenhado. */
export function itemDeclarado(elemento) {
  const dados = elemento?.dataset || {};
  if (!dados.itemRef) return null;
  return { tipo: dados.itemTipo, ref: dados.itemRef, titulo: dados.itemTitulo, href: dados.itemHref };
}

export function itemDaPagina(documento = document, local = globalThis.location) {
  const declarado = documento.querySelector?.("[data-item-visto]");
  if (declarado) return itemDeclarado(declarado);
  const secao = documento.body?.dataset?.section;
  if (!secao || secao === "meu-potala" || documento.body?.dataset?.storyPage === "true") return null;
  const titulo = documento.querySelector("main h1")?.textContent?.trim() || String(documento.title || "").split("—")[0].trim();
  if (!titulo) return null;
  return { tipo: "pagina", ref: secao, titulo, href: local?.pathname || "/" };
}

export function montarRastro({
  documento = document,
  sessao,
  armazenamento = globalThis.sessionStorage,
  agora = () => Date.now(),
  local = globalThis.location,
} = {}) {
  const lerUltimas = () => {
    try {
      return JSON.parse(armazenamento?.getItem(CHAVE_ULTIMAS) || "{}");
    } catch {
      return {};
    }
  };

  /* A mesma visita pode chegar por dois caminhos quase juntos: a montagem e o evento do artigo. */
  const emCurso = new Set();

  async function registrar(item) {
    const { status, usuario } = sessao.obter();
    if (!item?.ref || status !== "autenticado") return;
    /* A pessoa entra na chave: outra conta, nesta mesma aba, tem a sua própria visita. */
    const chave = `${usuario?.id}|${item.tipo}:${item.ref}`;
    if (emCurso.has(chave) || !deveRegistrar(lerUltimas(), chave, agora())) return;
    emCurso.add(chave);
    try {
      await sessao.colecao("historico").gravar(criarHistorico({ ...item, visitadoEm: new Date(agora()) }));
      const ultimas = lerUltimas();
      ultimas[chave] = agora();
      armazenamento?.setItem(CHAVE_ULTIMAS, JSON.stringify(ultimas));
    } catch {
      /* O histórico é secundário: sem banco, a leitura continua igual. */
    } finally {
      emCurso.delete(chave);
    }
  }

  const aoVer = (evento) => registrar(evento.detail);

  let estadoAnterior = sessao.obter().status;
  const desligarSessao = sessao.assinar((estado) => {
    if (estado.status === "autenticado" && estadoAnterior !== "autenticado") registrar(itemDaPagina(documento, local));
    estadoAnterior = estado.status;
  });

  documento.addEventListener("potala:item-visto", aoVer);
  if (sessao.obter().status === "autenticado") registrar(itemDaPagina(documento, local));

  return {
    registrar,
    destroy() {
      desligarSessao();
      documento.removeEventListener("potala:item-visto", aoVer);
    },
  };
}
