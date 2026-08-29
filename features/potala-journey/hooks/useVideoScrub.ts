"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";

import { JOURNEY_MEDIA, timeForJourneyProgress } from "../data/journey-timeline";
import { createVideoScrubController } from "./video-scrub-controller";

type VideoScrubOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  disabled: boolean;
  requestUpdate: () => void;
};

export function useVideoScrub({ videoRef, disabled, requestUpdate }: VideoScrubOptions) {
  const requestUpdateRef = useRef(requestUpdate);
  requestUpdateRef.current = requestUpdate;
  const controllerRef = useRef(createVideoScrubController({
    duration: JOURNEY_MEDIA.duration,
    fps: JOURNEY_MEDIA.fps,
    maxSeeksPerSecond: 30,
    timeForProgress: timeForJourneyProgress,
  }));

  const syncProgress = useCallback((progress: number, timestamp: number) => {
    const video = videoRef.current;
    if (disabled || !video) return false;
    return controllerRef.current.sync(video, progress, timestamp);
  }, [disabled, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || disabled) return;
    const onSeeked = () => {
      if (controllerRef.current.onSeeked(video, performance.now())) requestUpdateRef.current();
    };
    const keepPaused = () => video.pause();
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("playing", keepPaused);
    return () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("playing", keepPaused);
      controllerRef.current.reset();
      video.pause();
    };
  }, [disabled, videoRef]);

  return { syncProgress };
}
