import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

import { createOperationsClient } from "../../outputs/js/admin/operations/client.js";
import { executarPlano, simularPlano } from "../../outputs/js/admin/organizar-curso.js";
import { dadosDoServico, montarPlanoAlternar, montarPlanoServico, novoFormulario, servicosDeAtendimento, validarServico } from "../../outputs/js/admin/servicos-atendimento.js";

/*
 * Cadastro simples de serviços contra o BANCO REAL (todas as migrations; só auth/storage simulados):
 * o Owner cria/edita/ativa/desativa pelo mesmo motor da Central, o cliente só vê o que está ativo,
 * conta comum não grava, e o fluxo pedido -> Owner agenda profissional habilitado segue igual.
 */
const DIR = new URL("../../supabase/migrations/", import.meta.url);
const U = { owner: "00000000-0000-0000-0000-0000000000a1", cliente: "00000000-0000-0000-0000-0000000000c1", outro: "00000000-0000-0000-0000-0000000000c2" };

async function montar() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema extensions; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), deleted_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $x$ select string_to_array(name, '/') $x$;
    create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
  `);
  for (const a of readdirSync(DIR).sort()) await db.exec(readFileSync(new URL(a, DIR), "utf8"));
  await db.exec("grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated");
  for (const [k, email] of [["owner", "owner@potala.test"], ["cliente", "cliente@potala.test"], ["outro", "outro@potala.test"]]) {
    await db.query("insert into auth.users(id, email) values ($1,$2)", [U[k], email]);
  }
  await db.query("insert into public.users(id, role, name, email) values ($1,'owner','owner','owner@potala.test') on conflict (id) do update set role='owner'", [U.owner]);
  const doc = (col, id, d) => db.query("insert into public.op_records(collection, id, document) values ($1,$2,$3::jsonb)", [col, id, JSON.stringify({ id, ...d })]);
  await doc("profiles", "prof-ana", { display_name: "TESTE INTERNO Ana", email: "ana@potala.test", roles: ["professional"], active: true, published: true });
  await doc("profiles", "prof-bia", { display_name: "TESTE INTERNO Bia", email: "bia@potala.test", roles: ["professional"], active: true, published: true });
  await doc("profiles", "prof-off", { display_name: "TESTE INTERNO Inativa", email: "off@potala.test", roles: ["professional"], active: false, published: false });
  await doc("profiles", "pessoa-comum", { display_name: "TESTE INTERNO Cliente", email: "cli@potala.test", roles: ["client"], active: true });
  const como = async (uid, sql, params) => {
    await db.exec(`set test.uid = '${uid}'; set role authenticated`);
    try { return await db.query(sql, params); } finally { await db.exec("reset role; set test.uid = ''"); }
  };
  return { db, como };
}

function clienteRpc(como, uid) {
  return {
    async rpc(nome, args = {}) {
      const chaves = Object.keys(args);
      const sql = `select public.${nome}(${chaves.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
      const valores = chaves.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      try { return { data: (await como(uid, sql, valores)).rows[0].r, error: null }; } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    },
  };
}
const registros = async (db, col) => (await db.query("select document from public.op_records where collection=$1 order by ordem", [col])).rows.map((r) => r.document);
const publicos = async (como, uid = U.cliente) => (await como(uid, "select public.list_appointment_offerings() as l")).rows[0].l;

async function salvar(op, dados) {
  const s = op.snapshot;
  const erros = validarServico(dados, s);
  assert.deepEqual(erros, []);
  const passos = montarPlanoServico(dados, s);
  assert.equal(simularPlano(s, passos).ok, true);
  const r = await executarPlano({ operations: op, passos });
  assert.equal(r.ok, true, r.falha?.motivo);
  await op.refresh();
  return r;
}
const form = (extra = {}) => ({ ...novoFormulario(), nome: "TESTE INTERNO Acolhimento", descricao: "Conversa inicial", modalidade: "ambas", duracao: 45, profissionais: ["prof-ana", "prof-bia"], status: "ativo", ...extra });

test("Owner cadastra serviço online+presencial sem SQL: cliente vê as duas ofertas, ligadas a profissionais habilitados", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: clienteRpc(como, U.owner) });
  await op.refresh();
  await salvar(op, form());
  const [def] = await registros(db, "activity_definitions");
  assert.equal(def.kind, "appointment");
  assert.equal(def.duration_minutes, 45);
  const ofertas = await registros(db, "activity_offerings");
  assert.deepEqual(ofertas.map((o) => o.mode).sort(), ["online", "presencial"]);
  assert.ok(ofertas.every((o) => o.active === true && o.definition_id === def.id && !o.professional_id));
  const vinculos = await registros(db, "offering_professionals");
  assert.equal(vinculos.length, 4);
  const lista = await publicos(como);
  assert.equal(lista.length, 2);
  assert.ok(lista.every((s) => s.title?.includes?.("Acolhimento") || JSON.stringify(s).includes("Acolhimento")));
  assert.ok((await registros(db, "audit_events")).length >= 7, "cada gravação gera evento de auditoria");
});

test("serviço inativo/rascunho não aparece; desativar e reativar preserva tudo e não apaga nada", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: clienteRpc(como, U.owner) });
  await op.refresh();
  await salvar(op, form({ status: "inativo", modalidade: "online", nome: "TESTE INTERNO Mentoria" }));
  assert.equal((await publicos(como)).length, 0, "nasce inativo e oculto");
  const id = servicosDeAtendimento(op.snapshot)[0].id;
  let plano = montarPlanoAlternar(op.snapshot, id, true);
  assert.equal(plano.erro, "");
  await executarPlano({ operations: op, passos: plano.passos }); await op.refresh();
  assert.equal((await publicos(como)).length, 1, "ativado aparece");
  const antes = (await registros(db, "activity_offerings")).length;
  plano = montarPlanoAlternar(op.snapshot, id, false);
  await executarPlano({ operations: op, passos: plano.passos }); await op.refresh();
  assert.equal((await publicos(como)).length, 0, "desativado some para o cliente");
  assert.equal((await registros(db, "activity_offerings")).length, antes, "nada excluído");
  assert.equal((await registros(db, "activity_definitions")).length, 1);
});

test("editar: trocar para só online desativa a oferta presencial; tirar profissional desativa o vínculo; nada é apagado", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: clienteRpc(como, U.owner) });
  await op.refresh();
  await salvar(op, form());
  const id = servicosDeAtendimento(op.snapshot)[0].id;
  const d = dadosDoServico(op.snapshot, id);
  assert.equal(d.modalidade, "ambas");
  await salvar(op, { ...d, modalidade: "online", profissionais: ["prof-ana"], nome: "TESTE INTERNO Acolhimento (novo)", duracao: 60 });
  assert.equal((await publicos(como)).length, 1);
  const ofertas = await registros(db, "activity_offerings");
  assert.equal(ofertas.length, 2);
  assert.equal(ofertas.find((o) => o.mode === "presencial").active, false);
  const vinc = await registros(db, "offering_professionals");
  assert.equal(vinc.length, 4);
  const online = ofertas.find((o) => o.mode === "online").id;
  assert.deepEqual(vinc.filter((l) => l.offering_id === online && l.active !== false).map((l) => l.professional_id), ["prof-ana"], "Bia saiu da oferta online (vínculo desativado, não apagado)");
  assert.equal((await registros(db, "activity_definitions")).length, 1, "mesma definição editada");
  assert.equal((await registros(db, "activity_definitions"))[0].duration_minutes, 60);
});

test("conta comum não grava serviço (op_apply é só da administração)", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: clienteRpc(como, U.cliente) });
  await assert.rejects(() => op.refresh());
  await assert.rejects(() => op.command("definition.save", { title: "Invasor", kind: "appointment" }));
  assert.equal((await registros(db, "activity_definitions")).length, 0);
});

test("fluxo completo: cliente pede o serviço novo; Owner escolhe profissional habilitado e agenda; profissional fora do vínculo é recusado", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: clienteRpc(como, U.owner) });
  await op.refresh();
  await salvar(op, form({ modalidade: "online", profissionais: ["prof-ana"] }));
  const oferta = (await registros(db, "activity_offerings"))[0];
  const DIA = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  await como(U.cliente, "select public.submit_authenticated_appointment_request($1::uuid,$2,$3,$4::date,$5) as r", ["bbbbbbbb-0000-0000-0000-0000000000f1", oferta.id, "online", DIA, "tarde"]);
  const pedido = (await db.query("select id, updated_at from public.appointment_requests where offering_id=$1", [oferta.id])).rows[0];
  const inicio = new Date(Date.now() + 8 * 864e5); inicio.setUTCHours(13, 0, 0, 0);
  const fim = new Date(inicio.valueOf() + 45 * 60e3);
  const confirmar = (prof, chave) => como(U.owner, "select public.confirm_appointment_request_reservation($1::uuid,$2::timestamptz,$3,$4::jsonb) as r",
    [pedido.id, pedido.updated_at, chave, JSON.stringify({ starts_at: inicio.toISOString(), ends_at: fim.toISOString(), professional_profile_id: prof, offering_id: oferta.id, room_id: null, notes: "" })])
    .then((x) => ({ ok: true, r: x.rows[0].r })).catch((e) => ({ ok: false, message: e.message }));
  assert.equal((await confirmar("prof-bia", "cccccccc-0000-4000-8000-0000000000f1")).ok, false, "Bia não foi habilitada");
  const ok = await confirmar("prof-ana", "cccccccc-0000-4000-8000-0000000000f2");
  assert.equal(ok.ok, true, ok.message);
  const depois = (await db.query("select professional_profile_id, reservation_schedule_id from public.appointment_requests where id=$1", [pedido.id])).rows[0];
  assert.equal(depois.professional_profile_id, "prof-ana");
  assert.ok(depois.reservation_schedule_id);
  const meus = (await como(U.cliente, "select public.list_my_appointment_requests() as l")).rows[0].l;
  assert.equal(meus.length, 1);
  /* desativar depois não apaga a consulta */
  const plano = montarPlanoAlternar(op.snapshot, servicosDeAtendimento(op.snapshot)[0].id, false);
  await executarPlano({ operations: op, passos: plano.passos });
  assert.equal((await db.query("select count(*) n from public.appointment_requests")).rows[0].n, 1);
  assert.equal((await registros(db, "schedule_items")).length >= 0, true);
});

test("validações: nome, duplicado, duração, modalidade, ativo sem profissional, profissional inativo, fixo", async () => {
  const { como } = await montar();
  const op = createOperationsClient({ client: clienteRpc(como, U.owner) });
  await op.refresh();
  const s = op.snapshot;
  assert.ok(validarServico(form({ nome: "  " }), s).length);
  assert.ok(validarServico(form({ duracao: 5 }), s).length);
  assert.ok(validarServico(form({ modalidade: "x" }), s).length);
  assert.ok(validarServico(form({ profissionais: [] }), s).length, "ativo exige profissional");
  assert.deepEqual(validarServico(form({ profissionais: [], status: "inativo" }), s), [], "rascunho/inativo pode ficar sem profissional");
  assert.ok(validarServico(form({ profissionais: ["prof-off"] }), s).length, "profissional inativo recusado");
  assert.ok(validarServico(form({ fixo: true }), s).length, "fixo exige exatamente um");
  assert.deepEqual(validarServico(form({ fixo: true, profissionais: ["prof-ana"] }), s), []);
  await salvar(op, form());
  assert.ok(validarServico(form(), op.snapshot).some((m) => /já existe/i.test(m)), "nome duplicado");
});

test("profissional fixo: a oferta já nasce com o profissional", async () => {
  const { db, como } = await montar();
  const op = createOperationsClient({ client: clienteRpc(como, U.owner) });
  await op.refresh();
  await salvar(op, form({ modalidade: "online", fixo: true, profissionais: ["prof-bia"], nome: "TESTE INTERNO Sessão com a Bia" }));
  const [oferta] = await registros(db, "activity_offerings");
  assert.equal(oferta.professional_id, "prof-bia");
  assert.equal((await publicos(como)).length, 1);
});
