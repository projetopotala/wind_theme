/*
 * O ROTEADOR DO MEU POTALA.
 *
 * Um documento só, e as telas trocam sem recarregar. O endereço acompanha cada
 * troca — /meu-potala/salvos é um endereço de verdade: dá para favoritar,
 * compartilhar e voltar pelo botão do navegador. O servidor e a Vercel devolvem
 * o mesmo documento para qualquer rota daqui, e é este arquivo que decide qual
 * tela desenhar.
 *
 * As regras de rota são funções puras, testáveis sem navegador. O que toca
 * `history` e eventos fica em `criarRoteador`.
 */

export const BASE = "/meu-potala";

export const ROTAS = Object.freeze([
  Object.freeze({ nome: "inicio", caminho: "", titulo: "Meu Potala", rotulo: "Início" }),
  Object.freeze({ nome: "perfil", caminho: "perfil", titulo: "Meu perfil", rotulo: "Perfil" }),
  Object.freeze({ nome: "cursos", caminho: "cursos", titulo: "Meus cursos", rotulo: "Cursos" }),
  Object.freeze({ nome: "agenda", caminho: "agenda", titulo: "Minha agenda", rotulo: "Agenda" }),
  Object.freeze({ nome: "salvos", caminho: "salvos", titulo: "Salvos", rotulo: "Salvos" }),
  Object.freeze({ nome: "historico", caminho: "historico", titulo: "Histórico", rotulo: "Histórico" }),
  Object.freeze({ nome: "acompanhando", caminho: "acompanhando", titulo: "Acompanhando", rotulo: "Acompanhando" }),
  Object.freeze({ nome: "notificacoes", caminho: "notificacoes", titulo: "Notificações", rotulo: "Notificações" }),
  Object.freeze({ nome: "configuracoes", caminho: "configuracoes", titulo: "Configurações", rotulo: "Configurações" }),
]);

/* As abas do cabeçalho. Notificações e Configurações ficam fora: têm lugar próprio. */
export const ROTAS_DA_NAVEGACAO = Object.freeze(["inicio", "perfil", "cursos", "agenda", "salvos", "historico", "acompanhando"]);

export function caminhoDa(nome) {
  const rota = ROTAS.find((candidata) => candidata.nome === nome);
  if (!rota) throw new TypeError(`Rota desconhecida: ${nome}`);
  return rota.caminho ? `${BASE}/${rota.caminho}` : BASE;
}

export function resolverRota(pathname = "") {
  let limpo;
  try {
    limpo = decodeURIComponent(String(pathname).split(/[?#]/)[0]);
  } catch {
    return { rota: null, encontrada: false };
  }
  limpo = limpo.replace(/\/+$/, "");
  if (limpo !== BASE && !limpo.startsWith(`${BASE}/`)) return { rota: null, encontrada: false, fora: true };
  const resto = limpo.slice(BASE.length).replace(/^\/+/, "");
  const rota = ROTAS.find((candidata) => candidata.caminho === resto);
  return rota ? { rota, encontrada: true } : { rota: null, encontrada: false };
}

/*
 * O clique vira navegação interna só quando é um clique comum num link daqui.
 *
 * Ctrl, Cmd, Shift, botão do meio e target="_blank" são a pessoa pedindo outra
 * aba ou janela — interceptar seria desobedecer. Âncoras para o mesmo lugar
 * (#conteudo) também passam: são o link de pular para o conteúdo, e tratá-las
 * como rota apagaria o salto.
 */
export function deveInterceptar(
  { botao = 0, meta = false, ctrl = false, shift = false, alt = false, padraoImpedido = false } = {},
  { href = "", target = "", download = false, enderecoAtual = "" } = {},
) {
  if (padraoImpedido || botao !== 0 || meta || ctrl || shift || alt) return false;
  if (download || (target && target !== "_self")) return false;
  let destino;
  let atual;
  try {
    atual = new URL(enderecoAtual);
    destino = new URL(href, atual);
  } catch {
    return false;
  }
  if (destino.origin !== atual.origin) return false;
  if (destino.hash && destino.pathname === atual.pathname && destino.search === atual.search) return false;
  return resolverRota(destino.pathname).encontrada;
}

export function criarRoteador({ janela = window, documento = document, aoMudar } = {}) {
  if (typeof aoMudar !== "function") throw new TypeError("O roteador precisa saber o que fazer a cada troca.");
  const atual = () => resolverRota(janela.location.pathname);

  function navegar(caminho, { substituir = false } = {}) {
    const agora = `${janela.location.pathname}${janela.location.search}`;
    if (caminho !== agora) janela.history[substituir ? "replaceState" : "pushState"]({}, "", caminho);
    aoMudar(atual(), { origem: substituir ? "substituicao" : "navegacao" });
  }

  const aoClicar = (evento) => {
    const ancora = evento.target.closest?.("a[href]");
    /*
     * `data-recarregar` pede a página inteira de novo. É o que liga e desliga a
     * demonstração, decidida uma vez só, quando a conta nasce: trocada por
     * dentro da SPA, a mudança não teria efeito nenhum.
     */
    if (!ancora || ancora.hasAttribute("data-recarregar")) return;
    const pode = deveInterceptar(
      { botao: evento.button, meta: evento.metaKey, ctrl: evento.ctrlKey, shift: evento.shiftKey, alt: evento.altKey, padraoImpedido: evento.defaultPrevented },
      { href: ancora.getAttribute("href"), target: ancora.getAttribute("target") || "", download: ancora.hasAttribute("download"), enderecoAtual: janela.location.href },
    );
    if (!pode) return;
    evento.preventDefault();
    const destino = new URL(ancora.href, janela.location.href);
    /*
     * `data-substituir` troca o endereço sem empilhar: é o que os filtros de
     * Salvos usam. Trocar três vezes de filtro não deve exigir três toques em
     * Voltar para sair da tela.
     */
    navegar(`${destino.pathname}${destino.search}`, { substituir: ancora.hasAttribute("data-substituir") });
  };

  const aoVoltar = () => aoMudar(atual(), { origem: "historico" });

  return {
    iniciar() {
      documento.addEventListener("click", aoClicar);
      janela.addEventListener("popstate", aoVoltar);
      aoMudar(atual(), { origem: "inicial" });
    },
    navegar,
    atual,
    destroy() {
      documento.removeEventListener("click", aoClicar);
      janela.removeEventListener("popstate", aoVoltar);
    },
  };
}
