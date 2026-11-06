# PROD-03 — Escritores e editores do Blog pela conta owner

Migration `202611060005_blog_editorial_permissions.sql`: **preparada, não aplicada**.

## Modelo

| Nível | Como é gravado | O que pode no Blog |
|---|---|---|
| Sem permissão | sem linha ativa em `users`/`portal_module_permissions` | só lê artigos públicos |
| Escritor | `blog_editor` + `read+edit`, sem `publish` | cria e edita **textos próprios**; envia para revisão; não publica, agenda, despublica, arquiva nem destaca; troca/apaga só a mídia que enviou |
| Editor | `read+edit+publish` | edita e revisa textos de qualquer autor; publica e despublica; gere categorias e mídia |
| Owner | `users.role = 'owner'` | tudo; único que concede/revoga e vê o histórico |

O papel global `blog_editor` já existia e **não dá acesso administrativo**: Pessoas, Agendamentos, Salas e Financeiro exigem `is_portal_admin()` (owner/admin), que escritor e editor nunca recebem. O rótulo Escritor/Editor é derivado das permissões efetivas.

## O que a migration faz
1. `blog_posts.created_by` (autoria real, sem permissão de leitura pública nem de escrita). Textos antigos ficam sem autor: só editor/owner os alteram.
2. `admin_set_blog_access(uuid, text)` (`none`/`writer`/`editor`): apenas owner ativo; recusa owner/admin, a si mesma e níveis inválidos; idempotente; auditada em `admin_access_events` (`blog_access_changed`: ator, alvo, antes e depois) só quando algo muda.
3. `admin_list_blog_events(integer)`: histórico, só para o owner.
4. `mesa_salvar_post`: sem permissão de publicar, só altera texto próprio; bloqueia publicar, agendar, despublicar, arquivar, destacar e a corrida de criação do mesmo id. A autoria vem de `auth.uid()`; nenhum parâmetro a define.
5. `mesa_listar_posts`: escritor vê os próprios textos e os públicos, sem alterações pendentes de outros.
6. Políticas: versões do texto só para quem publica ou para o autor; categorias só para quem publica; **trocar/apagar mídia só para quem publica ou para quem enviou o arquivo** (`owner_id`).

Texto já publicado: o escritor só consegue gravar a *pendência* (`pending_document`), nunca o conteúdo público; o público só muda quando um editor publica. Revogação vale na próxima chamada, mesmo com a sessão aberta.

## Testes
- `npm run test:portal`: 1512 testes, com `blog-permissoes.test.mjs`.
- Comportamento real no banco, sempre dentro de transação com `rollback`:
  - `supabase/tests/prod-03-blog-permissions.sql`: concessão/revogação, idempotência, auditoria, escritor/editor/sem permissão, texto publicado, autoria, mídia, chamadas diretas à API, conta administrativa única, textos e permissões existentes preservados.
  - `supabase/tests/prod-03-rollback.sql`: o rollback preserva autoria, auditoria e concessões.
- Runner: `begin; set local lock_timeout='3s'; <corpo da migration sem begin/commit>; <arquivo de teste>; rollback;` (o do rollback troca o marcador `-- @@ROLLBACK@@` pelo script de rollback sem begin/commit).

## Aplicação (somente com autorização)
1. **Preflight** (só leitura): HEAD da PR e CI verdes; arquivo de aplicação igual à migration commitada; versão `202611060005` ausente do histórico; 22 textos e permissões atuais; ações já gravadas em `admin_access_events` compatíveis com a constraint nova; sem dependências novas.
2. **Transação única**: `begin; <migration>; insert into supabase_migrations.schema_migrations(version,name,statements) values ('202611060005','blog_editorial_permissions', array[...]); commit;` via `supabase db query --remote=gotrumwuimpoeggwamut --yes -f`. Sem `db push` e sem reparar versões antigas.
3. **Validação**: versão registrada uma vez; `created_by` existe; 22 textos idênticos; 0 permissões; 1 conta administrativa; funções novas sem acesso para `anon`; login owner e listagem de Usuários e acessos funcionando.

## Rollback (incremental, não destrói dados novos)
`supabase/rollbacks/202611060005_rollback_comportamento.sql` devolve `mesa_listar_posts`, `mesa_salvar_post` e as políticas de versões, categorias e mídia ao texto exato de `202610280001`. **Mantém** `created_by`, as linhas de auditoria, a constraint que as aceita, as concessões e as funções do owner. Para também retirar concessões, revogue antes pelo painel. Remover `created_by` ou eventos só deve ser feito em limpeza posterior e deliberada, nunca como rollback.

## Limites e riscos
- Autoria só vale para textos novos; os 22 existentes ficam sem autor.
- O nome de autor exibido no texto (`document.author`) é texto livre; a autoria real é `created_by`.
- Mídia: a biblioteca é compartilhada para leitura. Arquivos enviados antes desta migration não têm dono do escritor: só editor/owner os trocam. Se o escritor tentar apagar mídia alheia, o armazenamento não remove e a tela pode não avisar.
- Convite e recuperação de senha de novos escritores dependem do SMTP: por ora a concessão vale para contas que já existem.
- Excluir texto continua exclusivo de owner/admin (política existente).
