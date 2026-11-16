import { test } from "node:test";
import assert from "node:assert/strict";
import { montar, U } from "./cursos-inscricao-banco.test.mjs";

const KEY = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
async function pagoPreparado() {
  const x = await montar();
  await x.turmaAberta("asaas", { preco: 15000, vagas: 2 });
  const requestId = (await x.pedir(U.a1, "asaas")).r.id;
  await x.decidir(requestId, "aprovar");
  const prepared = (await x.como(U.a1,
    "select public.prepare_course_payment_checkout($1::uuid,$2::uuid) as r", [requestId, KEY])).rows[0].r;
  await x.como(null, "select public.register_course_payment_checkout($1::uuid,$2,$3)",
    [prepared.id, "chk_TESTE", "https://asaas.com/checkoutSession/show?id=chk_TESTE"], "service_role");
  return { ...x, requestId, checkoutId: prepared.id, external: prepared.external_reference };
}
const evento = ({ id = "evt_1", type = "CHECKOUT_PAID", status = "PAID", checkout = "chk_TESTE", external, value = 150 }) => ({
  id, event: type, checkout: { id: checkout, status, externalReference: external,
    items: [{ name: "Curso", quantity: 1, value }] },
});

test("checkout usa identidade e preco congelado; outro aluno nao prepara", async () => {
  const x = await montar();
  await x.turmaAberta("asaas", { preco: 15000 });
  const id = (await x.pedir(U.a1, "asaas")).r.id;
  await x.decidir(id, "aprovar");
  await assert.rejects(() => x.como(U.a2, "select public.prepare_course_payment_checkout($1::uuid,$2::uuid)", [id, KEY]), /inexistente/i);
  const a = (await x.como(U.a1, "select public.prepare_course_payment_checkout($1::uuid,$2::uuid) r", [id, KEY])).rows[0].r;
  const b = (await x.como(U.a1, "select public.prepare_course_payment_checkout($1::uuid,$2::uuid) r", [id, KEY])).rows[0].r;
  assert.equal(a.id, b.id);
  assert.equal(a.amount_cents, 15000);
  await assert.rejects(() => x.como(U.a1, "select * from public.course_payment_checkouts"), /permission denied/i);
});

test("falha antes do registro libera nova tentativa sem reutilizar referencia financeira", async () => {
  const x = await montar();
  await x.turmaAberta("retry", { preco: 5000 });
  const id = (await x.pedir(U.a1, "retry")).r.id;
  await x.decidir(id, "aprovar");
  const first = (await x.como(U.a1, "select public.prepare_course_payment_checkout($1::uuid,$2::uuid) r", [id, KEY])).rows[0].r;
  await x.como(null, "select public.fail_course_payment_checkout($1::uuid,'provider_error')", [first.id], "service_role");
  const second = (await x.como(U.a1, "select public.prepare_course_payment_checkout($1::uuid,$2::uuid) r",
    [id, "aaaaaaaa-bbbb-4ccc-8ddd-000000000002"])).rows[0].r;
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.external_reference, second.external_reference);
});

test("CHECKOUT_PAID matricula uma vez; repeticao e evento atrasado nao duplicam", async () => {
  const x = await pagoPreparado();
  const first = (await x.como(null, "select public.process_course_payment_webhook($1::jsonb) r", [JSON.stringify(evento({ external: x.external }))], "service_role")).rows[0].r;
  assert.equal(first.processed, true);
  const replay = (await x.como(null, "select public.process_course_payment_webhook($1::jsonb) r", [JSON.stringify(evento({ external: x.external }))], "service_role")).rows[0].r;
  assert.equal(replay.replayed, true);
  await x.como(null, "select public.process_course_payment_webhook($1::jsonb)", [JSON.stringify(evento({ id: "evt_old", type: "CHECKOUT_EXPIRED", status: "EXPIRED", external: x.external }))], "service_role");
  assert.equal(await x.status(x.requestId), "matriculada");
  assert.equal(Number((await x.db.query("select count(*) n from public.op_records where collection='enrollments'")).rows[0].n), 1);
  assert.equal((await x.db.query("select status from public.course_payment_checkouts where id=$1", [x.checkoutId])).rows[0].status, "paid");
});

test("valor divergente e checkout desconhecido falham sem liberar matricula", async () => {
  const x = await pagoPreparado();
  const valor = (await x.como(null, "select public.process_course_payment_webhook($1::jsonb) r",
    [JSON.stringify(evento({ external: x.external, value: 149 }))], "service_role")).rows[0].r;
  const desconhecido = (await x.como(null, "select public.process_course_payment_webhook($1::jsonb) r",
    [JSON.stringify(evento({ id: "evt_x", checkout: "outro", external: x.external }))], "service_role")).rows[0].r;
  assert.equal(valor.processed, false);
  assert.equal(desconhecido.processed, false);
  assert.equal(Number((await x.db.query("select count(*) n from public.course_payment_webhook_events where processing_status='failed'")).rows[0].n), 2, "falhas ficam duraveis para reprocessamento");
  assert.equal(await x.status(x.requestId), "aguardando_pagamento");
});

test("cancelamento/expiracao libera vaga; estorno integral revoga matricula com auditoria", async () => {
  const a = await pagoPreparado();
  await a.como(null, "select public.process_course_payment_webhook($1::jsonb)", [JSON.stringify(evento({ id: "evt_cancel", type: "CHECKOUT_CANCELED", status: "CANCELED", external: a.external }))], "service_role");
  assert.equal(await a.status(a.requestId), "cancelada");
  const b = await pagoPreparado();
  await b.como(null, "select public.process_course_payment_webhook($1::jsonb)", [JSON.stringify(evento({ external: b.external }))], "service_role");
  await b.como(null, "select public.process_course_payment_webhook($1::jsonb)", [JSON.stringify({
    id: "evt_refund", event: "PAYMENT_REFUNDED", payment: { externalReference: b.external, value: 150, status: "REFUNDED" },
  })], "service_role");
  assert.equal(await b.status(b.requestId), "cancelada");
  const op = (await b.db.query("select document from public.op_records where collection='enrollments'")).rows[0].document;
  assert.equal(op.status, "cancelled");
});

test("webhook pendente/fora de ordem nao libera matricula e parcial exige revisao", async () => {
  const x = await pagoPreparado();
  const ignored = (await x.como(null, "select public.process_course_payment_webhook($1::jsonb) r", [JSON.stringify(evento({ id: "evt_created", type: "CHECKOUT_CREATED", status: "ACTIVE", external: x.external }))], "service_role")).rows[0].r;
  assert.equal(ignored.ignored, true);
  assert.equal(await x.status(x.requestId), "aguardando_pagamento");
  const review = (await x.como(null, "select public.process_course_payment_webhook($1::jsonb) r", [JSON.stringify({
    id: "evt_partial", event: "PAYMENT_PARTIALLY_REFUNDED", payment: { externalReference: x.external, value: 150, status: "PARTIALLY_REFUNDED" },
  })], "service_role")).rows[0].r;
  assert.equal(review.manual_review, true);
  assert.equal(await x.status(x.requestId), "aguardando_pagamento");
  const latePaid = (await x.como(null, "select public.process_course_payment_webhook($1::jsonb) r", [JSON.stringify(evento({ id: "evt_late_paid", external: x.external }))], "service_role")).rows[0].r;
  assert.equal(latePaid.manual_review, true, "pago depois de estorno parcial nao matricula automaticamente");
  assert.equal(await x.status(x.requestId), "aguardando_pagamento");
});
