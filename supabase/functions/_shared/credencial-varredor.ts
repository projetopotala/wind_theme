// Credencial ESPECIFICA do varredor (pg_cron/pg_net): segredo proprio, guardado no Vault do banco e no Secret
// SWEEPER_SECRET da funcao. Nao e a service_role nem uma chave do projeto: so autoriza esta funcao.
// Enviado no cabecalho `x-sweeper-secret`; comparacao em tempo constante; sem segredo configurado, nega tudo.
import { igual } from "./credencial-servico.ts";

type Env = (nome: string) => string | undefined;
const TAMANHO_MINIMO = 32;

export function credencialDoVarredor(env: Env, request: Request): boolean {
  const esperada = env("SWEEPER_SECRET") ?? "";
  if (esperada.length < TAMANHO_MINIMO) return false;
  const enviada = request.headers.get("x-sweeper-secret") ?? "";
  return enviada.length > 0 && igual(enviada, esperada);
}
