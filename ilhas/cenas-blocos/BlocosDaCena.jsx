/*
 * BLOCOS DA CENA — o que há em cada seção, em blocos pequenos abaixo do
 * texto da cena (dados em ./blocos.js).
 *
 * Cada bloco é um SpotlightCard do React Bits feito link: ao passar o mouse,
 * uma luz dourada segue o ponteiro dentro dele e a borda esquenta (CSS); com
 * GSAP, o ícone se redesenha — o traço corre de novo, como nos títulos das
 * cenas — e sobe de leve, e a seta avança. O foco do teclado dispara o mesmo.
 * No toque e com movimento reduzido, só a borda e a luz mudam.
 */
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import SpotlightCard from "./reactbits/SpotlightCard.jsx";
import { BLOCOS } from "./blocos.js";
import { ICONES } from "./icones.js";
import "./estilos/blocos.css";

gsap.registerPlugin(useGSAP);

const semMovimento = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Icone({ nome }) {
  return (
    <svg className="cena-bloco__icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {(ICONES[nome] ?? []).map(([Forma, atributos], indice) => (
        <Forma key={indice} {...atributos} pathLength="1" />
      ))}
    </svg>
  );
}

function Bloco({ rotulo, dica, href, icone }) {
  const ref = useRef(null);
  const { contextSafe } = useGSAP({ scope: ref });

  const acender = contextSafe((evento) => {
    if (evento.pointerType === "touch" || semMovimento()) return;
    const formas = evento.currentTarget.querySelectorAll(".cena-bloco__icone > *");
    gsap.timeline({ defaults: { overwrite: "auto" } })
      .fromTo(formas, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.75, ease: "power2.out", stagger: 0.07 }, 0)
      .to(".cena-bloco__icone", { y: -2, rotate: -6, duration: 0.45, ease: "back.out(2.2)" }, 0)
      .to(".cena-bloco__seta", { x: 3, y: -3, duration: 0.4, ease: "power3.out" }, 0.05);
  });

  const apagar = contextSafe(() => {
    if (semMovimento()) return;
    gsap.to(".cena-bloco__icone", { y: 0, rotate: 0, duration: 0.55, ease: "power3.out", overwrite: "auto" });
    gsap.to(".cena-bloco__seta", { x: 0, y: 0, duration: 0.4, ease: "power2.out", overwrite: "auto" });
  });

  return (
    <SpotlightCard
      as="a"
      ref={ref}
      href={href}
      className="cena-bloco"
      onPointerEnter={acender}
      onPointerLeave={apagar}
      onFocus={acender}
      onBlur={apagar}
    >
      <Icone nome={icone} />
      <span className="cena-bloco__texto">
        <span className="cena-bloco__rotulo">{rotulo}</span>
        <span className="cena-bloco__dica">{dica}</span>
      </span>
      <span className="cena-bloco__seta" aria-hidden="true">↗</span>
    </SpotlightCard>
  );
}

export default function BlocosDaCena({ cena }) {
  return (
    <ul className="cena-blocos" aria-label="Nesta seção">
      {(BLOCOS[cena] ?? []).map((bloco, indice) => (
        <li key={bloco.rotulo} style={{ "--i": indice }}>
          <Bloco {...bloco} />
        </li>
      ))}
    </ul>
  );
}
