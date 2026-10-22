// Habilitar somente após homologação da RPC e aprovação do destino Supabase.
// Não ler query strings, localStorage ou variáveis globais para ativar o recurso.
export const APPOINTMENT_REQUESTS_ENABLED = false;
// Triagem administrativa independente do lançamento do formulário público.
export const APPOINTMENT_ADMIN_ENABLED = false;
export const APPOINTMENT_RESERVATIONS_ENABLED = false;
// Sitekey pública específica da publicação; sem ela o envio falha fechado.
export const APPOINTMENT_TURNSTILE_SITE_KEY = "";
