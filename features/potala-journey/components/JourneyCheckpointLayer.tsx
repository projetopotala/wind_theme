import { JOURNEY_CONTENT, PRIMARY_CONTENT_IDS } from "../data/journey-content";
import { progressForCheckpoint } from "../data/journey-timeline";
import styles from "./potala-experience.module.css";

export function JourneyCheckpointLayer() {
  return (
    <div className={styles.checkpointLayer} aria-hidden="true">
      {PRIMARY_CONTENT_IDS.map((id) => (
        <span
          key={id}
          id={`conteudo-${id}`}
          style={{ top: `${progressForCheckpoint(id) * 100}%` }}
          data-title={JOURNEY_CONTENT[id].title}
        />
      ))}
    </div>
  );
}
