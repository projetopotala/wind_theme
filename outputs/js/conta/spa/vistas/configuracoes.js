/*
 * CONFIGURAÇÕES.
 *
 * Só o que é da conta: senha, sessão e onde vivem os avisos. É também para cá
 * que o link de "Esqueci minha senha" traz a pessoa — já com a sessão de
 * recuperação aberta pelo Supabase —, e por isso a senha nova é o primeiro bloco.
 */

import { mensagemDoErro } from "../../mensagens.js";
import { caminhoDa } from "../roteador.js";
import { e, secao } from "./comum.js";

export default {
  renderizar({ estado }) {
    const sobreSenha = estado.demonstracao
      ? "No modo de demonstração nenhuma senha é conferida nem guardada."
      : "A senha não fica guardada no Portal: quem a confere é o serviço de autenticação, que guarda apenas uma versão embaralhada e irreversível dela.";

    return `${secao({
      id: "mp-senha",
      kicker: "Acesso",
      titulo: "Criar uma nova senha",
      corpo: `<p class="mp-texto">${e(sobreSenha)}</p>
        <form class="mp-form" data-form="nova-senha" novalidate>
          <div class="mp-campo"><label for="mp-nova-senha">Nova senha</label><input id="mp-nova-senha" name="senha" type="password" autocomplete="new-password" minlength="8" required aria-describedby="mp-nova-senha-dica"><small id="mp-nova-senha-dica">Pelo menos 8 caracteres.</small></div>
          <div class="mp-campo"><label for="mp-nova-senha-confirmacao">Confirmar nova senha</label><input id="mp-nova-senha-confirmacao" name="confirmacao" type="password" autocomplete="new-password" required></div>
          <p class="mp-status-form" data-form-status role="status" aria-live="polite"></p>
          <button type="submit" class="mp-botao">Salvar nova senha</button>
        </form>`,
    })}
      ${secao({
        id: "mp-sessao",
        kicker: "Conta",
        titulo: "Sua sessão",
        corpo: `<dl class="mp-dados"><div><dt>E-mail</dt><dd>${e(estado.usuario?.email)}</dd></div></dl>
          <p class="mp-texto">Sair encerra a sessão neste navegador. Seus salvos, sua agenda e seu histórico continuam guardados.</p>
          <button type="button" class="mp-botao mp-botao-secundario" data-acao="sair">Sair</button>`,
      })}
      ${secao({
        id: "mp-privacidade",
        classe: "mp-secao-discreta",
        kicker: "Privacidade",
        titulo: "O que é só seu",
        corpo: `<p class="mp-texto">Salvos, histórico, agenda e o que você acompanha não aparecem para outras pessoas no Portal. O histórico registra só o que você visita com a conta aberta, e pode ser apagado a qualquer momento em <a href="${caminhoDa("historico")}">Histórico</a>.</p>
          <p class="mp-texto">Os avisos seguem as suas escolhas em <a href="${caminhoDa("notificacoes")}">Notificações</a>.</p>`,
      })}`;
  },

  ligar(raiz, { sessao, anunciar }) {
    const form = raiz.querySelector("[data-form='nova-senha']");
    if (!form) return null;
    const aviso = form.querySelector("[data-form-status]");

    const aoEnviar = async (evento) => {
      evento.preventDefault();
      const campos = Object.fromEntries(new FormData(form));
      const botao = form.querySelector("[type='submit']");
      botao.disabled = true;
      aviso.textContent = "";
      try {
        await sessao.definirNovaSenha(campos.senha, campos.confirmacao);
        form.reset();
        aviso.textContent = "Senha atualizada.";
        anunciar("Sua senha nova já vale no próximo acesso.");
      } catch (erro) {
        aviso.textContent = mensagemDoErro(erro);
      } finally {
        botao.disabled = false;
      }
    };

    form.addEventListener("submit", aoEnviar);
    return () => form.removeEventListener("submit", aoEnviar);
  },
};
