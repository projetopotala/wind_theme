# PR C — Asaas Sandbox: ativação e recuperação

Esta entrega usa o Checkout hospedado do Asaas. O Portal não recebe dados de cartão e o retorno do navegador nunca confirma pagamento.

## Configuração externa (Sandbox)

O Instituto deve fornecer/configurar diretamente no Asaas Sandbox:

- conta Sandbox institucional verificada para testes;
- chave de API Sandbox dedicada ao Portal;
- webhook sequencial para `CHECKOUT_CREATED`, `CHECKOUT_PAID`, `CHECKOUT_CANCELED` e `CHECKOUT_EXPIRED`;
- no mesmo endpoint, eventos de cobrança necessários a estorno/chargeback (`PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`);
- token próprio do webhook, aleatório, com 32–255 caracteres e sem espaços;
- dados comerciais/fiscais e chave Pix exigidos pelo próprio Asaas para o ambiente escolhido.

Secrets no Supabase Sandbox/LAB (valores nunca versionados):

- `ASAAS_API_URL=https://api-sandbox.asaas.com/v3`
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN`
- `PAYMENT_ALLOWED_ORIGINS` (origens exatas, sem wildcard)
- `COURSE_PAYMENT_RETURN_URL` (HTTPS, pertencente a uma origem permitida)

## Ordem de homologação

1. Backup lógico e linha de base descritos abaixo.
2. Aplicar somente `20261116101729_cursos_pagamentos_asaas_sandbox.sql` no ambiente isolado.
3. Pós-teste: tabelas, RLS, grants, funções, índices e contagens anteriores.
4. Cadastrar secrets Sandbox no Supabase do ambiente isolado.
5. Publicar individualmente `create-course-payment-checkout` (`verify_jwt=true`) e `asaas-course-webhook` (`verify_jwt=false`, token obrigatório no handler).
6. Cadastrar o webhook no Asaas apontando para a função publicada.
7. Exercitar Pix e cartão com dados de teste do Sandbox; confirmar que só `CHECKOUT_PAID` matricula.
8. Testar repetição, atraso, valor divergente, cancelamento, expiração, estorno e recuperação.

## Backup recuperável sem Docker

Executar com PostgreSQL client compatível instalado no Windows e uma connection string temporária inserida apenas na sessão privada do PowerShell. O destino deve ficar fora do Git e com ACL restrita.

```powershell
$backupDir = Join-Path $env:LOCALAPPDATA "PotalaPrivateBackups\asaas-preflight-AAAA-MM-DD"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
icacls $backupDir /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" | Out-Null
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" --format=custom --no-owner --no-acl --file (Join-Path $backupDir "potala-pre-asaas.dump") $env:POTALA_DATABASE_URL
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --list (Join-Path $backupDir "potala-pre-asaas.dump") | Out-Null
Get-FileHash (Join-Path $backupDir "potala-pre-asaas.dump") -Algorithm SHA256
Remove-Item Env:POTALA_DATABASE_URL
```

Antes de qualquer escrita, salvar também contagens e hashes agregados (sem dados pessoais) de `course_enrollment_requests`, `course_enrollment_request_events`, `op_records` nas coleções `enrollments`/`profiles`/`audit_events`, `appointment_profile_accounts` e histórico de migrations. A restauração deve ser ensaiada em PostgreSQL temporário isolado com `pg_restore --exit-on-error`; nunca sobre Production.

## Rollback

O arquivo `supabase/rollbacks/20261116101729_rollback_cursos_pagamentos_asaas_sandbox.sql` nunca apaga histórico financeiro. Sem Checkout/evento ele remove os objetos da PR C. Com qualquer histórico, apenas revoga as APIs e preserva tabelas/eventos para auditoria e correção posterior. Antes do rollback operacional, despublicar as duas Edge Functions e desabilitar o webhook no Asaas para impedir novas entregas.

## Condições para pagamentos reais

- nova autorização específica para Production;
- contrato/conta Asaas institucional e política de estorno aprovados;
- chaves de Production separadas das de Sandbox;
- domínio, callback e webhook de Production aprovados;
- observabilidade e procedimento de reprocessamento de eventos em `failed`/`manual_review`;
- backup restaurado em ensaio e rollback aprovado;
- E2E autenticado com Owner e aluno, sem dados financeiros reais durante a homologação;
- migration, Edge Functions e frontend publicados na mesma janela controlada.
