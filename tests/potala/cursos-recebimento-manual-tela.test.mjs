import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  acoesDeRecebimento, acoesPermitidas, AVISO_RECEBIMENTO, createInscricoesCursos, hojeEmSaoPaulo,
  renderizarConfirmacaoRecebimento, renderizarCorrecaoRecebimento, renderizarInscricoes, textoDoRecebimento,
} from "../../outputs/js/admin/inscricoes-cursos.js";

const ler = (c) => readFileSync(new URL(`../../${c}`, import.meta.url), "utf8");
const PEDIDO = { id: "r1", status: "aguardando_pagamento", price_cents: 15000, created_at: "2026-11-16T09:00:00Z", updated_at: "2026-11-16T09:05:00Z",
  course_title: "Curso de Meditação Potala", student_name: "Ana <b>Aluna</b>", student_email: "ana@x.test", capacity: 3, seats_taken: 1, payment: null };

test("pedido aguardando pagamento ganha 'Registrar pagamento recebido'; outros estados nao", () => {
  assert.deepEqual(acoesDeRecebimento(PEDIDO), [["receber", "Registrar pagamento recebido"]]);
  assert.deepEqual(acoesDeRecebimento({ ...PEDIDO, status: "solicitada" }), []);
  assert.deepEqual(acoesDeRecebimento({ ...PEDIDO, price_cents: 0 }), [], "gratuito nao recebe");
  assert.deepEqual(acoesDeRecebimento({ ...PEDIDO, status: "matriculada", payment: { source: "manual", status: "registrado" } }), [["corrigir", "Corrigir recebimento"]]);
  assert.deepEqual(acoesDeRecebimento({ ...PEDIDO, status: "cancelada", payment: { source: "manual", status: "registrado" } }), [["estorno", "Registrar estorno realizado"]]);
  assert.deepEqual(acoesDeRecebimento({ ...PEDIDO, status: "cancelada", payment: { source: "manual", status: "estornado" } }), []);
  assert.deepEqual(acoesPermitidas("aguardando_pagamento", 15000).map((a) => a[0]), ["recusar", "cancelar"], "fila antiga intacta");
  const html = renderizarInscricoes([PEDIDO]);
  assert.match(html, /data-ic-receber="r1">Registrar pagamento recebido/);
  assert.doesNotMatch(html, /<b>Aluna<\/b>/, "texto escapado");
});

test("janela de confirmacao: curso, aluno, valor do banco, forma, data, referencia, aviso e confirmacao explicita", () => {
  const html = renderizarConfirmacaoRecebimento(PEDIDO, { hoje: "2026-11-16" });
  assert.match(html, /Curso de Meditação Potala/);
  assert.match(html, /Ana &lt;b&gt;Aluna&lt;\/b&gt;/);
  assert.match(html, /R\$\s?150,00/);
  for (const forma of ["Pix", "Transferência", "Dinheiro", "Outro"]) assert.match(html, new RegExp(`>${forma}<`));
  assert.match(html, /name="data"[^>]*value="2026-11-16"[^>]*max="2026-11-16"[^>]*min="2026-11-16"/);
  assert.match(html, /name="referencia"/);
  assert.ok(html.includes(AVISO_RECEBIMENTO));
  assert.match(AVISO_RECEBIMENTO, /^Confirme somente se o Instituto já recebeu o pagamento\. Esta ação registrará o recebimento e concluirá a matrícula\.$/);
  assert.match(html, /name="confirmo"/);
  assert.match(html, /data-ic-rec-confirmar disabled>Confirmar recebimento e matricular/, "nasce desabilitado");
  assert.doesNotMatch(html, /name="(valor|amount|preco|status)"/, "o valor nao e digitavel e nao ha campo de estado");
  assert.equal(hojeEmSaoPaulo(new Date("2026-11-16T01:00:00Z")), "2026-11-15", "dia de Sao Paulo, nao UTC");
});

test("texto do recebimento diferencia registrado, cancelado sem estorno, anulado e estornado", () => {
  const p = { source: "manual", method: "pix", amount_cents: 15000, received_on: "2026-11-16", reference: "E2E" };
  assert.match(textoDoRecebimento({ status: "matriculada", payment: { ...p, status: "registrado" } }), /Recebimento manual registrado: R\$\s?150,00 · Pix · 16\/11\/2026 · E2E/);
  assert.match(textoDoRecebimento({ status: "cancelada", payment: { ...p, status: "registrado" } }), /nenhum estorno foi registrado/);
  assert.match(textoDoRecebimento({ status: "aguardando_pagamento", payment: { ...p, status: "anulado", reversal_reason: "Pix não caiu" } }), /anulado[\s\S]*Pix não caiu/);
  assert.match(textoDoRecebimento({ status: "cancelada", payment: { ...p, status: "estornado", reversal_reason: "Devolvido" } }), /estornado[\s\S]*Devolvido/);
  assert.equal(textoDoRecebimento({ status: "solicitada", payment: null }), "");
  const html = renderizarCorrecaoRecebimento({ ...PEDIDO, status: "matriculada", payment: { ...p, status: "registrado", id: "p1" } });
  assert.match(html, /value="registro_incorreto" checked/);
  assert.match(html, /value="estorno_realizado"/);
  assert.match(html, /não registra devolução de dinheiro/);
});

/* Fluxo com DOM de mentira: o clique envia exatamente o que o banco espera, com o valor do pedido. */
function montar({ rpc }) {
  const ouvintes = new Map();
  const elemento = () => {
    const campos = {};
    return {
      campos, children: [], _html: "", attrs: {},
      set innerHTML(v) { this._html = v; },
      get innerHTML() { return this._html; },
      appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { (ouvintes.get(this) || ouvintes.set(this, {}).get(this))[t] = f; },
      showModal() { this.open = true; }, close() { this.open = false; },
      querySelector(sel) { const m = sel.match(/^\[name="(.+)"\]$/); if (m) return campos[m[1]] || null; if (sel === "[data-ic-rec-confirmar]") return campos._botao; if (sel === "[data-ic-ref-dica]") return null; return null; },
    };
  };
  const root = { ...elemento(), ownerDocument: { createElement: elemento } };
  const calls = [];
  const client = { rpc: async (n, a) => { calls.push([n, a]); return rpc(n, a); } };
  const modulo = createInscricoesCursos({ root, client, novaChaveFn: () => "11111111-1111-4111-8111-111111111111" });
  const [dialog, janela] = root.children;
  const [corpo] = dialog.children; const [painel] = janela.children;
  const clique = async (alvo, mapa) => { await ouvintes.get(alvo).click({ target: { closest: (s) => (mapa[s] ? { getAttribute: (k) => mapa[s][k] ?? mapa[s].id } : null) } }); await new Promise((r) => setTimeout(r, 5)); };
  return { modulo, corpo, painel, janela, calls, clique, ouvintes };
}

test("confirmar envia valor do pedido, chave estavel e depois recarrega com mensagem de sucesso", async () => {
  let aposRecebimento = false;
  const { modulo, corpo, painel, janela, calls, clique } = montar({
    rpc: async (nome) => {
      if (nome === "admin_list_course_enrollment_requests") return { data: [aposRecebimento ? { ...PEDIDO, status: "matriculada" } : PEDIDO] };
      aposRecebimento = true;
      return { data: { status: "matriculada" } };
    },
  });
  await modulo.carregar();
  await clique(corpo, { "[data-ic-receber]": { id: "r1" } });
  assert.equal(janela.open, true);
  assert.match(painel.innerHTML, /Registrar pagamento recebido/);
  const botao = { disabled: true };
  painel.campos._botao = botao;
  Object.assign(painel.campos, { forma: { value: "pix" }, data: { value: "2026-11-16" }, referencia: { value: "  Pix E2E  " }, confirmo: { checked: false } });
  await clique(painel, { "[data-ic-rec-confirmar]": { id: "x" } });
  assert.equal(calls.filter(([n]) => n === "admin_register_manual_course_payment").length, 0, "sem marcar a confirmacao nada e enviado");
  painel.campos.confirmo.checked = true;
  await clique(painel, { "[data-ic-rec-confirmar]": { id: "x" } });
  const envio = calls.find(([n]) => n === "admin_register_manual_course_payment");
  assert.deepEqual(envio[1], { p_idempotency_key: "11111111-1111-4111-8111-111111111111", p_request_id: "r1", p_expected_updated_at: PEDIDO.updated_at,
    p_amount_cents: 15000, p_method: "pix", p_received_on: "2026-11-16", p_reference: "Pix E2E" });
  assert.equal(janela.open, false);
  assert.match(corpo.innerHTML, /Recebimento registrado\. O aluno foi matriculado/);
  assert.equal(calls.filter(([n]) => n === "admin_list_course_enrollment_requests").length, 2, "recarregou a lista");
});

test("erro do banco: nada some em silencio; conflito fecha e recarrega; erro generico mantem a janela com a mesma chave", async () => {
  for (const [code, fecha] of [["PT409", true], ["PT422", true], ["XX000", false]]) {
    const { modulo, corpo, painel, janela, clique } = montar({
      rpc: async (nome) => (nome === "admin_list_course_enrollment_requests" ? { data: [PEDIDO] } : { error: { code } }),
    });
    await modulo.carregar();
    await clique(corpo, { "[data-ic-receber]": { id: "r1" } });
    painel.campos._botao = { disabled: true };
    Object.assign(painel.campos, { forma: { value: "dinheiro" }, data: { value: "2026-11-16" }, referencia: { value: "" }, confirmo: { checked: true } });
    await clique(painel, { "[data-ic-rec-confirmar]": { id: "x" } });
    assert.equal(janela.open === false, fecha, code);
    const texto = fecha ? corpo.innerHTML : painel.innerHTML;
    assert.match(texto, /role="alert"/, code);
  }
});

test("'Outro' exige referencia antes de habilitar a confirmacao", async () => {
  const { modulo, corpo, painel, clique, calls } = montar({ rpc: async (n) => (n === "admin_list_course_enrollment_requests" ? { data: [PEDIDO] } : { data: {} }) });
  await modulo.carregar();
  await clique(corpo, { "[data-ic-receber]": { id: "r1" } });
  painel.campos._botao = { disabled: false };
  Object.assign(painel.campos, { forma: { value: "outro" }, data: { value: "2026-11-16" }, referencia: { value: "" }, confirmo: { checked: true } });
  await clique(painel, { "[data-ic-rec-confirmar]": { id: "x" } });
  assert.equal(calls.some(([n]) => n === "admin_register_manual_course_payment"), false);
});

test("o navegador so usa as RPCs do Owner; nunca a confirmacao do servidor; nada de escrita direta", () => {
  const src = ler("outputs/js/admin/inscricoes-cursos.js");
  assert.doesNotMatch(src, /confirm_course_enrollment_payment/);
  assert.doesNotMatch(src, /\.from\(|\.insert\(|\.update\(|\.delete\(|service_role/);
  assert.deepEqual([...new Set([...src.matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1]))].sort(),
    ["admin_decide_course_enrollment_request", "admin_list_course_enrollment_requests", "admin_register_manual_course_payment", "admin_reverse_manual_course_payment"]);
  assert.match(src, /p_amount_cents: item\.price_cents/, "valor sempre vindo do pedido");
});

test("a migration e o rollback existem, sao aditivos e nao redefinem as funcoes internas nem a do servidor", () => {
  const m = ler("supabase/migrations/202611160008_cursos_recebimento_manual.sql");
  assert.doesNotMatch(m, /create or replace function public\.(course_enrollment_transition|course_enrollment_materialize|course_enrollment_dematerialize|confirm_course_enrollment_payment)/);
  assert.doesNotMatch(m, /grant execute on function public\.confirm_course_enrollment_payment/);
  assert.match(m, /course_payment_is_owner\(\)/);
  assert.match(m, /grant execute on function public\.admin_register_manual_course_payment\(uuid, uuid, timestamptz, integer, text, date, text\) to authenticated;/);
  assert.doesNotMatch(m, /grant execute[^;]*\bto (anon|public)\b/);
  assert.match(ler("supabase/rollbacks/202611160008_rollback_cursos_recebimento_manual.sql"), /Ha recebimentos registrados/);
});
