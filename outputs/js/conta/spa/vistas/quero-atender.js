import { e, secao } from "./comum.js";

/*
 * "QUERO ATENDER" (Meu Potala > Atendimentos).
 *
 * Quem decide se a pessoa já atende, se pode pedir e o estado da solicitação é o BANCO
 * (my_professional_application, vínculo ativo). Esta tela só mostra e envia texto: o
 * navegador não manda identidade, e-mail, papel nem status. Aprovar é decisão exclusiva do
 * Owner; aprovar também não publica o perfil nem define serviços, preços ou horários.
 */

export const LIMITES_DA_SOLICITACAO = Object.freeze({ nome: [3, 120], especialidade: [2, 120], apresentacao: [20, 1500], telefone: [8, 30] });

const data = (valor) => {
  const d = valor ? new Date(valor) : null;
  return d && Number.isFinite(d.valueOf())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(d)
    : "";
};

/* Mesma regra do banco, para avisar antes de enviar. O banco confere de novo. */
export function validarSolicitacao({ nome = "", especialidade = "", apresentacao = "", telefone = "" } = {}) {
  const dentro = (texto, [min, max]) => texto.length >= min && texto.length <= max;
  const campos = {
    nome: String(nome).trim(), especialidade: String(especialidade).trim(),
    apresentacao: String(apresentacao).trim(), telefone: String(telefone).trim(),
  };
  if (!dentro(campos.nome, LIMITES_DA_SOLICITACAO.nome)) return { erro: "Informe seu nome profissional (3 a 120 caracteres).", campos };
  if (!dentro(campos.especialidade, LIMITES_DA_SOLICITACAO.especialidade)) return { erro: "Informe sua especialidade.", campos };
  if (!dentro(campos.apresentacao, LIMITES_DA_SOLICITACAO.apresentacao)) return { erro: "Conte um pouco da sua atuação (de 20 a 1500 caracteres).", campos };
  if (campos.telefone && (!dentro(campos.telefone, LIMITES_DA_SOLICITACAO.telefone) || !/^[0-9+()\s.-]+$/.test(campos.telefone))) {
    return { erro: "Confira o telefone: use apenas números, espaços e + ( ) . -", campos };
  }
  return { erro: "", campos };
}

function formulario(nomeSugerido) {
  return `<form class="mp-form" data-form="profissional" novalidate>
    <div class="mp-campo mp-campo-largo"><label for="mp-prof-nome">Nome profissional</label>
      <input id="mp-prof-nome" name="nome" maxlength="120" autocomplete="name" required value="${e(nomeSugerido)}"></div>
    <div class="mp-campo mp-campo-largo"><label for="mp-prof-especialidade">Especialidade</label>
      <input id="mp-prof-especialidade" name="especialidade" maxlength="120" required></div>
    <div class="mp-campo mp-campo-largo"><label for="mp-prof-apresentacao">Sua atuação</label>
      <textarea id="mp-prof-apresentacao" name="apresentacao" rows="5" maxlength="1500" required aria-describedby="mp-prof-apresentacao-ajuda"></textarea>
      <small id="mp-prof-apresentacao-ajuda">Formação, tempo de experiência e quem você atende. De 20 a 1500 caracteres.</small></div>
    <div class="mp-campo mp-campo-largo"><label for="mp-prof-telefone">Telefone <small>(opcional)</small></label>
      <input id="mp-prof-telefone" name="telefone" type="tel" maxlength="30" autocomplete="tel"></div>
    <p class="mp-nota">A equipe analisa o pedido. Aprovar não publica seu perfil: serviços, valores e horários são definidos pela equipe do Instituto.</p>
    <p class="mp-form-status" data-form-status role="alert"></p>
    <button class="mp-botao" type="submit">Enviar solicitação</button>
  </form>`;
}

/*
 * Estados: sem a atualização do banco => nada aparece; e-mail por confirmar => aviso;
 * em análise => aviso; aprovada => orientação; recusada => motivo e novo pedido; sem pedido => formulário.
 */
export function secaoQueroAtender({ pedido = null, disponivel = false, emailVerificadoEm = null, nomeSugerido = "" } = {}) {
  if (!disponivel) return "";
  const kicker = "Para quem atende";
  const titulo = "Quero atender";
  const solicitacao = pedido && typeof pedido === "object" ? pedido : null;
  let corpo;
  if (solicitacao?.status === "pending") {
    corpo = `<p class="mp-aviso" role="status" data-profissional-estado="pending">Seu pedido de ${e(data(solicitacao.created_at))} está em análise pela equipe${solicitacao.specialty ? ` (${e(solicitacao.specialty)})` : ""}. Avisaremos quando houver uma decisão.</p>`;
  } else if (solicitacao?.status === "approved") {
    corpo = `<p class="mp-aviso" role="status" data-profissional-estado="approved">Seu pedido foi aprovado. A equipe vai configurar seus serviços e horários antes de publicar seu perfil; sua agenda de atendimentos aparece aqui quando o acesso estiver ativo.</p>`;
  } else if (!emailVerificadoEm) {
    corpo = `<p class="mp-aviso" role="status" data-profissional-estado="sem-email">Confirme seu e-mail para pedir para atender. Procure a mensagem de confirmação que enviamos.</p>`;
  } else {
    const recusada = solicitacao?.status === "rejected"
      ? `<p class="mp-aviso" role="status" data-profissional-estado="rejected">Seu pedido anterior não foi aprovado${solicitacao.decision_note ? `: ${e(solicitacao.decision_note)}` : "."} Você pode enviar um novo pedido com as informações atualizadas.</p>`
      : `<p class="mp-nota">Atende pessoas no Instituto ou quer atender? Envie seus dados para análise da equipe.</p>`;
    corpo = `${recusada}${formulario(nomeSugerido)}`;
  }
  return secao({ id: "mp-quero-atender", kicker, titulo, corpo, classe: "mp-secao-discreta" });
}
