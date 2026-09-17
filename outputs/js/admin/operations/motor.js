/*
 * O MOTOR DOS COMANDOS DA OPERAÇÃO.
 *
 * Um comando (salvar sala, reservar, lançar pagamento…) é aplicado a uma cópia
 * do estado pelas regras de domínio de schedule.js e resources.js. O que sai
 * daqui é a lista exata de registros que mudaram — é isso, e só isso, que vai
 * ao banco.
 *
 * As regras rodam no navegador, mas contra o estado de uma revisão conhecida.
 * O banco só aceita a gravação se a revisão ainda for a mesma
 * (public.op_apply): se outra janela gravou no meio, o comando é recusado e
 * refeito sobre o estado novo. Assim um conflito de sala checado aqui não
 * envelhece antes de chegar ao banco. Quem pode gravar é decidido lá, não aqui.
 */

export const COLECOES = Object.freeze([
  "rooms", "profiles", "activity_definitions", "activity_offerings", "offering_professionals",
  "schedule_items", "schedule_series", "schedule_participants", "enrollments",
  "inventory_items", "inventory_assets", "inventory_balances", "inventory_movements", "maintenance_orders",
  "financial_entries", "payments", "payment_allocations", "split_rules", "split_allocations", "audit_events",
]);

/* O banco devolve as chaves do JSON em outra ordem; comparar texto cru marcaria como alterado o que não mudou. */
export function textoEstavel(valor) {
  const ordenar = (item) => {
    if (Array.isArray(item)) return item.map(ordenar);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.keys(item).sort().map((chave) => [chave, ordenar(item[chave])]));
    }
    return item;
  };
  return JSON.stringify(ordenar(valor));
}

export function estadoVazio() {
  return { revision: 0, ...Object.fromEntries(COLECOES.map((nome) => [nome, []])) };
}

/**
 * @returns {{result: unknown, changes: Array<{table: string, id: string, after: object|null}>}}
 */
export function aplicarComando(antes, comando, { handlers, id, agora, actor = "" }) {
  if (!comando || typeof comando.type !== "string" || !comando.payload || typeof comando.payload !== "object" || Array.isArray(comando.payload)) {
    throw new Error("Comando inválido.");
  }
  const base = { ...estadoVazio(), ...structuredClone(antes || {}) };
  const estado = structuredClone(base);
  const ctx = { id, now: agora, actor };

  let result;
  for (const handler of handlers) {
    result = handler(estado, comando, ctx);
    if (result !== undefined) break;
  }
  if (result === undefined) throw new Error("Operação desconhecida.");

  const changes = [];
  for (const tabela of COLECOES) {
    if (tabela === "audit_events") continue;
    const anteriores = new Map((base[tabela] || []).map((linha) => [linha.id, textoEstavel(linha)]));
    const vistos = new Set();
    for (const linha of estado[tabela] || []) {
      linha.id ||= id();
      if (vistos.has(linha.id)) throw new Error("Identificador duplicado.");
      vistos.add(linha.id);
      if (anteriores.get(linha.id) !== textoEstavel(linha)) changes.push({ table: tabela, id: linha.id, after: linha });
    }
    for (const chave of anteriores.keys()) {
      if (!vistos.has(chave)) changes.push({ table: tabela, id: chave, after: null });
    }
  }
  return { result, changes };
}
