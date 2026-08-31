import type { JourneyContent } from "../types/journey";
import { canonicalJourneyHref } from "../lib/journey-navigation";
import { checkpointMotionState } from "../lib/checkpoint-motion";
import styles from "./potala-experience.module.css";

export function JourneyCheckpoint({ content, active, reducedMotion = false }: { content: JourneyContent; active: boolean; reducedMotion?: boolean }) {
  const portal = content.portal;
  const confirmedActions = content.status === "active" ? content.actions ?? [] : [];
  return (
    <article
      className={`${styles.checkpoint} ${styles[`importance-${content.importance}`]}`}
      data-content-id={content.id}
      data-motion={checkpointMotionState({ active, reducedMotion })}
      aria-hidden={!active}
    >
      {portal && <p className={styles.category}>{portal.number}</p>}
      {content.category && !portal && <p className={styles.category}>{content.category}</p>}
      {content.eyebrow && <p className={styles.category}>{content.eyebrow}</p>}
      {content.title && <h2>{content.title}</h2>}
      {(portal?.description ?? content.description) && <p className={styles.description}>{portal?.description ?? content.description}</p>}
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
      {portal && (
        <div className={styles.actions}>
          <a href={canonicalJourneyHref(portal.href)}>Conhecer {content.title?.toLocaleLowerCase("pt-BR")} <span aria-hidden="true">→</span></a>
        </div>
      )}
    </article>
  );
}
