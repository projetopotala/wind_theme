import { SUPABASE_CONFIG } from "../supabase/config.js";

const LAB_URL = "https://hmspabllgxqfzzricijv.supabase.co";
const PREVIEW_HOST = "wind-theme-m2-lab-preview.vercel.app";

// Somente a origem isolada pode ativar as RPCs já homologadas do laboratório.
// O formulário público continua sob sua flag própria e exige a Edge Function.
export function isAppointmentLabPreview({ hostname = globalThis.location?.hostname, url = SUPABASE_CONFIG.url } = {}) {
  return hostname === PREVIEW_HOST && url === LAB_URL;
}

export const APPOINTMENT_LAB_PREVIEW_ENABLED = isAppointmentLabPreview();
