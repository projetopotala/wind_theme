import { withSupabase } from "npm:@supabase/server@1";
import { createAppointmentHandler, verifyTurnstileWithFetch } from "./handler.ts";

// `verify_jwt=false` em config.toml: a chave publicável é validada pelo wrapper.
// Ela não é autorização para acessar a RPC; a credencial privilegiada fica só aqui.
const env = (name: string) => Deno.env.get(name);
const nonPost = createAppointmentHandler({ env,
  verifyTurnstile: async () => { throw new Error("unreachable"); },
  invokeRpc: async () => { throw new Error("unreachable"); },
});
const post = withSupabase({ auth: "publishable", cors: "disabled" }, async (request, context) => {
  // O cliente privilegiado fica no contexto da requisição, sem estado global.
  const handle = createAppointmentHandler({ env, verifyTurnstile: verifyTurnstileWithFetch,
    invokeRpc: (args: Record<string, string>) => context.supabaseAdmin.schema("public")
      .rpc("submit_appointment_request", args),
  });
  return handle(request);
});
export default {
  fetch: (request: Request) => request.method === "POST" ? post(request) : nonPost(request),
};
