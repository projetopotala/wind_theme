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
  renderizar({ estado, enderecos = [], privacidade = [], atividadesDaConta = [] }) {
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
        id: "mp-enderecos",
        kicker: "Dados pessoais",
        titulo: "Endereço",
        corpo: `${enderecos.length ? `<ul class="mp-lista">${enderecos.map((item) => `<li><strong>${e(item.rotulo)}</strong><span>${e(item.logradouro)}, ${e(item.numero)} — ${e(item.cidade)}/${e(item.uf)}</span><button type="button" class="mp-link-botao" data-remover-endereco="${e(item.id)}">Remover</button></li>`).join("")}</ul>` : `<p class="mp-texto">Nenhum endereço cadastrado.</p>`}
          <form class="mp-form" data-form="endereco" novalidate>
            <div class="mp-campo"><label>Identificação<input name="rotulo" maxlength="40" value="Principal" required></label></div>
            <div class="mp-campo"><label>Nome do destinatário<input name="destinatario" maxlength="120" autocomplete="name" required></label></div>
            <div class="mp-campo"><label>CEP<input name="cep" inputmode="numeric" autocomplete="postal-code" pattern="\\d{5}-?\\d{3}" required></label></div>
            <div class="mp-campo"><label>Logradouro<input name="logradouro" maxlength="160" autocomplete="address-line1" required></label></div>
            <div class="mp-campo"><label>Número<input name="numero" maxlength="20" required></label></div>
            <div class="mp-campo"><label>Complemento<input name="complemento" maxlength="80" autocomplete="address-line2"></label></div>
            <div class="mp-campo"><label>Bairro<input name="bairro" maxlength="80" required></label></div>
            <div class="mp-campo"><label>Cidade<input name="cidade" maxlength="80" autocomplete="address-level2" required></label></div>
            <div class="mp-campo"><label>UF<input name="uf" maxlength="2" minlength="2" autocomplete="address-level1" required></label></div>
            <label class="mp-escolha"><input type="checkbox" name="principal" ${enderecos.length ? "" : "checked"}> Endereço principal</label>
            <p class="mp-status-form" data-endereco-status role="status" aria-live="polite"></p>
            <button type="submit" class="mp-botao">Salvar endereço</button>
          </form>`,
      })}
      ${secao({
        id: "mp-privacidade",
        classe: "mp-secao-discreta",
        kicker: "Privacidade",
        titulo: "Suas escolhas",
        corpo: `<p class="mp-texto">Salvos, histórico, agenda e o que você acompanha não aparecem para outras pessoas.</p>
          <form class="mp-form" data-form="privacidade">
            <label class="mp-escolha"><input type="checkbox" name="historicoAtivo" ${privacidade[0]?.historicoAtivo !== false ? "checked" : ""}> Registrar histórico para continuar de onde parei</label>
            <label class="mp-escolha"><input type="checkbox" name="personalizacaoAtiva" ${privacidade[0]?.personalizacaoAtiva !== false ? "checked" : ""}> Personalizar recomendações</label>
            <label class="mp-escolha"><input type="checkbox" name="analytics" ${privacidade[0]?.analytics ? "checked" : ""}> Permitir métricas opcionais de uso</label>
            <label class="mp-escolha"><input type="checkbox" name="comunicacoesComerciais" ${privacidade[0]?.comunicacoesComerciais ? "checked" : ""}> Receber comunicações comerciais</label>
            <p class="mp-status-form" data-privacidade-status role="status" aria-live="polite"></p>
            <button type="submit" class="mp-botao">Salvar escolhas</button>
          </form>
          <p class="mp-texto">O histórico pode ser apagado em <a href="${caminhoDa("historico")}">Histórico</a>.</p>`,
      })}
      ${secao({
        id: "mp-atividade-conta", kicker: "Segurança", titulo: "Atividade recente",
        corpo: atividadesDaConta.length
          ? `<ul class="mp-lista">${atividadesDaConta.slice(0, 10).map((item) => `<li><span>${e(item.acao.replaceAll("_", " "))}</span><time>${e(item.ocorridaEm ? new Date(item.ocorridaEm).toLocaleString("pt-BR") : "")}</time></li>`).join("")}</ul>`
          : `<p class="mp-texto">Nenhuma alteração recente registrada.</p>`,
      })}`;
  },

  ligar(raiz, { sessao, anunciar, atualizar }) {
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

    const formEndereco = raiz.querySelector("[data-form='endereco']");
    const formPrivacidade = raiz.querySelector("[data-form='privacidade']");
    const aoSalvarEndereco = async (evento) => {
      evento.preventDefault();
      const campos = Object.fromEntries(new FormData(formEndereco));
      const avisoEndereco = formEndereco.querySelector("[data-endereco-status]");
      try {
        await sessao.colecao("enderecos").gravar({ ...campos, principal: campos.principal === "on" });
        anunciar("Endereço salvo."); await atualizar();
      } catch (erro) { avisoEndereco.textContent = mensagemDoErro(erro); }
    };
    const aoSalvarPrivacidade = async (evento) => {
      evento.preventDefault();
      const campos = Object.fromEntries(new FormData(formPrivacidade));
      const avisoPrivacidade = formPrivacidade.querySelector("[data-privacidade-status]");
      try {
        await sessao.colecao("privacidade").gravar({
          historicoAtivo: campos.historicoAtivo === "on", personalizacaoAtiva: campos.personalizacaoAtiva === "on",
          analytics: campos.analytics === "on", comunicacoesComerciais: campos.comunicacoesComerciais === "on",
          atualizadoEm: new Date(),
        });
        anunciar("Escolhas de privacidade salvas."); await atualizar();
      } catch (erro) { avisoPrivacidade.textContent = mensagemDoErro(erro); }
    };
    const aoRemoverEndereco = async (evento) => {
      const botao = evento.target.closest?.("[data-remover-endereco]");
      if (!botao) return;
      botao.disabled = true;
      try { await sessao.colecao("enderecos").remover(botao.dataset.removerEndereco); anunciar("Endereço removido."); await atualizar(); }
      catch (erro) { anunciar(mensagemDoErro(erro)); botao.disabled = false; }
    };
    formEndereco?.addEventListener("submit", aoSalvarEndereco);
    formPrivacidade?.addEventListener("submit", aoSalvarPrivacidade);
    raiz.addEventListener("click", aoRemoverEndereco);
    return () => {
      form.removeEventListener("submit", aoEnviar);
      formEndereco?.removeEventListener("submit", aoSalvarEndereco);
      formPrivacidade?.removeEventListener("submit", aoSalvarPrivacidade);
      raiz.removeEventListener("click", aoRemoverEndereco);
    };
  },
};
