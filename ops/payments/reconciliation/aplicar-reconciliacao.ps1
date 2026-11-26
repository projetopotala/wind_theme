# PREPARADO, NAO EXECUTADO. Executar somente pelo Owner, com autorização.
$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$envf = 'C:\PotalaBackups\pay03\segredos\pay03-travado.env'
$sql = Join-Path $PSScriptRoot '01-criar-segredo-e-job.sql'

if (-not (Test-Path -LiteralPath $psql)) { throw 'psql 17 nao encontrado.' }
if (-not (Test-Path -LiteralPath $envf)) { throw 'Arquivo local de segredos nao encontrado.' }
$linha = Select-String -LiteralPath $envf -Pattern '^PAYMENTS_RECONCILE_TOKEN=' | Select-Object -First 1
if (-not $linha) { throw 'PAYMENTS_RECONCILE_TOKEN nao encontrado no arquivo local de segredos.' }
$env:PAY_RECONCILE_TOKEN = ($linha.Line -split '=', 2)[1].Trim()
if ($env:PAY_RECONCILE_TOKEN.Length -lt 32 -or $env:PAY_RECONCILE_TOKEN -match '\s') {
  throw 'Token do reconciliador ausente, curto ou com espaco: nada foi feito.'
}

$senha = Read-Host 'Senha do banco' -AsSecureString
$env:PGSSLMODE = 'require'
$env:PGPASSWORD = [Net.NetworkCredential]::new('', $senha).Password
try {
  & $psql -h aws-0-us-east-2.pooler.supabase.com -p 5432 `
    -U postgres.gotrumwuimpoeggwamut -d postgres -X -q -v ON_ERROR_STOP=1 -f $sql
  if ($LASTEXITCODE -ne 0) { throw "psql terminou com codigo $LASTEXITCODE." }
} finally {
  Remove-Item Env:PAY_RECONCILE_TOKEN, Env:PGPASSWORD, Env:PGSSLMODE -ErrorAction SilentlyContinue
}
