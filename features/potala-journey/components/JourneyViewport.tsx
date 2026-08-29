import type { ReactNode } from "react";

import styles from "./potala-experience.module.css";

export function JourneyViewport({ children }: { children: ReactNode }) {
  return <div className={styles.sticky}>{children}</div>;
}
