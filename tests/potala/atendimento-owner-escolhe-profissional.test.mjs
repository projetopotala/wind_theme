import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { reservationForm } from "../../outputs/js/admin/appointment-panel.js";

const operacao = {
  activity_offerings: [{ id: "aberta", title: "Acolhimento", active: true, mode: "online" }, { id: "fixa", title: "Fixa", professional_id: "p1", mode: "online" }],
  profiles: [
    { id: "p1", display_name: "Prof Um", roles: ["professional"], active: true },
    { id: "p2", display_name: "Prof Dois", roles: ["professional"], active: true },
    { id: "p3", display_name: "Prof Tres (nao ligado)", roles: ["professional"], active: true },
    { id: "c1", display_name: "Cliente", roles: ["client"], active: true },
  ],
  offering_professionals: [{ id: "v1", offering_id: "aberta", professional_id: "p2", active: true }, { id: "v2", offering_id: "aberta", professional_id: "p1", active: false }],
};
const pedido = { id: "r1", requester_user_id: "u1", offering_id: "aberta", professional_profile_id: null, modality: "online", preferred_date: "2026-11-20", preferred_period: "tarde" };

test("pedido de conta logada sem profissional: Owner escolhe entre os ligados ao servico, sem 'cliente operacional'", () => {
  const html = reservationForm(pedido, operacao, { simple: true });
  assert.match(html, /Escolha quem vai atender e o horário/);
  assert.match(html, /data-reservation-professional/);
  assert.match(html, /value="p2"/);
  assert.doesNotMatch(html, /value="p1"/, "vinculo inativo fica de fora");
  assert.doesNotMatch(html, /value="p3"/, "profissional nao ligado fica de fora");
  assert.doesNotMatch(html, /data-reservation-client/);
  assert.match(html, /data-reservation-start/);
});

test("servico sem ninguem ligado avisa o Owner", () => {
  const html = reservationForm({ ...pedido, offering_id: "outra" }, { ...operacao, activity_offerings: [...operacao.activity_offerings, { id: "outra", title: "Outra" }] }, { simple: true });
  assert.match(html, /data-reservation-sem-profissional/);
});

test("pedido que ja tem profissional nao muda; pedido publico antigo continua no modo explicito", () => {
  assert.doesNotMatch(reservationForm({ ...pedido, offering_id: "fixa", professional_profile_id: "p1" }, operacao, { simple: true }), /data-reservation-professional/);
  assert.match(reservationForm({ ...pedido, requester_user_id: null, offering_id: null }, operacao), /data-reservation-client/);
});

test("a fila do Owner le requester_user_id", () => {
  assert.match(readFileSync(new URL("../../outputs/js/admin/appointment-requests.js", import.meta.url), "utf8"), /status,requester_user_id,offering_id/);
});
