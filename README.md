# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Portal Potala: conteúdo editorial no Supabase

O portal estático publicado pelo Vercel vive em `outputs/`. A Home lê os blocos
de `public.home_blocks`; se a leitura remota falhar, usa os blocos empacotados
em `outputs/js/home/journey-data.js` para não deixar a jornada vazia. Escritas
nunca usam fallback local.

### Preparar o projeto

1. Execute `npm install` e `npm run vendor:supabase`.
2. Aplique `supabase/migrations/202609020001_portal_home_content.sql` no SQL
   Editor do projeto `gotrumwuimpoeggwamut`.
3. Em Authentication → Users, crie o primeiro usuário com e-mail e senha.
4. Copie o UUID do usuário e execute no SQL Editor:

```sql
insert into public.admin_users (user_id, role)
values ('UUID_COPIADO_DO_AUTH', 'owner')
on conflict (user_id) do update
set role = excluded.role, updated_at = now();
```

O navegador recebe apenas a chave `sb_publishable_...`, que é pública por
definição. A proteção real está nos grants e nas políticas RLS da migração.
Nunca coloque `service_role`, `sb_secret_...`, senha do banco ou access token em
`outputs/`, no Git ou em uma variável exposta ao cliente.

### Administradores

- Para autorizar um usuário existente, insira seu UUID em `admin_users` com o
  papel `admin` ou `owner`.
- Para trocar o papel, atualize somente `admin_users.role`.
- Para revogar o painel sem apagar a conta Auth, remova a linha correspondente
  de `admin_users`.
- Cadastro público não faz parte do painel. Novos usuários são criados pelo
  Dashboard do Supabase nesta entrega.

### Rollback e recuperação

- O repositório anterior de `localStorage` permanece em
  `outputs/js/home/content-repository.js` e pode voltar a ser injetado sem mudar
  os componentes visuais.
- Antes de qualquer remoção futura de tabela, exporte `home_blocks`. Esta
  migração não contém `drop table`, `truncate` nem outra contração destrutiva.
- Falha de escrita no painel é exibida como erro e não altera a lista em memória
  nem anuncia publicação.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
