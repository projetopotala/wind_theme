# F2.2.4 — Homologação isolada preparada

**Estado:** arquivos preparados; nenhum banco criado, SQL executado ou flag ativada.

## Destino e comando futuro

Banco novo: `potala_appointments_f224`, no cluster PostgreSQL 17 aprovado em
`127.0.0.1:55432`, usuário `potala_lab_admin`, diretório de dados
`C:\Users\vicel\AppData\Local\PotalaPgLabs\pg17-homolog-20261013\data`.
O executor recusa banco preexistente. Preserva `potala_homolog`, H1/H2/H3 e backups.
Não executa DROP nem restaura outros bancos. Em falha, deixa o banco novo para
inspeção manual; nunca tenta apagar ou repetir automaticamente.

**Somente após aprovação explícita do destino e da execução**, no PowerShell 5.1:

```powershell
powershell.exe -NoProfile -File "C:\Users\vicel\wind_theme-main\scripts\run-appointment-homologation.ps1" -Execute -ExpectedDatabase potala_appointments_f224
```

O executor requer senha **exclusiva do laboratório** por prompt seguro, uma vez.
Ela fica temporariamente no ambiente do processo e é removida em `finally`;
não aparece em argumento, arquivo ou log. Não aceita variáveis PG* herdadas,
desativa pgpass e usa `psql -X -w -v ON_ERROR_STOP=1` com host, porta, usuário e
banco explícitos. Antes da criação confirma endereço, porta, usuário, versão 17,
diretório real de dados e ausência do banco. A guarda SQL repete a identidade
na mesma sessão das alterações. Hashes fixos recusam mudanças na migration ou
nos SQL de laboratório. A criação falha se outra execução criar o banco antes.
As conexões têm timeout de 5 s e as instruções SQL, de 30 s, com espera por
bloqueio limitada a 3 s. O teste concorrente usa um job local, encerrado e
removido também em caso de falha. A política normal do PowerShell é mantida;
caso bloqueie o script, interromper e revisar a política antes da execução.

## Sequência automática

1. Verificar identidade e papéis locais `anon`/`authenticated` já existentes,
   recusando papéis com SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE ou REPLICATION.
   Não criar papéis globais nem alterar sua associação no cluster.
2. Criar apenas `potala_appointments_f224` a partir de `template0`.
3. No banco novo: criar schema `auth` substituto, `auth.users`, `auth.uid()`,
   `public.users`, `is_portal_admin()` e grants locais necessários.
4. Aplicar a migration original `202610160001_appointment_requests.sql` intacta.
5. Inserir identidades e solicitações exclusivamente fictícias.
6. Executar assertivas transacionais de validação, grants, RLS, estados,
   `updated_at`, conflito e limites; testes de volume fazem `ROLLBACK`.
7. Coordenar duas sessões `psql` automaticamente com o administrador local.
   A primeira mantém aberta uma transação após a RPC; a segunda deve receber
   `PT429`. Após o commit, a repetição da mesma chave deve retornar recibo sem
   criar segunda linha. Os testes de negação verificam separadamente que
   `anon` e `authenticated` não podem executar a RPC.

O SQL já existente em `tests/sql/appointment-requests.sql` aponta para outra
porta/banco (`55433`/`potala_appointments_test`). Ele permanece intacto e não
é executado pelo novo driver. Os SQL F2.2.4 incluem guardas próprios de 55432.

## Alcance e pendências

PostgreSQL nativo pode comprovar compilação da migration, persistência,
constraints, bloqueio de EXECUTE para `anon`/`authenticated`, RLS sob papéis
locais e lógica da função, idempotência e concorrência pelo administrador local.
Os testes positivos da função não comprovam que o visitante pode chamá-la;
essa permissão permanece intencionalmente revogada.
`auth.uid()` usa uma claim de teste controlável na sessão SQL: isso **não prova**
assinatura de JWT nem Supabase Auth real.

Não foi encontrado `postgrest` no PATH local. A sequência preparada é de banco;
HTTP 401/403, serialização PostgREST, schema cache e os clientes no navegador
exigem PostgREST local isolado com JWT fictício, se posteriormente disponibilizado.
Auth/JWT efetivos do Supabase exigem projeto Supabase isolado ou stack local
equivalente, sem usar produção. O projeto hospedado dependeria de confirmação de
disponibilidade/custo antes de sua criação. As duas flags permanecem `false`.

Antes de liberar o recurso, repetir no ambiente de integração o caminho completo
formulário → RPC HTTP → banco → painel administrativo → atualização. Decidir também
proteção contra abuso, retenção dos contatos e revisão visual/teclado do painel.
