import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PEDIDO_DEMO_ID, SELO_DEMONSTRACAO, ativarDemonstracaoDePagamento, demonstracaoDePagamentoPermitida,
  gravarEstadoDemo, lerEstadoDemo, pedidoDemonstracao,
} from "../../outputs/js/conta/pagamento-demonstracao.js";
import { criarDadosDemonstracao } from "../../outputs/js/conta/adaptadores/demonstracao.js";
import { querDemonstracao } from "../../outputs/js/conta/conta.js";
import { pedidosDeInscricao } from "../../outputs/js/conta/spa/vistas/cursos.js";

const ler = (c) => readFileSync(new URL(`../../${c}`, import.meta.url), "utf8");
const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const em = (hostname, search = "") => ({ hostname, search });
const PREVIEW = "wind-theme-git-codex-cursos-asaas-sandbox-potala.vercel.app";

test("demonstracao so liga em ambiente local ou Preview de branch; nunca em Production", () => {
  for (const h of ["localhost", "127.0.0.1", PREVIEW]) assert.equal(demonstracaoDePagamentoPermitida(em(h)), true, h);
  for (const h of ["institutopotala.com.br", "www.institutopotala.org", "wind-theme.vercel.app", "wind-theme-23km31aqy-potala.vercel.app",
    "wind-theme-git-x-potala.vercel.app.evil.com", "evil-wind-theme-git-x-potala.vercel.app", ""]) {
    assert.equal(demonstracaoDePagamentoPermitida(em(h)), false, h);
  }
});

test("?demo=pagamento em Production nao liga a simulacao nem a conta ficticia", () => {
  const s = memoria();
  assert.equal(querDemonstracao(em("wind-theme-23km31aqy-potala.vercel.app", "?demo=pagamento"), s), false);
  assert.equal(lerEstadoDemo(s), null);
  const p = memoria();
  assert.equal(querDemonstracao(em(PREVIEW, "?demo=pagamento"), p), true);
  assert.deepEqual(lerEstadoDemo(p), { ativo: true, estado: null, metodo: "pix" });
  querDemonstracao(em(PREVIEW, "?demo=sair"), p);
  assert.equal(lerEstadoDemo(p), null);
});

test("estados simulados: aguardando e recusado seguem aguardando pagamento; aprovado mostra matriculado", () => {
  assert.equal(pedidoDemonstracao({ estado: null }).status, "aguardando_pagamento");
  assert.equal(pedidoDemonstracao({ estado: "aguardando" }).status, "aguardando_pagamento");
  assert.equal(pedidoDemonstracao({ estado: "recusado" }).status, "aguardando_pagamento");
  assert.equal(pedidoDemonstracao({ estado: "aprovado" }).status, "matriculada");
  const html = pedidosDeInscricao([pedidoDemonstracao({ estado: null })]);
  assert.match(html, new RegExp(SELO_DEMONSTRACAO));
  assert.match(html, /Simular pagamento com Pix ou cartão/);
  assert.doesNotMatch(html, /asaas\.com/);
  assert.match(pedidosDeInscricao([pedidoDemonstracao({ estado: "aprovado" })]), /Acessar o curso \(demonstração\)/);
});

test("adaptador de demonstracao: sem estado nao inventa pedido; pedido real nunca vira pagamento local", async () => {
  const sessao = memoria();
  const dados = criarDadosDemonstracao({ armazenamento: memoria(), sessao, local: em(PREVIEW) });
  assert.deepEqual(await dados.inscricoesCursos(), []);
  await assert.rejects(dados.iniciarPagamentoCurso(PEDIDO_DEMO_ID));
  ativarDemonstracaoDePagamento(em(PREVIEW), sessao);
  assert.equal((await dados.inscricoesCursos())[0].id, PEDIDO_DEMO_ID);
  assert.equal(await dados.iniciarPagamentoCurso(PEDIDO_DEMO_ID), "/pagamento-demonstracao.html?pedido=demo-pedido-curso");
  await assert.rejects(dados.iniciarPagamentoCurso("8f1c0000-0000-0000-0000-000000000001"));
  gravarEstadoDemo({ estado: "aprovado" }, sessao);
  assert.equal((await dados.inscricoesCursos())[0].status, "matriculada");
  const prod = criarDadosDemonstracao({ armazenamento: memoria(), sessao, local: em("wind-theme-23km31aqy-potala.vercel.app") });
  assert.deepEqual(await prod.inscricoesCursos(), []);
  await assert.rejects(prod.iniciarPagamentoCurso(PEDIDO_DEMO_ID));
});

test("codigo da demonstracao nao toca rede, Supabase, Asaas, cartao ou confirmacao financeira", () => {
  const arquivos = ["outputs/js/conta/pagamento-demonstracao.js", "outputs/js/pagamento-demonstracao-pagina.js", "outputs/pagamento-demonstracao.html"];
  for (const f of arquivos) {
    const fonte = ler(f);
    for (const proibido of [/fetch\(/, /\.rpc\(/, /functions\.invoke/, /supabase/i, /api(-sandbox)?\.asaas\.com/, /confirm_course_enrollment_payment/, /process_course_payment_webhook/, /<input/i, /000201/]) {
      assert.doesNotMatch(fonte, proibido, `${f}: ${proibido}`);
    }
  }
  assert.match(ler("outputs/pagamento-demonstracao.html"), /DEMONSTRAÇÃO — nenhum pagamento real/);
  assert.match(ler("outputs/pagamento-demonstracao.html"), /noindex/);
});

test("integracao real preservada: adaptador Supabase segue so com Checkout hospedado do Asaas", () => {
  const supa = ler("outputs/js/conta/adaptadores/supabase.js");
  assert.match(supa, /create-course-payment-checkout/);
  assert.match(supa, /asaas\.com/);
  assert.doesNotMatch(supa, /pagamento-demonstracao/);
});
