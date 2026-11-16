/*
 * Lista simples de cursos para o Owner: um cartao por curso, com o que importa
 * (nome, preco, publicado ou rascunho, interessados, pedidos de inscricao) e as
 * acoes diretas (Editar, Ver interessados, Abrir/Gerenciar inscricoes).
 *
 * So le: o snapshot da operacao e as duas listas administrativas que ja existem
 * (admin_list_course_interests e admin_list_course_enrollment_requests). Nao grava
 * nada; as acoes abrem as telas existentes ("Novo curso" e "Inscricoes de cursos").
 */
import { cursosEditaveis, cursosParecidos, situacaoDoCurso } from "./novo-curso.js";
import { turmasDoCurso } from "./organizar-curso.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const PENDENTES = new Set(["solicitada", "aguardando_pagamento", "pagamento_confirmado"]);

export function precoDoCurso(s, d) {
  const t = turmasDoCurso(s, d.id)[0] || null;
  const c = Number.isInteger(t?.price_cents) ? t.price_cents : d.price_cents;
  if (c === 0) return "Gratuito";
  if (!Number.isInteger(c)) return "Preço não informado";
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* Resumo por curso a partir do snapshot e das listas administrativas. */
export function resumoDosCursos(s, { interessados = [], pedidos = [] } = {}) {
  const turmaParaCurso = new Map((s?.activity_offerings || []).map((o) => [o.id, o.definition_id]));
  return cursosEditaveis(s)
    .map((d) => {
      const turmas = turmasDoCurso(s, d.id);
      const meusPedidos = pedidos.filter((p) => turmaParaCurso.get(p.offering_id) === d.id);
      return {
        id: d.id, titulo: d.title || "Sem nome", publicado: d.published === true, situacao: situacaoDoCurso(d), preco: precoDoCurso(s, d),
        imagem: d.image || "", inscricoesAbertas: turmas.some((t) => t.published === true), temTurma: turmas.length > 0,
        interessados: interessados.filter((i) => i.course_id === d.id).length,
        pedidos: meusPedidos.length, pedidosPendentes: meusPedidos.filter((p) => PENDENTES.has(p.status)).length,
        parecidos: cursosParecidos(s, d.title, d.id).map((x) => ({ id: x.id, titulo: x.title, situacao: situacaoDoCurso(x) })),
      };
    })
    .sort((a, b) => Number(b.publicado) - Number(a.publicado) || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

export function renderizarCursosPainel(resumo, { carregando = false, erro = "" } = {}) {
  const conta = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  return `<section class="op-card cp-painel" aria-labelledby="cp-painel-titulo">
    <header class="cp-painel-topo"><div><h3 id="cp-painel-titulo">Cursos</h3>
      <p class="op-field-hint">Crie o curso, publique e acompanhe quem se interessou ou pediu inscrição.</p></div></header>
    ${erro ? `<p class="nc-erros" role="alert">${e(erro)}</p>` : ""}
    ${resumo.length ? `<ul class="cp-lista">${resumo.map((c) => `<li class="cp-curso" data-curso-id="${e(c.id)}">
      <div class="cp-curso-info">
        <p class="cp-curso-estado"><span class="nc-selo nc-selo-${c.publicado ? "publicado" : "rascunho"}">${e(c.situacao)}</span>${c.inscricoesAbertas ? `<span class="nc-selo nc-selo-aberto">Inscrições abertas</span>` : ""}</p>
        <h4>${e(c.titulo)}</h4>
        <p class="cp-curso-meta">${e(c.preco)} · ${carregando ? "contando…" : `${e(conta(c.interessados, "interessado", "interessados"))} · ${e(conta(c.pedidos, "pedido de inscrição", "pedidos de inscrição"))}${c.pedidosPendentes ? ` (${e(c.pedidosPendentes)} aguardando)` : ""}`}</p>
        ${c.parecidos.length ? `<p class="cp-curso-aviso" role="note">Nome parecido com: ${c.parecidos.map((p) => `${e(p.titulo)} (${e(p.situacao.toLowerCase())})`).join(", ")}. Confira antes de editar.</p>` : ""}
      </div>
      <div class="cp-curso-acoes">
        <button type="button" class="op-button" data-novo-curso="${e(c.id)}">Editar</button>
        <button type="button" class="op-button" data-novo-curso="${e(c.id)}" data-nc-ver-interessados>Ver interessados</button>
        ${c.temTurma
    ? `<button type="button" class="op-button" data-inscricoes-cursos="">Gerenciar inscrições</button>`
    : `<button type="button" class="op-button" data-novo-curso="${e(c.id)}" data-nc-abrir-inscricoes>Abrir inscrições</button>`}
      </div></li>`).join("")}</ul>` : `<p class="cp-vazio">Nenhum curso cadastrado ainda. Comece por “Novo curso”.</p>`}
  </section>`;
}

export function createCursosPainel({ root, operations, client = null } = {}) {
  if (!root || !operations) return null;
  let listas = { interessados: [], pedidos: [] };
  let estado = { carregando: Boolean(client?.rpc), erro: "" };
  let pedido = null;

  function render() {
    const alvo = root.querySelector("[data-cursos-painel]");
    if (!alvo) return;
    alvo.innerHTML = renderizarCursosPainel(resumoDosCursos(operations.snapshot || {}, listas), estado);
  }

  async function recarregar() {
    if (!client?.rpc) { estado = { carregando: false, erro: "" }; render(); return; }
    if (pedido) return pedido;
    pedido = (async () => {
      const [a, b] = await Promise.all([client.rpc("admin_list_course_interests"), client.rpc("admin_list_course_enrollment_requests")]);
      listas = { interessados: Array.isArray(a?.data) ? a.data : [], pedidos: Array.isArray(b?.data) ? b.data : [] };
      estado = { carregando: false, erro: a?.error || b?.error ? "Não foi possível contar interessados e pedidos agora." : "" };
    })().catch(() => { estado = { carregando: false, erro: "Não foi possível contar interessados e pedidos agora." }; })
      .finally(() => { pedido = null; render(); });
    return pedido;
  }

  void recarregar();
  return { render, recarregar };
}
