import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResourceCommand, resourceNeeds, financialSummary } from '../../outputs/js/admin/operations/resources.js';

function fixture() {
  const state = { rooms: [{ id: 'room' }], profiles: [{ id: 'pro' }], schedule_items: [], inventory_items: [], inventory_assets: [], inventory_balances: [], inventory_movements: [], maintenance_orders: [], financial_entries: [], payments: [], payment_allocations: [], split_rules: [], split_allocations: [] };
  let sequence = 0;
  const run = (type, payload) => applyResourceCommand(state, { type, payload }, { id: () => `id-${++sequence}`, now: '2026-09-16T12:00:00Z', actor: 'local-admin' });
  return { state, run };
}
test('transfer conserves stock, rejects insufficient balance and damaged units cannot cover needs', () => {
  const { state, run } = fixture();
  const item = run('inventory.item.save', { name: 'Cadeira', tracking_mode: 'quantity' });
  run('inventory.receive', { item_id: item.id, location_id: 'storage', quantity: 10 });
  run('inventory.move', { item_id: item.id, from_location_id: 'storage', to_location_id: 'room', quantity: 6 });
  run('inventory.condition', { item_id: item.id, location_id: 'room', quantity: 2, condition: 'damaged', reason: 'Quebradas' });
  assert.equal(state.inventory_balances.reduce((n, b) => n + b.quantity, 0), 10);
  assert.throws(() => run('inventory.move', { item_id: item.id, from_location_id: 'storage', to_location_id: 'room', quantity: 5 }), /insuficiente/i);
  const needs = resourceNeeds(state, { room_id: 'room', requirements: [{ item_id: item.id, quantity: 6 }] });
  assert.equal(needs[0].shortage, 2);
  assert.equal(needs[0].suggestions[0].available, 4);
  assert.equal(state.inventory_movements.at(-1).actor, 'local-admin');
});
test('serialized assets are single, unique and maintenance excludes availability', () => {
  const { state, run } = fixture();
  const item = run('inventory.item.save', { name: 'Projetor', tracking_mode: 'asset' });
  assert.throws(() => run('inventory.receive', { item_id: item.id, location_id: 'room', quantity: 2, asset_code: 'A' }));
  const asset = run('inventory.receive', { item_id: item.id, location_id: 'room', quantity: 1, asset_code: 'A' });
  assert.throws(() => run('inventory.receive', { item_id: item.id, location_id: 'room', quantity: 1, asset_code: 'A' }));
  run('inventory.condition', { asset_id: asset.id, condition: 'maintenance', reason: 'Revisão' });
  assert.equal(state.maintenance_orders.length, 1);
  assert.equal(resourceNeeds(state, { room_id: 'room', requirements: [{ item_id: item.id, quantity: 1 }] })[0].shortage, 1);
});
test('overlapping resource needs reduce suggestions but adjacent schedules do not', () => {
  const { state, run } = fixture();
  const item = run('inventory.item.save', { name: 'Cadeira', tracking_mode: 'quantity' });
  run('inventory.receive', { item_id: item.id, location_id: 'room', quantity: 10 });
  state.schedule_items.push({ id: 'reserved', room_id: 'room', starts_at: '2026-09-17T10:00Z', ends_at: '2026-09-17T11:00Z', resource_requirements: [{ item_id: item.id, quantity: 8 }] });
  const schedule = { room_id: 'storage', starts_at: '2026-09-17T10:30Z', ends_at: '2026-09-17T11:30Z', requirements: [{ item_id: item.id, quantity: 4 }] };
  assert.equal(resourceNeeds(state, schedule)[0].suggestions[0].available, 2);
  schedule.starts_at = '2026-09-17T11:00Z';
  assert.equal(resourceNeeds(state, schedule)[0].suggestions[0].available, 10);
});
test('partial payments snapshot split, conserve rounded cents and full refund reverses obligations', () => {
  const { state, run } = fixture();
  state.schedule_items.push({ id: 'visit', professional_id: 'pro' });
  const rule = run('finance.rule.save', { name: 'Acordo', professional_id: 'pro', professional_basis_points: 7000, active: true });
  const entry = run('finance.entry.save', { direction: 'receivable', schedule_id: 'visit', description: 'Sessão', amount_cents: 10001, due_date: '2026-09-16' });
  const payment = run('finance.payment', { entry_id: entry.id, amount_cents: 3333, method: 'pix' });
  assert.equal(financialSummary(state).outstanding_receivable_cents, 6668);
  assert.equal(state.split_allocations[0].professional_cents, 2333);
  assert.equal(state.split_allocations[0].institute_cents, 1000);
  run('finance.rule.save', { ...rule, professional_basis_points: 5000 });
  assert.equal(state.split_allocations[0].rule_snapshot.professional_basis_points, 7000);
  run('finance.refund', { payment_id: payment.id, amount_cents: 3333, reason: 'Cancelamento' });
  assert.equal(financialSummary(state).outstanding_receivable_cents, 10001);
  assert.equal(financialSummary(state).pending_split_cents, 0);
  assert.equal(state.payments.length, 2);
  assert.throws(() => run('finance.refund', { payment_id: payment.id, amount_cents: 3333, reason: 'Duplicado' }));
});
test('financial validation rejects non-cent values, overpayments and editing paid obligations', () => {
  const { run } = fixture();
  for (const amount_cents of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => run('finance.entry.save', { description: 'X', direction: 'payable', due_date: '2026-09-16', amount_cents }));
  const entry = run('finance.entry.save', { description: 'Conta', direction: 'payable', due_date: '2026-09-16', amount_cents: 100 });
  assert.throws(() => run('finance.payment', { entry_id: entry.id, amount_cents: 101, method: 'cash' }));
  run('finance.payment', { entry_id: entry.id, amount_cents: 50, method: 'cash' });
  assert.throws(() => run('finance.entry.save', { ...entry, amount_cents: 200 }));
});
test('monthly recurring obligations preserve month-end anchor and generate idempotently', () => {
  const { state, run } = fixture();
  run('finance.entry.save', { description: 'Aluguel', direction: 'payable', due_date: '2026-01-31', amount_cents: 100, recurrence: 'monthly' });
  run('finance.generateRecurring', { through: '2026-03-31' });
  run('finance.generateRecurring', { through: '2026-03-31' });
  assert.deepEqual(state.financial_entries.map(e => e.due_date), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(financialSummary(state).outstanding_payable_cents, 300);
});
test('refund requires reversing a paid professional obligation first', () => {
  const { state, run } = fixture();
  state.schedule_items.push({ id: 'visit', professional_id: 'pro' });
  run('finance.rule.save', { name: 'Regra', professional_id: 'pro', professional_basis_points: 7000 });
  const entry = run('finance.entry.save', { direction: 'receivable', schedule_id: 'visit', description: 'Sessão', amount_cents: 10000, due_date: '2026-09-16' });
  const incoming = run('finance.payment', { entry_id: entry.id, amount_cents: 10000, method: 'pix' });
  const obligation = state.financial_entries.find(e => e.source_split_id);
  const outgoing = run('finance.payment', { entry_id: obligation.id, amount_cents: 7000, method: 'pix' });
  assert.throws(() => run('finance.refund', { payment_id: incoming.id, amount_cents: 10000, reason: 'Cancelamento' }), /repasse/);
  run('finance.refund', { payment_id: outgoing.id, amount_cents: 7000, reason: 'Devolução' });
  run('finance.refund', { payment_id: incoming.id, amount_cents: 10000, reason: 'Cancelamento' });
  assert.equal(financialSummary(state).paid_cents, 0);
  assert.equal(financialSummary(state).pending_split_cents, 0);
});
test('resource planning uses peak simultaneous reservation rather than summing adjacent sessions', () => {
  const { state, run } = fixture();
  const item = run('inventory.item.save', { name: 'Cadeira', tracking_mode: 'quantity' });
  run('inventory.receive', { item_id: item.id, location_id: 'room', quantity: 10 });
  for (const [id, start, end] of [['a', '10:00', '11:00'], ['b', '11:00', '12:00']]) state.schedule_items.push({ id, room_id: 'room', starts_at: `2026-09-17T${start}Z`, ends_at: `2026-09-17T${end}Z`, requirements: [{ item_id: item.id, quantity: 6 }] });
  const needs = resourceNeeds(state, { room_id: 'storage', starts_at: '2026-09-17T10:00Z', ends_at: '2026-09-17T12:00Z', requirements: [{ item_id: item.id, quantity: 3 }] });
  assert.equal(needs[0].suggestions[0].available, 4);
});
test('asset maintenance restores previous condition and preserves subsequent loss', () => {
  const { state, run } = fixture();
  const item = run('inventory.item.save', { name: 'Projetor', tracking_mode: 'asset' });
  const asset = run('inventory.receive', { item_id: item.id, location_id: 'room', quantity: 1, asset_code: 'P1', condition: 'damaged' });
  const order = run('maintenance.save', { asset_id: asset.id, description: 'Revisão', status: 'open', due_date: '2026-09-20', cost_cents: 0 });
  assert.equal(asset.condition, 'maintenance');
  run('maintenance.save', { id: order.id, status: 'completed' });
  assert.equal(asset.condition, 'damaged');
  assert.equal(state.inventory_movements.at(-1).condition, 'damaged');
  const next = run('maintenance.save', { asset_id: asset.id, description: 'Conserto', status: 'open', due_date: '2026-09-21' });
  run('inventory.condition', { asset_id: asset.id, condition: 'lost', reason: 'Extravio' });
  run('maintenance.save', { id: next.id, status: 'completed' });
  assert.equal(asset.condition, 'lost');
});
test('room maintenance needs acknowledgement of future bookings and leaves base room status intact', () => {
  const { state, run } = fixture();
  state.rooms[0].status = 'available';
  state.schedule_items.push({ id: 'booking', room_id: 'room', starts_at: '2026-09-17T10:00Z', ends_at: '2026-09-17T11:00Z' });
  const payload = { room_id: 'room', description: 'Pintura', due_date: '2026-09-20', status: 'open' };
  assert.throws(() => run('maintenance.save', payload), /reservas/i);
  const order = run('maintenance.save', { ...payload, allow_booked: true });
  assert.equal(state.rooms[0].status, 'available');
  assert.deepEqual(order.affected_schedule_ids, ['booking']);
  run('maintenance.save', { id: order.id, status: 'completed' });
  assert.equal(state.rooms[0].status, 'available');
});
test('moving reserved stock requires explicit acknowledgement and retired assets cannot move', () => {
  const { state, run } = fixture();
  const item = run('inventory.item.save', { name: 'Cadeira', tracking_mode: 'quantity' });
  run('inventory.receive', { item_id: item.id, location_id: 'room', quantity: 10 });
  state.schedule_items.push({ id: 'booking', room_id: 'room', starts_at: '2026-09-17T10:00Z', ends_at: '2026-09-17T11:00Z', requirements: [{ item_id: item.id, quantity: 8 }] });
  const move = { item_id: item.id, from_location_id: 'room', to_location_id: 'storage', quantity: 3 };
  assert.throws(() => run('inventory.move', move), /reservas/i);
  run('inventory.move', { ...move, allow_reserved: true });
  assert.equal(state.inventory_movements.at(-1).allow_reserved, true);
  assert.throws(() => run('inventory.condition', { item_id: item.id, location_id: 'room', quantity: 1, condition: 'retired' }));
  const equipment = run('inventory.item.save', { name: 'TV', tracking_mode: 'asset' });
  const asset = run('inventory.receive', { item_id: equipment.id, location_id: 'room', quantity: 1, asset_code: 'TV' });
  run('inventory.condition', { asset_id: asset.id, condition: 'retired', reason: 'Baixa' });
  assert.throws(() => run('inventory.move', { asset_id: asset.id, from_location_id: 'room', to_location_id: 'storage', quantity: 1 }));
});
test('rules validate references and unique active scopes and receipts reject unsafe URLs', () => {
  const { state, run } = fixture();
  state.activity_definitions = [{ id: 'definition' }];
  state.activity_offerings = [{ id: 'offering', definition_id: 'definition', professional_id: 'pro' }];
  const rule = { name: 'Acordo', professional_id: 'pro', professional_basis_points: 7000 };
  assert.throws(() => run('finance.rule.save', { ...rule, offering_id: 'missing' }));
  run('finance.rule.save', rule);
  assert.throws(() => run('finance.rule.save', rule), /escopo/i);
  run('finance.rule.save', { ...rule, active: false });
  for (const receipt_url of ['javascript:alert(1)', 'https://', 'https://user:pass@example.com/x', 'https://example.com/\nfile']) assert.throws(() => run('finance.entry.save', { description: 'Conta', direction: 'payable', amount_cents: 100, due_date: '2026-09-16', receipt_url }));
});
