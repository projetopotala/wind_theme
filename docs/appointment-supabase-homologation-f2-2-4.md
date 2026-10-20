# F2.2.4 — Homologação em Supabase isolado

**Preparado; não executado.** Os 12 arquivos do laboratório PostgreSQL nativo permanecem intactos. Não executar `run-appointment-homologation.ps1` nesta estratégia.

**Destino preparado:** Project ID público `pntjdelwdhicrdhanedr`, URL exata `https://pntjdelwdhicrdhanedr.supabase.co/`, nome informado `ArthurVice05's Project`, região informada `us-west-2`. Esses dados foram fornecidos pelo responsável; a existência, a organização, a região efetiva e a independência do ambiente ainda precisam ser conferidas no Dashboard antes de qualquer escrita. A guarda do executor aceita somente esse Project ID. Nenhuma chave está neste arquivo.

## Dependências e ordem mínima

Em um projeto Supabase **novo e vazio**, distinto de `gotrumwuimpoeggwamut` e do Marketplace:

1. Confirmar Project ID, organização, região e cobrança com o responsável antes de criar o projeto. Esta documentação não autoriza criação.
2. O Supabase deve fornecer `auth.users`, `auth.uid()`, papéis `anon` e `authenticated`, PostgREST e `gen_random_uuid()`.
3. Aplicar, nesta ordem, os arquivos originais `202609020001_portal_home_content.sql`, `202609020002_fix_replace_home_blocks_safe_update.sql`, `202609080004_portal_users.sql` e `202610160001_appointment_requests.sql`. A primeira cria `admin_users`, exigida pela terceira; a segunda corrige a função editorial criada pela primeira para o modo safe-update do PostgREST. A terceira instala a versão definitiva de `is_portal_admin()` e `public.users`. A quarta cria solicitações/RPC/RLS. As três primeiras também criam ou modificam objetos da Home; verificar previamente suas dependências e efeitos no projeto vazio. Não aplicar o conjunto inteiro das migrations por conveniência.
   - `202609020001` também insere dez blocos editoriais públicos da Home. Essa escrita adicional deve constar da aprovação. Não usa Storage nem extensão explícita; requer `auth.users` e `auth.uid()` fornecidos pelo Supabase.
   - `202609020002` substitui `replace_home_blocks(jsonb)`; é correção de compatibilidade/segurança do objeto que a base inevitavelmente instala, embora não seja dependência direta das solicitações.
   - `202609080004` lê `public.admin_users` e `auth.users`; em projeto novo, o `INSERT ... SELECT` inicial não cria administradores por si só. As demais migrations intermediárias não são dependências do contrato de solicitações.
   - `202610160001` requer os papéis `anon`/`authenticated`, `public.is_portal_admin()` e `gen_random_uuid()` do PostgreSQL 17/Supabase. Cria tabela, índices, RLS, grants, políticas, trigger e RPC pública com `SECURITY DEFINER` e `search_path` vazio.
4. Criar três usuários **fictícios** via Supabase Auth no projeto isolado: administrador ativo, usuário comum e administrador inativo. Registrar seus UUIDs somente no ambiente de homologação. Inserir em `public.users` apenas os dois administradores fictícios, com papel `admin`, um `active=true` e outro `active=false`. Não usar e-mail, identidade ou dados da produção. A atribuição administrativa requer operação autorizada separada no SQL Editor do projeto isolado, conferindo o Project ID antes da escrita; a RLS não permite promoção pelo navegador. Não inserir o usuário comum em `public.users`.
5. Conferir no banco isolado grants, owner e `SECURITY DEFINER` da RPC e políticas RLS antes de abrir acesso HTTP. A função pública retorna apenas `id` e `status=recebida`; ela não confirma reserva.

## Execução HTTP futura

O script [run-appointment-supabase-homologation.mjs](../scripts/run-appointment-supabase-homologation.mjs) faz requisições **somente** com `--execute`. Ele exige `POTALA_HOMOLOG_PROJECT_REF`, URL exata `https://<ref>.supabase.co/`, confirmação igual ao ref, chave publicável e três JWTs de contas fictícias. Recusa o Project ID de produção e tokens com `iss`/papel/expiração incompatíveis. Antes da primeira escrita, consulta `GET /auth/v1/user` para verificar os três JWTs com o Supabase Auth real e consulta a linha própria em `public.users` para conferir o papel efetivo. Tokens apenas montados localmente não passam nessa verificação. Não usa `service_role` nem segredo no navegador. Credenciais e JWTs devem ser inseridos apenas em processo local supervisionado, sem salvá-los no Git ou em histórico de comandos; limpar o ambiente do processo ao terminar.

Obter os JWTs por login normal das três contas fictícias **no novo projeto**, sem copiar JWTs de produção. Antes de aplicar cada SQL no Dashboard, conferir organização, Project ID `pntjdelwdhicrdhanedr`, região e ambiente; abrir o arquivo local correspondente, revisar seu conteúdo integral e executar somente naquele projeto. Se a URL exibida no Dashboard não for exatamente `https://pntjdelwdhicrdhanedr.supabase.co`, interromper. Não usar `supabase link` ou `db push` nesta etapa. A aplicação das quatro migrations e a inserção das duas linhas administrativas são **escritas futuras separadas** do comando HTTP abaixo.

Com as variáveis temporárias já fornecidas de modo seguro, o comando único futuro é:

```powershell
node scripts/run-appointment-supabase-homologation.mjs --execute
```

Esse comando **grava solicitações fictícias** no projeto isolado. Não executá-lo até a criação, conferência do destino e autorização explícita. Uma execução deixa registros de teste; não há limpeza automática. Falhas interrompem a sequência. Os resultados devem ser registrados sem JWTs, contatos ou corpos privados.

O roteiro automatizado cobre RPC pública, recibo mínimo, persistência observada pelo administrador, idempotência, payload inválido, conflito de chave, leitura/escrita pública bloqueadas, usuário comum/inativo, atualização administrativa, `updated_at`, conflito por versão antiga, concorrência simultânea da mesma chave, limite por contato, os quatro estados e lista ordenada. Os 12 arquivos SQL locais continuam disponíveis para revisão estrutural. Antes da aprovação final ainda serão necessários testes adicionais de limite global sob concorrência, sessão expirada, respostas 401/403 e interface real em uma cópia **isolada** do frontend. Esses casos não devem ser declarados aprovados pelo roteiro atual.

## Frontend e limites

`APPOINTMENT_REQUESTS_ENABLED` e `APPOINTMENT_ADMIN_ENABLED` permanecem `false` no código. Para testar o navegador, criar posteriormente uma cópia de trabalho isolada, trocar **somente nessa cópia** URL/chave publicável e ativar as flags. Conferir que nenhum link ou configuração da cópia aponte para produção. Não usar chave secreta no navegador. Homologar formulário → PostgREST → RLS → painel → alteração de estado com contas fictícias. Nenhuma alteração da produção é parte desta etapa.
