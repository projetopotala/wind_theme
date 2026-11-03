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
  encerrar: $("[data-sala-encerrar]"),
};

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
  mostrarSaida(motivo) { el.palco.hidden = true; el.mensagens.replaceChildren(); el.titulo.textContent = motivo === "encerrada" ? "Atendimento encerrado" : "Você saiu da sala"; el.texto.textContent = motivo === "encerrada" ? "A sala foi encerrada." : "Você pode voltar enquanto a sala estiver aberta."; el.conexao.hidden = true; },
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
    criarChat: (ganchos) => criarChat({ lista: el.mensagens, formulario: el.form, campo: el.campo, aviso: el.aviso, ...ganchos }),
  });
  el.entrar.addEventListener("click", () => sessao.entrar());
  el.tentar.addEventListener("click", () => (el.tentar.dataset.acao === "revogar" ? sessao.revogar() : sessao.carregar()));
  el.sair.addEventListener("click", () => sessao.sair());
  el.encerrar.addEventListener("click", () => sessao.encerrar());
  sessao.carregar();
}
