export type JourneyImportance = "primary" | "secondary" | "passive";

export type JourneyContentStatus =
  | "active"
  | "legacy-reference"
  | "pending-destination"
  | "pending-content";

export type JourneyContentKind =
  | "prologue"
  | "arrival"
  | "region"
  | "transition"
  | "secondary"
  | "epilogue";

export type JourneyAction = {
  label: string;
  href: string;
  external?: boolean;
};

export type JourneyFocusRange = {
  start: number;
  focus: number;
  end: number;
};

export type JourneyPortal = {
  number: string;
  href: string;
  description: string;
  alignment: "left" | "right";
  secondaryIds: readonly string[];
};

export type JourneyContent = {
  id: string;
  kind: JourneyContentKind;
  importance: JourneyImportance;
  status: JourneyContentStatus;
  category?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  body?: string;
  role?: string;
  label?: string;
  cue?: string;
  poem?: readonly string[];
  tags?: readonly string[];
  relatedContent?: readonly string[];
  actions?: readonly JourneyAction[];
  legacyHref?: string;
  portal?: JourneyPortal;
};

export type JourneyCheckpoint = {
  id: string;
  contentId: string;
  videoStart: number;
  videoFocus: number;
  videoEnd: number;
  scrollWeight: number;
  importance: JourneyImportance;
  focusRange?: JourneyFocusRange;
};

export type JourneyMediaManifest = {
  src: string;
  poster: string;
  duration: number;
  fps: number;
  development: boolean;
};

export type JourneyMediaVersion = "v1" | "v2";

export type JourneyBreathingSettings = {
  patternSeconds: readonly [number, number, number];
  cycles: number;
  enabled: boolean;
};

export type JourneyAudioSettings = {
  legacySrc: string;
  volume: number;
  optIn: boolean;
  autoplay: false;
  enabled: boolean;
  supportsFade: boolean;
};

export type JourneyExperienceSettings = {
  breathing: JourneyBreathingSettings;
  audio: JourneyAudioSettings;
};
