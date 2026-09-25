import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { CONSULTAS } from "./consultas.js";
import { coreografar } from "./coreografias.js";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/*
 * Liga uma cena à sua coreografia, uma vez por leitura da página
 * (computador ou celular). Com movimento reduzido nenhuma das duas casa e
 * nada é criado; ao trocar de leitura (girar o telefone, redimensionar), o
 * matchMedia desfaz a anterior antes de montar a nova.
 */
export function useCena(ref, variante) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ computador: CONSULTAS.computador, celular: CONSULTAS.celular }, ({ conditions }) => {
        if (!conditions.computador && !conditions.celular) return;
        coreografar(ref.current, variante, { celular: conditions.celular });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
}
