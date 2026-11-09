/*
 * LINKS DE ACESSO QUE CHEGAM NO ENDEREÇO ERRADO.
 *
 * O link do e-mail de recuperação nem sempre volta para a página que o portal
 * pediu: o que sai do painel do Supabase usa a URL padrão do projeto (a raiz
 * do site), e uma página que não conhece o token o descarta. Aqui fica só a
 * leitura do endereço, sem tocar no Supabase, para quem recebe o link decidir
 * para onde levá-lo sem perder `#access_token`, `?code` nem `#error`.
 */

function partes(href) {
  const url = new URL(href);
  return { url, busca: url.searchParams, fragmento: new URLSearchParams(url.hash.replace(/^#/, "")) };
}

export function sinalDoLink(href) {
  const { busca, fragmento } = partes(href);
  const ler = (nome) => fragmento.get(nome) || busca.get(nome) || "";
  return {
    recuperacao: ler("type") === "recovery",
    codigo: busca.has("code"),
    erro: Boolean(ler("error") || ler("error_code") || ler("error_description")),
  };
}

export function temLinkDeAcesso(href) {
  const sinal = sinalDoLink(href);
  return sinal.recuperacao || sinal.codigo || sinal.erro;
}

/* A raiz do site sempre leva à chegada; um link de acesso leva à página de senha, com o endereço inteiro. */
export function destinoDaRaiz(href) {
  const { url } = partes(href);
  const alvo = temLinkDeAcesso(href) ? "/redefinir-senha" : "/transcender.html";
  return `${alvo}${url.search}${url.hash}`;
}
