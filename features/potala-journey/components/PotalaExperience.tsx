"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EXPERIENCE_SETTINGS, JOURNEY_CONTENT } from "../data/journey-content";
import { useActiveCheckpoint } from "../hooks/useActiveCheckpoint";
import { useScrollTimeline } from "../hooks/useScrollTimeline";
import { useVideoScrub } from "../hooks/useVideoScrub";
import { BreathingControl } from "./BreathingControl";
import { JourneyCheckpointLayer } from "./JourneyCheckpointLayer";
import { JourneyContentFlow } from "./JourneyContentFlow";
import { JourneyEpilogue } from "./JourneyEpilogue";
import { JourneyNavigation } from "./JourneyNavigation";
import { JourneyOverlay } from "./JourneyOverlay";
import { JourneyVideo } from "./JourneyVideo";
import { JourneyViewport } from "./JourneyViewport";
import { ThreeEnvironment } from "./ThreeEnvironment";
import styles from "./potala-experience.module.css";

type MediaState = "loading" | "ready" | "error";

export function PotalaExperience() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef(0);
  const scheduleRef = useRef<() => void>(() => undefined);
  const [mediaState, setMediaState] = useState<MediaState>("loading");
  const [reducedMotion, setReducedMotion] = useState(false);
  const { activeCheckpoint, updateActiveCheckpoint } = useActiveCheckpoint();

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(query.matches);
    syncPreference();
    query.addEventListener("change", syncPreference);
    document.documentElement.classList.add("potala-preview-active");
    document.body.classList.add("potala-preview-active");
    return () => {
      query.removeEventListener("change", syncPreference);
      document.documentElement.classList.remove("potala-preview-active");
      document.body.classList.remove("potala-preview-active");
    };
  }, []);

  const scrubDisabled = reducedMotion || mediaState === "error";
  const { syncProgress } = useVideoScrub({
    videoRef,
    disabled: scrubDisabled,
    requestUpdate: () => scheduleRef.current(),
  });
  const handleProgress = useCallback((progress: number, timestamp: number) => {
    progressRef.current = progress;
    updateActiveCheckpoint(progress);
    return syncProgress(progress, timestamp);
  }, [syncProgress, updateActiveCheckpoint]);
  const { scheduleUpdate, scrollToProgress } = useScrollTimeline({
    sectionRef,
    disabled: scrubDisabled,
    onProgress: handleProgress,
  });
  scheduleRef.current = scheduleUpdate;

  const handleMediaReady = useCallback(() => {
    setMediaState("ready");
    scheduleRef.current();
  }, []);

  const activeContentId = JOURNEY_CONTENT[activeCheckpoint.contentId]?.id ?? "prologo";

  return (
    <>
      <section
        ref={sectionRef}
        className={styles.experience}
        data-media-state={mediaState}
        data-reduced-motion={reducedMotion ? "true" : "false"}
        aria-label="Jornada visual até o Palácio Potala"
      >
        <JourneyViewport>
          <JourneyVideo videoRef={videoRef} onReady={handleMediaReady} onError={() => setMediaState("error")} />
          <div className={styles.videoShade} aria-hidden="true" />
          <ThreeEnvironment progressRef={progressRef} disabled={scrubDisabled} />
          <JourneyNavigation
            activeContentId={activeContentId}
            onNavigate={scrollToProgress}
            flowMode={reducedMotion || mediaState === "error"}
          />
          <JourneyOverlay checkpoint={activeCheckpoint} reducedMotion={reducedMotion} />
          {mediaState === "loading" && <p className={styles.mediaStatus}>Preparando a jornada…</p>}
          {mediaState === "error" && <p className={styles.mediaStatus}>A paisagem não pôde ser carregada.</p>}
        </JourneyViewport>
        <JourneyCheckpointLayer />
        <JourneyContentFlow visible={reducedMotion || mediaState === "error"} />
      </section>
      <BreathingControl settings={EXPERIENCE_SETTINGS.breathing} />
      <JourneyEpilogue />
    </>
  );
}
