import { temLinkDeAcesso } from "./link-recuperacao.js";

/* Páginas de chegada que o Supabase usa como URL padrão: um link de acesso segue para a senha, com o token. */
if (temLinkDeAcesso(location.href)) {
  location.replace(`/redefinir-senha${location.search}${location.hash}`);
}
