// Autenticação de chamadas de serviço (pg_cron/pg_net, agendadores) em funções com verify_jwt = false.
//
// Conforme a documentação atual do Supabase para chaves novas: a credencial vai no cabeçalho `apikey`
// e é conferida contra as chaves secretas do projeto (`SUPABASE_SECRET_KEYS`, JSON com chaves nomeadas,
// ex.: {"default":"sb_secret_..."}). A chave de serviço legada (`SUPABASE_SERVICE_ROLE_KEY`) continua
// aceita enquanto o projeto a mantiver. O mesmo valor em `Authorization: Bearer` também vale, porque
// chamadores antigos o enviam assim. Chave publicável, anon e JWT de usuário NUNCA estão no conjunto
// aceito. Sem nenhuma chave configurada, nega tudo (falha fechado).
type Env = (nome: string) => string | undefined;

function chavesAceitas(env: Env): string[] {
  const chaves: string[] = [];
  try {
    const nomeadas = JSON.parse(env("SUPABASE_SECRET_KEYS") ?? "{}");
    if (nomeadas && typeof nomeadas === "object") {
      for (const v of Object.values(nomeadas)) if (typeof v === "string" && v.length >= 20) chaves.push(v);
    }
  } catch { /* JSON inválido: ignora, não aceita nada por ele */ }
  const legada = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legada && legada.length >= 20) chaves.push(legada);
  return chaves;
}

// Comparação sem saída antecipada por posição; o comprimento só vaza se for diferente de todas.
function igual(a: string, b: string) {
  let d = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export function credencialDeServico(env: Env, request: Request): boolean {
  const aceitas = chavesAceitas(env);
  if (aceitas.length === 0) return false;
  const apikey = request.headers.get("apikey") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  let ok = false;
  for (const candidata of [apikey, bearer]) {
    if (!candidata) continue;
    for (const chave of aceitas) if (igual(candidata, chave)) ok = true;
  }
  return ok;
}
