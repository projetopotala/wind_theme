import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ler = (caminho) =>
  readFile(new URL(caminho, import.meta.url), "utf8");

test("cadastro administrativo inclui modalidade no formulario e payload", async () => {
  const js = await ler("../../outputs/js/admin/operations/controller.js");
  const linhas = js.split(/\r?\n/).filter(
    (linha) => linha.includes("if(kind==='offering')return")
  );

  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /mode:v\.mode\|\|'presencial'/);
  assert.match(linhas[1], /choice\('mode','Modalidade'/);
  assert.match(linhas[1], /\['presencial','Presencial'\]/);
  assert.match(linhas[1], /\['online','Online'\]/);
});

test("motor valida e conserva modalidade da oferta", async () => {
  const js = await ler("../../outputs/js/admin/operations/schedule.js");
  const trecho = js.split("case 'offering.save':")[1]
    ?.split("case 'enrollment.save':")[0];

  assert.ok(trecho, "Handler offering.save nao encontrado");
  assert.match(trecho, /row\.mode\s*\|\|\s*'presencial'/);
  assert.match(trecho, /includes\(mode\)/);
  assert.match(trecho, /return\s*\{\.\.\.row,[^;]*mode,/);
});

test("listagem e RPC aceitam somente ofertas de atendimento", async () => {
  const sql = await ler(
    "../../supabase/migrations/202610210001_authenticated_appointment_requests.sql"
  );

  assert.match(
    sql,
    /where oferta\.collection = 'activity_offerings'\s+and definicao\.document ->> 'kind' = 'appointment'/
  );

  const inicio = sql.indexOf(
    "create function public.submit_authenticated_appointment_request("
  );

  assert.ok(inicio >= 0, "RPC autenticada nao encontrada");

  const rpc = sql.slice(inicio);

  const guarda = rpc.indexOf(
    "if definition.document ->> 'kind' is distinct from 'appointment' then"
  );

  const persistencia = rpc.indexOf(
    "receipt := public.submit_appointment_request("
  );

  assert.ok(guarda >= 0, "Falta validacao do tipo de oferta");
  assert.ok(persistencia > guarda, "Validacao deve anteceder persistencia");
});