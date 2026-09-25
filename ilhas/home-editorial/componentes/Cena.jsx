import { useRef } from "react";
import SplitText from "../reactbits/SplitText.jsx";
import Foto from "./Foto.jsx";
import { useCena } from "../movimento/useCena.js";

/*
 * UMA CENA DO ENSAIO.
 *
 * Camadas, de trás para a frente: fotografia principal (com a máscara),
 * detalhe e recorte (que atravessam a borda da principal), moldura fina e o
 * texto — número, marcador, título, descrição e caminhos. A ordem no HTML é a
 * ordem de leitura do celular: imagem, título, texto, ação.
 */
export default function Cena({ cena }) {
  const secao = useRef(null);
  useCena(secao, cena.variante);
  const tituloId = `${cena.id}-titulo`;

  return (
    <section ref={secao} id={cena.id} className={`cena cena--${cena.variante} cena--${cena.lado}`} aria-labelledby={tituloId}>
      <div className="cena__palco">
        <Foto className="cena__foto" imagem={cena.principal}>
          {cena.variante === "painel" ? <span className="cena__cortina" aria-hidden="true" /> : null}
        </Foto>
        {cena.detalhe ? <Foto className="cena__detalhe" imagem={cena.detalhe} /> : null}
        <Foto className="cena__recorte" imagem={cena.recorte} />
        <span className="cena__moldura" aria-hidden="true" />
        <div className="cena__texto">
          <span className="cena__numero" aria-hidden="true">
            {cena.numero}
          </span>
          <p className="cena__kicker">{cena.kicker}</p>
          <SplitText
            tag="h2"
            id={tituloId}
            className="cena__titulo"
            text={cena.titulo}
            splitType="words"
            delay={45}
            duration={0.9}
            from={{ opacity: 0, y: 36 }}
            to={{ opacity: 1, y: 0 }}
            gatilho=".cena"
            inicio="top 20%"
          />
          <p className="cena__descricao">{cena.texto}</p>
          <ul className="cena__links">
            {cena.links.map((link) => (
              <li key={link.href}>
                <a className="botao-linha" href={link.href}>
                  {link.rotulo} <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
          {cena.escolha ? (
            <div className="cena__escolha">
              <p>{cena.escolha.pergunta}</p>
              <a className="botao-cheio" href={cena.escolha.principal.href}>
                {cena.escolha.principal.rotulo} <span aria-hidden="true">→</span>
              </a>
              <a className="botao-linha" href={cena.escolha.secundaria.href}>
                {cena.escolha.secundaria.rotulo}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
