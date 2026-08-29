"use client";

import { JOURNEY_CONTENT, PRIMARY_CONTENT_IDS } from "../data/journey-content";
import { progressForCheckpoint } from "../data/journey-timeline";
import styles from "./potala-experience.module.css";

export function JourneyNavigation({
  activeContentId,
  onNavigate,
  flowMode,
}: {
  activeContentId: string;
  onNavigate: (progress: number) => void;
  flowMode: boolean;
}) {
  return (
    <nav className={styles.navigation} aria-label="Destinos da jornada">
      <p>Potala Experience</p>
      <ol>
        {PRIMARY_CONTENT_IDS.map((id, index) => {
          const content = JOURNEY_CONTENT[id];
          return (
            <li key={id}>
              <a
                href={flowMode ? `#fluxo-${id}` : `#conteudo-${id}`}
                aria-label={`${String(index + 1).padStart(2, "0")} — ${content.title}`}
                aria-current={activeContentId === id ? "location" : undefined}
                onClick={(event) => {
                  if (flowMode) return;
                  event.preventDefault();
                  onNavigate(progressForCheckpoint(id));
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{content.title}</strong>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
