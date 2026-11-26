# PREPARADO, NAO EXECUTADO. Executar somente pelo Owner, com autorização.
param(
  [string]$TokenFile = (Join-Path $env:LOCALAPPDATA 'InstitutoPotala\Secrets\payments-reconcile-token.dpapi')
)

$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$sql = Join-Path $PSScriptRoot '01-criar-segredo-e-job.sql'
$tokenPtr = [IntPtr]::Zero

if (-not (Test-Path -LiteralPath $psql)) { throw 'psql 17 nao encontrado.' }
if (-not (Test-Path -LiteralPath $TokenFile)) { throw 'Arquivo DPAPI do token nao encontrado.' }

$senha = Read-Host 'Senha do banco' -AsSecureString
$env:PGSSLMODE = 'require'
$env:PGPASSWORD = [Net.NetworkCredential]::new('', $senha).Password
try {
  $tokenSeguro = Get-Content -Raw -LiteralPath $TokenFile | ConvertTo-SecureString
  $tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSeguro)
  $env:PAY_RECONCILE_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
  if ($env:PAY_RECONCILE_TOKEN.Length -lt 32 -or $env:PAY_RECONCILE_TOKEN -match '\s') {
    throw 'Token do reconciliador ausente, curto ou com espaco: nada foi feito.'
  }

  & $psql -h aws-0-us-east-2.pooler.supabase.com -p 5432 `
    -U postgres.gotrumwuimpoeggwamut -d postgres -X -q -v ON_ERROR_STOP=1 -f $sql
  if ($LASTEXITCODE -ne 0) { throw "psql terminou com codigo $LASTEXITCODE." }
} finally {
  if ($tokenPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr)
  }
  Remove-Item Env:PAY_RECONCILE_TOKEN, Env:PGPASSWORD, Env:PGSSLMODE -ErrorAction SilentlyContinue
  Remove-Variable tokenSeguro, senha -ErrorAction SilentlyContinue
}
