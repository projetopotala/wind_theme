import { getSupabaseClient } from "../supabase/client.js";
import { pedidoDoEndereco } from "./estado-sala.js";
import { criarApiDaSala, criarSessaoSala } from "./sessao-sala.js";
import { adaptadorLiveKit, criarPortaDeVideo } from "./video-sala.js";
import { criarChat } from "./chat-sala.js";

const $ = (seletor) => document.querySelector(seletor);
const el = {
  titulo: $("[data-sala-titulo]"), texto: $("[data-sala-texto]"), conexao: $("[data-sala-conexao]"),
  entrar: $("[data-sala-entrar]"), tentar: $("[data-sala-tentar]"), palco: $("[data-sala-palco]"),
  video: $("[data-sala-video]"), mensagens: $("[data-sala-mensagens]"), form: $("[data-sala-form]"),
  campo: $("[data-sala-campo]"), aviso: $("[data-sala-aviso]"), sair: $("[data-sala-sair]"),
  encerrar: $("[data-sala-encerrar]"), vazio: $("[data-sala-vazio]"), enviar: $("[data-sala-enviar]"),
  confirmar: $("[data-sala-confirmar]"), confirmarSim: $("[data-sala-confirmar-sim]"), confirmarNao: $("[data-sala-confirmar-nao]"),
};
el.enviar.rotulo = $("[data-sala-enviar-rotulo]");
const fecharConfirmacao = () => { el.confirmar.hidden = true; };

const reiniciarTentar = () => { delete el.tentar.dataset.acao; el.tentar.textContent = "Tentar de novo"; };
const ui = {
  areaDoVideo: el.video,
  mostrarCarregando() { reiniciarTentar(); el.titulo.textContent = "Abrindo a sala…"; el.texto.textContent = ""; el.entrar.hidden = true; el.tentar.hidden = true; },
  mostrarVisao(v) { reiniciarTentar(); el.titulo.textContent = v.titulo; el.texto.textContent = v.texto; el.entrar.hidden = !v.podeEntrar; el.tentar.hidden = true; el.palco.hidden = true; },
  mostrarEntrando() { el.titulo.textContent = "Entrando…"; el.texto.textContent = "Preparando a videochamada."; el.entrar.hidden = true; },
  mostrarErro(texto, { podeTentarDeNovo }) { reiniciarTentar(); el.titulo.textContent = "Não foi possível continuar"; el.texto.textContent = texto; el.tentar.hidden = !podeTentarDeNovo; el.entrar.hidden = true; },
  mostrarSala({ papel }) { el.titulo.textContent = "Sala de atendimento"; el.texto.textContent = ""; el.palco.hidden = false; el.encerrar.hidden = papel !== "professional"; },
  oferecerRevogacao() { el.texto.textContent = "Se alguém ainda estiver conectado, confirme a desconexão."; el.tentar.textContent = "Confirmar desconexão de todos"; el.tentar.dataset.acao = "revogar"; el.tentar.hidden = false; },
  revogacaoConcluida() { el.texto.textContent = "Todos foram desconectados."; el.tentar.hidden = true; delete el.tentar.dataset.acao; },
  mostrarConexao(ok) { el.conexao.hidden = ok; },
  mostrarSaida(motivo) { fecharConfirmacao(); el.vazio.hidden = false; el.palco.hidden = true; el.entrar.hidden = motivo === "encerrada"; el.tentar.hidden = true; el.mensagens.replaceChildren(); el.titulo.textContent = motivo === "encerrada" ? "Atendimento encerrado" : "Você saiu da sala"; el.texto.textContent = motivo === "encerrada" ? "A sala foi encerrada." : "Você pode voltar enquanto a sala estiver aberta."; el.conexao.hidden = true; },
};

const requestId = pedidoDoEndereco(new URLSearchParams(location.search));
if (!requestId) {
  ui.mostrarVisao({ titulo: "Sala indisponível", texto: "O endereço da sala está incompleto.", podeEntrar: false });
} else {
  const sessao = criarSessaoSala({
    requestId,
    api: criarApiDaSala({ client: getSupabaseClient() }),
    video: criarPortaDeVideo(adaptadorLiveKit()),
    ui,
    criarChat: (ganchos) => criarChat({ lista: el.mensagens, formulario: el.form, campo: el.campo, aviso: el.aviso, vazio: el.vazio, botao: el.enviar, ...ganchos }),
  });
  el.entrar.addEventListener("click", () => sessao.entrar());
  el.tentar.addEventListener("click", () => (el.tentar.dataset.acao === "revogar" ? sessao.revogar() : sessao.carregar()));
  el.sair.addEventListener("click", () => sessao.sair());
  // "Encerrar para todos" é irreversível para os dois lados: pede confirmação própria (sem janela do navegador).
  el.encerrar.addEventListener("click", () => { el.confirmar.hidden = false; el.confirmarNao.focus(); });
  el.confirmarNao.addEventListener("click", () => { fecharConfirmacao(); el.encerrar.focus(); });
  el.confirmarSim.addEventListener("click", () => { fecharConfirmacao(); sessao.encerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.confirmar.hidden) { fecharConfirmacao(); el.encerrar.focus(); } });
  sessao.carregar();
}
