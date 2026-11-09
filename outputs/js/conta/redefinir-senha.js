import { getSupabaseClient } from "../supabase/client.js";
import { erroDaUrl } from "./confirmar-conta.js";
import { sinalDoLink } from "./link-recuperacao.js";

/*
 * DEFINIR UMA NOVA SENHA.
 *
 * Serve ao link do e-mail "Reset your password", venha ele do painel do
 * Supabase ou do "Esqueci minha senha" do portal. A senha só é trocada se o
 * endereço trouxe um link de recuperação E o Supabase abriu uma sessão a partir
 * dele; uma sessão comum, sem o link, não habilita esta tela. A troca é feita
 * por `updateUser` do Auth: nenhuma chave privada, nenhum SQL de senha.
 */

const MINIMO = 8;
const DESTINO = "/meu-potala?senha=atualizada";

const ESTADOS = Object.freeze({
  carregando: { titulo: "Validando seu link", mensagem: "Só um instante enquanto confirmamos o seu acesso.", acao: null },
  pronto: { titulo: "Crie uma nova senha", mensagem: "Escolha uma senha com pelo menos 8 caracteres e repita para confirmar.", acao: null },
  expirado: {
    titulo: "Este link expirou",
    mensagem: "Por segurança, o link vale por pouco tempo e só uma vez. Peça um novo em Meu Potala: Entrar, depois Esqueci minha senha.",
    acao: { href: "/meu-potala", rotulo: "Ir para o Meu Potala" },
  },
  invalido: {
    titulo: "Link inválido",
    mensagem: "Este endereço não traz um link de recuperação válido. Abra o link mais recente enviado por e-mail ou peça um novo em Meu Potala.",
    acao: { href: "/meu-potala", rotulo: "Ir para o Meu Potala" },
  },
  erro: {
    titulo: "Não foi possível validar agora",
    mensagem: "Houve uma falha ao validar o link. Tente novamente pelo e-mail ou peça um novo em Meu Potala.",
    acao: { href: "/meu-potala", rotulo: "Ir para o Meu Potala" },
  },
  sucesso: {
    titulo: "Senha atualizada",
    mensagem: "Pronto. Entre no Meu Potala com a sua nova senha.",
    acao: { href: "/meu-potala?senha=atualizada", rotulo: "Entrar no Meu Potala" },
  },
});

export function validarSenhas(senha, confirmacao) {
  if (String(senha || "").length < MINIMO) return `A senha precisa ter pelo menos ${MINIMO} caracteres.`;
  if (senha !== confirmacao) return "As duas senhas não são iguais.";
  return "";
}

function mensagemDaFalha(erro) {
  const codigo = String(erro?.code || "");
  const texto = String(erro?.message || "");
  if (codigo === "same_password" || /different from the old password/i.test(texto)) return "A nova senha precisa ser diferente da anterior.";
  if (codigo === "weak_password" || /password.*(weak|short|at least)/i.test(texto)) return "Escolha uma senha mais forte, com pelo menos 8 caracteres.";
  if (/session|jwt|token|not authenticated|missing/i.test(`${codigo} ${texto}`)) return "O link expirou ou já foi usado. Peça um novo em Meu Potala.";
  return "Não foi possível salvar a nova senha agora. Tente de novo em instantes.";
}

/* Diz se este endereço pode mostrar o formulário. Não lê nem mostra token. */
export async function verificarLink({ client, href }) {
  const falha = erroDaUrl(href);
  if (falha) return { status: falha.status === "expirado" ? "expirado" : "invalido" };

  const sinal = sinalDoLink(href);
  if (!sinal.recuperacao && !sinal.codigo) return { status: "invalido" };

  try {
    if (sinal.codigo && !sinal.recuperacao && client.auth.exchangeCodeForSession) {
      const { error } = await client.auth.exchangeCodeForSession(new URL(href).searchParams.get("code"));
      if (error) return { status: /expired|invalid/i.test(`${error.code} ${error.message}`) ? "expirado" : "invalido" };
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data?.session?.user ? { status: "pronto" } : { status: "invalido" };
  } catch {
    return { status: "erro" };
  }
}

export async function salvarNovaSenha({ client, senha, confirmacao }) {
  const problema = validarSenhas(senha, confirmacao);
  if (problema) return { ok: false, mensagem: problema };
  const { error } = await client.auth.updateUser({ password: senha });
  if (error) return { ok: false, mensagem: mensagemDaFalha(error) };
  /* Encerra só a sessão de recuperação deste navegador: outras sessões e permissões ficam como estão. */
  try { await client.auth.signOut({ scope: "local" }); } catch { /* a senha já foi trocada */ }
  return { ok: true };
}

export function renderizar(estado, raiz = globalThis.document?.querySelector("[data-redefinicao]")) {
  if (!raiz) return;
  const conteudo = ESTADOS[estado];
  raiz.dataset.status = estado;
  raiz.querySelector("[data-redefinicao-titulo]").textContent = conteudo.titulo;
  raiz.querySelector("[data-redefinicao-status]").textContent = conteudo.mensagem;
  const form = raiz.querySelector("[data-redefinicao-form]");
  if (form) form.hidden = estado !== "pronto";
  const acao = raiz.querySelector("[data-redefinicao-acao]");
  if (acao) {
    acao.hidden = !conteudo.acao;
    if (conteudo.acao) { acao.href = conteudo.acao.href; acao.textContent = conteudo.acao.rotulo; }
  }
}

async function iniciar() {
  const raiz = document.querySelector("[data-redefinicao]");
  if (!raiz) return;
  const href = location.href;
  renderizar("carregando", raiz);

  /* O cliente precisa nascer com o endereço original: é ele que lê o token da URL. */
  let client;
  try {
    client = getSupabaseClient();
  } catch {
    renderizar("erro", raiz);
    return;
  }

  const { status } = await verificarLink({ client, href });
  /* Com a sessão aberta (ou o link recusado), o token sai da barra de endereço. */
  history.replaceState({}, "", "/redefinir-senha");
  renderizar(status, raiz);
  if (status !== "pronto") return;

  const form = raiz.querySelector("[data-redefinicao-form]");
  const aviso = raiz.querySelector("[data-redefinicao-erro]");
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = new FormData(form);
    const botao = form.querySelector("[type='submit']");
    botao.disabled = true;
    aviso.textContent = "";
    const resultado = await salvarNovaSenha({ client, senha: dados.get("senha"), confirmacao: dados.get("confirmacao") });
    if (!resultado.ok) {
      aviso.textContent = resultado.mensagem;
      botao.disabled = false;
      return;
    }
    form.reset();
    renderizar("sucesso", raiz);
    setTimeout(() => location.assign(DESTINO), 1800);
  });
}

if (typeof document !== "undefined") iniciar();
