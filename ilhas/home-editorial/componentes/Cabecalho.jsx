import { useEffect, useRef, useState } from "react";
import { NAVEGACAO } from "../cenas.js";

/*
 * CABEÇALHO.
 *
 * Claro sobre a paisagem da abertura; depois dela, ganha fundo de marfim para
 * não disputar com as fotografias. O menu abre o índice do Portal (sem JS, o
 * rodapé traz os mesmos caminhos). O botão da conta é o mesmo gatilho que
 * js/conta/conta.js procura em todas as páginas.
 */
export default function Cabecalho() {
  const [aberto, setAberto] = useState(false);
  const [solido, setSolido] = useState(false);
  const botaoMenu = useRef(null);
  const primeiroLink = useRef(null);

  useEffect(() => {
    const aoRolar = () => setSolido(window.scrollY > window.innerHeight * 0.85);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  useEffect(() => {
    if (!aberto) return undefined;
    primeiroLink.current?.focus();
    const aoTeclar = (evento) => {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botaoMenu.current?.focus();
    };
    window.addEventListener("keydown", aoTeclar);
    document.documentElement.classList.add("menu-aberto");
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.documentElement.classList.remove("menu-aberto");
    };
  }, [aberto]);

  const classes = ["cabecalho", solido && !aberto ? "cabecalho--solido" : "", aberto ? "cabecalho--menu" : ""].filter(Boolean).join(" ");

  return (
    <header className={classes}>
      <a className="cabecalho__marca" href="#inicio" aria-label="Instituto Potala — início">
        <img src="media/potala-mark-transparent.png" alt="" width="44" height="36" />
        <span>
          Instituto <strong>Potala</strong>
        </span>
      </a>
      <div className="cabecalho__acoes">
        <a className="cabecalho__botao cabecalho__botao--recepcao" href="recepcao.html">
          Recepção
        </a>
        <button
          ref={botaoMenu}
          type="button"
          className="cabecalho__botao"
          aria-expanded={aberto}
          aria-controls="menu-portal"
          onClick={() => setAberto((valor) => !valor)}
        >
          {aberto ? "Fechar" : "Menu"}
        </button>
        <button
          type="button"
          className="cabecalho__conta conta-gatilho"
          data-conta-gatilho=""
          data-keeps-expansion=""
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-label="Seu espaço no Potala"
          title="Seu espaço no Potala"
        >
          <svg className="conta-icone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.8c-3.6 0-7.4 1.8-7.4 4.6V20h14.8v-1.4c0-2.8-3.8-4.6-7.4-4.6Z" />
          </svg>
          <span className="conta-iniciais" aria-hidden="true"></span>
        </button>
      </div>
      <nav id="menu-portal" className="menu-portal" aria-label="Seções do Portal Potala" hidden={!aberto}>
        <ol>
          {NAVEGACAO.map((item, indice) => (
            <li key={item.href}>
              <a ref={indice === 0 ? primeiroLink : undefined} href={item.href}>
                <span aria-hidden="true">{String(indice + 1).padStart(2, "0")}</span>
                {item.rotulo}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </header>
  );
}
