import type { JourneyContent } from "../types/journey";
import styles from "./potala-experience.module.css";

export function JourneyPrelude({ content }: { content: JourneyContent }) {
  return (
    <article className={styles.prelude} data-content-id={content.id}>
      {content.role && <p className={styles.category}>{content.role}</p>}
      {content.label && <h2>{content.label}</h2>}
      {content.cue && <p className={styles.description}>{content.cue}</p>}
      {content.poem && <p className={styles.poem}>{content.poem.map((line) => <span key={line}>{line}</span>)}</p>}
    </article>
  );
}
