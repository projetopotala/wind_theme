import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { payloadFromForm } from "../../outputs/js/admin/operations/controller.js";
import { applyScheduleCommand } from "../../outputs/js/admin/operations/schedule.js";
import { renderProfessional, loadPublishedProfessionals, filterProfessionals } from "../../outputs/js/comunidade/profissionais-remotos.js";

const state = () => ({ profiles: [], schedule_items: [], activity_definitions: [], activity_offerings: [], enrollments: [] });
const ctx = { id: () => "prof-1", now: "2026-10-29T12:00:00Z" };

test("formulário normaliza o perfil profissional completo", () => {
  const payload = payloadFromForm("person", { display_name: "Ana", roles: ["professional"], specialties: "Yoga, Meditação", practice_areas: "Corpo", modalities: ["presencial"], price_reais: "150,00", published: "true", active: "true", presentation: "Atendimento humano." });
  assert.deepEqual(payload.specialties, ["Yoga", "Meditação"]);
  assert.equal(payload.price_cents, 15000);
  assert.equal(payload.published, true);
});

test("domínio recusa publicar pessoa sem papel ou apresentação", () => {
  assert.throws(() => applyScheduleCommand(state(), { type: "person.save", payload: { display_name: "A", roles: [], published: true, presentation: "Perfil" } }, ctx), /profissional/i);
  assert.throws(() => applyScheduleCommand(state(), { type: "person.save", payload: { display_name: "A", roles: ["professional"], published: true } }, ctx), /apresentação/i);
});

test("domínio preserva campos e permite desativação", () => {
  const data = state();
  applyScheduleCommand(data, { type: "person.save", payload: { display_name: "Ana", roles: ["professional"], published: true, active: true, presentation: "Perfil", specialties: ["Yoga"], modalities: ["online"], price_cents: 9000 } }, ctx);
  assert.equal(data.profiles[0].published, true);
  applyScheduleCommand(data, { type: "person.save", payload: { ...data.profiles[0], active: false } }, ctx);
  assert.equal(data.profiles[0].active, false);
});

test("serviço associado preserva profissional, valor, modalidade e situação", () => {
  const data = state();
  data.profiles.push({ id: "prof-1", display_name: "Ana", roles: ["professional"] });
  data.activity_definitions.push({ id: "def-1", title: "Terapia", kind: "appointment" });
  applyScheduleCommand(data, { type: "offering.save", payload: { title: "Sessão inicial", definition_id: "def-1", professional_id: "prof-1", mode: "online", price_cents: 12000, active: true } }, { ...ctx, id: () => "offer-1" });
  assert.equal(data.activity_offerings[0].professional_id, "prof-1");
  assert.equal(data.activity_offerings[0].price_cents, 12000);
  assert.equal(data.activity_offerings[0].active, true);
});

test("render público escapa conteúdo persistido", () => {
  const html = renderProfessional({ id: "p1", display_name: "<script>", presentation: "ok", specialties: ["Yoga"] });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("busca e filtro usam nome, especialidade, modalidade, serviço e área", () => {
  const profiles = [
    { id: "1", display_name: "Ana", specialties: ["Acupuntura"], practice_areas: ["escuta"], modalities: ["presencial"], services: [] },
    { id: "2", display_name: "Beto", specialties: ["Yoga"], practice_areas: ["corpo"], modalities: ["online"], services: [{ title: "Avaliação postural" }] },
  ];
  assert.deepEqual(filterProfessionals(profiles, { query: "acupuntura" }).map(item => item.id), ["1"]);
  assert.deepEqual(filterProfessionals(profiles, { query: "avaliacao", area: "corpo" }).map(item => item.id), ["2"]);
});

test("migration expõe somente projeção publicada e não concede tabela", () => {
  const sql = fs.readFileSync(new URL("../../supabase/migrations/202610290003_professionals_public_projection.sql", import.meta.url), "utf8");
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /published/);
  assert.match(sql, /active/);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+public\.op_records/i);
});

test("loader mantém demonstração quando backend não tem publicados", async () => {
  const nodes = { live: { hidden: true, innerHTML: "" }, status: { textContent: "" }, demo: { hidden: false } };
  const root = { querySelector: (selector) => selector.includes("live") ? nodes.live : nodes.status, querySelectorAll: () => [nodes.live, nodes.demo] };
  const result = await loadPublishedProfessionals({ root, rest: { rpc: async () => [] } });
  assert.deepEqual(result, []);
  assert.equal(nodes.demo.hidden, false);
});
