import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { formatarReais, situacaoFinanceira, resumoCobranca, textoParaCopiar } from "../../outputs/js/conta/pagamentos/apresentacao.js";
import { ESTADOS } from "../../supabase/functions/_shared/pagamentos/estados.ts";

/* PAY-01 | Apresentacao financeira do Meu Potala: textos claros por estado; so o estado "recebido" aparece como sucesso. */

test("apresentacao | todo estado financeiro tem texto proprio, com proximo passo", () => {
  const titulos = new Set();
  for (const e of ESTADOS) {
    const s = situacaoFinanceira(e);
    assert.ok(s.titulo && s.descricao && s.proximoPasso, e);
    assert.notEqual(s.titulo, "Situação indisponível", e);
    titulos.add(s.titulo);
  }
  assert.equal(titulos.size, ESTADOS.length, "titulos distintos");
  assert.equal(situacaoFinanceira("inventado").titulo, "Situação indisponível");
});

test("apresentacao | somente 'recebido' e sucesso; pendente, confirmado e vencido nunca parecem pagos", () => {
  for (const e of ESTADOS) assert.equal(situacaoFinanceira(e).pagoComSucesso, e === "recebido", e);
  assert.doesNotMatch(situacaoFinanceira("aguardando_pagamento").titulo, /recebido|pago\b/i);
});

test("apresentacao | valor em reais, data no fuso de Sao Paulo e resumo completo", () => {
  assert.match(formatarReais(15000), /R\$\s?150,00/);
  assert.match(formatarReais(12345), /123,45/);
  assert.equal(formatarReais(-1), "Valor indisponível");
  assert.equal(formatarReais(1.5), "Valor indisponível");
  const r = resumoCobranca({ servico: "Acolhimento", profissional: "Profissional X", inicio: "2026-12-01T17:00:00Z", valorCentavos: 15000, estado: "aguardando_pagamento" });
  assert.deepEqual([r.servico, r.profissional, r.forma, r.situacao], ["Acolhimento", "Profissional X", "Pix", "Aguardando o pagamento"]);
  assert.match(r.quando, /14:00/); // 17:00Z = 14:00 em Sao Paulo
  assert.match(r.emCasoDeErro, /não pague de novo/i);
  assert.equal(resumoCobranca({ estado: "recebido", valorCentavos: 100 }).profissional, "Profissional a confirmar");
});

test("apresentacao | Pix Copia e Cola e copiado como veio do servidor", () => {
  assert.equal(textoParaCopiar({ pix_copy_paste: "00020126..." }), "00020126...");
  assert.equal(textoParaCopiar({ pix_copy_paste: "" }), null);
  assert.equal(textoParaCopiar(null), null);
});

test("frontend | nenhuma credencial, chave ou URL do Asaas no codigo do navegador; modulo ainda nao esta ligado a nenhuma tela", () => {
  const raiz = new URL("../../outputs/", import.meta.url);
  const arquivos = [];
  (function ler(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name === "vendor" || e.name === "node_modules") continue; const p = new URL(e.name + (e.isDirectory() ? "/" : ""), dir); if (e.isDirectory()) ler(p); else if (/\.(js|html)$/.test(e.name)) arquivos.push(p); } })(raiz);
  for (const a of arquivos) {
    const codigo = readFileSync(a, "utf8");
    assert.doesNotMatch(codigo, /ASAAS_API_KEY|ASAAS_WEBHOOK_TOKEN|api\.asaas\.com|api-sandbox\.asaas\.com|access_token\s*:/i, a.pathname);
    if (!a.pathname.endsWith("pagamentos/apresentacao.js")) assert.doesNotMatch(codigo, /pagamentos\/apresentacao/, `${a.pathname} nao deve importar a apresentacao na PAY-01`);
  }
});
