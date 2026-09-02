# Portal Potala Supabase Content and Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir os blocos editoriais da Home no Supabase e proteger o painel existente com autenticação real por e-mail e senha, sem quebrar a Home quando o serviço remoto estiver indisponível.

**Architecture:** O portal estático continuará publicado a partir de `outputs/` no Vercel. Um cliente Supabase público e um adaptador de conteúdo substituirão o `localStorage` como fonte principal, enquanto os blocos empacotados permanecerão como fallback somente de leitura; o painel usará a mesma interface de repositório depois de validar sessão e papel administrativo por RLS.

**Tech Stack:** HTML, CSS, JavaScript ES Modules, `@supabase/supabase-js` 2.x vendorizado localmente, Supabase Auth, PostgreSQL, Row Level Security, Node Test Runner, Vercel estático.

**Spec:** `docs/superpowers/specs/2026-09-01-potala-trajeto-editorial-admin-design.md`

## Global Constraints

- Manter o portal no Vercel e o Supabase como persistência e autenticação.
- Não expor `service_role`, senha do banco ou token administrativo no navegador ou no Git.
- A Home pública consulta apenas blocos publicados e continua utilizável com o snapshot empacotado quando a rede falha.
- O painel exige sessão Supabase e registro em `admin_users`; esconder a interface não conta como autorização.
- Preservar a prévia ao vivo por `postMessage`; rascunhos não salvos não vão ao banco.
- Esta entrega não inclui upload de mídia nem convites automáticos de administradores; imagens continuam como caminho público ou URL HTTPS e o primeiro administrador é provisionado no Dashboard.
- A migração é expansiva e reversível: o repositório local não será removido nesta entrega.

---

### Task 1: Esquema reproduzível, RLS e conteúdo inicial

**Files:**
- Create: `supabase/migrations/202609020001_portal_home_content.sql`
- Create: `supabase/tests/home_content_rls.test.sql`
- Test: `tests/potala/supabase-migration.test.mjs`

**Interfaces:**
- Consumes: campos normalizados de `outputs/js/home/content-model.js`.
- Produces: tabelas `public.home_blocks` e `public.admin_users`; funções `public.is_portal_admin()` e `public.replace_home_blocks(jsonb)`.

- [ ] **Step 1: escrever o teste estrutural que falha**

```js
test("migração protege conteúdo e administração por RLS", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table public\.home_blocks/i);
  assert.match(sql, /create table public\.admin_users/i);
  assert.match(sql, /enable row level security/gi);
  assert.match(sql, /to anon[\s\S]*published/i);
  assert.match(sql, /replace_home_blocks\s*\(payload jsonb\)/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /service_role|sb_secret_/i);
});
```

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `node --test tests/potala/supabase-migration.test.mjs`

Expected: FAIL porque a migração ainda não existe.

- [ ] **Step 3: criar a migração idempotente**

Criar `home_blocks` com as colunas:

```sql
id text primary key,
slug text not null unique,
category text not null default '',
title text not null,
summary text not null default '',
body text not null default '',
image text not null default '',
icon text not null default '',
tags text[] not null default '{}',
href text not null default '#',
side text not null check (side in ('left', 'right')),
position integer not null check (position >= 0),
published boolean not null default true,
updated_at timestamptz not null default now()
```

Criar `admin_users(user_id uuid primary key references auth.users(id) on delete cascade, role text check (role in ('owner','admin')), created_at timestamptz, updated_at timestamptz)`. Revogar privilégios padrão, conceder apenas `select` público dos blocos publicados e CRUD para autenticados autorizados. `is_portal_admin()` será `security definer`, terá `search_path = ''` e consultará `admin_users` pelo `auth.uid()`.

`replace_home_blocks(payload jsonb)` deve:

1. rejeitar sessão sem administrador;
2. validar que `payload` é array;
3. converter o array com `jsonb_to_recordset`;
4. fazer upsert dos registros;
5. excluir registros ausentes do payload;
6. devolver a lista final ordenada;
7. executar tudo na mesma transação da chamada RPC.

Inserir os nove blocos de `DEFAULT_HOME_BLOCKS` com `insert ... on conflict (id) do nothing`, preservando qualquer edição que já exista ao reaplicar a migração.

- [ ] **Step 4: criar testes pgTAP de permissão**

Cobrir estes casos em `supabase/tests/home_content_rls.test.sql`:

```sql
-- anon: SELECT publicado permitido; SELECT oculto, INSERT, UPDATE e DELETE negados
-- authenticated sem admin_users: apenas SELECT publicado
-- authenticated admin: SELECT completo e RPC replace_home_blocks permitidos
-- authenticated owner: mesmas permissões editoriais
```

- [ ] **Step 5: executar as verificações locais**

Run: `node --test tests/potala/supabase-migration.test.mjs`

Expected: PASS. Se o Supabase CLI estiver instalado, executar também `supabase test db`; caso contrário, registrar a indisponibilidade e validar o SQL no projeto remoto antes de ligar o frontend.

---

### Task 2: cliente Supabase público e configuração segura

**Files:**
- Modify: `package.json`
- Create: `scripts/vendor-supabase.mjs`
- Create: `outputs/js/supabase/config.js`
- Create: `outputs/js/supabase/client.js`
- Create: `tests/potala/supabase-client.test.mjs`
- Modify: `scripts/validate-portal-assets.mjs`

**Interfaces:**
- Consumes: `globalThis.supabase.createClient` do bundle UMD local.
- Produces: `getSupabaseClient({ sdk, config })` e `SUPABASE_CONFIG` com URL e publishable key.

- [ ] **Step 1: escrever testes que falham para configuração e singleton**

```js
test("cliente usa somente configuração pública e é reutilizado", async () => {
  let calls = 0;
  const sdk = { createClient(url, key) { calls += 1; return { url, key }; } };
  const config = { url: "https://example.supabase.co", publishableKey: "sb_publishable_test" };
  assert.equal(getSupabaseClient({ sdk, config }), getSupabaseClient({ sdk, config }));
  assert.equal(calls, 1);
});

test("configuração não aceita chave privada", () => {
  assert.throws(() => validateSupabaseConfig({ url: "https://x.supabase.co", publishableKey: "sb_secret_x" }));
});
```

- [ ] **Step 2: confirmar a falha**

Run: `node --test tests/potala/supabase-client.test.mjs`

Expected: FAIL com módulo inexistente.

- [ ] **Step 3: adicionar e vendorizar o SDK**

Adicionar `@supabase/supabase-js` em versão 2.x e criar script que copie `node_modules/@supabase/supabase-js/dist/umd/supabase.min.js` para `outputs/vendor/supabase.min.js` por escrita atômica. Incluir `vendor:supabase` nos scripts e validar a existência do artefato.

- [ ] **Step 4: implementar configuração e cliente**

```js
export const SUPABASE_CONFIG = Object.freeze({
  url: "https://gotrumwuimpoeggwamut.supabase.co",
  publishableKey: "sb_publishable_daUl7ko5Dg-C5jO67g4sEQ_rGLbbu0e",
});

export function getSupabaseClient({
  sdk = globalThis.supabase,
  config = SUPABASE_CONFIG,
} = {}) {
  validateSupabaseConfig(config);
  if (!sdk?.createClient) throw new Error("SDK Supabase indisponível");
  return cachedClient ??= sdk.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
```

Não criar variável, arquivo ou caminho para `service_role` nesta entrega.

- [ ] **Step 5: executar os testes e validação de assets**

Run: `node --test tests/potala/supabase-client.test.mjs && npm run validate:portal`

Expected: PASS e `outputs/vendor/supabase.min.js` encontrado.

---

### Task 3: repositório remoto com fallback explícito

**Files:**
- Create: `outputs/js/home/supabase-content-repository.js`
- Create: `outputs/js/home/content-source.js`
- Test: `tests/potala/supabase-content-repository.test.mjs`
- Test: `tests/potala/home-content-source.test.mjs`

**Interfaces:**
- Consumes: cliente com `.from("home_blocks")` e `.rpc("replace_home_blocks")`; `normalizeHomeBlocks`.
- Produces: `createSupabaseContentRepository({ client, defaults })` e `createHomeContentSource({ remote, fallback })`, ambos com `list`, `replaceAll` e `reset`.

- [ ] **Step 1: escrever testes que falham para mapeamento, ordenação e erro**

```js
test("list mapeia snake_case e filtra publicação no servidor", async () => {
  const repository = createSupabaseContentRepository({ client: fakeClient(rows) });
  const blocks = await repository.list({ publishedOnly: true });
  assert.equal(blocks[0].updatedAt, rows[0].updated_at);
  assert.equal(query.eqCalls[0], ["published", true]);
  assert.deepEqual(query.orderCalls[0], ["position", { ascending: true }]);
});

test("replaceAll usa uma única RPC atômica", async () => {
  await repository.replaceAll(blocks);
  assert.deepEqual(client.rpcCalls.map((call) => call.name), ["replace_home_blocks"]);
});
```

- [ ] **Step 2: confirmar a falha**

Run: `node --test tests/potala/supabase-content-repository.test.mjs tests/potala/home-content-source.test.mjs`

Expected: FAIL por módulos inexistentes.

- [ ] **Step 3: implementar o adaptador remoto**

Mapear `updated_at` ↔ `updatedAt`; selecionar colunas explicitamente; lançar erro com `code` e mensagem quando o Supabase retornar erro. `replaceAll` envia todos os blocos normalizados numa única chamada RPC. `reset` chama `replaceAll(defaults)`.

- [ ] **Step 4: implementar a fonte compatível**

```js
export function createHomeContentSource({ remote, fallback, onRemoteError = () => {} }) {
  return {
    async list(options) {
      try { return await remote.list(options); }
      catch (error) { onRemoteError(error); return fallback.list(options); }
    },
    replaceAll(blocks) { return remote.replaceAll(blocks); },
    reset() { return remote.reset(); },
  };
}
```

O fallback é somente para leitura pública. Falha de escrita deve subir ao painel; nunca gravar silenciosamente no `localStorage` e anunciar sucesso.

- [ ] **Step 5: executar os testes**

Run: `node --test tests/potala/supabase-content-repository.test.mjs tests/potala/home-content-source.test.mjs tests/potala/home-content-repository.test.mjs`

Expected: PASS, incluindo as regressões do repositório local preservado.

---

### Task 4: autenticação e autorização do painel

**Files:**
- Create: `outputs/js/admin/admin-auth.js`
- Modify: `outputs/admin.html`
- Modify: `outputs/css/admin.css`
- Modify: `outputs/js/admin/admin-controller.js`
- Test: `tests/potala/admin-auth.test.mjs`
- Modify: `tests/potala/admin-local.test.mjs`

**Interfaces:**
- Consumes: `client.auth.getSession()`, `signInWithPassword`, `signOut` e consulta de `admin_users`.
- Produces: `createAdminAuth({ client, root, onAuthorized })`, estados `checking`, `signed-out`, `forbidden`, `authorized` e `error`.

- [ ] **Step 1: escrever testes de estado que falham**

```js
test("sessão inexistente mostra login e não monta editor", async () => {
  const auth = createAdminAuth({ client: signedOutClient, root, onAuthorized });
  await auth.ready;
  assert.equal(root.dataset.authState, "signed-out");
  assert.equal(onAuthorized.mock.calls.length, 0);
});

test("usuário autenticado sem papel é recusado", async () => {
  await createAdminAuth({ client: nonAdminClient, root, onAuthorized }).ready;
  assert.equal(root.dataset.authState, "forbidden");
});

test("administrador monta o painel uma única vez", async () => {
  const auth = createAdminAuth({ client: adminClient, root, onAuthorized });
  await auth.ready;
  assert.equal(root.dataset.authState, "authorized");
  assert.equal(onAuthorized.mock.calls.length, 1);
});
```

- [ ] **Step 2: confirmar a falha**

Run: `node --test tests/potala/admin-auth.test.mjs tests/potala/admin-local.test.mjs`

Expected: FAIL porque ainda há a entrada demonstrativa sem senha.

- [ ] **Step 3: substituir a entrada local por login real**

O HTML terá e-mail, senha, feedback `aria-live`, botão Entrar e estado de carregamento. O painel só perde `hidden` após sessão válida e papel `owner` ou `admin`. Adicionar botão Sair. Não oferecer cadastro público, recuperação improvisada ou armazenamento próprio de senha.

- [ ] **Step 4: integrar o controlador sem duplicar montagem**

Remover o listener demonstrativo `admin-open`. Montar `createAdminController` somente dentro de `onAuthorized`, com o repositório Supabase recebido por injeção. Capturar erros de `list`, `replaceAll` e `reset`; o status deve dizer que nada foi salvo quando a escrita falhar.

- [ ] **Step 5: executar os testes**

Run: `node --test tests/potala/admin-auth.test.mjs tests/potala/admin-local.test.mjs tests/potala/admin-live-preview.test.mjs`

Expected: PASS; a prévia continua atualizando sem persistir rascunhos.

---

### Task 5: ligar Home e painel ao Supabase sem regressão visual

**Files:**
- Modify: `outputs/transcendido.html`
- Modify: `outputs/admin.html`
- Modify: `outputs/secoes.js`
- Modify: `outputs/js/home/home-controller.js`
- Create: `tests/potala/home-supabase-wiring.test.mjs`
- Modify: `tests/potala/home-trajeto-html.test.mjs`

**Interfaces:**
- Consumes: cliente público, repositório remoto e fonte com fallback das Tasks 2–3.
- Produces: Home pública remota e painel autenticado sobre a mesma tabela.

- [ ] **Step 1: escrever o teste de ligação que falha**

```js
test("Home carrega SDK antes do entrypoint e usa fonte Supabase", async () => {
  const html = await readFile(homeUrl, "utf8");
  assert.match(html, /vendor\/supabase\.min\.js/);
  assert.match(await readFile(entryUrl, "utf8"), /createSupabaseContentRepository/);
  assert.match(await readFile(entryUrl, "utf8"), /createHomeContentSource/);
});
```

- [ ] **Step 2: confirmar a falha**

Run: `node --test tests/potala/home-supabase-wiring.test.mjs`

Expected: FAIL porque a Home ainda cria apenas o repositório local.

- [ ] **Step 3: ligar a Home pública**

Carregar o bundle Supabase antes do módulo de entrada. No `secoes.js`, criar cliente, remoto e fallback, então chamar:

```js
mountHomeJourney({
  repository: createHomeContentSource({
    remote: createSupabaseContentRepository({ client, defaults: DEFAULT_HOME_BLOCKS }),
    fallback: createLocalContentRepository({ defaults: DEFAULT_HOME_BLOCKS, storage: null }),
    onRemoteError: (error) => console.warn("Conteúdo remoto indisponível; usando snapshot.", error),
  }),
});
```

O modo `?admin-preview=1` continua priorizando o snapshot da sessão recebido pelo painel.

- [ ] **Step 4: ligar o painel**

Carregar o mesmo SDK e configurar `createAdminAuth`. Após autorização, criar `createSupabaseContentRepository` e montar o controlador. A URL e a publishable key são compartilhadas pelo módulo de configuração; não duplicar constantes no HTML.

- [ ] **Step 5: executar regressões funcionais**

Run: `node --test tests/potala/home-supabase-wiring.test.mjs tests/potala/home-trajeto-html.test.mjs tests/potala/home-scenes.test.mjs tests/potala/admin-live-preview.test.mjs`

Expected: PASS, sem alteração na escala da prévia, nos lados ou na expansão dos blocos.

---

### Task 6: aplicar, provisionar e provar a migração remota

**Files:**
- Modify: `README.md`
- Test: projeto Supabase remoto `gotrumwuimpoeggwamut`

**Interfaces:**
- Consumes: migração SQL testada e um usuário Auth criado manualmente.
- Produces: banco remoto com conteúdo inicial, proprietário autorizado e portal conectado.

- [ ] **Step 1: aplicar a migração no SQL Editor ou via Supabase CLI**

Aplicar exatamente `supabase/migrations/202609020001_portal_home_content.sql`. Reaplicar uma segunda vez para provar idempotência: deve manter edições existentes e não duplicar registros.

- [ ] **Step 2: criar o proprietário inicial**

Criar o usuário em Authentication → Users com e-mail definido pelo proprietário e senha temporária. Depois executar, substituindo somente o e-mail:

```sql
insert into public.admin_users (user_id, role)
select id, 'owner'
from auth.users
where lower(email) = lower('EMAIL_DO_PROPRIETARIO')
on conflict (user_id) do update set role = excluded.role, updated_at = now();
```

- [ ] **Step 3: provar permissões reais**

1. Abrir a Home sem sessão: blocos publicados aparecem e ocultos não.
2. Tentar `insert` com a publishable key sem sessão: resposta deve ser negada.
3. Entrar como usuário autenticado não listado: painel deve mostrar acesso negado.
4. Entrar como owner: criar, editar, reordenar, ocultar e excluir um bloco de teste.
5. Recarregar a Home em outra aba: alterações publicadas devem aparecer.
6. Desligar a rede: Home deve montar o snapshot empacotado; painel deve informar falha e não simular salvamento.

- [ ] **Step 4: documentar operação e rollback**

Registrar no README:

- onde criar usuários Auth;
- como promover um usuário existente a `owner` ou `admin`;
- como revogar acesso removendo-o de `admin_users`;
- que a publishable key é pública e depende de RLS;
- que `service_role` nunca entra no frontend;
- rollback do frontend: voltar a injetar `createLocalContentRepository`;
- rollback dos dados: exportar `home_blocks` antes de qualquer `drop`; nenhum `drop` faz parte desta entrega.

- [ ] **Step 5: executar a suíte completa**

Run: `npm run test:portal && npm run lint && npm run validate:portal && git diff --check`

Expected: todos os testes passam, lint e validação sem erros, sem credencial privada no diff.
