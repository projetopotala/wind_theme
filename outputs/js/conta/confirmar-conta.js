import { getSupabaseClient } from "../supabase/client.js";

const ESTADOS = Object.freeze({
  carregando: {
    titulo: "Confirmando seu e-mail",
    mensagem: "Só um instante enquanto validamos seu acesso ao Portal Potala.",
    acao: null,
  },
  sucesso: {
    titulo: "Conta confirmada",
    mensagem: "Seu e-mail foi validado. Seu espaço no Potala já está pronto para receber você.",
    acao: { href: "/meu-potala", rotulo: "Entrar no Meu Potala" },
  },
  expirado: {
    titulo: "Este link expirou",
    mensagem: "Por segurança, este link expirou. Entre no Meu Potala para solicitar um novo acesso.",
    acao: { href: "/meu-potala", rotulo: "Ir para o Meu Potala" },
  },
  invalido: {
    titulo: "Não foi possível confirmar",
    mensagem: "Este endereço não contém uma confirmação válida. Abra o link mais recente enviado pelo Potala.",
    acao: { href: "/meu-potala", rotulo: "Ir para o Meu Potala" },
  },
  erro: {
    titulo: "Não foi possível confirmar agora",
    mensagem: "Houve uma falha ao validar sua conta. Tente novamente pelo link do e-mail ou acesse o Meu Potala.",
    acao: { href: "/meu-potala", rotulo: "Ir para o Meu Potala" },
  },
});

function parametrosDaUrl(href) {
  const url = new URL(href);
  const busca = new URLSearchParams(url.search);
  const fragmento = new URLSearchParams(url.hash.replace(/^#/, ""));
  return { url, busca, fragmento };
}

export function erroDaUrl(href) {
  const { busca, fragmento } = parametrosDaUrl(href);
  const ler = (nome) => busca.get(nome) || fragmento.get(nome) || "";
  const erro = ler("error");
  const codigo = ler("error_code") || erro;
  const descricao = ler("error_description");
  if (!erro && !codigo && !descricao) return null;

  const expirou = /expired|otp_expired|invalid.*(token|link)|token.*invalid/i.test(`${codigo} ${descricao}`);
  return {
    codigo: codigo || "confirmacao",
    status: expirou ? "expirado" : "erro",
    mensagem: ESTADOS[expirou ? "expirado" : "erro"].mensagem,
  };
}

export function renderizarConfirmacao(estado, raiz = globalThis.document?.querySelector("[data-confirmacao]")) {
  if (!raiz) return;
  const conteudo = { ...ESTADOS[estado.status], ...estado };
  raiz.dataset.status = estado.status;
  const titulo = raiz.querySelector("[data-confirmacao-titulo]");
  const status = raiz.querySelector("[data-confirmacao-status]");
  const acao = raiz.querySelector("[data-confirmacao-acao]");
  if (titulo) titulo.textContent = conteudo.titulo;
  if (status) status.textContent = conteudo.mensagem;
  if (acao) {
    acao.hidden = !conteudo.acao;
    if (conteudo.acao) {
      acao.href = conteudo.acao.href;
      acao.textContent = conteudo.acao.rotulo;
    }
  }
}

export async function confirmarConta({
  client,
  href = globalThis.location?.href || "https://portal.invalid/confirmar-conta",
  render = renderizarConfirmacao,
  limparUrl = (url) => globalThis.history?.replaceState?.({}, "", url),
} = {}) {
  render({ status: "carregando", ...ESTADOS.carregando });

  const falhaDoLink = erroDaUrl(href);
  if (falhaDoLink) {
    const estado = { status: falhaDoLink.status, ...ESTADOS[falhaDoLink.status] };
    limparUrl("/confirmar-conta");
    render(estado);
    return estado;
  }

  try {
    const { busca } = parametrosDaUrl(href);
    const codigo = busca.get("code");
    if (codigo && client.auth.exchangeCodeForSession) {
      const { error } = await client.auth.exchangeCodeForSession(codigo);
      if (error) throw error;
    }

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data?.session?.user) {
      const estado = { status: "invalido", ...ESTADOS.invalido };
      render(estado);
      return estado;
    }

    const estado = { status: "sucesso", ...ESTADOS.sucesso };
    limparUrl("/confirmar-conta");
    render(estado);
    return estado;
  } catch {
    const estado = { status: "erro", ...ESTADOS.erro };
    limparUrl("/confirmar-conta");
    render(estado);
    return estado;
  }
}

async function iniciar() {
  const raiz = document.querySelector("[data-confirmacao]");
  if (!raiz) return;
  try {
    const href = location.href;
    const client = getSupabaseClient();
    await confirmarConta({ client, href });
  } catch {
    renderizarConfirmacao({ status: "erro", ...ESTADOS.erro }, raiz);
  }
}

if (typeof document !== "undefined") iniciar();
