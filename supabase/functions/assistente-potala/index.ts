import { withSupabase } from "npm:@supabase/server@1";
import { chamarOpenAI, createAssistantHandler } from "./handler.ts";
import { criarFonteDeConhecimento } from "./conhecimento.ts";

/*
 * Edge Function assistente-potala (IA-01). `verify_jwt=false` em config.toml: o
 * visitante é anônimo; a chave publicável é validada pelo wrapper no POST.
 *
 * Segredos (painel do Supabase > Edge Functions > Secrets; nunca no Git):
 *   OPENAI_API_KEY, IA_SEGREDO_HASH.
 * Configuração: IA_ATIVO ("true" liga), IA_ORIGENS_PERMITIDAS, IA_SITE_URL, IA_MODELO,
 *   IA_ESFORCO, IA_MAX_TOKENS_SAIDA, IA_TIMEOUT_MS, IA_LIMITE_MINUTO, IA_LIMITE_DIA,
 *   IA_LIMITE_GLOBAL_DIA, IA_LIMITE_TOKENS_DIA.
 * A chave secreta do Supabase (contexto `supabaseAdmin`) é usada só para as duas RPCs de
 * contadores, que não são executáveis por anon/authenticated. O conteúdo é lido com a
 * chave publicável.
 */
const env = (nome: string) => Deno.env.get(nome);

function chavePublicavel(): string {
  try {
    const mapa = JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS") || "{}") as Record<string, string>;
    const primeira = Object.values(mapa).find((v) => typeof v === "string" && v);
    if (primeira) return primeira;
  } catch { /* cai para a chave legada */ }
  return env("SUPABASE_ANON_KEY") || "";
}

// Cache da base pública por instância (10 min), compartilhado entre pedidos.
const fonte = criarFonteDeConhecimento({
  siteUrl: env("IA_SITE_URL") || "https://wind-theme.vercel.app",
  supabaseUrl: env("SUPABASE_URL") || "",
  chavePublicavel: chavePublicavel(),
});

const semBanco = createAssistantHandler({ env,
  reservarUso: async () => { throw new Error("inalcancavel"); },
  registrarTokens: async () => {},
  carregarConhecimento: async () => { throw new Error("inalcancavel"); },
  chamarModelo: async () => { throw new Error("inalcancavel"); },
});

const post = withSupabase({ auth: "publishable", cors: "disabled" }, async (request, context) => {
  const admin = context.supabaseAdmin.schema("public");
  const handle = createAssistantHandler({ env,
    reservarUso: (args) => admin.rpc("ia_reservar_uso", args),
    registrarTokens: (tokens) => admin.rpc("ia_registrar_tokens", { p_tokens: tokens }),
    carregarConhecimento: () => fonte.carregar(),
    chamarModelo: (chamada) => chamarOpenAI(chamada),
  });
  return handle(request);
});

export default {
  // GET (situação: ativo ou não) e OPTIONS não chamam banco nem OpenAI.
  fetch: (request: Request) => request.method === "POST" ? post(request) : semBanco(request),
};
