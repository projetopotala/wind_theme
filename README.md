# Instituto Potala

O site publicado é o portal estático em `outputs/`. O preview local serve essa pasta; `npm run dev` não sobe o Potala.

## Pré-requisitos

- Node.js `>=22.13.0`

## Preview local

```bash
npm install
npm run preview:portal
```

O log da Vercel, no projeto já ligado, fica em `npm run logs`. Precisa da conta dona do projeto Potala. A sessão atual do CLI é `newstoresorteios-3937`, no time NewStore's projects, e esse time não tem o portal.

Abre em http://127.0.0.1:4173/. A raiz cai na Chegada.

## Entradas

Os endereços das páginas não mudam. O que mudou foi só onde o casco vive.

- `transcender.html` — Chegada. O casco dela está em `css/respiracao.css` e `js/chegada/respiracao.js`.
- `transcendido.html` — Home, a travessia. O casco compartilhado das páginas está em `css/secoes.css` e `js/secoes.js`.
- `admin.html` — editor da jornada. Exige conta do Supabase em `admin_users` (`owner` ou `admin`).
- `blog-admin.html` — editor do blog, com a mesma autorização.

## Onde olhar

- `outputs/*.html` — páginas, com os endereços atuais
- `outputs/css/` e `outputs/js/` — estilo e scripts, por área (`home`, `chegada`, `admin`, …)
- `outputs/media/` — imagens, vídeo e o áudio de fundo
- `outputs/js/home/busca-indice.json` — índice de busca gerado; refazer com `node scripts/prepare-busca-indice.mjs`
- `assets-source/` — originais das mídias; o que o site serve já está em `outputs/media/`
- `scripts/` — preview, encode de mídia e vendors
- `supabase/migrations/` — conteúdo editorial e autorização do painel
- `docs/superpowers/` — planos e specs de implementação, não o mapa do que está no ar

## Conteúdo editorial no Supabase

A Home lê os blocos de `public.home_blocks`. Se a leitura remota falhar, usa os blocos empacotados em `outputs/js/home/journey-data.js` para não deixar a jornada vazia. Escritas nunca usam fallback local.

### Preparar o projeto

1. Execute `npm install` e `npm run vendor:supabase`.
2. Aplique `supabase/migrations/202609020001_portal_home_content.sql` no SQL Editor do projeto `gotrumwuimpoeggwamut`.
3. Em Authentication → Users, crie o primeiro usuário com e-mail e senha.
4. Copie o UUID do usuário e execute no SQL Editor:

```sql
insert into public.admin_users (user_id, role)
values ('UUID_COPIADO_DO_AUTH', 'owner')
on conflict (user_id) do update
set role = excluded.role, updated_at = now();
```

O navegador recebe apenas a chave `sb_publishable_...`, que é pública por definição. A proteção real está nos grants e nas políticas RLS da migração. Nunca coloque `service_role`, `sb_secret_...`, senha do banco ou access token em `outputs/`, no Git ou em uma variável exposta ao cliente.

### Administradores

- Para autorizar um usuário existente, insira seu UUID em `admin_users` com o papel `admin` ou `owner`.
- Para trocar o papel, atualize somente `admin_users.role`.
- Para revogar o painel sem apagar a conta Auth, remova a linha correspondente de `admin_users`.
- Cadastro público não faz parte do painel. Novos usuários são criados pelo Dashboard do Supabase nesta entrega.

### Rollback e recuperação

- O repositório anterior de `localStorage` permanece em `outputs/js/home/content-repository.js` e pode voltar a ser injetado sem mudar os componentes visuais.
- Antes de qualquer remoção futura de tabela, exporte `home_blocks`. Esta migração não contém `drop table`, `truncate` nem outra contração destrutiva.
- Falha de escrita no painel é exibida como erro e não altera a lista em memória nem anuncia publicação.

## Sobra: starter vinext

`app/`, `worker/`, `db/`, `examples/` e `public/` são o starter [vinext](https://github.com/cloudflare/vinext) que originou o repositório. Não é o portal. `npm run dev` e `npm run build` falam com esse app, não com `outputs/`.
