import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import SplitText from "../reactbits/SplitText.jsx";
import ScrollReveal from "../reactbits/ScrollReveal.jsx";
import NevoaTres from "./NevoaTres.jsx";
import Foto from "./Foto.jsx";
import { ABERTURA } from "../cenas.js";
import { CONSULTAS } from "../movimento/consultas.js";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/*
 * ABERTURA — "Instituto Potala".
 *
 * Ao chegar: uma faixa da paisagem se abre até a tela inteira (CSS, em
 * .abertura__janela — funciona antes mesmo do JavaScript terminar) e o nome
 * sobe letra a letra (SplitText).
 *
 * Com a rolagem, o palco fica preso por uma tela:
 *   - o panorama assenta devagar (escala e um deslocamento menor que o da
 *     página, que dá profundidade) e a névoa do three.js se dissipa;
 *   - o recorte da arquitetura é descoberto de baixo para cima;
 *   - a moldura fina anda em outra velocidade;
 *   - a frase ganha nitidez palavra por palavra (ScrollReveal).
 * Na saída, o panorama é recortado por baixo enquanto a cena 01 sobe por
 * cima — uma passagem, não um corte. Subir refaz tudo ao contrário.
 */
export default function Abertura() {
  const secao = useRef(null);
  const progresso = useRef(0);
  const { panorama, recorte } = ABERTURA;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ computador: CONSULTAS.computador, celular: CONSULTAS.celular }, ({ conditions }) => {
        const { computador, celular } = conditions;
        if (!computador && !celular) return;
        const q = gsap.utils.selector(secao);

        gsap
          .timeline({
            defaults: { ease: "none", duration: 1 },
            scrollTrigger: {
              trigger: secao.current,
              start: "top top",
              end: "bottom bottom",
              scrub: 0.4,
              onUpdate: (gatilho) => {
                progresso.current = gatilho.progress;
              },
            },
          })
          .fromTo(q(".abertura__panorama img"), { scale: 1.1, yPercent: 0 }, { scale: 1, yPercent: 4 }, 0)
          .fromTo(q(".abertura__moldura"), { y: 0 }, { y: celular ? -36 : -150 }, 0)
          .fromTo(q(".abertura__texto"), { y: 0 }, { y: celular ? -16 : -48 }, 0)
          .fromTo(
            q(".abertura__recorte"),
            { clipPath: "inset(100% 0% 0% 0%)", y: celular ? 40 : 90 },
            { clipPath: "inset(0% 0% 0% 0%)", y: celular ? 0 : -30, ease: "power2.out", duration: 0.6 },
            0.1,
          );

        gsap
          .timeline({
            defaults: { ease: "none", duration: 1, immediateRender: false },
            scrollTrigger: { trigger: secao.current, start: "bottom bottom", end: "bottom top", scrub: 0.4 },
          })
          .fromTo(q(".abertura__panorama"), { clipPath: "inset(0% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 58% 0%)" }, 0)
          .fromTo(q(".abertura__texto, .abertura__moldura"), { opacity: 1 }, { opacity: 0, duration: 0.55 }, 0)
          .fromTo(q(".abertura__recorte"), { yPercent: 0 }, { yPercent: -70 }, 0);
      });
      return () => mm.revert();
    },
    { scope: secao },
  );

  return (
    <section ref={secao} className="abertura" id={ABERTURA.id} aria-labelledby="abertura-titulo">
      <div className="abertura__palco">
        <div className="abertura__janela">
          <div className="abertura__panorama">
            <picture>
              <source media="(max-width: 760px)" srcSet={panorama.srcCelular} width="1080" height="1440" />
              <img
                src={panorama.src}
                alt={panorama.alt}
                width={panorama.largura}
                height={panorama.altura}
                fetchPriority="high"
                decoding="async"
                style={{ "--foco": panorama.foco.computador, "--foco-celular": panorama.foco.celular }}
              />
            </picture>
          </div>
          <NevoaTres progresso={progresso} />
          <div className="abertura__sombra" aria-hidden="true" />
        </div>
        <span className="abertura__moldura" aria-hidden="true" />
        <Foto className="abertura__recorte" imagem={recorte} />
        <div className="abertura__texto">
          <p className="abertura__kicker">{ABERTURA.kicker}</p>
          <SplitText
            tag="h1"
            id="abertura-titulo"
            className="abertura__titulo"
            text={ABERTURA.titulo}
            splitType="chars"
            delay={45}
            duration={1.4}
            from={{ opacity: 0, y: 70 }}
            to={{ opacity: 1, y: 0 }}
            inicio="top bottom"
            alternar="play none none none"
          />
          <ScrollReveal className="abertura__frase" gatilho=".abertura" inicio="top 60%" fim="top -45%">
            {ABERTURA.frase}
          </ScrollReveal>
          <a className="botao-linha botao-linha--claro" href={ABERTURA.acao.href}>
            {ABERTURA.acao.rotulo} <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
