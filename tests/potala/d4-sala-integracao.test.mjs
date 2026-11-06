import assert from "node:assert/strict";
import test from "node:test";
import { ligacaoDaSala } from "../../outputs/js/conta/spa/vistas/atendimentos.js";
import { roomLink } from "../../outputs/js/admin/appointment-panel.js";

const ID = "10000000-0000-4000-8000-000000000001";

test("Meu Potala: link da sala só para consulta online confirmada", () => {
  assert.match(ligacaoDaSala({ id: ID, modalidade: "online" }, "confirmada"), new RegExp(`href="/sala-atendimento.html\\?pedido=${ID}"`));
  assert.equal(ligacaoDaSala({ id: ID, modalidade: "presencial" }, "confirmada"), "");
  assert.equal(ligacaoDaSala({ id: ID, modalidade: "online" }, "anterior"), "");
  assert.equal(ligacaoDaSala({ id: ID, modalidade: "online" }, "pedido"), "");
  assert.equal(ligacaoDaSala({ id: "<script>", modalidade: "online" }, "confirmada"), "");
});

test("Central Operacional: link da sala só com reserva vinculada, online e encerrada", () => {
  const base = { id: ID, modality: "online", reservation_schedule_id: "s1", status: "encerrada" };
  assert.match(roomLink(base), /sala-atendimento\.html\?pedido=/);
  assert.equal(roomLink({ ...base, modality: "presencial" }), "");
  assert.equal(roomLink({ ...base, reservation_schedule_id: null }), "");
  assert.equal(roomLink({ ...base, status: "cancelada" }), "");
});
