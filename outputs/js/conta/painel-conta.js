/*
 * O PAINEL DA CONTA: "SEU ESPAÇO NO POTALA".
 *
 * Um painel que se desdobra a partir do botão, e não um modal no centro da
 * tela nem uma página de login. A paisagem continua visível atrás dele, e a
 * pessoa não sente que saiu da Travessia para entrar num sistema.
 *
 * Começa pequeno — duas ações — e é a própria janela que se transforma no
 * formulário escolhido. A altura acompanha a troca, e o conteúdo novo entra
 * esmaecendo, para que "Entrar" pareça continuação do mesmo gesto e não uma
 * tela nova.
 *
 * Detalhes que carregam decisão:
 *
 * - Clicar fora fecha a apresentação e o menu, mas NÃO fecha um formulário.
 *   Quem digitou metade do cadastro e tocou na paisagem para baixar o teclado
 *   perderia tudo.
 * - Ao fechar, o miolo é apagado. Um formulário escondido com a senha digitada
 *   continuaria no DOM para qualquer script da página ler.
 * - O foco fica preso no painel enquanto ele está aberto, e volta ao botão que o
 *   abriu quando fecha.
 */

import { mensagemDoErro } from "./mensagens.js";
import { escaparHtml } from "./html.js";
import { iniciaisDe, nomeDeExibicao } from "./modelos.js";
import { caminhoDa } from "./spa/roteador.js";

export const ESTADOS_DO_PAINEL = Object.freeze([
  "intro",
  "entrar",
  "criar",
  "recuperar",
  "recuperacao-enviada",
  "confirmar-email",
  "menu",
]);

/* Estados que um clique fora pode dispensar: nenhum deles guarda digitação. */
const DESCARTAVEIS = new Set(["intro", "menu", "recuperacao-enviada", "confirmar-email"]);

/* O bastante para o formulário de cadastro inteiro, com a mensagem de erro, sem rolar. */
const ALTURA_UTIL_DO_PAINEL = 420;

const OLHO = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z\"/></svg>";

const titulo = (texto) => `<h2 id="conta-painel-titulo" class="conta-titulo">${escaparHtml(texto)}</h2>`;
const contextoDe = (texto) => (texto ? `<p class="conta-contexto">${escaparHtml(texto)}</p>` : "");
const voltar = (destino) => `<button type="button" class="conta-voltar" data-conta-ir="${destino}"><span aria-hidden="true">←</span> Voltar</button>`;
const status = () => "<p class=\"conta-status\" data-conta-status role=\"alert\" aria-live=\"assertive\"></p>";

function campo({ rotulo, nome, tipo = "text", autocomplete, dica = "", extra = "" }) {
  const idDica = dica ? `conta-dica-${nome}` : "";
  const entrada = `<input type="${tipo}" name="${nome}" id="conta-campo-${nome}" autocomplete="${autocomplete}" required${idDica ? ` aria-describedby="${idDica}"` : ""}${extra}>`;
  const miolo = tipo === "password"
    ? `<span class="conta-senha">${entrada}<button type="button" class="conta-ver-senha" data-conta-ver-senha aria-pressed="false" aria-label="Mostrar senha">${OLHO}</button></span>`
    : entrada;
  return `<div class="conta-campo"><label for="conta-campo-${nome}">${escaparHtml(rotulo)}</label>${miolo}${dica ? `<small id="${idDica}">${escaparHtml(dica)}</small>` : ""}</div>`;
}

/**
 * O miolo do painel para cada estado. Puro: o mesmo estado dá sempre a mesma
 * marcação, e é isso que os testes conferem.
 */
export function renderizarPainel(estadoDoPainel, {
  contexto = "",
  google = false,
  emailPendente = "",
  usuario = null,
  perfil = null,
  naoLidas = 0,
  demonstracao = false,
} = {}) {
  switch (estadoDoPainel) {
    case "entrar":
      return `${voltar("intro")}${titulo("Entrar")}${contextoDe(contexto)}
        <form class="conta-form" data-conta-form="entrar" novalidate>
          ${campo({ rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "email", extra: " inputmode=\"email\"" })}
          ${campo({ rotulo: "Senha", nome: "senha", tipo: "password", autocomplete: "current-password" })}
          ${status()}
          <button type="submit" class="conta-primario">Entrar</button>
        </form>
        <button type="button" class="conta-link conta-esqueci" data-conta-ir="recuperar">Esqueci minha senha</button>
        <div data-conta-google-lugar>${google ? blocoGoogle() : ""}</div>
        <p class="conta-rodape">Ainda não tem conta? <button type="button" class="conta-link" data-conta-ir="criar">Criar uma conta</button></p>`;

    case "criar":
      return `${voltar("intro")}${titulo("Criar uma conta")}${contextoDe(contexto)}
        <form class="conta-form" data-conta-form="criar" novalidate>
          ${campo({ rotulo: "Como podemos te chamar", nome: "nome", autocomplete: "name", extra: " maxlength=\"80\"" })}
          ${campo({ rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "email", extra: " inputmode=\"email\"" })}
          ${campo({ rotulo: "Senha", nome: "senha", tipo: "password", autocomplete: "new-password", dica: "Pelo menos 8 caracteres.", extra: " minlength=\"8\"" })}
          ${campo({ rotulo: "Confirmar senha", nome: "confirmacao", tipo: "password", autocomplete: "new-password" })}
          ${status()}
          <button type="submit" class="conta-primario">Criar conta</button>
        </form>
        <p class="conta-nota">Pedimos só o necessário para guardar a sua jornada. Enviaremos um link para confirmar o e-mail.</p>
        <p class="conta-rodape">Já tem conta? <button type="button" class="conta-link" data-conta-ir="entrar">Entrar</button></p>`;

    case "recuperar":
      return `${voltar("entrar")}${titulo("Recuperar acesso")}
        <p class="conta-texto">Diga o e-mail da sua conta e enviaremos um link para criar uma senha nova.</p>
        <form class="conta-form" data-conta-form="recuperar" novalidate>
          ${campo({ rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "email", extra: " inputmode=\"email\"" })}
          ${status()}
          <button type="submit" class="conta-primario">Enviar link</button>
        </form>`;

    /*
     * A resposta NÃO diz se a conta existe. Dizer "não encontramos este e-mail"
     * ensinaria a qualquer um quais endereços têm conta no Potala.
     */
    case "recuperacao-enviada":
      return `${titulo("Confira sua caixa de entrada")}
        <p class="conta-texto">Se houver uma conta com esse e-mail, o link chega em alguns minutos. Ele leva direto para a criação da senha nova.</p>
        <button type="button" class="conta-secundario" data-conta-ir="entrar">Voltar para entrar</button>`;

    case "confirmar-email":
      return `${titulo("Confirme seu e-mail")}
        <p class="conta-texto">Enviamos um link para <strong>${escaparHtml(emailPendente || "o seu e-mail")}</strong>. Ao abrir, você volta direto para o seu espaço.</p>
        <p class="conta-nota">Não chegou? Veja a caixa de spam — o remetente é o Instituto Potala.</p>
        <button type="button" class="conta-primario" data-conta-fechar>Entendi</button>`;

    case "menu": {
      const nome = nomeDeExibicao(usuario, perfil);
      const avatar = perfil?.avatarUrl
        ? `<img src="${escaparHtml(perfil.avatarUrl)}" alt="" decoding="async">`
        : escaparHtml(iniciaisDe(nome, usuario?.email));
      const aviso = demonstracao
        ? "<p class=\"conta-aviso\">Seus dados aparecem em modo de demonstração enquanto o banco pessoal não é conectado.</p>"
        : "";
      const item = (rota, rotulo, extra = "") => `<li><a href="${caminhoDa(rota)}" data-conta-navegar>${escaparHtml(rotulo)}${extra}</a></li>`;
      const contador = naoLidas ? ` <span class="conta-contador" aria-label="${naoLidas} ${naoLidas === 1 ? "novo" : "novos"}">${naoLidas}</span>` : "";
      return `<div class="conta-quem">
          <span class="conta-avatar" aria-hidden="true">${avatar}</span>
          <div><h2 id="conta-painel-titulo" class="conta-titulo conta-titulo-menor">${escaparHtml(nome)}</h2><p class="conta-texto">Continue sua jornada.</p></div>
        </div>
        ${aviso}
        <nav aria-label="Seu espaço no Potala">
          <a class="conta-destaque" href="${caminhoDa("inicio")}" data-conta-navegar>Meu Potala <span aria-hidden="true">→</span></a>
          <ul class="conta-menu">
            ${item("perfil", "Meu perfil")}
            ${item("cursos", "Meus cursos")}
            ${item("agenda", "Minha agenda")}
            ${item("salvos", "Salvos")}
            ${item("historico", "Histórico")}
            ${item("acompanhando", "Acompanhando")}
            ${item("notificacoes", "Notificações", contador)}
          </ul>
          <div class="conta-menu-pe">
            <a href="${caminhoDa("configuracoes")}" data-conta-navegar>Configurações</a>
            <button type="button" class="conta-link" data-conta-sair>Sair</button>
          </div>
        </nav>`;
    }

    default:
      return `${titulo("Seu espaço no Potala")}${contextoDe(contexto)}
        <p class="conta-texto">Guarde aquilo que encontra pelo caminho e continue sua jornada quando quiser.</p>
        <div class="conta-acoes">
          <button type="button" class="conta-primario" data-conta-ir="entrar">Entrar</button>
          <button type="button" class="conta-secundario" data-conta-ir="criar">Criar uma conta</button>
        </div>
        <div class="conta-visita">
          <a class="conta-visita-botao" href="${caminhoDa("inicio")}?demo=visita" data-recarregar>Ver a página sem conta <span aria-hidden="true">→</span></a>
          <p class="conta-nota">Com dados de exemplo, só neste navegador: sem cadastro e sem entrar.</p>
        </div>`;
  }
}

function blocoGoogle() {
  return "<div class=\"conta-divisor\"><span>ou</span></div><button type=\"button\" class=\"conta-secundario\" data-conta-google>Continuar com Google</button>";
}

const FOCALIZAVEIS = "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";

export function montarPainelConta({ documento = document, sessao, janela = window, obterNaoLidas = () => 0 } = {}) {
  if (!sessao) throw new TypeError("O painel precisa da sessão.");

  const raiz = documento.createElement("div");
  raiz.className = "conta-painel";
  raiz.hidden = true;
  raiz.setAttribute("role", "dialog");
  raiz.setAttribute("aria-modal", "true");
  raiz.setAttribute("aria-labelledby", "conta-painel-titulo");
  /* Um clique aqui dentro não pode fechar um bloco aberto da Travessia. */
  raiz.setAttribute("data-keeps-expansion", "");
  raiz.innerHTML = "<div class=\"conta-painel-miolo\" data-conta-miolo></div>";

  const veu = documento.createElement("div");
  veu.className = "conta-veu";
  veu.hidden = true;
  veu.setAttribute("data-keeps-expansion", "");

  documento.body.append(veu, raiz);
  const miolo = raiz.querySelector("[data-conta-miolo]");

  let aberto = false;
  let atual = "intro";
  let contexto = "";
  let origem = null;
  let google = false;
  let provedoresPedidos = false;
  let temporizador = 0;
  const aoFecharOuvintes = new Set();

  const reduzido = () => Boolean(janela.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  function dadosDoRender() {
    const estado = sessao.obter();
    return {
      contexto,
      google,
      emailPendente: estado.emailPendente,
      usuario: estado.usuario,
      perfil: estado.perfil,
      naoLidas: obterNaoLidas(),
      demonstracao: estado.demonstracao || estado.dadosEmReserva,
    };
  }

  function sincronizarGatilhos() {
    for (const botao of documento.querySelectorAll("[data-conta-gatilho]")) {
      botao.setAttribute("aria-expanded", String(aberto));
    }
  }

  /*
   * O PAINEL SE DESDOBRA A PARTIR DO BOTÃO DA CONTA — mesmo quando quem o abriu
   * foi outro elemento, como o "Salvar" no meio de um artigo ou o "Entrar" no
   * corpo do Meu Potala. Ancorado nesses, ele nascia no pé da tela sem altura
   * para o formulário: no telefone, sobravam dois pixels de painel.
   *
   * E se nem o botão deixa espaço — tela baixa, teclado aberto —, o painel sobe
   * o quanto precisar para caber. Cobrir o botão é melhor que cortar o formulário.
   */
  function botaoVisivel() {
    const candidatos = [origem, ...documento.querySelectorAll("[data-conta-gatilho]")];
    return candidatos.find((elemento) => elemento?.isConnected
      && elemento.matches?.("[data-conta-gatilho]")
      && elemento.getClientRects().length
      && janela.getComputedStyle?.(elemento).visibility !== "hidden") || null;
  }

  function posicionar() {
    const caixa = botaoVisivel()?.getBoundingClientRect();
    const lado = caixa && caixa.left + caixa.width / 2 < janela.innerWidth / 2 ? "esquerda" : "direita";
    const abaixoDoBotao = caixa ? caixa.bottom + 10 : 72;
    const topo = Math.max(12, Math.min(abaixoDoBotao, janela.innerHeight - ALTURA_UTIL_DO_PAINEL));
    const lateral = caixa ? (lado === "esquerda" ? caixa.left : janela.innerWidth - caixa.right) : 16;
    raiz.dataset.lado = lado;
    raiz.style.setProperty("--conta-topo", `${Math.round(topo)}px`);
    raiz.style.setProperty("--conta-lateral", `${Math.max(12, Math.round(lateral))}px`);
  }

  function focarPrimeiro() {
    const alvo = miolo.querySelector("input") || miolo.querySelector(FOCALIZAVEIS);
    alvo?.focus?.({ preventScroll: true });
  }

  function desenhar(proximo, { animar = true } = {}) {
    atual = ESTADOS_DO_PAINEL.includes(proximo) ? proximo : "intro";
    const mover = animar && aberto && !reduzido();
    const alturaAntes = raiz.offsetHeight;
    miolo.innerHTML = renderizarPainel(atual, dadosDoRender());

    if (mover) {
      /*
       * A altura anda de um valor medido para outro, e só então é solta. Animar
       * de "auto" para "auto" não anima nada: o navegador não interpola o que
       * não sabe medir.
       */
      raiz.style.height = `${alturaAntes}px`;
      const alvo = raiz.scrollHeight;
      janela.requestAnimationFrame(() => {
        raiz.style.height = `${alvo}px`;
      });
      janela.clearTimeout(temporizador);
      temporizador = janela.setTimeout(() => {
        raiz.style.height = "";
      }, 360);
      miolo.classList.remove("is-entrando");
      void miolo.offsetWidth;
      miolo.classList.add("is-entrando");
    }
    focarPrimeiro();
  }

  async function pedirProvedores() {
    if (provedoresPedidos) return;
    provedoresPedidos = true;
    const resposta = await sessao.provedores();
    google = resposta?.google === true;
    const lugar = miolo.querySelector("[data-conta-google-lugar]");
    if (google && lugar && !lugar.innerHTML.trim()) lugar.innerHTML = blocoGoogle();
  }

  function estadoInicial() {
    const { status } = sessao.obter();
    if (status === "autenticado") return "menu";
    if (status === "aguardando-confirmacao") return "confirmar-email";
    return "intro";
  }

  function abrir({ estado, contexto: novoContexto = "", origem: novaOrigem = null } = {}) {
    origem = novaOrigem || documento.activeElement?.closest?.("[data-conta-gatilho]") || documento.querySelector("[data-conta-gatilho]");
    contexto = novoContexto;
    posicionar();
    raiz.hidden = false;
    veu.hidden = false;
    aberto = true;
    sincronizarGatilhos();
    desenhar(estado || estadoInicial(), { animar: false });
    janela.requestAnimationFrame(() => {
      raiz.classList.add("is-aberto");
      veu.classList.add("is-aberto");
    });
    pedirProvedores();
  }

  function fechar({ devolverFoco = true } = {}) {
    if (!aberto) return;
    aberto = false;
    raiz.classList.remove("is-aberto");
    veu.classList.remove("is-aberto");
    sincronizarGatilhos();

    const esconder = () => {
      if (aberto) return;
      raiz.hidden = true;
      veu.hidden = true;
      raiz.style.height = "";
      miolo.innerHTML = "";
    };
    if (reduzido()) esconder();
    else janela.setTimeout(esconder, 320);

    if (devolverFoco && origem?.isConnected) origem.focus({ preventScroll: true });
    const estado = sessao.obter();
    for (const ouvinte of [...aoFecharOuvintes]) ouvinte(estado);
  }

  async function aoEnviar(evento) {
    const form = evento.target.closest?.("[data-conta-form]");
    if (!form) return;
    evento.preventDefault();
    const tipo = form.dataset.contaForm;
    const campos = Object.fromEntries(new FormData(form));
    const aviso = form.querySelector("[data-conta-status]");
    const botao = form.querySelector("[type='submit']");
    botao.disabled = true;
    form.setAttribute("aria-busy", "true");
    if (aviso) aviso.textContent = "";

    try {
      if (tipo === "entrar") {
        await sessao.entrar(campos);
        fechar();
      } else if (tipo === "criar") {
        const estado = await sessao.criarConta(campos);
        if (estado.status === "aguardando-confirmacao") desenhar("confirmar-email");
        else fechar();
      } else if (tipo === "recuperar") {
        await sessao.recuperarSenha(campos.email);
        desenhar("recuperacao-enviada");
      }
    } catch (erro) {
      if (aviso?.isConnected) aviso.textContent = mensagemDoErro(erro);
    } finally {
      if (botao.isConnected) {
        botao.disabled = false;
        form.removeAttribute("aria-busy");
      }
    }
  }

  function aoClicarDentro(evento) {
    const ir = evento.target.closest?.("[data-conta-ir]");
    if (ir) {
      desenhar(ir.dataset.contaIr);
      return;
    }
    if (evento.target.closest?.("[data-conta-fechar]")) {
      fechar();
      return;
    }
    if (evento.target.closest?.("[data-conta-sair]")) {
      sessao.sair().finally(() => fechar({ devolverFoco: false }));
      return;
    }
    if (evento.target.closest?.("[data-conta-google]")) {
      sessao.entrarComGoogle();
      return;
    }
    const verSenha = evento.target.closest?.("[data-conta-ver-senha]");
    if (verSenha) {
      const entrada = verSenha.parentElement.querySelector("input");
      const mostrar = entrada.type === "password";
      entrada.type = mostrar ? "text" : "password";
      verSenha.setAttribute("aria-pressed", String(mostrar));
      verSenha.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
      return;
    }
    if (evento.target.closest?.("[data-conta-navegar]")) fechar({ devolverFoco: false });
  }

  function aoClicarNoDocumento(evento) {
    const gatilho = evento.target.closest?.("[data-conta-gatilho]");
    if (gatilho) {
      evento.preventDefault();
      if (aberto) fechar();
      else abrir({ origem: gatilho });
      return;
    }
    if (!aberto || raiz.contains(evento.target)) return;
    if (DESCARTAVEIS.has(atual)) fechar({ devolverFoco: false });
  }

  function aoTeclar(evento) {
    if (!aberto) return;
    if (evento.key === "Escape") {
      evento.stopPropagation();
      fechar();
      return;
    }
    if (evento.key !== "Tab") return;
    const alvos = [...raiz.querySelectorAll(FOCALIZAVEIS)].filter((elemento) => !elemento.closest("[hidden]"));
    if (!alvos.length) return;
    const primeiro = alvos[0];
    const ultimo = alvos.at(-1);
    if (evento.shiftKey && documento.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && documento.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  const aoRedimensionar = () => {
    if (aberto) posicionar();
  };

  /*
   * A sessão pode mudar sem clique no painel: um login pelo Google que volta, a
   * confirmação aberta em outra aba, a expiração do token. O painel acompanha.
   */
  const desligarSessao = sessao.assinar((estado) => {
    if (!aberto) return;
    if (estado.status === "autenticado" && ["entrar", "criar", "confirmar-email", "intro"].includes(atual)) fechar();
    else if (estado.status !== "autenticado" && atual === "menu") desenhar("intro");
  });

  raiz.addEventListener("submit", aoEnviar);
  raiz.addEventListener("click", aoClicarDentro);
  documento.addEventListener("click", aoClicarNoDocumento);
  documento.addEventListener("keydown", aoTeclar, true);
  janela.addEventListener("resize", aoRedimensionar);

  return {
    abrir,
    fechar,
    estaAberto: () => aberto,
    estadoAtual: () => atual,
    aoFechar(ouvinte) {
      aoFecharOuvintes.add(ouvinte);
      return () => aoFecharOuvintes.delete(ouvinte);
    },
    destroy() {
      desligarSessao();
      raiz.removeEventListener("submit", aoEnviar);
      raiz.removeEventListener("click", aoClicarDentro);
      documento.removeEventListener("click", aoClicarNoDocumento);
      documento.removeEventListener("keydown", aoTeclar, true);
      janela.removeEventListener("resize", aoRedimensionar);
      raiz.remove();
      veu.remove();
    },
  };
}
