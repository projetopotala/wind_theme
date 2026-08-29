import type { JourneyBreathingSettings } from "../types/journey";

export function BreathingControl({ settings }: { settings: JourneyBreathingSettings }) {
  if (!settings.enabled) return null;
  return (
    <section aria-label="Respiração 3-3-3" data-cycles={settings.cycles}>
      <p>3-3-3</p>
    </section>
  );
}
