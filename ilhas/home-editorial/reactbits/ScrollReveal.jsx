/*
 * ScrollReveal — React Bits (https://reactbits.dev), por David Haz.
 * MIT + Commons Clause: ver ./LICENSE.md. Adaptado para o Potala:
 *
 * - Renderiza um único elemento (`tag`); o original punha um <p> dentro de um
 *   <h2>, HTML inválido.
 * - `gatilho` (seletor do ancestral), `inicio` e `fim`: a frase se revela
 *   conforme o progresso da cena que a contém — dentro de um palco fixo, a
 *   posição da própria frase não muda e não serviria de régua. É um seletor,
 *   e não uma ref: no primeiro efeito do filho, a ref do pai ainda não existe.
 * - Cada instância desfaz só os próprios gatilhos.
 * - Com movimento reduzido, as palavras ficam nítidas desde o início.
 */
import { useRef, useMemo } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { movimentoReduzido } from "../movimento/consultas.js";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const ScrollReveal = ({
  children,
  tag = "p",
  className = "",
  gatilho,
  inicio = "top bottom-=20%",
  fim = "bottom bottom",
  enableBlur = true,
  baseOpacity = 0.14,
  blurStrength = 4,
}) => {
  const ref = useRef(null);

  const palavras = useMemo(() => {
    const texto = typeof children === "string" ? children : "";
    return texto.split(/(\s+)/).map((parte, indice) =>
      /^\s+$/.test(parte) ? parte : <span className="word" key={indice}>{parte}</span>,
    );
  }, [children]);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || movimentoReduzido()) return;
      const alvos = el.querySelectorAll(".word");
      const scrollTrigger = { trigger: (gatilho && el.closest(gatilho)) || el, start: inicio, end: fim, scrub: true };
      gsap.fromTo(alvos, { opacity: baseOpacity }, { opacity: 1, ease: "none", stagger: 0.05, scrollTrigger });
      if (enableBlur) {
        gsap.fromTo(alvos, { filter: `blur(${blurStrength}px)` }, { filter: "blur(0px)", ease: "none", stagger: 0.05, scrollTrigger: { ...scrollTrigger } });
      }
    },
    { dependencies: [gatilho, inicio, fim, enableBlur, baseOpacity, blurStrength], scope: ref },
  );

  const Tag = tag;
  return (
    <Tag ref={ref} className={`scroll-reveal ${className}`}>
      {palavras}
    </Tag>
  );
};

export default ScrollReveal;
