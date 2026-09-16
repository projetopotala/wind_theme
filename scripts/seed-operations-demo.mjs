import { randomUUID } from 'node:crypto';

const baseUrl = new URL(process.env.POTALA_PREVIEW_URL || process.argv[2] || 'http://127.0.0.1:4173');
if (!['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)) {
  throw new Error('A carga demonstrativa só pode ser executada em um endereço local.');
}

const apiUrl = new URL('/api/operations/', baseUrl);
const request = async (path, options = {}) => {
  const response = await fetch(new URL(path, apiUrl), options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status} em ${path}.`);
  return data;
};

const session = await request('session');
const headers = { 'Content-Type': 'application/json', 'X-Potala-Token': session.token };
let state = await request('state', { headers });

const domainCollections = [
  'rooms', 'profiles', 'activity_definitions', 'activity_offerings', 'schedule_items',
  'inventory_items', 'inventory_assets', 'inventory_balances', 'financial_entries',
];
const existing = domainCollections.reduce((total, key) => total + (state[key]?.length || 0), 0);
if (existing) {
  throw new Error('A base operacional já possui dados. A carga demonstrativa foi cancelada para não sobrescrever informações existentes.');
}

let commandNumber = 0;
const command = async (type, payload = {}) => {
  commandNumber += 1;
  const response = await request('command', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type,
      payload,
      revision: state.revision,
      idempotency_key: `demo-${String(commandNumber).padStart(3, '0')}-${randomUUID()}`,
      actor: 'Carga demonstrativa local',
    }),
  });
  state.revision = response.revision;
  return response.result;
};

const refresh = async () => { state = await request('state', { headers }); return state; };
const saoPauloDate = (offset = 0) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const noon = new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + offset, 12));
  return noon.toISOString().slice(0, 10);
};
const dateAt = (day, time) => `${day}T${time}:00-03:00`;

console.log('Preparando uma demonstração integrada do Portal Potala...');

await command('setup.rooms');
await refresh();

const roomData = [
  ['S01', 'Sala Lótus', 'Térreo · ala tranquila', 'Ambiente reservado para atendimentos individuais.', 12, 2, 'individual', true, 9000],
  ['S02', 'Sala Aurora', '1º andar · corredor leste', 'Consultório acolhedor com luz natural.', 14, 3, 'individual', false, 9500],
  ['S03', 'Sala Bambu', '1º andar · corredor oeste', 'Sala silenciosa para terapias e consultas.', 11, 2, 'individual', false, 8500],
  ['S04', 'Sala Silêncio', 'Térreo · jardim interno', 'Atendimentos individuais ou pequenos grupos.', 18, 4, 'collective', true, 11000],
  ['S05', 'Sala Ponte', '2º andar · ala norte', 'Espaço flexível para escuta e orientação.', 19, 4, 'collective', false, 10500],
  ['S06', 'Sala Brisa', '2º andar · ala sul', 'Consultório compacto em revisão de iluminação.', 13, 2, 'individual', false, 8500],
  ['S07', 'Sala Mandala', 'Térreo · jardim', 'Práticas corporais, grupos e encontros de movimento.', 46, 20, 'multiuso', true, 18000],
  ['S08', 'Sala Horizonte', 'Térreo · acesso principal', 'Cursos, rodas e workshops com apoio audiovisual.', 72, 35, 'course', true, 26000],
  ['S09', 'Salão Celeiro', 'Bloco cultural', 'Palestras, apresentações e eventos de maior porte.', 118, 60, 'event', true, 42000],
  ['S10', 'Terraço Potala', 'Cobertura · acesso por elevador', 'Espaço multiuso para experiências e locações.', 96, 45, 'multiuso', true, 36000],
];

for (const values of roomData) {
  const [code, name, floor, description, area, capacity, type, accessible, hourly_rate_cents] = values;
  const room = state.rooms.find(item => item.code === code);
  await command('room.save', {
    id: room.id, code, name, floor, description, area, capacity, type, accessible,
    status: 'available', opens_at: '07:00', closes_at: '22:30', hourly_rate_cents,
    notes: code === 'S08' ? 'Acesso sem degraus e banheiro acessível próximo.' : '',
  });
}
await refresh();
const room = code => state.rooms.find(item => item.code === code);

const people = {};
for (const person of [
  { key: 'clara', display_name: 'Clara Mendes', email: 'clara.mendes@example.com', phone: '(41) 99911-1201', roles: ['professional'], notes: 'Psicóloga · abordagem integrativa' },
  { key: 'lin', display_name: 'Lin Watanabe', email: 'lin.watanabe@example.com', phone: '(41) 99922-1202', roles: ['professional'], notes: 'Professor de Kung Fu e práticas contemplativas' },
  { key: 'rita', display_name: 'Rita Okada', email: 'rita.okada@example.com', phone: '(41) 99933-1203', roles: ['professional'], notes: 'Instrutora de Yoga Integral' },
  { key: 'paulo', display_name: 'Paulo Nunes', email: 'paulo.nunes@example.com', phone: '(41) 99944-1204', roles: ['professional'], notes: 'Facilitador de dança e grupos' },
  { key: 'ana', display_name: 'Ana Souza', email: 'ana.souza@example.com', phone: '(41) 98811-2101', roles: ['client', 'student', 'participant'], notes: 'Prefere contato por mensagem' },
  { key: 'joao', display_name: 'João Ferreira', email: 'joao.ferreira@example.com', phone: '(41) 98822-2102', roles: ['client', 'participant'], notes: 'Cliente de atendimento e locação' },
  { key: 'marina', display_name: 'Marina Lopes', email: 'marina.lopes@example.com', phone: '(41) 98833-2103', roles: ['student', 'participant'], notes: 'Aluna de Yoga e Dança' },
  { key: 'beatriz', display_name: 'Beatriz Lima', email: 'beatriz.lima@example.com', phone: '(41) 98844-2104', roles: ['client', 'participant'], notes: '' },
  { key: 'caio', display_name: 'Caio Martins', email: 'caio.martins@example.com', phone: '(41) 98855-2105', roles: ['student', 'participant'], notes: 'Aluno de Kung Fu' },
]) people[person.key] = await command('person.save', person);

const definitions = {};
for (const definition of [
  { key: 'therapy', title: 'Psicoterapia integrativa', kind: 'appointment', description: 'Atendimento individual presencial ou online.' },
  { key: 'yoga', title: 'Yoga Integral', kind: 'activity', description: 'Prática de presença, respiração e movimento.' },
  { key: 'dance', title: 'Dança Circular', kind: 'activity', description: 'Encontro coletivo de movimento e vínculo.' },
  { key: 'kungfu', title: 'Kung Fu', kind: 'course', description: 'Prática marcial continuada para diferentes níveis.' },
  { key: 'expansion', title: 'Ciclo de Expansão', kind: 'workshop', description: 'Workshop vivencial com recursos audiovisuais.' },
  { key: 'rental', title: 'Locação de espaço', kind: 'rental', description: 'Uso pontual das salas por clientes e parceiros.' },
]) definitions[definition.key] = await command('definition.save', definition);

const offerings = {};
for (const offering of [
  { key: 'yoga', definition_id: definitions.yoga.id, title: 'Yoga Integral · turma da tarde', professional_id: people.rita.id, capacity: 20, status: 'active' },
  { key: 'dance', definition_id: definitions.dance.id, title: 'Dança Circular · quartas', professional_id: people.paulo.id, capacity: 30, status: 'active' },
  { key: 'kungfu', definition_id: definitions.kungfu.id, title: 'Kung Fu · fundamentos', professional_id: people.lin.id, capacity: 40, status: 'active' },
  { key: 'expansion', definition_id: definitions.expansion.id, title: 'Ciclo de Expansão · setembro', professional_id: people.clara.id, capacity: 35, status: 'active' },
]) offerings[offering.key] = await command('offering.save', offering);

const enrollments = {};
for (const enrollment of [
  { key: 'ana-yoga', profile_id: people.ana.id, offering_id: offerings.yoga.id, status: 'active' },
  { key: 'marina-yoga', profile_id: people.marina.id, offering_id: offerings.yoga.id, status: 'active' },
  { key: 'marina-dance', profile_id: people.marina.id, offering_id: offerings.dance.id, status: 'active' },
  { key: 'caio-kungfu', profile_id: people.caio.id, offering_id: offerings.kungfu.id, status: 'active' },
]) enrollments[enrollment.key] = await command('enrollment.save', enrollment);

const items = {};
for (const item of [
  { key: 'chairs', name: 'Cadeiras', tracking_mode: 'quantity', category: 'Mobiliário' },
  { key: 'tables', name: 'Mesas dobráveis', tracking_mode: 'quantity', category: 'Mobiliário' },
  { key: 'mats', name: 'Tapetes de yoga', tracking_mode: 'quantity', category: 'Práticas corporais' },
  { key: 'projector', name: 'Projetor multimídia', tracking_mode: 'asset', category: 'Audiovisual' },
  { key: 'speaker', name: 'Caixa de som', tracking_mode: 'asset', category: 'Audiovisual' },
  { key: 'tv', name: 'TV 55 polegadas', tracking_mode: 'asset', category: 'Audiovisual' },
  { key: 'presenter', name: 'Controle de apresentação', tracking_mode: 'asset', category: 'Audiovisual' },
]) items[item.key] = await command('inventory.item.save', item);

await command('inventory.receive', { item_id: items.chairs.id, location_id: 'storage', quantity: 180, condition: 'available', reason: 'Carga patrimonial inicial' });
for (const [to, quantity] of [[room('S07').id, 20], [room('S08').id, 30], [room('S09').id, 40], [room('S10').id, 30]]) {
  await command('inventory.move', { item_id: items.chairs.id, from_location_id: 'storage', to_location_id: to, quantity, reason: 'Distribuição inicial por sala' });
}
await command('inventory.condition', { item_id: items.chairs.id, location_id: 'storage', quantity: 7, from_condition: 'available', condition: 'damaged', reason: 'Cadeiras separadas para avaliação' });
await command('inventory.condition', { item_id: items.chairs.id, location_id: 'storage', quantity: 3, from_condition: 'available', condition: 'maintenance', reason: 'Reparo de estrutura e acabamento' });

await command('inventory.receive', { item_id: items.tables.id, location_id: 'storage', quantity: 18, condition: 'available', reason: 'Carga patrimonial inicial' });
await command('inventory.move', { item_id: items.tables.id, from_location_id: 'storage', to_location_id: room('S07').id, quantity: 4, reason: 'Apoio para atividades coletivas' });
await command('inventory.move', { item_id: items.tables.id, from_location_id: 'storage', to_location_id: room('S08').id, quantity: 6, reason: 'Configuração da sala de cursos' });
await command('inventory.receive', { item_id: items.mats.id, location_id: 'storage', quantity: 30, condition: 'available', reason: 'Carga patrimonial inicial' });
await command('inventory.move', { item_id: items.mats.id, from_location_id: 'storage', to_location_id: room('S07').id, quantity: 20, reason: 'Turma de Yoga Integral' });

const assets = {};
for (const asset of [
  { key: 'projector1', item: 'projector', code: 'PAT-PROJ-001', brand: 'Epson', model: 'PowerLite E20', serial: 'DEMO-PJ-001', room: 'S08' },
  { key: 'projector2', item: 'projector', code: 'PAT-PROJ-002', brand: 'BenQ', model: 'MX550', serial: 'DEMO-PJ-002', room: 'S09' },
  { key: 'projector3', item: 'projector', code: 'PAT-PROJ-003', brand: 'Epson', model: 'X49', serial: 'DEMO-PJ-003', room: null },
  { key: 'speaker1', item: 'speaker', code: 'PAT-SOM-001', brand: 'JBL', model: 'EON One', serial: 'DEMO-SOM-001', room: 'S09' },
  { key: 'tv1', item: 'tv', code: 'PAT-TV-001', brand: 'Samsung', model: 'Crystal UHD', serial: 'DEMO-TV-001', room: 'S10' },
  { key: 'presenter1', item: 'presenter', code: 'PAT-CTRL-001', brand: 'Logitech', model: 'R500', serial: 'DEMO-CTRL-001', room: 'S08' },
]) {
  assets[asset.key] = await command('inventory.receive', {
    item_id: items[asset.item].id, location_id: 'storage', quantity: 1, condition: 'available',
    asset_code: asset.code, brand: asset.brand, model: asset.model, serial_number: asset.serial,
    acquired_at: '2026-02-12', reason: 'Cadastro patrimonial demonstrativo',
  });
  if (asset.room) {
    await command('inventory.move', {
      item_id: items[asset.item].id, asset_id: assets[asset.key].id,
      from_location_id: 'storage', to_location_id: room(asset.room).id,
      quantity: 1, reason: 'Alocação permanente de equipamento',
    });
  }
}

await command('maintenance.save', { asset_id: assets.projector3.id, description: 'Troca preventiva da lâmpada e limpeza óptica', due_date: saoPauloDate(5), status: 'open' });
await command('maintenance.save', { room_id: room('S06').id, description: 'Revisão da iluminação do consultório', due_date: saoPauloDate(2), status: 'open' });

await command('finance.rule.save', { name: 'Repasse padrão 70/30', professional_basis_points: 7000, active: true });
await command('finance.rule.save', { name: 'Parceria Yoga 65/35', professional_id: people.rita.id, professional_basis_points: 6500, active: true });

const yesterday = saoPauloDate(-1);
const today = saoPauloDate(0);
const tomorrow = saoPauloDate(1);
const inTwoDays = saoPauloDate(2);
const inFourWeeks = saoPauloDate(28);

const completed = await command('schedule.save', {
  title: 'Workshop de respiração consciente', kind: 'workshop', room_id: room('S08').id,
  professional_id: people.clara.id, mode: 'presencial', starts_at: dateAt(yesterday, '14:00'),
  ends_at: dateAt(yesterday, '16:00'), participants: 18, price_cents: 54000,
  requirements: [{ item_id: items.chairs.id, quantity: 18 }, { item_id: items.projector.id, quantity: 1 }],
  extras: [], notes: 'Encontro concluído para compor o histórico operacional.',
});
await command('schedule.complete', { id: completed.id });

const therapy = await command('schedule.save', {
  title: 'Psicoterapia · Ana Souza', kind: 'appointment', definition_id: definitions.therapy.id,
  room_id: room('S01').id, professional_id: people.clara.id, client_id: people.ana.id,
  mode: 'presencial', starts_at: dateAt(today, '09:00'), ends_at: dateAt(today, '10:00'),
  participants: 1, price_cents: 22000, requirements: [], extras: [], notes: 'Primeira sessão do ciclo.',
});
const online = await command('schedule.save', {
  title: 'Psicoterapia online · João Ferreira', kind: 'appointment', definition_id: definitions.therapy.id,
  professional_id: people.clara.id, client_id: people.joao.id, mode: 'online',
  starts_at: dateAt(today, '10:30'), ends_at: dateAt(today, '11:30'), participants: 1,
  price_cents: 18000, online_url: 'https://meet.example.com/potala-demo', requirements: [], extras: [],
});
const yoga = await command('schedule.save', {
  title: 'Yoga Integral', kind: 'activity', offering_id: offerings.yoga.id, room_id: room('S07').id,
  mode: 'presencial', starts_at: dateAt(today, '18:00'), ends_at: dateAt(today, '19:00'),
  participants: 16, price_cents: 48000, setup_minutes: 15, teardown_minutes: 10,
  requirements: [{ item_id: items.mats.id, quantity: 16 }], extras: [],
  recurrence: { frequency: 'weekly', until: inFourWeeks },
});
const dance = await command('schedule.save', {
  title: 'Dança Circular', kind: 'activity', offering_id: offerings.dance.id, room_id: room('S08').id,
  mode: 'presencial', starts_at: dateAt(today, '19:30'), ends_at: dateAt(today, '21:00'),
  participants: 24, price_cents: 60000, requirements: [{ item_id: items.chairs.id, quantity: 12 }], extras: [],
});
const kungfu = await command('schedule.save', {
  title: 'Kung Fu · fundamentos', kind: 'course', offering_id: offerings.kungfu.id, room_id: room('S09').id,
  mode: 'presencial', starts_at: dateAt(today, '19:00'), ends_at: dateAt(today, '20:30'),
  participants: 32, price_cents: 72000, requirements: [], extras: [],
});
const expansion = await command('schedule.save', {
  title: 'Ciclo de Expansão', kind: 'workshop', offering_id: offerings.expansion.id, room_id: room('S08').id,
  mode: 'presencial', starts_at: dateAt(tomorrow, '18:30'), ends_at: dateAt(tomorrow, '21:00'),
  participants: 30, price_cents: 150000, setup_minutes: 30, teardown_minutes: 20,
  requirements: [
    { item_id: items.chairs.id, quantity: 30 }, { item_id: items.projector.id, quantity: 1 },
    { item_id: items.speaker.id, quantity: 1 }, { item_id: items.presenter.id, quantity: 1 },
  ],
  extras: [{ name: 'Coffee break', quantity: 30, unit_price_cents: 2500 }],
  notes: 'A caixa de som está em outra sala; o painel deve sugerir a transferência.',
});
const rental = await command('schedule.save', {
  title: 'Locação · Encontro de lideranças', kind: 'rental', definition_id: definitions.rental.id,
  room_id: room('S10').id, client_id: people.joao.id, mode: 'presencial',
  starts_at: dateAt(inTwoDays, '14:00'), ends_at: dateAt(inTwoDays, '18:00'), participants: 40,
  price_cents: 120000, setup_minutes: 45, teardown_minutes: 30,
  requirements: [{ item_id: items.chairs.id, quantity: 40 }, { item_id: items.tv.id, quantity: 1 }],
  extras: [{ name: 'Coffee break', quantity: 40, unit_price_cents: 3500 }, { name: 'Preparação especial da sala', quantity: 1, unit_price_cents: 18000 }],
  notes: 'Configuração em auditório e recepção no terraço.',
});

for (const participant of [
  { schedule_id: yoga.id, profile_id: people.ana.id, enrollment_id: enrollments['ana-yoga'].id, status: 'confirmed' },
  { schedule_id: yoga.id, profile_id: people.marina.id, enrollment_id: enrollments['marina-yoga'].id, status: 'confirmed' },
  { schedule_id: dance.id, profile_id: people.marina.id, enrollment_id: enrollments['marina-dance'].id, status: 'confirmed' },
  { schedule_id: kungfu.id, profile_id: people.caio.id, enrollment_id: enrollments['caio-kungfu'].id, status: 'confirmed' },
  { schedule_id: expansion.id, profile_id: people.beatriz.id, status: 'confirmed' },
  { schedule_id: rental.id, profile_id: people.joao.id, status: 'confirmed', role: 'organizer' },
]) await command('participant.save', participant);

const expenses = [];
for (const entry of [
  { direction: 'payable', description: 'Energia elétrica', category: 'Energia', cost_center: 'Estrutura', amount_cents: 180000, due_date: today, recurrence: 'monthly' },
  { direction: 'payable', description: 'Internet fibra', category: 'Internet', cost_center: 'Administrativo', amount_cents: 45000, due_date: tomorrow, recurrence: 'monthly' },
  { direction: 'payable', description: 'Manutenção do Projetor 03', category: 'Manutenção', cost_center: 'Patrimônio', amount_cents: 28000, due_date: saoPauloDate(5) },
  { direction: 'payable', description: 'Coffee break · Ciclo de Expansão', category: 'Coffee break', cost_center: 'Eventos', amount_cents: 42000, due_date: tomorrow },
  { direction: 'receivable', description: 'Apoio cultural · setembro', category: 'Parcerias', cost_center: 'Cultura', amount_cents: 90000, due_date: inTwoDays },
]) expenses.push(await command('finance.entry.save', entry));

await refresh();
const scheduleEntry = scheduleId => state.financial_entries.find(entry => entry.schedule_id === scheduleId && entry.source === 'schedule');
await command('finance.payment', { entry_id: scheduleEntry(therapy.id).id, amount_cents: 22000, method: 'pix', paid_at: `${today}T08:40:00-03:00` });
await command('finance.payment', { entry_id: scheduleEntry(online.id).id, amount_cents: 9000, method: 'cartão', paid_at: `${today}T10:20:00-03:00` });
await command('finance.payment', { entry_id: scheduleEntry(yoga.id).id, amount_cents: 48000, method: 'pix', paid_at: `${today}T17:45:00-03:00` });
await command('finance.payment', { entry_id: expenses[0].id, amount_cents: 180000, method: 'débito automático', paid_at: `${today}T07:30:00-03:00` });
await command('finance.generateRecurring', { through: saoPauloDate(62) });

await refresh();
const summary = {
  salas: state.rooms.length,
  pessoas: state.profiles.length,
  ofertas: state.activity_offerings.length,
  agenda: state.schedule_items.length,
  itens: state.inventory_items.length,
  patrimonios: state.inventory_assets.length,
  movimentacoes: state.inventory_movements.length,
  manutencoes: state.maintenance_orders.length,
  lancamentosFinanceiros: state.financial_entries.length,
  pagamentos: state.payments.length,
  auditorias: state.audit_events.length,
};

console.log('\nCarga demonstrativa concluída.');
console.table(summary);
console.log(`Abra ${new URL('/admin', baseUrl).href} e entre no painel para visualizar.`);
