const CONDITIONS = ['available', 'damaged', 'maintenance', 'lost', 'retired'];
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const positive = value => requireValue(Number.isSafeInteger(value) && value > 0, 'Informe uma quantidade/valor inteiro positivo.');
const requiredText = (value, field) => { requireValue(typeof value === 'string' && value.trim(), `Informe ${field}.`); return value.trim(); };
const find = (rows, id, label) => { const row = rows.find(item => item.id === id); requireValue(row, `${label} não encontrado.`); return row; };
const validDate = date => requireValue(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date, 'Data inválida.');
const location = (state, id) => requireValue(id === 'storage' || state.rooms.some(room => room.id === id), 'Local não encontrado.');
const condition = value => requireValue(CONDITIONS.includes(value), 'Condição inválida.');
const requirements = schedule => schedule.resource_requirements || schedule.requirements || [];
const overlaps = (a, b) => Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
const futureRequirements = (state, itemId, locationId, now) => state.schedule_items
  .filter(row => row.room_id === locationId && row.status !== 'cancelled' && Date.parse(row.ends_at) > Date.parse(now))
  .reduce((maximum, row) => Math.max(maximum, requirements(row).filter(req => req.item_id === itemId).reduce((sum, req) => sum + req.quantity, 0)), 0);
function safeUrl(value) {
  try {
    requireValue(!/[\r\n]/.test(value), 'Link de comprovante inválido.');
    const parsed = new URL(value);
    requireValue(['http:', 'https:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password, 'Link de comprovante inválido.');
  } catch (error) {
    if (error?.message === 'Link de comprovante inválido.') throw error;
    throw new Error('Link de comprovante inválido.');
  }
}

function physicalAvailable(state, itemId, locationId) {
  const item = state.inventory_items.find(row => row.id === itemId);
  if (item?.tracking_mode === 'asset') return state.inventory_assets.filter(row => row.item_id === itemId && row.location_id === locationId && row.condition === 'available').length;
  return state.inventory_balances.filter(row => row.item_id === itemId && row.location_id === locationId && row.condition === 'available').reduce((n, row) => n + row.quantity, 0);
}

/** Planning only: temporal requirements reserve availability, never move physical stock. */
export function resourceNeeds(state, schedule) {
  const available = (itemId, locationId) => {
    const events = state.schedule_items.filter(row => row.id !== schedule.id && !['cancelled', 'canceled'].includes(row.status) && row.room_id === locationId && overlaps(row, schedule)).flatMap(row => {
      const quantity = requirements(row).filter(req => req.item_id === itemId).reduce((n, req) => n + req.quantity, 0);
      return [[Math.max(Date.parse(row.starts_at), Date.parse(schedule.starts_at)), quantity], [Math.min(Date.parse(row.ends_at), Date.parse(schedule.ends_at)), -quantity]];
    }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let reserved = 0, current = 0;
    for (const [, delta] of events) { current += delta; reserved = Math.max(reserved, current); }
    return Math.max(0, physicalAvailable(state, itemId, locationId) - reserved);
  };
  const combined = new Map();
  for (const req of requirements(schedule)) { positive(req.quantity); combined.set(req.item_id, (combined.get(req.item_id) || 0) + req.quantity); }
  return [...combined].map(([item_id, quantity]) => {
    const local = available(item_id, schedule.room_id);
    return { item_id, quantity, available: local, shortage: Math.max(0, quantity - local), suggestions: ['storage', ...state.rooms.map(room => room.id)].filter(id => id !== schedule.room_id).map(location_id => ({ location_id, available: available(item_id, location_id) })).filter(row => row.available > 0).sort((a, b) => b.available - a.available) };
  });
}

const allocated = (state, entryId) => state.payment_allocations.filter(row => row.entry_id === entryId).reduce((n, row) => n + row.amount_cents, 0);
const netAmount = (state, entry) => entry.amount_cents - state.financial_entries.filter(row => row.reverses_entry_id === entry.id).reduce((n, row) => n + row.amount_cents, 0);
export function financialSummary(state) {
  const summary = { receivable_cents: 0, payable_cents: 0, received_cents: 0, paid_cents: 0, outstanding_receivable_cents: 0, outstanding_payable_cents: 0, pending_split_cents: 0 };
  for (const entry of state.financial_entries.filter(row => !row.reverses_entry_id)) {
    const amount = netAmount(state, entry), paid = allocated(state, entry.id);
    summary[`${entry.direction}_cents`] += amount;
    summary[entry.direction === 'receivable' ? 'received_cents' : 'paid_cents'] += paid;
    summary[`outstanding_${entry.direction}_cents`] += amount - paid;
    if (entry.source_split_id) summary.pending_split_cents += amount - paid;
  }
  return summary;
}

function balance(state, itemId, locationId, status, ctx) {
  let row = state.inventory_balances.find(b => b.item_id === itemId && b.location_id === locationId && b.condition === status);
  if (!row) { row = { id: ctx.id(), item_id: itemId, location_id: locationId, condition: status, quantity: 0 }; state.inventory_balances.push(row); }
  return row;
}
function movement(state, data, ctx) {
  const row = { ...data, id: ctx.id(), actor: ctx.actor, created_at: ctx.now };
  state.inventory_movements.push(row);
  return row;
}
function save(rows, old, data, ctx) {
  if (old) { Object.assign(old, data, { updated_at: ctx.now }); return old; }
  const row = { ...data, id: ctx.id(), created_at: ctx.now, updated_at: ctx.now };
  rows.push(row); return row;
}
function selectRule(state, entry) {
  if (entry.direction !== 'receivable' || !entry.schedule_id) return null;
  const schedule = find(state.schedule_items, entry.schedule_id, 'Agendamento');
  const rules = state.split_rules.filter(rule => rule.active && (!rule.professional_id || rule.professional_id === schedule.professional_id) && (!rule.definition_id || rule.definition_id === schedule.definition_id) && (!rule.offering_id || rule.offering_id === schedule.offering_id));
  const score = rule => rule.offering_id ? 3 : rule.definition_id ? 2 : rule.professional_id ? 1 : 0;
  rules.sort((a, b) => score(b) - score(a));
  requireValue(rules.length < 2 || score(rules[0]) !== score(rules[1]), 'Mais de uma regra de repasse aplicável.');
  if (!rules.length) return null;
  const professional_id = rules[0].professional_id || schedule.professional_id;
  find(state.profiles, professional_id, 'Profissional');
  return { rule: rules[0], professional_id };
}

/** Caller owns cloning, atomic persistence and idempotency; errors abort its transaction. */
export function applyResourceCommand(state, { type, payload: p = {} }, ctx) {
  if (type === 'inventory.item.save') {
    const old = p.id ? find(state.inventory_items, p.id, 'Item') : null;
    requireValue(['quantity', 'asset'].includes(p.tracking_mode), 'Tipo de controle inválido.');
    requireValue(!old || old.tracking_mode === p.tracking_mode || (!state.inventory_balances.some(b => b.item_id === p.id) && !state.inventory_assets.some(a => a.item_id === p.id)), 'Não altere o controle de um item com histórico.');
    return save(state.inventory_items, old, { name: requiredText(p.name, 'nome'), tracking_mode: p.tracking_mode, category: p.category || '' }, ctx);
  }
  if (type === 'inventory.receive') {
    const item = find(state.inventory_items, p.item_id, 'Item');
    positive(p.quantity); location(state, p.location_id); condition(p.condition || 'available');
    let result;
    if (item.tracking_mode === 'asset') {
      requireValue(p.quantity === 1, 'Receba um patrimônio por vez.');
      const asset_code = requiredText(p.asset_code, 'código patrimonial');
      requireValue(!state.inventory_assets.some(a => a.asset_code === asset_code || (p.serial_number && a.serial_number === p.serial_number)), 'Código ou série já cadastrado.');
      result = save(state.inventory_assets, null, { item_id: item.id, location_id: p.location_id, condition: p.condition || 'available', asset_code, brand: p.brand || '', model: p.model || '', serial_number: p.serial_number || '', acquired_at: p.acquired_at || ctx.now.slice(0, 10) }, ctx);
    } else { result = balance(state, item.id, p.location_id, p.condition || 'available', ctx); requireValue(Number.isSafeInteger(result.quantity + p.quantity), 'Quantidade excede o limite.'); result.quantity += p.quantity; }
    movement(state, { type: 'receive', item_id: item.id, asset_id: item.tracking_mode === 'asset' ? result.id : null, to_location_id: p.location_id, quantity: p.quantity, condition: p.condition || 'available', reason: p.reason || 'Entrada' }, ctx);
    return result;
  }
  if (type === 'inventory.move' || type === 'inventory.condition') {
    const asset = p.asset_id ? find(state.inventory_assets, p.asset_id, 'Patrimônio') : null;
    const item = find(state.inventory_items, p.item_id || asset?.item_id, 'Item');
    requireValue(!asset || asset.item_id === item.id, 'Patrimônio não pertence ao item.');
    requireValue(item.tracking_mode === 'quantity' || asset, 'Selecione o patrimônio.');
    const quantity = p.quantity ?? (asset ? 1 : undefined); positive(quantity);
    requireValue(!asset || quantity === 1, 'Patrimônio tem quantidade unitária.');
    const from = type === 'inventory.move' ? p.from_location_id : p.location_id || asset?.location_id;
    const to = type === 'inventory.move' ? p.to_location_id : from;
    location(state, from); location(state, to);
    const previousCondition = asset?.condition || p.from_condition || 'available';
    const nextCondition = type === 'inventory.condition' ? p.condition : previousCondition;
    condition(previousCondition); condition(nextCondition);
    requireValue(!asset || previousCondition !== 'retired' || type !== 'inventory.move', 'Patrimônio baixado não pode ser movimentado.');
    requireValue(asset || !['lost', 'retired'].includes(nextCondition), 'Perda e baixa exigem patrimônio individual.');
    requireValue(type !== 'inventory.move' || from !== to, 'Escolha outro local.');
    requireValue(type !== 'inventory.condition' || previousCondition !== nextCondition, 'Condição já aplicada.');
    if (type === 'inventory.move') {
      const reserved = futureRequirements(state, item.id, from, ctx.now);
      const remaining = physicalAvailable(state, item.id, from) - quantity;
      requireValue(remaining < 0 || p.allow_reserved || remaining >= reserved, 'A movimentação afeta reservas futuras; revise as reservas e confirme explicitamente.');
    }
    if (asset) { requireValue(asset.location_id === from, 'Patrimônio está em outro local.'); Object.assign(asset, { location_id: to, condition: nextCondition }); }
    else {
      const source = state.inventory_balances.find(b => b.item_id === item.id && b.location_id === from && b.condition === previousCondition);
      requireValue(source && source.quantity >= quantity, 'Saldo insuficiente.');
      const target = balance(state, item.id, to, nextCondition, ctx);
      requireValue(Number.isSafeInteger(target.quantity + quantity), 'Quantidade excede o limite.');
      source.quantity -= quantity; target.quantity += quantity;
    }
    const record = movement(state, { type: type.split('.')[1], item_id: item.id, asset_id: asset?.id || null, from_location_id: from, to_location_id: to, quantity, from_condition: previousCondition, condition: nextCondition, reason: p.reason || 'Movimentação', allow_reserved: p.allow_reserved === true }, ctx);
    if (nextCondition === 'maintenance' && previousCondition !== 'maintenance') save(state.maintenance_orders, null, { item_id: item.id, asset_id: asset?.id || null, location_id: to, quantity, description: p.reason || 'Manutenção', previous_condition: previousCondition, status: 'open', movement_id: record.id }, ctx);
    if (previousCondition === 'maintenance' && nextCondition !== 'maintenance') state.maintenance_orders.filter(o => o.status === 'open' && (asset ? o.asset_id === asset.id : o.item_id === item.id && o.location_id === from)).forEach(o => Object.assign(o, { status: 'completed', completed_at: ctx.now }));
    return asset || record;
  }
  if (type === 'maintenance.save') {
    const old = p.id ? find(state.maintenance_orders, p.id, 'Manutenção') : null;
    const status = p.status || old?.status || 'open';
    requireValue(['open', 'completed'].includes(status), 'Situação da manutenção inválida.');
    if (old) {
      if (old.status === 'completed') requireValue(status === 'completed', 'Manutenção concluída preserva seu histórico.');
      Object.assign(old, { description: p.description || old.description, due_date: p.due_date ?? old.due_date, status, updated_at: ctx.now });
      if (status === 'completed' && !old.completed_at) {
        old.completed_at = ctx.now;
        if (old.asset_id) {
          const asset = find(state.inventory_assets, old.asset_id, 'Patrimônio');
          if (asset.condition === 'maintenance') {
            const restored = old.previous_condition || 'available';
            asset.condition = restored;
            movement(state, { type: 'condition', item_id: asset.item_id, asset_id: asset.id, from_location_id: asset.location_id, to_location_id: asset.location_id, quantity: 1, from_condition: 'maintenance', condition: restored, reason: `Manutenção concluída: ${old.description}` }, ctx);
          }
        }
      }
      return old;
    }
    const description = requiredText(p.description, 'descrição');
    if (p.due_date) validDate(p.due_date);
    requireValue(Boolean(p.asset_id) !== Boolean(p.room_id), 'Selecione uma sala ou um equipamento.');
    if (p.asset_id) {
      const asset = find(state.inventory_assets, p.asset_id, 'Patrimônio');
      requireValue(asset.condition !== 'retired' && asset.condition !== 'lost', 'Patrimônio indisponível para manutenção.');
      const previous_condition = asset.condition;
      asset.condition = 'maintenance';
      const order = save(state.maintenance_orders, null, { asset_id: asset.id, item_id: asset.item_id, location_id: asset.location_id, description, due_date: p.due_date || null, status, previous_condition }, ctx);
      movement(state, { type: 'condition', item_id: asset.item_id, asset_id: asset.id, from_location_id: asset.location_id, to_location_id: asset.location_id, quantity: 1, from_condition: previous_condition, condition: 'maintenance', reason: description }, ctx);
      return order;
    }
    find(state.rooms, p.room_id, 'Sala');
    const affected = state.schedule_items.filter(row => row.room_id === p.room_id && row.status !== 'cancelled' && Date.parse(row.ends_at) > Date.parse(ctx.now)).map(row => row.id);
    requireValue(!affected.length || p.allow_booked === true, 'A sala possui reservas futuras; revise-as e confirme a abertura da manutenção.');
    return save(state.maintenance_orders, null, { room_id: p.room_id, description, due_date: p.due_date || null, status, affected_schedule_ids: affected }, ctx);
  }
  if (type === 'finance.rule.save') {
    requireValue(Number.isInteger(p.professional_basis_points) && p.professional_basis_points >= 0 && p.professional_basis_points <= 10000, 'Percentual inválido.');
    if (p.professional_id) find(state.profiles, p.professional_id, 'Profissional');
    if (p.definition_id) find(state.activity_definitions || [], p.definition_id, 'Atividade');
    if (p.offering_id) find(state.activity_offerings || [], p.offering_id, 'Oferta');
    const old = p.id ? find(state.split_rules, p.id, 'Regra') : null;
    const sameScope = rule => rule.id !== old?.id && rule.active && (p.active !== false) &&
      (rule.professional_id || null) === (p.professional_id || null) &&
      (rule.definition_id || null) === (p.definition_id || null) &&
      (rule.offering_id || null) === (p.offering_id || null);
    requireValue(!state.split_rules.some(sameScope), 'Já existe uma regra ativa para este escopo.');
    return save(state.split_rules, old, { name: requiredText(p.name, 'nome'), professional_id: p.professional_id || null, definition_id: p.definition_id || null, offering_id: p.offering_id || null, professional_basis_points: p.professional_basis_points, active: p.active !== false, version: (old?.version || 0) + 1 }, ctx);
  }
  if (type === 'finance.entry.save') {
    positive(p.amount_cents); validDate(p.due_date);
    requireValue(['receivable', 'payable'].includes(p.direction), 'Direção inválida.');
    if (p.profile_id) find(state.profiles, p.profile_id, 'Pessoa');
    if (p.schedule_id) find(state.schedule_items, p.schedule_id, 'Agendamento');
    const old = p.id ? find(state.financial_entries, p.id, 'Obrigação') : null;
    requireValue(!old || (!old.source_split_id && !old.reverses_entry_id && !state.payment_allocations.some(a => a.entry_id === old.id)), 'Obrigação com pagamento ou repasse não pode ser alterada.');
    requireValue(!p.recurrence || p.recurrence === 'monthly', 'Recorrência suportada: mensal.');
    if (p.receipt_url) safeUrl(p.receipt_url);
    return save(state.financial_entries, old, { direction: p.direction, profile_id: p.profile_id || null, schedule_id: p.schedule_id || null, description: requiredText(p.description, 'descrição'), category: p.category || '', cost_center: p.cost_center || '', amount_cents: p.amount_cents, due_date: p.due_date, receipt_url: p.receipt_url || '', recurrence: p.recurrence || null }, ctx);
  }
  if (type === 'finance.payment') {
    const entry = find(state.financial_entries, p.entry_id, 'Obrigação'); positive(p.amount_cents);
    requireValue(!entry.reverses_entry_id && p.amount_cents <= netAmount(state, entry) - allocated(state, entry.id), 'Valor excede o saldo pendente.');
    const method = requiredText(p.method, 'forma de pagamento');
    requireValue(!p.paid_at || Number.isFinite(Date.parse(p.paid_at)), 'Data do pagamento inválida.');
    const applicable = selectRule(state, entry);
    const payment = save(state.payments, null, { entry_id: entry.id, direction: entry.direction, amount_cents: p.amount_cents, method, paid_at: p.paid_at || ctx.now }, ctx);
    save(state.payment_allocations, null, { payment_id: payment.id, entry_id: entry.id, amount_cents: p.amount_cents }, ctx);
    if (applicable) {
      const professional_cents = Number((BigInt(p.amount_cents) * BigInt(applicable.rule.professional_basis_points) + 5000n) / 10000n);
      const split = save(state.split_allocations, null, { payment_id: payment.id, entry_id: entry.id, professional_id: applicable.professional_id, rule_snapshot: { ...applicable.rule }, professional_cents, institute_cents: p.amount_cents - professional_cents, basis: 'gross', rounding: 'half-up' }, ctx);
      if (professional_cents) save(state.financial_entries, null, { direction: 'payable', profile_id: applicable.professional_id, schedule_id: entry.schedule_id, description: `Repasse: ${entry.description}`, category: 'repasse', cost_center: entry.cost_center, amount_cents: professional_cents, due_date: (p.paid_at || ctx.now).slice(0, 10), source_split_id: split.id }, ctx);
    }
    return payment;
  }
  if (type === 'finance.refund') {
    const payment = find(state.payments, p.payment_id, 'Pagamento'); positive(p.amount_cents);
    requireValue(!payment.reverses_payment_id && !state.payments.some(row => row.reverses_payment_id === payment.id), 'Pagamento já estornado.');
    requireValue(p.amount_cents === payment.amount_cents, 'Nesta versão o estorno deve ser integral.');
    const reason = requiredText(p.reason, 'motivo');
    const splits = state.split_allocations.filter(row => row.payment_id === payment.id);
    const obligations = state.financial_entries.filter(row => splits.some(split => split.id === row.source_split_id));
    requireValue(obligations.every(entry => allocated(state, entry.id) === 0), 'Estorne o pagamento do repasse antes do recebimento.');
    const reversal = save(state.payments, null, { entry_id: payment.entry_id, direction: payment.direction, amount_cents: -payment.amount_cents, reverses_payment_id: payment.id, reason, method: payment.method, paid_at: ctx.now }, ctx);
    save(state.payment_allocations, null, { entry_id: payment.entry_id, payment_id: reversal.id, amount_cents: -payment.amount_cents }, ctx);
    for (const obligation of obligations) save(state.financial_entries, null, { direction: obligation.direction, amount_cents: obligation.amount_cents, reverses_entry_id: obligation.id, description: `Estorno: ${obligation.description}`, due_date: ctx.now.slice(0, 10) }, ctx);
    for (const split of splits) save(state.split_allocations, null, { payment_id: reversal.id, reverses_split_id: split.id, professional_cents: -split.professional_cents, institute_cents: -split.institute_cents, rule_snapshot: { ...split.rule_snapshot } }, ctx);
    return reversal;
  }
  if (type === 'finance.generateRecurring') {
    validDate(p.through);
    const generated = [];
    for (const template of state.financial_entries.filter(entry => entry.recurrence === 'monthly' && !entry.recurring_source_id)) {
      const [year, month, day] = template.due_date.split('-').map(Number);
      const [endYear, endMonth] = p.through.split('-').map(Number);
      const count = (endYear - year) * 12 + endMonth - month;
      requireValue(count <= 120, 'Gere no máximo dez anos de recorrência por vez.');
      for (let index = 1; index <= count; index++) {
        const first = new Date(Date.UTC(year, month - 1 + index, 1));
        const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
        const due_date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
        if (due_date > p.through || state.financial_entries.some(entry => entry.recurring_source_id === template.id && entry.due_date === due_date)) continue;
        generated.push(save(state.financial_entries, null, { direction: template.direction, profile_id: template.profile_id, schedule_id: template.schedule_id, description: template.description, category: template.category, cost_center: template.cost_center, amount_cents: template.amount_cents, due_date, recurring_source_id: template.id, recurrence: null }, ctx));
      }
    }
    return generated;
  }
  return undefined;
}
