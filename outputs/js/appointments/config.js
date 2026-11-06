import { SUPABASE_CONFIG } from "../supabase/config.js";

/*
 * Flags públicas, mas derivadas exclusivamente do perfil de ambiente validado.
 * A Preview E2E recebe um artefato gerado no build e preso à sua URL exata;
 * produção continua fechada. Query string, storage e globais nunca ativam nada.
 */
const flags = SUPABASE_CONFIG.appointments;
export const APPOINTMENT_REQUESTS_ENABLED = flags.authenticatedRequests === true;
export const APPOINTMENT_ADMIN_ENABLED = flags.admin === true;
export const APPOINTMENT_RESERVATIONS_ENABLED = flags.reservations === true;
export const APPOINTMENT_PUBLIC_REQUESTS_ENABLED = flags.publicRequests === true;
// Site key é pública; sem widget aprovado, o formulário público continua fechado.
export const APPOINTMENT_TURNSTILE_SITE_KEY = flags.turnstileSiteKey || "";
