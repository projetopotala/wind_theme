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
- `/admin` — central operacional e editor da jornada. A senha fica no Auth; o cadastro que libera o painel é `public.users` (`owner` ou `admin`, `active`).
- `/blog` — mesa do blogueiro. A entrada é o login; o acesso de teste fica no próprio formulário.

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
2. Aplique todos os arquivos de `supabase/migrations/` pela ordem numérica do nome no SQL Editor do projeto `gotrumwuimpoeggwamut`.
3. Em **Authentication → Users**, crie o primeiro usuário com e-mail e senha. O Supabase Auth é a única fonte de credenciais.
4. No SQL Editor, autorize o mesmo `id` no cadastro administrativo:

```sql
insert into public.users (id, email, name, role, active)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', ''), 'owner', true
from auth.users
where email = 'projetopotala@gmail.com'
on conflict (id) do update
set role = excluded.role, active = true, updated_at = now();
```

Trocas e recuperações de senha são feitas por **Authentication → Users** ou pelo fluxo de recuperação do Supabase Auth. `public.users` guarda somente papel e situação de acesso ao painel.

O navegador recebe apenas a chave `sb_publishable_...`, que é pública por definição. A proteção real está nos grants e nas políticas RLS da migração. Nunca coloque `service_role`, `sb_secret_...`, senha do banco ou access token em `outputs/`, no Git ou em uma variável exposta ao cliente.

### Administradores

- Para autorizar um usuário que já existe no Auth, insira a linha correspondente em `public.users` com o papel `admin` ou `owner`.
- Para trocar o papel, atualize somente `public.users.role`.
- Para revogar o painel sem apagar a conta Auth, marque `public.users.active = false`.
- Cadastro público não faz parte do painel. Novos usuários são criados pelo Dashboard do Supabase nesta entrega.

### Rollback e recuperação

- O repositório anterior de `localStorage` permanece em `outputs/js/home/content-repository.js` e pode voltar a ser injetado sem mudar os componentes visuais.
- Antes de qualquer remoção futura de tabela, exporte `home_blocks`. Esta migração não contém `drop table`, `truncate` nem outra contração destrutiva.
- Falha de escrita no painel é exibida como erro e não altera a lista em memória nem anuncia publicação.

## Banco do Portal (Supabase, projeto "Painel")

Tudo o que o site grava vai para o projeto `gotrumwuimpoeggwamut`. O navegador usa só a chave publicável; quem pode ler e escrever é decidido pelos grants e políticas RLS das migrações em `supabase/migrations/`, aplicadas em ordem. Em 17/09/2026 todas estavam aplicadas.

| O que | Onde grava | Quem lê |
|---|---|---|
| Jornada da Home, rascunhos | `home_blocks`, `home_block_drafts` | público lê o publicado; rascunho só administração |
| Operação: salas, agenda, pessoas, cursos e turmas, inventário, movimentações, manutenção, financeiro | `op_records` via `op_snapshot()` e `op_apply()` | só owner/admin ativo |
| Textos e configuração do Blog | `blog_posts` via `save_blog_post()`, `blog_settings` | público lê o publicado |
| Leituras dos artigos | `blog_post_views` via `register_blog_view()` | só administração |
| Comentários do Caderno e dos artigos | `blog_comments` (nasce pendente) | público lê os aprovados; a mesa do Blog modera |
| Inscrição nas inspirações | `newsletter_subscriptions` via `subscribe_newsletter()` | só administração |
| "Monte seu curso", "Tenho interesse", retorno da Recepção | `site_interests` | só administração (Relatórios → Recebido pelo site) |
| Meu Potala | `profiles`, `saved_items`, `history_items`… | cada pessoa, só o que é dela |

### Operação do Instituto

A central operacional abre depois do login do `/admin`. As regras de domínio (`outputs/js/admin/operations/schedule.js` e `resources.js`) rodam no navegador contra uma revisão do estado; `op_apply` grava o resultado numa transação e recusa se outra janela gravou antes (HTTP 409), se o identificador do pedido já foi usado para outro comando ou se um código de sala ou patrimônio se repete. Cada gravação registra o autor da sessão e o antes/depois.

Na primeira entrada, use **Preparar as 10 salas** e revise cada cadastro antes de liberar reservas. Para copiar os dados, use **Configurações → Exportar cópia dos dados**.

### Cuidado ao criar funções no banco

No Supabase, função nova em `public` recebe EXECUTE para `anon` e `authenticated` por privilégio padrão. `revoke all ... from public` NÃO tira esse grant: revogue de `anon` explicitamente. Uma função antiga de senha ficou chamável por qualquer visitante até `202609170004`; `202609180001` remove definitivamente essa credencial paralela.

### Blog

`npm run db:seed-blog` regenera a migração com o acervo empacotado de `outputs/js/blog/blog-data.js`. O "acesso de teste" da mesa continua no `localStorage` e nunca escreve no banco.

## Composição editorial e Rodapé Vivo

A Home respeita a ordem publicada no painel, intercalando notícias e seções conforme a escolha do editor. O marcador de novidade não muda a posição. Blocos removidos ou ocultos não são reinseridos pelo código quando o banco responde; o conteúdo empacotado só é usado na recuperação de falhas de leitura.

Na aba Aparência do editor, os formatos Editorial, Imagem em destaque, Retrato e Reflexão compartilham a mesma navegação. Os caminhos relacionados podem ser selecionados pelo nome; no modo automático, temas em comum completam as sugestões. No modo manual, uma seleção vazia suprime os relacionados.

Antes de usar a escrita editorial, aplique `supabase/migrations/202609100001_home_editorial_composition.sql` depois das migrações anteriores. Ela adiciona `editorial_variant`, `related_mode` e `related_content` às tabelas de conteúdo e rascunhos, cria `replace_home_blocks_editorial` e atualiza a publicação de rascunhos. Preserva as políticas de acesso e o conteúdo existente. A nova RPC impede que um banco antigo descarte silenciosamente os campos. Aplicada no projeto em 17/09/2026.

O Rodapé Vivo oferece retorno às seções, contato por e-mail e WhatsApp, poemas/reflexões/perguntas para baixar como texto e a plantinha. O progresso da planta fica apenas no `localStorage` deste navegador (`potala.plantinha.v1`), com um cuidado por dia local; não é enviado ao Instituto e pode desaparecer ao limpar os dados do navegador. Sem armazenamento, a experiência continua durante a visita. Os links sobre Mural de Luz e novidades abrem uma conversa com a Recepção, sem registrar nomes ou inscrições automaticamente.

Validação específica: `node --test tests/potala/editorial-composition.test.mjs`.

## Sobra: starter vinext

`app/`, `worker/`, `db/`, `examples/` e `public/` são o starter [vinext](https://github.com/cloudflare/vinext) que originou o repositório. Não é o portal. `npm run dev` e `npm run build` falam com esse app, não com `outputs/`.
