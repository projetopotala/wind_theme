import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { criarDadosSupabase } from "../../outputs/js/conta/adaptadores/supabase.js";
import { criarSolicitacaoAtendimento } from "../../outputs/js/conta/modelos.js";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";

const MIGRATION = new URL("../../supabase/migrations/202610210001_authenticated_appointment_requests.sql", import.meta.url);

function clientFake() {
  const calls = [];
  const query = {
    select(fields) { calls.push(["select", fields]); return this; },
    order(field, options) { calls.push(["order", field, options]); return this; },
    then(resolve, reject) {
      return Promise.resolve({ data: [{
        id: "3f2b8a6e-1c4d-4e5f-9a7b-2c8d1e0f3a4b",
        service: "Reiki",
        modality: "online",
        preferred_date: "2026-11-03",
        preferred_period: "noite",
        status: "recebida",
        created_at: "2026-10-21T12:00:00Z",
        updated_at: "2026-10-21T12:00:00Z",
      }], error: null }).then(resolve, reject);
    },
  };
  return {
    calls,
    from(table) { calls.push(["from", table]); return query; },
    async rpc(name, args) {
      calls.push(["rpc", name, args]);
      if (name === "list_appointment_offerings") return { data: [{ id: "oferta-1", service: "Reiki" }], error: null };
      if (name === "list_my_appointment_requests") return { data: [{
        id: "3f2b8a6e-1c4d-4e5f-9a7b-2c8d1e0f3a4b", service: "Reiki", modality: "online",
        preferred_date: "2026-11-03", preferred_period: "noite", status: "recebida",
        created_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T12:00:00Z",
      }], error: null };
      return { data: { id: "3f2b8a6e-1c4d-4e5f-9a7b-2c8d1e0f3a4b", status: "recebida" }, error: null };
    },
  };
}

test("a migration reutiliza operação, vincula Auth e mantém a solicitação separada da consulta", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  for (const dependency of ["appointment_requests", "profiles", "op_records", "is_portal_admin", "submit_appointment_request"]) {
    assert.match(sql, new RegExp(`to_reg(?:class|procedure)\\('public\\.${dependency}`), `dependência não conferida: ${dependency}`);
  }
  assert.match(sql, /alter table public\.appointment_requests[\s\S]*requester_user_id uuid references auth\.users/i);
  assert.match(sql, /create table public\.appointment_profile_accounts/i);
  assert.match(sql, /join public\.op_records as perfil/i, "o profissional deve vir do cadastro operacional existente");
  assert.match(sql, /collection = 'activity_offerings'/i, "o serviço deve vir das ofertas existentes");
  assert.match(sql, /appointment_requests_client_read[\s\S]*requester_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /appointment_requests_professional_read[\s\S]*is_appointment_professional/i);
  assert.match(sql, /public\.submit_appointment_request\(/i, "a validação e os limites da F2.2 devem ser reutilizados");
  assert.match(sql, /revoke all on function public\.submit_authenticated_appointment_request[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.submit_authenticated_appointment_request[\s\S]*to authenticated/i);
  assert.match(sql, /has_function_privilege\([\s\S]*'anon'[\s\S]*submit_authenticated_appointment_request[\s\S]*'authenticated'/i);
  const revokePosition = sql.search(/revoke all on function public\.submit_authenticated_appointment_request/i);
  const commitPosition = sql.lastIndexOf("commit;");
  assert.ok(revokePosition >= 0 && revokePosition < commitPosition, "o bloqueio deve ser atômico com a migration");
  assert.doesNotMatch(sql, /insert into public\.schedule_items/i, "pedido ainda não pode virar consulta automaticamente");
});

test("o modelo e a tela mostram somente o contrato seguro de acompanhamento", () => {
  const pedido = criarSolicitacaoAtendimento({
    id: "pedido-1", usuarioId: "cliente-1", servico: "Reiki", modalidade: "online",
    dataPreferida: "2026-11-03", periodoPreferido: "noite", status: "recebida",
    criadaEm: "2026-10-21T12:00:00Z", atualizadaEm: "2026-10-21T12:00:00Z",
  });
  const fechado = atendimentos.renderizar({ atendimentos: [pedido], atendimentoDisponivel: false });
  assert.match(fechado, /Novas solicitações continuam desativadas/);
  assert.doesNotMatch(fechado, /data-form="atendimento"/);
  assert.match(fechado, /ainda não é uma consulta confirmada/);

  const aberto = atendimentos.renderizar({
    atendimentos: [pedido], atendimentoDisponivel: true,
    opcoesAtendimento: [{ id: "oferta-1", service: "<b>Reiki</b>", professional: "Profissional", modality: "online" }],
    horariosAtendimento: [{ id: "horario-1", offering_id: "oferta-1", starts_at: "2026-11-03T21:00:00Z" }],
  });
  assert.match(aberto, /data-form="atendimento"/);
  assert.match(aberto, /&lt;b&gt;Reiki&lt;\/b&gt;/);
  assert.doesNotMatch(aberto, /<b>Reiki<\/b>/);
});

test("o adaptador lê só campos do cliente e usa a RPC autenticada para escrever", async () => {
  const client = clientFake();
  const data = criarDadosSupabase({ client });
  const [request] = await data.listar("atendimentos", "cliente-1");
  assert.equal(request.servico, "Reiki");
  assert.deepEqual(client.calls[0], ["rpc", "list_my_appointment_requests", undefined]);

  const args = {
    idempotencia: "3f2b8a6e-1c4d-4e5f-9a7b-2c8d1e0f3a4b",
    ofertaId: "oferta-1", modalidade: "online", dataPreferida: "2026-11-03", periodoPreferido: "noite",
  };
  const result = await data.solicitarAtendimento(args);
  assert.equal(result.status, "recebida");
  assert.deepEqual(client.calls.at(-1), ["rpc", "submit_authenticated_appointment_request", {
    p_idempotency_key: args.idempotencia,
    p_offering_id: args.ofertaId,
    p_modality: args.modalidade,
    p_preferred_date: args.dataPreferida,
    p_preferred_period: args.periodoPreferido,
  }]);
  await assert.rejects(data.gravar("atendimentos", request, "cliente-1"), /somente pela RPC autenticada/);
});

test("a implementação preserva a chave idempotente enquanto uma tentativa falha", async () => {
  const app = await readFile(new URL("../../outputs/js/conta/spa/app.js", import.meta.url), "utf8");
  assert.match(app, /pedido\.dataset\.idempotencia \|\|= globalThis\.crypto\.randomUUID\(\)/);
  assert.match(app, /await sessao\.solicitarHorarioAtendimento[\s\S]*delete pedido\.dataset\.idempotencia/);
  assert.doesNotMatch(app, /delete pedido\.dataset\.idempotencia[\s\S]*await sessao\.solicitarHorarioAtendimento/);
});
