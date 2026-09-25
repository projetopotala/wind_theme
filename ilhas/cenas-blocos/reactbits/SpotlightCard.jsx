/*
 * SpotlightCard — React Bits (https://reactbits.dev), por David Haz.
 * MIT + Commons Clause: ver ./LICENSE.md. Adaptado para o Potala:
 *
 * - `as`: o cartão pode ser o próprio link (o bloco inteiro é clicável), e
 *   os demais atributos (href, aria-*) passam adiante.
 * - A luz segue o ponteiro (pointermove, não só o mouse) e também acende com
 *   o foco do teclado, centrada no cartão.
 * - A cor da luz fica no CSS (--spotlight-color), como tudo o que é aparência;
 *   `spotlightColor` ainda pode trocá-la por cartão.
 * - Encaminha o ref e os eventos de ponteiro a quem o usa (o bloco anima o
 *   ícone com GSAP nos mesmos eventos).
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import "./SpotlightCard.css";

const SpotlightCard = forwardRef(function SpotlightCard(
  { as: Elemento = "div", children, className = "", spotlightColor, onPointerMove, style, ...resto },
  refExterno,
) {
  const divRef = useRef(null);
  useImperativeHandle(refExterno, () => divRef.current);

  const handleMouseMove = (evento) => {
    const cartao = divRef.current;
    if (cartao) {
      const rect = cartao.getBoundingClientRect();
      cartao.style.setProperty("--mouse-x", `${evento.clientX - rect.left}px`);
      cartao.style.setProperty("--mouse-y", `${evento.clientY - rect.top}px`);
    }
    onPointerMove?.(evento);
  };

  return (
    <Elemento
      ref={divRef}
      onPointerMove={handleMouseMove}
      className={`card-spotlight ${className}`.trim()}
      style={spotlightColor ? { ...style, "--spotlight-color": spotlightColor } : style}
      {...resto}
    >
      {children}
    </Elemento>
  );
});

export default SpotlightCard;
