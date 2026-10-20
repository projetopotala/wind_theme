param(
  [switch]$Execute,
  [string]$ExpectedDatabase
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$database = 'potala_appointments_f224'
$hostName = '127.0.0.1'
$port = '55432'
$user = 'potala_lab_admin'
$approvedData = 'C:\Users\vicel\AppData\Local\PotalaPgLabs\pg17-homolog-20261013\data'
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$psql = Join-Path $bin 'psql.exe'
$createdb = Join-Path $bin 'createdb.exe'
$repo = Split-Path -Parent $PSScriptRoot
$sql = Join-Path $repo 'tests\sql'
$migration = Join-Path $repo 'supabase\migrations\202610160001_appointment_requests.sql'

if (-not $Execute -or $ExpectedDatabase -cne $database) {
  throw 'Execução desabilitada. É necessário -Execute -ExpectedDatabase potala_appointments_f224 após aprovação.'
}
if (@(Get-ChildItem Env: | Where-Object { $_.Name -match '^PG' }).Count -gt 0) {
  throw 'Variáveis PG* herdadas. Remova-as em uma nova sessão antes de prosseguir.'
}
foreach ($path in @($psql, $createdb, $approvedData, $migration)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Pré-requisito ausente: $path" }
}
$psqlVersion = & $psql --version
if ($LASTEXITCODE -ne 0 -or $psqlVersion -notmatch ' 17\.') { throw 'psql não é PostgreSQL 17.' }

# Hashes independentes dos arquivos SQL aprovados; não executar conteúdo alterado.
$approvedHashes = @{
  'appointment-f224-bootstrap.sql' = '1AF67141EFB9D1875DC118F463B5BFFDE8692E1BE62AC0CAEE5D19CCD3CDDD7E'
  'appointment-f224-concurrency-a.psql' = 'CBA8E29A175AE3936E1CEB449BACE5D65D62983CF81AB3CCC515025570DF30C5'
  'appointment-f224-concurrency-b.psql' = '17B8D021888E53DEA5B75A38304545A409141221240471B8818D246F8496E0F1'
  'appointment-f224-concurrency-final.psql' = 'F7548B6481125543DB20A3971C07E5A1C2E55A9387D6A8DAB0E3D180AF6B7D36'
  'appointment-f224-fixtures.sql' = '1FA8D5839433C06140484035025078D700002E3F3D02954EF4A561C277FC1843'
  'appointment-f224-guard.sql' = 'D9FC333D9F5AC5FE7B36177F567ADE3FD74947F5FE30BDDAFC873B3D9ADA53A0'
  'appointment-f224-phase.psql' = '2BD91F71BF3B34ED14F4A9E0CC018EE48925F0FA65F56486A6435C6C5C56C72D'
  'appointment-f224-verify.sql' = '571452149897ECEDD7DFA5720C0EE0C1264CB07CD261F8E0154B347914722C88'
  'appointment-f224-volume.sql' = 'C46DF4D1C66D3B4BD99D0DE115FA4C3200AB7F47C81999014CEA0312F54E825A'
}
foreach ($file in $approvedHashes.Keys) {
  $path = Join-Path $sql $file
  if (-not (Test-Path -LiteralPath $path)) { throw "Arquivo SQL ausente: $file" }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -cne $approvedHashes[$file]) {
    throw "Hash não aprovado: $file"
  }
}
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $migration).Hash -cne
    '2EA88EA245B368AC9516C25653767840B580B25D1045CEE7BEDDE528DB7659E6') {
  throw 'A migration difere da versão revisada.'
}

function Invoke-PsqlQuery([string]$db, [string]$query) {
  $output = & $psql -X -w -v ON_ERROR_STOP=1 -A -t -h $hostName -p $port -U $user -d $db -c $query 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Falha na consulta de verificação: $($output -join ' ')" }
  return ($output -join "`n").Trim()
}
function Invoke-PsqlFile([string]$db, [string]$path) {
  $output = & $psql -X -w -v ON_ERROR_STOP=1 -h $hostName -p $port -U $user -d $db -f $path 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Falha em $(Split-Path -Leaf $path): $($output -join ' ')" }
  Write-Host "Aprovado: $(Split-Path -Leaf $path)"
}
function Assert-Cluster([string]$db) {
  $query = "select json_build_object('host',inet_server_addr()::text,'port',inet_server_port(),'db',current_database(),'user',current_user,'version',current_setting('server_version_num'),'data',current_setting('data_directory'))::text"
  $identity = Invoke-PsqlQuery $db $query | ConvertFrom-Json
  $expectedPath = [IO.Path]::GetFullPath($approvedData).TrimEnd([char]92,[char]47).Replace([char]92,[char]47)
  $actualPath = [IO.Path]::GetFullPath(([string]$identity.data).Replace([char]47,[char]92)).TrimEnd([char]92,[char]47).Replace([char]92,[char]47)
  if ($identity.host -cne $hostName -or $identity.port -ne [int]$port -or
      $identity.db -cne $db -or $identity.user -cne $user -or
      [math]::Floor([int]$identity.version / 10000) -ne 17 -or
      $actualPath -ine $expectedPath) {
    throw 'Identidade do cluster diferente da aprovada.'
  }
}

$secret = Read-Host 'Senha exclusiva do administrador PostgreSQL local' -AsSecureString
$ptr = [IntPtr]::Zero
$job = $null
try {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $env:PGPASSFILE = Join-Path $env:TEMP ('potala-no-pgpass-' + [guid]::NewGuid().ToString('N'))
  $env:PGSSLMODE = 'disable'
  $env:PGCONNECT_TIMEOUT = '5'
  $env:PGOPTIONS = '-c statement_timeout=30s -c lock_timeout=3s'
  Assert-Cluster 'postgres'
  $exists = Invoke-PsqlQuery 'postgres' "select exists(select 1 from pg_database where datname='potala_appointments_f224')::int"
  if ($exists -ne '0') { throw 'Banco descartável já existe; nenhum banco será reutilizado.' }
  $roles = Invoke-PsqlQuery 'postgres' "select (select rolsuper from pg_roles where rolname=current_user)::int || ':' || (select count(*) from pg_roles where rolname in ('anon','authenticated'))::text"
  if ($roles -ne '1:2') { throw 'Administrador local ou papéis de teste não atendem aos pré-requisitos.' }
  $unsafeRoles = Invoke-PsqlQuery 'postgres' "select count(*) from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication)"
  if ($unsafeRoles -ne '0') { throw 'Papéis de teste possuem privilégios elevados; RLS não seria representativa.' }
  # createdb falha se outra execução criar o mesmo banco entre a consulta e a criação.
  Assert-Cluster 'postgres'
  $created = & $createdb --maintenance-db=postgres -h $hostName -p $port -U $user -T template0 -E UTF8 -O $user $database 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Criação recusada: $($created -join ' ')" }
  Write-Host "Banco descartável criado: $database"
  Assert-Cluster $database
  Invoke-PsqlFile $database (Join-Path $sql 'appointment-f224-phase.psql')

  # Duas sessões locais coordenadas pelo bloqueio transacional da RPC.
  $phaseA = Join-Path $sql 'appointment-f224-concurrency-a.psql'
  $job = Start-Job -ScriptBlock {
    param($exe,$file)
    & $exe -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55432 -U potala_lab_admin -d potala_appointments_f224 -f $file 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Primeira sessão concorrente falhou.' }
  } -ArgumentList $psql,$phaseA
  $locked = $false
  for ($attempt=0; $attempt -lt 50; $attempt++) {
    if ($job.State -eq 'Failed' -or $job.State -eq 'Completed') { throw 'A primeira sessão encerrou antes da verificação de concorrência.' }
    $held = Invoke-PsqlQuery $database "select exists(select 1 from pg_locks where locktype='advisory' and database=(select oid from pg_database where datname=current_database()) and classid=178904::oid and objid=1::oid and granted)::int"
    if ($held -eq '1') { $locked = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $locked) { throw 'Bloqueio da primeira sessão não confirmado.' }
  Invoke-PsqlFile $database (Join-Path $sql 'appointment-f224-concurrency-b.psql')
  $null = Receive-Job -Job $job -Wait
  if ($job.State -ne 'Completed') { throw 'Primeira sessão concorrente falhou.' }
  Invoke-PsqlFile $database (Join-Path $sql 'appointment-f224-concurrency-final.psql')
  Write-Host 'Homologação PostgreSQL local concluída. O banco permanece para inspeção; nenhuma exclusão automática.'
} finally {
  if ($job) {
    if ($job.State -eq 'Running') { Stop-Job -Job $job }
    Remove-Job -Job $job -Force
  }
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  Remove-Item Env:PGPASSWORD,Env:PGPASSFILE,Env:PGSSLMODE,Env:PGCONNECT_TIMEOUT,Env:PGOPTIONS -ErrorAction SilentlyContinue
  if ($secret) { $secret.Dispose() }
}
