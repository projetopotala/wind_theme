/*
 * A administracao e servida tanto em /admin quanto em /admin/. Com a barra final
 * o documento base passa a ser /admin/, e um caminho relativo guardado no
 * conteudo ("media/capa.webp") viraria /admin/media/capa.webp e daria 404.
 *
 * O endereco GUARDADO nao muda: so a leitura e ancorada na raiz do site.
 * Enderecos absolutos, protocolos, data: e ancoras passam intactos.
 */
export const enderecoDoSite = (caminho) => {
  const valor = String(caminho ?? "").trim();
  if (!valor || /^(?:[a-z]+:|\/\/|\/|#|data:)/i.test(valor)) return valor;
  return `/${valor}`;
};
