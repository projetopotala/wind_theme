import test from "node:test";
import assert from "node:assert/strict";
import { isAppointmentLabPreview } from "../../outputs/js/appointments/lab-preview.js";

test("ativa as jornadas RPC somente na origem Vercel isolada e no laboratório exato", () => {
  const lab = "https://hmspabllgxqfzzricijv.supabase.co";
  assert.equal(isAppointmentLabPreview({ hostname: "wind-theme-m2-lab-preview.vercel.app", url: lab }), true);
  for (const hostname of ["wind-theme.vercel.app", "wind-theme-potala.vercel.app", "localhost", "wind-theme-m2-lab-preview.vercel.app.attacker.invalid"]) {
    assert.equal(isAppointmentLabPreview({ hostname, url: lab }), false);
  }
  assert.equal(isAppointmentLabPreview({ hostname: "wind-theme-m2-lab-preview.vercel.app", url: "https://gotrumwuimpoeggwamut.supabase.co" }), false);
});
