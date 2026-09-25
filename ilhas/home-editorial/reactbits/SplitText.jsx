/*
 * SplitText — React Bits (https://reactbits.dev), por David Haz.
 * MIT + Commons Clause: ver ./LICENSE.md. Adaptado para o Potala:
 *
 * - `gatilho` (seletor do ancestral), `inicio` e `alternar`: o título pode
 *   obedecer à cena que o contém (e não à própria posição, que num palco fixo
 *   não muda), e volta ao estado inicial quando se rola para cima (o original
 *   animava uma vez só).
 * - Cada instância desfaz só os próprios gatilhos (o original matava todos os
 *   ScrollTriggers da página ao desmontar).
 * - Com movimento reduzido, o texto fica como veio do HTML.
 * - `data-pronto` marca quando a divisão terminou, para o CSS poder esconder o
 *   título só até esse instante.
 */
import { useRef, useEffect, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText as GSAPSplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { movimentoReduzido } from "../movimento/consultas.js";

gsap.registerPlugin(ScrollTrigger, GSAPSplitText, useGSAP);

const SplitText = ({
  text,
  className = "",
  delay = 50,
  duration = 1.1,
  ease = "power3.out",
  splitType = "words",
  from = { opacity: 0, y: 40 },
  to = { opacity: 1, y: 0 },
  tag = "p",
  id,
  gatilho,
  inicio = "top 85%",
  alternar = "play none none reverse",
}) => {
  const ref = useRef(null);
  const [fontesProntas, setFontesProntas] = useState(false);

  /* `fonts.ready` resolve na hora quando as fontes já chegaram: um só
     caminho, sempre assíncrono (o original chamava setState dentro do efeito). */
  useEffect(() => {
    let ativo = true;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (ativo) setFontesProntas(true);
    });
    return () => {
      ativo = false;
    };
  }, []);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !text || !fontesProntas) return;
      if (movimentoReduzido()) {
        el.dataset.pronto = "";
        return;
      }

      const divisao = new GSAPSplitText(el, {
        type: splitType,
        smartWrap: true,
        wordsClass: "split-word",
        charsClass: "split-char",
        linesClass: "split-line",
        reduceWhiteSpace: false,
      });
      const alvos = splitType.includes("chars") ? divisao.chars : splitType.includes("words") ? divisao.words : divisao.lines;
      gsap.fromTo(alvos, { ...from }, {
        ...to,
        duration,
        ease,
        stagger: delay / 1000,
        force3D: true,
        scrollTrigger: {
          trigger: (gatilho && el.closest(gatilho)) || el,
          start: inicio,
          toggleActions: alternar,
        },
      });
      el.dataset.pronto = "";

      return () => {
        divisao.revert();
        delete el.dataset.pronto;
      };
    },
    { dependencies: [gatilho, text, delay, duration, ease, splitType, JSON.stringify(from), JSON.stringify(to), inicio, alternar, fontesProntas], scope: ref, revertOnUpdate: true },
  );

  const Tag = tag;
  return (
    <Tag ref={ref} id={id} className={`split-parent ${className}`}>
      {text}
    </Tag>
  );
};

export default SplitText;
