import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/202609180002_guarda_da_operacao.sql", import.meta.url),
  "utf8",
);
const sql = migration.replace(/--.*$/gm, "");
const repairMigration = await readFile(
  new URL("../../supabase/migrations/202610230001_restore_operational_guard.sql", import.meta.url),
  "utf8",
);
const repairSql = repairMigration.replace(/--.*$/gm, "");

test("o banco recusa documentos operacionais grandes ou sem forma básica", () => {
  assert.match(sql, /check \(pg_column_size\(document\) <= 1000000\) not valid/i);
  assert.match(sql, /new\.collection = 'rooms'/i);
  assert.match(sql, /new\.collection <> 'schedule_items'/i);
  assert.match(sql, /Situação da sala inválida/i);
  assert.match(sql, /Horário da ocorrência inválido/i);
});

test("a última barreira do banco impede choque de sala e profissional", () => {
  assert.match(sql, /tstzrange/i);
  assert.match(sql, /Conflito de sala/i);
  assert.match(sql, /Conflito de profissional/i);
  assert.match(sql, /registro\.id <> new\.id/i);
  assert.match(sql, /coalesce\(registro\.document ->> 'status', 'booked'\) <> 'cancelled'/i);
});

test("sala presencial precisa existir, estar disponível e comportar participantes", () => {
  assert.match(sql, /collection = 'rooms'/i);
  assert.match(sql, /Sala inexistente/i);
  assert.match(sql, /Sala indisponível/i);
  assert.match(sql, /Capacidade da sala excedida/i);
  assert.match(sql, /Atendimento online não pode ter sala física/i);
  assert.match(sql, /Sala com agenda não pode ser removida/i);
  assert.match(sql, /Sala com reserva futura precisa continuar disponível/i);
  assert.match(sql, /Capacidade inferior a uma reserva existente/i);
});

test("o gatilho não vira uma RPC pública", () => {
  assert.match(sql, /create trigger op_records_validate_before_write/i);
  assert.match(sql, /revoke all on function public\.validate_op_record\(\) from public, anon, authenticated/i);
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;\s*$/m);
});

test("a correção exige a operação instalada e rejeita constraint incompatível", () => {
  for (const dependency of ["op_records", "op_meta", "op_requests", "op_apply", "is_portal_admin"]) {
    assert.match(repairSql, new RegExp(dependency, "i"));
  }
  assert.match(repairSql, /Constraint op_records_document_size possui definição incompatível/i);
  assert.match(repairMigration, /^begin;$/m);
  assert.match(repairMigration, /^commit;\s*$/m);
});

test("a correção restaura a definição histórica sem recriar trigger correto", () => {
  assert.match(repairSql, /create or replace function public\.validate_op_record\(\)/i);
  assert.match(repairSql, /if not found then\s+create trigger op_records_validate_before_write/i);
  assert.doesNotMatch(repairSql, /drop trigger/i);
  assert.match(repairSql, /Trigger op_records_validate_before_write possui definição incompatível/i);
  assert.match(repairSql, /revoke all on function public\.validate_op_record\(\) from public, anon, authenticated/i);
});
