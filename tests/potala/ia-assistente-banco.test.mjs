import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

/* IA-01 | Limites de uso do assistente no banco (migration preparada, NÃO aplicada). */
const ler = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const MIGRATION = "supabase/migrations/202611130001_ia_assistente_uso.sql";
const A = "a".repeat(32);
const B = "b".repeat(32);

async function banco() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; grant usage on schema public to anon, authenticated, service_role;");
  const sql = ler(MIGRATION);
  await db.exec(sql);
  await db.exec(sql); // reaplicar é seguro
  return db;
}
const reservar = (db, cliente, [min, dia, glob, tok] = [2, 3, 5, 100000]) => db.query("select public.ia_reservar_uso($1, $2, $3, $4, $5) r", [cliente, min, dia, glob, tok]);
const como = async (db, papel) => { await db.exec("reset role"); await db.exec(`set role ${papel}`); };

test("ninguém pelo navegador: anon/authenticated não leem, não gravam e não executam", async () => {
  const db = await banco();
  for (const papel of ["anon", "authenticated"]) {
    await como(db, papel);
    await assert.rejects(db.query("select * from public.ia_uso_cliente"), /permission denied/, papel);
    await assert.rejects(db.query("select * from public.ia_uso_global"), /permission denied/, papel);
    await assert.rejects(db.query("insert into public.ia_uso_global (dia) values (current_date)"), /permission denied/, papel);
    await assert.rejects(reservar(db, A), /permission denied/, papel);
    await assert.rejects(db.query("select public.ia_registrar_tokens(10)"), /permission denied/, papel);
  }
  await como(db, "service_role");
  assert.deepEqual((await reservar(db, A)).rows[0].r, { restantes_dia: 2 });
  await db.close();
});

test("limites: por minuto, por dia, teto global de pedidos e de tokens (PT429 / PT503)", async () => {
  const db = await banco();
  await como(db, "service_role");
  await reservar(db, A);
  await reservar(db, A);
  await assert.rejects(reservar(db, A), (e) => e.code === "PT429", "3º pedido no mesmo minuto");
  await db.exec("reset role");
  await db.query("update public.ia_uso_cliente set minuto = minuto - interval '2 minutes'");
  await como(db, "service_role");
  await reservar(db, A);
  await db.exec("reset role");
  await db.query("update public.ia_uso_cliente set minuto = minuto - interval '2 minutes'");
  await como(db, "service_role");
  await assert.rejects(reservar(db, A), (e) => e.code === "PT429", "limite diário (3)");
  await reservar(db, B);
  await reservar(db, B);
  await assert.rejects(reservar(db, "c".repeat(32)), (e) => e.code === "PT503", "teto global de 5 pedidos");
  await db.exec("reset role");
  await db.query("delete from public.ia_uso_global");
  await como(db, "service_role");
  await db.query("select public.ia_registrar_tokens(150000)");
  await assert.rejects(reservar(db, "d".repeat(32)), (e) => e.code === "PT503", "teto de tokens do dia");
  await db.close();
});

test("entradas inválidas recusadas; só contadores guardados; retenção mínima", async () => {
  const db = await banco();
  await como(db, "service_role");
  for (const args of [["203.0.113.9", 2, 3, 5, 100000], [A, 0, 3, 5, 100000], [A, 2, 3, 5, 10]]) {
    await assert.rejects(db.query("select public.ia_reservar_uso($1, $2, $3, $4, $5)", args), (e) => e.code === "22023" || e.code === "23514", String(args[0]));
  }
  await assert.rejects(db.query("select public.ia_registrar_tokens(-1)"), (e) => e.code === "22023");
  await db.exec("reset role");
  const colunas = (await db.query("select string_agg(column_name, ',' order by table_name, ordinal_position) c from information_schema.columns where table_name in ('ia_uso_cliente','ia_uso_global')")).rows[0].c;
  assert.equal(colunas, "cliente,dia,minuto,pedidos_minuto,pedidos_dia,dia,pedidos,tokens", "nenhuma coluna de texto livre, IP ou conversa");
  await db.query(`insert into public.ia_uso_cliente (cliente, dia, minuto) values ('${B}', current_date - 5, now())`);
  await db.query("insert into public.ia_uso_global (dia) values (current_date - 40)");
  await como(db, "service_role");
  await reservar(db, A);
  await db.exec("reset role");
  assert.equal((await db.query(`select count(*)::int n from public.ia_uso_cliente where cliente = '${B}'`)).rows[0].n, 0, "visitante de dias atrás apagado");
  assert.equal((await db.query("select count(*)::int n from public.ia_uso_global where dia < current_date - 30")).rows[0].n, 0);
  await db.close();
});

test("migration e rollback isolados: não tocam em outras tabelas, contas ou permissões", () => {
  const codigo = ler(MIGRATION).replace(/--.*$/gm, "");
  assert.doesNotMatch(codigo, /blog_|op_records|public\.users|portal_module_permissions|auth\./);
  assert.doesNotMatch(codigo, /grant [^;]*to [^;]*\b(anon|authenticated)\b/i);
  assert.match(codigo, /security definer set search_path = ''/);
  const rollback = ler("supabase/rollbacks/202611130001_rollback_ia_assistente_uso.sql").replace(/--.*$/gm, "");
  assert.match(rollback, /drop table if exists public\.ia_uso_cliente;/);
  assert.doesNotMatch(rollback, /blog_|users|portal_module/);
});
