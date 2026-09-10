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
- `/admin` — editor da jornada. A senha fica no Auth; o cadastro que libera o painel é `public.users` (`owner` ou `admin`, `active`).
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
2. Aplique `supabase/migrations/202609020001_portal_home_content.sql` e depois `supabase/migrations/202609080004_portal_users.sql` no SQL Editor do projeto `gotrumwuimpoeggwamut`.
3. Em Authentication → Users, crie o primeiro usuário com e-mail e senha.
4. Cadastre essa conta e grave a senha só como hash bcrypt, na tabela e no Auth:

```sql
select public.set_portal_user_password('projetopotala@gmail.com', '123456');
```

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

## Composição editorial e Rodapé Vivo

A Home respeita a ordem publicada no painel, intercalando notícias e seções conforme a escolha do editor. O marcador de novidade não muda a posição. Blocos removidos ou ocultos não são reinseridos pelo código quando o banco responde; o conteúdo empacotado só é usado na recuperação de falhas de leitura.

Na aba Aparência do editor, os formatos Editorial, Imagem em destaque, Retrato e Reflexão compartilham a mesma navegação. Os caminhos relacionados podem ser selecionados pelo nome; no modo automático, temas em comum completam as sugestões. No modo manual, uma seleção vazia suprime os relacionados.

Antes de usar a escrita editorial, aplique `supabase/migrations/202609100001_home_editorial_composition.sql` depois das migrações anteriores. Ela adiciona `editorial_variant`, `related_mode` e `related_content` às tabelas de conteúdo e rascunhos, cria `replace_home_blocks_editorial` e atualiza a publicação de rascunhos. Preserva as políticas de acesso e o conteúdo existente. A nova RPC impede que um banco antigo descarte silenciosamente os campos. Nesta entrega, a aplicação remota não foi possível: o conector recusou o acesso por permissão.

O Rodapé Vivo oferece retorno às seções, contato por e-mail e WhatsApp, poemas/reflexões/perguntas para baixar como texto e a plantinha. O progresso da planta fica apenas no `localStorage` deste navegador (`potala.plantinha.v1`), com um cuidado por dia local; não é enviado ao Instituto e pode desaparecer ao limpar os dados do navegador. Sem armazenamento, a experiência continua durante a visita. Os links sobre Mural de Luz e novidades abrem uma conversa com a Recepção, sem registrar nomes ou inscrições automaticamente.

Validação específica: `node --test tests/potala/editorial-composition.test.mjs`. A migração também precisa ser verificada no projeto Supabase quando o acesso estiver disponível.

## Sobra: starter vinext

`app/`, `worker/`, `db/`, `examples/` e `public/` são o starter [vinext](https://github.com/cloudflare/vinext) que originou o repositório. Não é o portal. `npm run dev` e `npm run build` falam com esse app, não com `outputs/`.
