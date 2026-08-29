import {
  ARRIVAL_CONCEPTS,
  JOURNEY_PRIMARY_REGIONS,
  JOURNEY_PROLOGUE,
  JOURNEY_SECONDARY_CONTENT,
  JOURNEY_TRANSITIONS,
} from "../data/journey-content";
import { JourneyCheckpoint } from "./JourneyCheckpoint";
import { JourneyPrelude } from "./JourneyPrelude";
import styles from "./potala-experience.module.css";

export function JourneyContentFlow({ visible }: { visible: boolean }) {
  return (
    <div className={styles.contentFlow} aria-hidden={!visible}>
      <header className={styles.flowPrologue}>
        <p>{JOURNEY_PROLOGUE.eyebrow}</p>
        <h1>{JOURNEY_PROLOGUE.title}</h1>
        <span>{JOURNEY_PROLOGUE.description}</span>
      </header>
      <section className={styles.arrivalFlow} aria-label="Significados da Chegada">
        {ARRIVAL_CONCEPTS.map((content) => <JourneyPrelude key={content.id} content={content} />)}
      </section>
      <section className={styles.regionFlow} aria-label="Regiões do Ecossistema Potala">
        {JOURNEY_PRIMARY_REGIONS.map((content, index) => (
          <div key={content.id} id={`fluxo-${content.id}`}>
            <JourneyCheckpoint content={content} active />
            {JOURNEY_TRANSITIONS[index] && index < 3 && <p className={styles.transition}>{JOURNEY_TRANSITIONS[index].description}</p>}
            {index === 6 && <p className={styles.transition}>{JOURNEY_TRANSITIONS[3].description}</p>}
          </div>
        ))}
      </section>
      <section className={styles.secondaryFlow} aria-label="Outros caminhos do ecossistema">
        {JOURNEY_SECONDARY_CONTENT.map((content) => <JourneyCheckpoint key={content.id} content={content} active />)}
      </section>
    </div>
  );
}
