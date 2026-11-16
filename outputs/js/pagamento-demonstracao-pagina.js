/*
 * Pagina da DEMONSTRACAO de pagamento de cursos — nenhum pagamento real.
 * Tudo acontece neste navegador: sem banco, sem provedor de pagamento, sem rede, sem campos
 * de cartao e sem codigo Pix pagavel. Fora do ambiente local ou da Preview de
 * branch, a pagina so informa que a demonstracao esta indisponivel.
 */
import {
  CURSO_DEMO, SELO_DEMONSTRACAO, ativarDemonstracaoDePagamento, demonstracaoDePagamentoPermitida,
  gravarEstadoDemo, lerEstadoDemo, reaisDemo,
} from "./conta/pagamento-demonstracao.js";

const raiz = document.querySelector("[data-pagamento-demo]");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Mosaico decorativo e propositalmente NAO e um QR Code: sem marcadores de canto e com "DEMO" por cima. */
function mosaicoIlustrativo() {
  let celulas = "";
  for (let i = 0; i < 121; i += 1) celulas += `<i${((i * i * 7 + i * 3) % 9) < 4 ? ' class="on"' : ""}></i>`;
  return `<div class="pd-mosaico" role="img" aria-label="Imagem ilustrativa, não é um código Pix">${celulas}<b>DEMO</b></div>`;
}

function resumo() {
  return `<section class="pd-resumo" aria-label="Resumo do pedido">
    <p class="pd-rotulo">Curso</p>
    <h1 class="pd-titulo">${esc(CURSO_DEMO.titulo)}</h1>
    <p class="pd-detalhe">${CURSO_DEMO.modalidade === "online" ? "Online" : "Presencial"} · ${esc(CURSO_DEMO.inicio)}</p>
    <p class="pd-valor"><span>Valor</span> <strong>${esc(reaisDemo(CURSO_DEMO.precoCentavos))}</strong></p>
  </section>`;
}

function simulador() {
  return `<section class="pd-simulador" aria-label="Simular o resultado">
    <p class="pd-rotulo">Simular o resultado do pagamento</p>
    <div class="pd-acoes">
      <button type="button" class="pd-botao pd-botao-secundario" data-simular="aguardando">Aguardando</button>
      <button type="button" class="pd-botao" data-simular="aprovado">Aprovado</button>
      <button type="button" class="pd-botao pd-botao-alerta" data-simular="recusado">Recusado</button>
    </div>
  </section>`;
}

function escolha(metodo) {
  const pix = metodo !== "cartao";
  return `${resumo()}
  <section class="pd-metodos">
    <div class="pd-abas" role="tablist" aria-label="Forma de pagamento">
      <button type="button" role="tab" class="pd-aba" aria-selected="${pix}" data-metodo="pix">Pix</button>
      <button type="button" role="tab" class="pd-aba" aria-selected="${!pix}" data-metodo="cartao">Cartão</button>
    </div>
    ${pix ? `<div class="pd-painel" role="tabpanel">
      ${mosaicoIlustrativo()}
      <p class="pd-codigo">Código ilustrativo: <code>DEMONSTRACAO-SEM-VALOR</code></p>
      <p class="pd-nota">Na versão real, o QR Code Pix aparece na página segura do Asaas e a confirmação chega ao Instituto automaticamente.</p>
    </div>` : `<div class="pd-painel" role="tabpanel">
      <div class="pd-cartao" aria-hidden="true"><span>DEMONSTRAÇÃO</span><span>•••• •••• •••• 0000</span><span>NOME DO ALUNO</span></div>
      <p class="pd-nota">Nesta demonstração nenhum dado de cartão é pedido. Na versão real, o cartão é digitado somente na página segura do Asaas; o Portal nunca recebe esses dados.</p>
    </div>`}
  </section>
  ${simulador()}`;
}

function aguardando(metodo) {
  return `${resumo()}
  <section class="pd-estado" data-estado="aguardando" role="status">
    <span class="pd-icone" aria-hidden="true">…</span>
    <h2>Aguardando confirmação do pagamento</h2>
    <p>${metodo === "cartao" ? "O cartão está em análise" : "O Pix ainda não foi identificado"}. Assim que o provedor confirmar, a vaga é garantida — você não precisa fazer nada nesta tela.</p>
  </section>
  ${simulador()}`;
}

function aprovado() {
  return `<section class="pd-estado" data-estado="aprovado" role="status">
    <span class="pd-icone" aria-hidden="true">✓</span>
    <h2>Pagamento aprovado</h2>
    <p>Inscrição confirmada em <strong>${esc(CURSO_DEMO.titulo)}</strong>. O curso já aparece em Meu Potala como “Matriculado”.</p>
  </section>
  <section class="pd-acesso" aria-label="Acesso ao curso">
    <p class="pd-rotulo">Seu curso</p>
    <ol class="pd-aulas">
      <li><strong>Aula 1</strong> Respiração e presença <span>Disponível</span></li>
      <li><strong>Aula 2</strong> Atenção no corpo <span>Na próxima semana</span></li>
      <li><strong>Aula 3</strong> Meditação no cotidiano <span>Em breve</span></li>
    </ol>
    <div class="pd-meu-potala" aria-label="Como aparece em Meu Potala">
      <p class="pd-rotulo">Em Meu Potala</p>
      <p><strong>Matriculado</strong> · ${esc(CURSO_DEMO.titulo)}</p>
      <p class="pd-nota">Sua vaga está garantida. As aulas aparecem em “Meus cursos”.</p>
    </div>
    <div class="pd-acoes">
      ${/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? `<a class="pd-botao" href="/meu-potala/cursos">Ver em Meu Potala</a>` : ""}
      <button type="button" class="pd-botao pd-botao-secundario" data-reiniciar>Recomeçar a demonstração</button>
    </div>
  </section>`;
}

function recusado() {
  return `${resumo()}
  <section class="pd-estado" data-estado="recusado" role="alert">
    <span class="pd-icone" aria-hidden="true">!</span>
    <h2>Pagamento recusado</h2>
    <p>Nada foi cobrado e a inscrição continua aguardando pagamento. Você pode tentar de novo com Pix ou outro cartão.</p>
    <div class="pd-acoes"><button type="button" class="pd-botao" data-reiniciar>Tentar novamente</button></div>
  </section>`;
}

function desenhar() {
  const estado = lerEstadoDemo() || { estado: null, metodo: "pix" };
  const telas = { aguardando: () => aguardando(estado.metodo), aprovado, recusado };
  raiz.innerHTML = (telas[estado.estado] || (() => escolha(estado.metodo)))();
  raiz.querySelector("h1, h2")?.setAttribute("tabindex", "-1");
}

if (!demonstracaoDePagamentoPermitida(location)) {
  raiz.innerHTML = `<section class="pd-estado"><h1>Demonstração indisponível neste endereço</h1><p>${esc(SELO_DEMONSTRACAO)}. Ela só abre no ambiente de testes.</p></section>`;
} else {
  ativarDemonstracaoDePagamento(location);
  desenhar();
  raiz.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("[data-metodo], [data-simular], [data-reiniciar]");
    if (!alvo) return;
    if (alvo.dataset.metodo) gravarEstadoDemo({ metodo: alvo.dataset.metodo });
    else if (alvo.dataset.simular) gravarEstadoDemo({ estado: alvo.dataset.simular });
    else gravarEstadoDemo({ estado: null });
    desenhar();
    raiz.querySelector("h1, h2")?.focus({ preventScroll: false });
  });
}
