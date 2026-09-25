import Cabecalho from "./componentes/Cabecalho.jsx";
import Abertura from "./componentes/Abertura.jsx";
import Cena from "./componentes/Cena.jsx";
import Rodape from "./componentes/Rodape.jsx";
import { CENAS } from "./cenas.js";

export default function Home() {
  return (
    <>
      <Cabecalho />
      <main id="conteudo" className="ensaio">
        <Abertura />
        {CENAS.map((cena) => (
          <Cena key={cena.id} cena={cena} />
        ))}
      </main>
      <Rodape />
    </>
  );
}
