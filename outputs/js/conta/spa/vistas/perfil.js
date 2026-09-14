/*
 * MEU PERFIL.
 *
 * A hierarquia vem da referência trazida pelo Instituto: um resumo à esquerda,
 * com foto e dados básicos, e à direita os cartões que a pessoa edita. Mas não
 * é uma página de rede social — não há seguidores, contagens nem mural. É onde
 * se diz como quer ser chamado e o que interessa, e é isso que alimenta "Para
 * você".
 *
 * Tudo aqui é opcional, menos o nome. Cidade, bio e interesses ajudam a
 * recomendar, mas nenhuma tela do Portal pede para preenchê-los.
 */

import { iniciaisDe, nomeDeExibicao } from "../../modelos.js";
import { mensagemDoErro } from "../../mensagens.js";
import { caminhoDa } from "../roteador.js";
import { e, secao } from "./comum.js";

const SUGESTOES_DE_INTERESSE = ["Meditação", "Yoga", "Tai chi", "Desenho", "Pintura", "Escrita", "Música", "Cinema", "Fotografia", "Terapias integrativas", "Leitura"];

function dataLonga(valor) {
  if (!valor) return "";
  return new Date(valor).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function pastilhaDeInteresse(interesse) {
  return `<li><span class="mp-pastilha mp-pastilha-removivel">${e(interesse)}<button type="button" data-remover-interesse="${e(interesse)}" aria-label="Remover ${e(interesse)}">×</button></span><input type="hidden" name="interesses" value="${e(interesse)}"></li>`;
}

export default {
  renderizar({ estado }) {
    const { usuario, perfil } = estado;
    const nome = nomeDeExibicao(usuario, perfil);
    const interesses = perfil?.interesses || [];
    const foto = perfil?.avatarUrl
      ? `<img class="mp-avatar" src="${e(perfil.avatarUrl)}" alt="">`
      : `<span class="mp-avatar" aria-hidden="true">${e(iniciaisDe(nome, usuario?.email))}</span>`;

    const abas = [["cursos", "Cursos"], ["agenda", "Agenda"], ["salvos", "Salvos"], ["historico", "Histórico"], ["acompanhando", "Acompanhando"]]
      .map(([rota, rotulo]) => `<li><a href="${caminhoDa(rota)}">${rotulo}</a></li>`).join("");

    return `<div class="mp-perfil">
      <div class="mp-perfil-coluna">
        ${secao({
          id: "mp-perfil-resumo",
          kicker: "Resumo",
          titulo: "Quem está caminhando",
          corpo: `<div class="mp-perfil-resumo">
            ${foto}
            <div>
              <p class="mp-perfil-nome">${e(nome)}</p>
              ${perfil?.cidade ? `<p class="mp-cartao-detalhe">${e(perfil.cidade)}</p>` : ""}
              ${usuario?.criadoEm ? `<p class="mp-cartao-detalhe">No Potala desde ${e(dataLonga(usuario.criadoEm))}</p>` : ""}
            </div>
          </div>
          ${perfil?.bio ? `<p class="mp-perfil-bio">${e(perfil.bio)}</p>` : ""}`,
        })}
        ${secao({
          id: "mp-perfil-conta",
          kicker: "Dados da conta",
          titulo: "Acesso",
          corpo: `<dl class="mp-dados">
            <div><dt>E-mail</dt><dd>${e(usuario?.email)}</dd></div>
            <div><dt>Confirmação</dt><dd>${usuario?.emailVerificadoEm ? "E-mail confirmado" : "Aguardando confirmação"}</dd></div>
          </dl>
          <a class="mp-link" href="${caminhoDa("configuracoes")}">Senha e configurações <span aria-hidden="true">→</span></a>`,
        })}
      </div>

      <div class="mp-perfil-coluna">
        ${secao({
          id: "mp-perfil-editar",
          kicker: "Sobre você",
          titulo: "Como quer ser apresentado",
          corpo: `<form class="mp-form" data-perfil-form novalidate>
            <div class="mp-campo"><label for="mp-perfil-nome">Nome</label><input id="mp-perfil-nome" name="nome" value="${e(perfil?.nome || usuario?.nome || "")}" maxlength="80" autocomplete="name" required></div>
            <div class="mp-campo"><label for="mp-perfil-cidade">Cidade <small>(opcional)</small></label><input id="mp-perfil-cidade" name="cidade" value="${e(perfil?.cidade || "")}" maxlength="80" autocomplete="address-level2"></div>
            <div class="mp-campo"><label for="mp-perfil-bio">Uma frase sobre você <small>(opcional)</small></label><textarea id="mp-perfil-bio" name="bio" maxlength="400" rows="3">${e(perfil?.bio || "")}</textarea></div>

            <fieldset class="mp-campo mp-interesses">
              <legend>Interesses <small>(até 12)</small></legend>
              <ul class="mp-pastilhas" data-interesses>${interesses.map(pastilhaDeInteresse).join("")}</ul>
              <div class="mp-interesse-novo">
                <input id="mp-perfil-interesse" list="mp-sugestoes-interesse" maxlength="40" aria-label="Novo interesse" placeholder="Escreva e toque em Adicionar">
                <datalist id="mp-sugestoes-interesse">${SUGESTOES_DE_INTERESSE.map((sugestao) => `<option value="${e(sugestao)}"></option>`).join("")}</datalist>
                <button type="button" class="mp-botao mp-botao-secundario mp-botao-pequeno" data-adicionar-interesse>Adicionar</button>
              </div>
            </fieldset>

            <p class="mp-status-form" data-perfil-status role="status" aria-live="polite"></p>
            <button type="submit" class="mp-botao">Salvar perfil</button>
          </form>`,
        })}
      </div>

      <nav class="mp-perfil-abas" aria-label="Sua participação">
        <ul>${abas}</ul>
      </nav>
    </div>`;
  },

  ligar(raiz, { sessao, anunciar, atualizar }) {
    const form = raiz.querySelector("[data-perfil-form]");
    if (!form) return null;
    const lista = form.querySelector("[data-interesses]");
    const entrada = form.querySelector("#mp-perfil-interesse");
    const aviso = form.querySelector("[data-perfil-status]");

    const atuais = () => [...form.querySelectorAll("input[name='interesses']")].map((campo) => campo.value);

    function adicionar() {
      const valor = entrada.value.trim();
      if (!valor) return;
      const existentes = atuais().map((item) => item.toLocaleLowerCase("pt-BR"));
      if (existentes.includes(valor.toLocaleLowerCase("pt-BR"))) {
        aviso.textContent = `“${valor}” já está nos seus interesses.`;
        return;
      }
      if (existentes.length >= 12) {
        aviso.textContent = "São no máximo 12 interesses. Remova um para acrescentar outro.";
        return;
      }
      lista.insertAdjacentHTML("beforeend", pastilhaDeInteresse(valor));
      entrada.value = "";
      aviso.textContent = "";
      entrada.focus();
    }

    const aoClicar = (evento) => {
      if (evento.target.closest("[data-adicionar-interesse]")) {
        adicionar();
        return;
      }
      const remover = evento.target.closest("[data-remover-interesse]");
      if (remover) {
        remover.closest("li").remove();
        entrada.focus();
      }
    };

    const aoTeclar = (evento) => {
      if (evento.target === entrada && evento.key === "Enter") {
        evento.preventDefault();
        adicionar();
      }
    };

    const aoEnviar = async (evento) => {
      evento.preventDefault();
      const dados = new FormData(form);
      const nome = String(dados.get("nome") || "").trim();
      if (!nome) {
        aviso.textContent = "Diga como podemos te chamar.";
        form.querySelector("#mp-perfil-nome").focus();
        return;
      }
      const botao = form.querySelector("[type='submit']");
      botao.disabled = true;
      aviso.textContent = "Salvando…";
      try {
        await sessao.atualizarPerfil({ nome, cidade: dados.get("cidade"), bio: dados.get("bio"), interesses: atuais() });
        anunciar("Perfil atualizado.");
        await atualizar();
      } catch (erro) {
        aviso.textContent = mensagemDoErro(erro);
        botao.disabled = false;
      }
    };

    /*
     * Formulário mexido não é redesenhado por baixo da pessoa.
     *
     * A SPA redesenha a tela quando o perfil muda — e o perfil chega do banco um
     * instante depois da sessão. Sem esta marca, quem começasse a digitar nesse
     * instante veria o texto sumir.
     */
    const aoMexer = () => {
      form.dataset.alterado = "true";
    };
    const aoMexerNoClique = (evento) => {
      if (evento.target.closest("[data-remover-interesse], [data-adicionar-interesse]")) aoMexer();
    };

    form.addEventListener("click", aoClicar);
    form.addEventListener("click", aoMexerNoClique);
    form.addEventListener("keydown", aoTeclar);
    form.addEventListener("input", aoMexer);
    form.addEventListener("submit", aoEnviar);
    return () => {
      form.removeEventListener("click", aoClicar);
      form.removeEventListener("click", aoMexerNoClique);
      form.removeEventListener("keydown", aoTeclar);
      form.removeEventListener("input", aoMexer);
      form.removeEventListener("submit", aoEnviar);
    };
  },
};
