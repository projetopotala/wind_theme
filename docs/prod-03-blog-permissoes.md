# PROD-03 — Escritores e editores do Blog pela conta owner

Migration `202611060005_blog_editorial_permissions.sql`: **preparada, não aplicada**.

## Modelo

| Nível | Como é gravado | O que pode no Blog |
|---|---|---|
| Sem permissão | sem linha ativa em `users`/`portal_module_permissions` | só lê artigos públicos |
| Escritor | `blog_editor` + permissões `read+edit`, sem `publish` | cria e edita **textos próprios**; envia para revisão; não publica, agenda, despublica, arquiva nem destaca |
| Editor | `read+edit+publish` | edita e revisa textos de qualquer autor; publica e despublica; gere categorias |
| Owner | `users.role = 'owner'` | tudo; único que concede/revoga e vê o histórico |

O papel global `blog_editor` já existia e **não dá acesso administrativo**: Pessoas, Agendamentos, Salas e Financeiro exigem `is_portal_admin()` (owner/admin), que o escritor e o editor nunca recebem. O rótulo Escritor/Editor é derivado das permissões efetivas.

## O que a migration faz
1. `blog_posts.created_by` (autoria real). Textos antigos ficam sem autor: só editor/owner os alteram.
2. `admin_set_blog_access(uuid, text)` (`none`/`writer`/`editor`): apenas owner ativo; recusa owner/admin, a si mesma e níveis inválidos; idempotente; auditada em `admin_access_events` (ação `blog_access_changed`, ator, alvo, antes e depois) só quando algo muda.
3. `admin_list_blog_events(integer)`: histórico, só para o owner.
4. `mesa_salvar_post`: sem permissão de publicar, só altera texto próprio; bloqueia publicar, agendar, despublicar, arquivar, destacar e a corrida de criação do mesmo id.
5. `mesa_listar_posts`: escritor vê os próprios textos e os públicos, sem alterações pendentes de outros.
6. Políticas: versões do texto só para quem publica ou para o próprio autor; categorias só para quem publica.

Revogação vale na próxima chamada: todas as checagens leem o banco a cada operação, mesmo com a sessão já aberta. A tela aberta só some ao recarregar, mas o banco recusa.

## Fluxos
- **Owner**: Central → Usuários e acessos → escolhe o nível na linha da conta → Alterar → confirma o efeito → lista e histórico atualizam sem recarregar.
- **Escritor**: entra em `/blog-admin`, cria rascunhos, edita os seus, envia para revisão.
- **Editor**: revisa e publica o que o escritor enviou.

## Testes
- Suíte do portal (`npm run test:portal`): 1509 testes, inclusive `blog-permissoes.test.mjs`.
- Comportamento real no banco: `supabase/tests/prod-03-blog-permissions.sql` (owner concede/revoga, idempotência, auditoria, escritor/editor/sem permissão, chamadas diretas à API, revogação imediata, conta administrativa única). Para rodar: montar `begin; <corpo da migration sem begin/commit>; <este arquivo>; rollback;` e executar. Foi rodado uma vez no banco oficial nessa forma, com rollback: resultado `PASSOU`, sem resíduo (verificado depois).

## Rollback
Antes de qualquer uso: reaplicar `mesa_salvar_post`, `mesa_listar_posts` e `mesa_post_json` de `202610280001`, recriar as políticas de versões e categorias dessa migration, derrubar `admin_set_blog_access`, `admin_list_blog_events` e `blog_access_level`, restaurar a constraint de ações de `admin_access_events` sem `blog_access_changed` e, se quiser, remover `created_by`. Concessões feitas continuam como linhas em `users`/`portal_module_permissions` (revogue antes pelo próprio painel).

## Limites e riscos
- Autoria só vale para textos novos; os 22 existentes ficam sem autor (só editor/owner alteram).
- O nome de autor exibido no texto (`document.author`) é texto livre do documento; a autoria real é `created_by`.
- A biblioteca de mídia do Blog é compartilhada: quem edita vê e envia imagens.
- Categorias: só editor/owner criam ou alteram; o escritor apenas escolhe.
- Convite e recuperação de senha de novos escritores dependem do SMTP: por ora a concessão vale para contas que já existem.
- Excluir texto continua exclusivo de owner/admin (política existente).
