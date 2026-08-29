"use client";

import { useCallback, useState } from "react";

import { activeCheckpointForProgress, JOURNEY_CHECKPOINTS } from "../data/journey-timeline";

export function useActiveCheckpoint() {
  const [activeId, setActiveId] = useState(JOURNEY_CHECKPOINTS[0].id);

  const updateActiveCheckpoint = useCallback((progress: number) => {
    const nextId = activeCheckpointForProgress(progress).id;
    setActiveId((current) => current === nextId ? current : nextId);
  }, []);

  return {
    activeCheckpoint: JOURNEY_CHECKPOINTS.find((item) => item.id === activeId) ?? JOURNEY_CHECKPOINTS[0],
    updateActiveCheckpoint,
  };
}
