import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationsClient } from '../../outputs/js/admin/operations/client.js';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });
function api() {
  const state = { revision: 0, profiles: [] };
  const calls = [];
  const requests = new Map();
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers['X-Potala-Token'], 'session-token');
    if (url.endsWith('/state')) return response(state);
    const command = JSON.parse(options.body);
    if (requests.has(command.idempotency_key)) return response(requests.get(command.idempotency_key));
    if (command.revision !== state.revision) return response({ error: 'Conflito de revisão' }, 409);
    if (command.type !== 'test.profile') return response({ error: 'Operação desconhecida' }, 400);
    const result = { id: command.payload.id, name: command.payload.name || '' };
    state.profiles.push(result);
    state.revision++;
    const answer = { result, revision: state.revision };
    requests.set(command.idempotency_key, answer);
    return response(answer);
  };
  return { state, calls, fetchImpl };
}

test('refresh exige token e expõe cópia do estado remoto', async () => {
  assert.throws(() => createOperationsClient({ token: '' }), /token/i);
  const server = api();
  const client = createOperationsClient({ token: 'session-token', fetchImpl: server.fetchImpl });
  assert.equal(client.snapshot, null);
  await client.refresh();
  assert.equal(client.snapshot.revision, 0);
  const copy = client.snapshot;
  copy.profiles.push({ id: 'não-persistido' });
  assert.deepEqual(client.snapshot.profiles, []);
  assert.equal(server.calls[0].options.method, 'GET');
});

test('comandos concorrentes aguardam revisões novas e devolvem o resultado', async () => {
  const server = api();
  const client = createOperationsClient({ token: 'session-token', fetchImpl: server.fetchImpl });
  const results = await Promise.all([
    client.command('test.profile', { id: 'a', name: 'Primeiro' }),
    client.command('test.profile', { id: 'b', name: 'Segundo' }),
  ]);
  assert.deepEqual(results.map((row) => row.id), ['a', 'b']);
  const commands = server.calls.filter((call) => call.options.method === 'POST').map((call) => JSON.parse(call.options.body));
  assert.deepEqual(commands.map((command) => command.revision), [0, 1]);
  assert.notEqual(commands[0].idempotency_key, commands[1].idempotency_key);
  assert.equal(client.snapshot.revision, 2);
  assert.equal(client.snapshot.profiles.length, 2);
});

test('409 atualiza o estado e mantém mensagem original; próximo comando funciona', async () => {
  const server = api();
  const client = createOperationsClient({ token: 'session-token', fetchImpl: server.fetchImpl });
  await client.refresh();
  server.state.revision = 3;
  await assert.rejects(client.command('test.profile', { id: 'a' }), /Conflito de revisão/);
  assert.equal(client.snapshot.revision, 3);
  await client.command('test.profile', { id: 'a' });
  assert.equal(client.snapshot.revision, 4);
});

test('resposta perdida reutiliza chave para mesma operação sem repetir gravação', async () => {
  const server = api();
  let loseResponse = true;
  const client = createOperationsClient({ token: 'session-token', fetchImpl: async (url, options) => {
    const result = await server.fetchImpl(url, options);
    if (options.method === 'POST' && loseResponse) { loseResponse = false; throw new Error('Conexão perdida'); }
    return result;
  } });
  await assert.rejects(client.command('test.profile', { id: 'a', name: 'Título' }), /Conexão perdida/);
  await client.command('test.profile', { name: 'Título', id: 'a' });
  const commands = server.calls.filter((call) => call.options.method === 'POST').map((call) => JSON.parse(call.options.body));
  assert.equal(commands[0].idempotency_key, commands[1].idempotency_key);
  assert.equal(server.state.revision, 1);
  assert.equal(client.snapshot.revision, 1);
});

test('falha de refresh depois de gravar também permite repetição idempotente', async () => {
  const server = api();
  let failed = false;
  const client = createOperationsClient({ token: 'session-token', fetchImpl: async (url, options) => {
    if (url.endsWith('/state') && server.state.revision === 1 && !failed) { failed = true; throw new Error('Leitura falhou'); }
    return server.fetchImpl(url, options);
  } });
  await assert.rejects(client.command('test.profile', { id: 'a' }), /Leitura falhou/);
  await client.command('test.profile', { id: 'a' });
  assert.equal(server.state.revision, 1);
  assert.equal(client.snapshot.revision, 1);
});

test('falha de leitura não inventa estado nem usa fallback local', async () => {
  const client = createOperationsClient({ token: 'session-token', fetchImpl: async () => response({ error: 'Serviço indisponível' }, 503) });
  await assert.rejects(client.refresh(), /Serviço indisponível/);
  assert.equal(client.snapshot, null);
});
