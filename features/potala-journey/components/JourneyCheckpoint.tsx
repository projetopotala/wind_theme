import type { JourneyContent } from "../types/journey";
import styles from "./potala-experience.module.css";

export function JourneyCheckpoint({ content, active }: { content: JourneyContent; active: boolean }) {
  const confirmedActions = content.status === "active" ? content.actions ?? [] : [];
  return (
    <article
      className={`${styles.checkpoint} ${styles[`importance-${content.importance}`]}`}
      data-content-id={content.id}
      aria-hidden={!active}
    >
      {content.category && <p className={styles.category}>{content.category}</p>}
      {content.eyebrow && <p className={styles.category}>{content.eyebrow}</p>}
      {content.title && <h2>{content.title}</h2>}
      {content.description && <p className={styles.description}>{content.description}</p>}
      {content.body && <p className={styles.description}>{content.body}</p>}
      {content.tags && (
        <ul className={styles.tags} aria-label="Temas desta região">
          {content.tags.map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
      )}
      {confirmedActions.length > 0 && (
        <div className={styles.actions}>
          {confirmedActions.map((action) => (
            <a key={action.href} href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noreferrer" : undefined}>
              {action.label}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
