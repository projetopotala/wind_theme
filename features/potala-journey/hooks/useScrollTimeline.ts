"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";

import { clamp } from "../data/journey-timeline";

type ScrollTimelineOptions = {
  sectionRef: RefObject<HTMLElement | null>;
  disabled: boolean;
  onProgress: (progress: number, timestamp: number) => boolean | void;
};

export function useScrollTimeline({ sectionRef, disabled, onProgress }: ScrollTimelineOptions) {
  const frameIdRef = useRef(0);
  const metricsRef = useRef({ sectionTop: 0, sectionHeight: 1, viewportHeight: 1 });
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const measure = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;
    const rect = section.getBoundingClientRect();
    metricsRef.current = {
      sectionTop: rect.top + window.scrollY,
      sectionHeight: section.offsetHeight || rect.height,
      viewportHeight: window.innerHeight,
    };
  }, [sectionRef]);

  const update = useCallback((timestamp: number) => {
    frameIdRef.current = 0;
    if (disabled || document.hidden) return;
    const { sectionTop, sectionHeight, viewportHeight } = metricsRef.current;
    const travel = Math.max(1, sectionHeight - viewportHeight);
    const progress = clamp((window.scrollY - sectionTop) / travel);
    if (onProgressRef.current(progress, timestamp) === true) {
      frameIdRef.current = window.requestAnimationFrame(update);
    }
  }, [disabled]);

  const scheduleUpdate = useCallback(() => {
    if (disabled || document.hidden || frameIdRef.current) return;
    frameIdRef.current = window.requestAnimationFrame(update);
  }, [disabled, update]);

  const scrollToProgress = useCallback((progress: number) => {
    measure();
    const { sectionTop, sectionHeight, viewportHeight } = metricsRef.current;
    window.scrollTo({
      top: sectionTop + clamp(progress) * Math.max(1, sectionHeight - viewportHeight),
      behavior: "smooth",
    });
  }, [measure]);

  useEffect(() => {
    if (disabled) return;
    const onResize = () => {
      measure();
      scheduleUpdate();
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = 0;
        return;
      }
      measure();
      scheduleUpdate();
    };
    measure();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleUpdate();
    return () => {
      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = 0;
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [disabled, measure, scheduleUpdate]);

  return { scheduleUpdate, scrollToProgress };
}
