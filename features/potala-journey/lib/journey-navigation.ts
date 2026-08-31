import type { JourneyFocusRange } from "../types/journey";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function canonicalJourneyHref(href: string): string {
  const url = new URL(href, "https://potala.local");
  url.searchParams.set("from", "journey");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function scrollTopForProgress(
  section: { top: number; height: number; viewportHeight: number },
  progress: number,
): number {
  return section.top + Math.max(0, section.height - section.viewportHeight) * clamp(progress);
}

export function checkpointVisibility(progress: number, range: JourneyFocusRange) {
  if (progress < range.start || progress > range.end) return { active: false, opacity: 0, translateY: 18, blur: 3 };
  const entering = clamp((progress - range.start) / (range.focus - range.start));
  const leaving = clamp((range.end - progress) / (range.end - range.focus));
  const opacity = Math.min(entering, leaving);
  return { active: true, opacity, translateY: (1 - opacity) * 18, blur: (1 - opacity) * 3 };
}
