import { CONTATO, NAVEGACAO } from "../cenas.js";

/*
 * RODAPÉ: onde estamos e todos os caminhos do Portal. Também é a navegação de
 * quem chega sem JavaScript, já que o menu do cabeçalho depende dele.
 */
export default function Rodape() {
  return (
    <footer className="rodape" id="contato">
      <div className="rodape__marca">
        <img src="media/potala-mark-transparent.png" alt="" width="64" height="53" loading="lazy" decoding="async" />
        <p>
          Instituto Cultural <strong>Potala</strong>
          <span>Desde 2012</span>
        </p>
      </div>
      <address className="rodape__contato">
        <p className="rodape__rotulo">Venha, escreva ou ligue</p>
        <p className="rodape__endereco">
          {CONTATO.endereco[0]}
          <br />
          {CONTATO.endereco[1]}
        </p>
        <ul>
          {CONTATO.canais.map((canal) => (
            <li key={canal.rotulo}>
              <a href={canal.href} rel={canal.href.startsWith("http") ? "noreferrer" : undefined}>
                <small>{canal.rotulo}</small>
                {canal.valor}
              </a>
            </li>
          ))}
        </ul>
      </address>
      <nav className="rodape__nav" aria-label="Portal Potala">
        <p className="rodape__rotulo">Pelo Portal</p>
        <ul>
          {NAVEGACAO.map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.rotulo}</a>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
