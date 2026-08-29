import { clamp, LAST_SAFE_FRAME_TIME } from "../data/journey-timeline";

type VideoLike = {
  currentTime: number;
  readyState: number;
  seeking: boolean;
};

type ScrubControllerOptions = {
  duration: number;
  fps: number;
  maxSeeksPerSecond: number;
  timeForProgress?: (progress: number) => number;
};

export function createVideoScrubController({
  duration,
  fps,
  maxSeeksPerSecond,
  timeForProgress,
}: ScrubControllerOptions) {
  const safeEnd = Math.min(LAST_SAFE_FRAME_TIME, duration - 1 / fps);
  const seekInterval = 1000 / maxSeeksPerSecond;
  const epsilon = 1 / (fps * 2);
  let lastSeekAt = Number.NEGATIVE_INFINITY;
  let pendingTime: number | null = null;

  function targetForProgress(progress: number) {
    const target = timeForProgress
      ? timeForProgress(clamp(progress))
      : clamp(progress) * safeEnd;
    return clamp(target, 0, safeEnd);
  }

  function apply(video: VideoLike, target: number, now: number): boolean {
    if (Math.abs(video.currentTime - target) < epsilon) {
      pendingTime = null;
      return false;
    }
    if (video.seeking || video.readyState < 1) return false;
    if (now - lastSeekAt < seekInterval) return true;
    video.currentTime = target;
    lastSeekAt = now;
    pendingTime = null;
    return false;
  }

  return {
    sync(video: VideoLike, progress: number, now: number): boolean {
      pendingTime = targetForProgress(progress);
      return apply(video, pendingTime, now);
    },
    onSeeked(video: VideoLike, now: number): boolean {
      if (pendingTime === null) return false;
      return apply(video, pendingTime, now);
    },
    reset() {
      lastSeekAt = Number.NEGATIVE_INFINITY;
      pendingTime = null;
    },
  };
}
