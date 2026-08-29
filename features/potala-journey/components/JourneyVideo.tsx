"use client";

import { type RefObject, useEffect } from "react";

import { JOURNEY_MEDIA } from "../data/journey-timeline";
import styles from "./potala-experience.module.css";

export function JourneyVideo({
  videoRef,
  onReady,
  onError,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  onReady: () => void;
  onError: () => void;
}) {
  useEffect(() => {
    if ((videoRef.current?.readyState ?? 0) >= 1) onReady();
  }, [onReady, videoRef]);

  return (
    <video
      ref={videoRef}
      className={styles.video}
      src={JOURNEY_MEDIA.src}
      poster={JOURNEY_MEDIA.poster}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      onLoadedMetadata={onReady}
      onLoadedData={onReady}
      onError={onError}
    />
  );
}
