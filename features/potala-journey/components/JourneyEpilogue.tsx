import {
  JOURNEY_CONTACT,
  JOURNEY_EPILOGUE,
  JOURNEY_SECONDARY_CONTENT,
} from "../data/journey-content";
import styles from "./potala-experience.module.css";

export function JourneyEpilogue() {
  return (
    <footer className={styles.epilogue} aria-labelledby="potala-epilogue-title">
      <div className={styles.epilogueLead}>
        <p>{JOURNEY_EPILOGUE.description}</p>
        <h2 id="potala-epilogue-title">{JOURNEY_EPILOGUE.title}</h2>
        <a href="https://www.institutopotala.com/">Continuar no Instituto Potala <span aria-hidden="true">↗</span></a>
      </div>
      <div className={styles.ecosystemIndex} aria-label="Caminhos complementares">
        {JOURNEY_SECONDARY_CONTENT.map((content) => (
          <span key={content.id} data-status={content.status}>
            <small>{content.category}</small>
            <strong>{content.title}</strong>
          </span>
        ))}
      </div>
      <address className={styles.contact}>
        <strong>{JOURNEY_CONTACT.name}</strong>
        <span>{JOURNEY_CONTACT.address}</span>
        <a href="tel:+551938346147">{JOURNEY_CONTACT.phone}</a>
        <a href="https://wa.me/5519997766131">{JOURNEY_CONTACT.whatsapp}</a>
        <a href={`mailto:${JOURNEY_CONTACT.email}`}>{JOURNEY_CONTACT.email}</a>
      </address>
    </footer>
  );
}
