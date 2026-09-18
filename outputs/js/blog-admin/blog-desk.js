/*
 * O que a mesa lê do banco ao entrar.
 *
 * Os textos e a configuração sustentam a tela: sem eles, o erro aparece
 * inteiro. Leituras, comentários, inscrições e categorias são complementos —
 * se um falhar, a mesa abre assim mesmo e diz o que não carregou, em vez de
 * mostrar zero como se fosse verdade.
 */
import { CATEGORIAS_PADRAO } from "../blog/blog-remoto.js";

export async function carregarDadosDaMesa(repositorio) {
  const partes = [
    ["registros", "blog.posts", () => repositorio.listar()],
    ["configuracao", "blog.configuracao", () => repositorio.lerConfiguracao()],
    ["categorias", "blog.categorias", () => repositorio.listarCategorias()],
    ["leituras", "blog.leituras", () => repositorio.leituras()],
    ["comentarios", "blog.comentarios", () => repositorio.comentarios()],
    ["inscritos", "blog.inscritos", () => repositorio.inscritos()],
  ];
  const resultados = await Promise.allSettled(partes.map(([, , ler]) => Promise.resolve().then(ler)));
  if (resultados[0].status === "rejected") throw resultados[0].reason;
  if (resultados[1].status === "rejected") throw resultados[1].reason;
  const reserva = { categorias: [...CATEGORIAS_PADRAO], leituras: {}, comentarios: [], inscritos: 0 };
  const dados = { falhas: [] };
  partes.forEach(([chave, contexto], indice) => {
    const resultado = resultados[indice];
    if (resultado.status === "fulfilled") dados[chave] = resultado.value;
    else {
      dados[chave] = reserva[chave];
      dados.falhas.push({ erro: resultado.reason, contexto });
    }
  });
  return dados;
}
