import { JOURNEY_CONTENT } from "../data/journey-content";
import type { JourneyCheckpoint as JourneyCheckpointType } from "../types/journey";
import { JourneyCheckpoint } from "./JourneyCheckpoint";
import { JourneyPrelude } from "./JourneyPrelude";
import styles from "./potala-experience.module.css";

export function JourneyOverlay({ checkpoint }: { checkpoint: JourneyCheckpointType }) {
  const content = JOURNEY_CONTENT[checkpoint.contentId];
  if (!content) return null;
  return (
    <div className={styles.overlay} aria-live="polite" aria-atomic="true">
      <div className={styles.overlayInner} key={content.id}>
        {content.kind === "arrival"
          ? <JourneyPrelude content={content} />
          : <JourneyCheckpoint content={content} active />}
      </div>
    </div>
  );
}
