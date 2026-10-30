import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCourseInterest, mountLearningStudio } from '../../outputs/js/courses/learning-studio.js';
import { carregarRecebidos } from '../../outputs/js/admin/recebidos.js';
import { criarBlogPublico } from '../../outputs/js/blog/blog-remoto.js';

function formularioDeCurso(dados = {}) {
  const submit = {
    disabled: false,
    setAttribute(nome) { if (nome === 'disabled') this.disabled = true; },
    removeAttribute(nome) { if (nome === 'disabled') this.disabled = false; },
  };
  const listeners = {};
  const form = {
    dados: { topic: 'Yoga e meditação', modality: 'online', availability: ['noite'], goal: 'Aprender', ...dados },
    querySelector: () => submit,
    addEventListener(event, fn) { listeners[event] = fn; },
    removeEventListener(event) { delete listeners[event]; },
    enviar() { return listeners.submit({ preventDefault() {} }); },
  };
  const status = { textContent: '', dataset: {} };
  const review = { hidden: true, focus() {} };
  const elements = new Map([
    ['[data-course-interest-form]', form],
    ['[data-interest-status]', status],
    ['[data-interest-topic]', { textContent: '' }],
    ['[data-interest-format]', { textContent: '' }],
    ['[data-interest-goal]', { textContent: '' }],
    ['[data-interest-review]', review],
  ]);
  const studio = {
    querySelector(selector) { return elements.get(selector) || null; },
    querySelectorAll() { return []; },
  };
  const root = { querySelector(selector) { return selector === '[data-learning-studio]' ? studio : null; } };
  return { root, form, submit, status, review };
}

// Os testes simulam o endpoint, sem usar o Supabase institucional.
test('curso: duplo submit durante rede lenta gera somente uma requisição e não reenvia após sucesso', async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  let liberar;
  const trava = new Promise((resolve) => { liberar = resolve; });
  const requests = [];
  globalThis.FormData = class {
    constructor(form) { this.data = form.dados; }
    get(name) { return this.data[name] ?? null; }
    getAll(name) { return this.data[name] || []; }
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    await trava;
    return { ok: true, status: 201, text: async () => '' };
  };
  try {
    const tela = formularioDeCurso();
    const mounted = mountLearningStudio(tela.root);
    const primeiro = tela.form.enviar();
    const segundo = tela.form.enviar();
    assert.equal(requests.length, 1, 'uma única requisição deve sair do navegador');
    assert.equal(tela.submit.disabled, true);
    liberar();
    await Promise.all([primeiro, segundo]);
    assert.equal(tela.status.dataset.state, 'success');
    assert.equal(tela.review.hidden, false);
    await tela.form.enviar();
    assert.equal(requests.length, 1, 'o mesmo formulário não reenvia após confirmação');
    assert.equal(tela.submit.disabled, true);
    mounted.destroy();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }
});

test('curso: tema e objetivo demasiado longos são rejeitados antes do envio', () => {
  const base = { topic: 'Yoga e meditação', modality: 'online', availability: ['noite'] };
  assert.throws(() => buildCourseInterest({ ...base, topic: 'a'.repeat(161) }), /160/);
  assert.throws(() => buildCourseInterest({ ...base, goal: 'b'.repeat(1001) }), /1\.000/);
  assert.equal(buildCourseInterest({ ...base, goal: 'b'.repeat(1000) }).goal.length, 1000);
});

test('administração: recebimentos e contagem são consultas separadas de leitura', async () => {
  const calls = [];
  const client = { from(table) {
    calls.push(table);
    return {
      select(fields, opts) {
        calls.push({ table, fields, opts });
        if (table === 'newsletter_subscriptions') return Promise.resolve({ error: null, count: 3 });
        return { order() { return { limit: async () => ({ error: null, data: [{ kind: 'curso', subject: 'Yoga' }] }) }; } };
      },
    };
  }};
  const result = await carregarRecebidos(client);
  assert.deepEqual(result.interesses.map((x) => x.subject), ['Yoga']);
  assert.equal(result.inscritos, 3);
  assert.deepEqual(calls.filter((x) => typeof x === 'string'), ['site_interests', 'newsletter_subscriptions']);
  const ins = calls.find((x) => x.table === 'newsletter_subscriptions');
  assert.deepEqual(ins.opts, { count: 'exact', head: true });
});

test('comentários e newsletter: payload público não escolhe aprovação nem status', async () => {
  const calls = [];
  const blog = criarBlogPublico({ rest: {
    ler: async () => [],
    inserir: async (tabela, linha) => { calls.push({ tabela, linha }); },
    rpc: async (name, args) => { calls.push({ name, args }); },
  } });
  await blog.enviarComentario({ slug: 'artigo-publicado', nome: 'Leitora', texto: '<script>alert(1)</script>' });
  await blog.inscrever('leitor@example.test');
  assert.deepEqual(Object.keys(calls[0].linha).sort(), ['author_name', 'body', 'post_slug']);
  assert.equal(calls[1].name, 'subscribe_newsletter');
  assert.deepEqual(calls[1].args, { p_email: 'leitor@example.test', p_source: 'blog' });
});
