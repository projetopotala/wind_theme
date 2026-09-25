/*
 * Uma fotografia com enquadramento por faixa de largura: `--foco` no
 * computador, `--foco-celular` no telefone (object-position no CSS). Assim o
 * recorte da máscara nunca corta o rosto de quem está na foto.
 */
export default function Foto({ imagem, className, prioridade = false, children }) {
  return (
    <figure className={className}>
      <img
        src={imagem.src}
        alt={imagem.alt}
        width={imagem.largura}
        height={imagem.altura}
        loading={prioridade ? "eager" : "lazy"}
        decoding="async"
        style={{ "--foco": imagem.foco.computador, "--foco-celular": imagem.foco.celular }}
      />
      {children}
    </figure>
  );
}
