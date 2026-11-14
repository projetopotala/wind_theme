/*
 * OFERTAS: a vitrine e os caminhos de inscrição, reserva, agendamento e pagamento
 * (PROTÓTIPO DE DEMONSTRAÇÃO). Nada é gravado, enviado ou cobrado. Todo texto entra
 * por textContent.
 */
import {
  ACOES, FORMATOS, HORARIOS_DE_EXEMPLO, MODALIDADES, filtrarOfertas, formatarPreco, gerarProtocolo,
  linkDaRecepcao, passosDoFluxo, rotuloDaAcao, temCobranca, textoDaConfirmacao, validarDados,
} from "./ofertas-modelo.js";

const el = (doc, tag, props = {}, filhos = []) => {
  const n = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "texto") n.textContent = v;
    else if (k === "classe") n.className = v;
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, String(v));
  }
  for (const f of filhos) if (f) n.append(f);
  return n;
};

const TITULO_DO_PASSO = Object.freeze({
  detalhes: "Detalhes",
  horario: "Escolha o horário",
  dados: "Seus dados",
  pagamento: "Pagamento (sandbox)",
  confirmacao: "Confirmação demonstrativa",
});

export async function iniciarOfertas(doc = document, { carregar = () => fetch("ofertas/catalogo-demonstracao.json").then((r) => r.json()) } = {}) {
  const raiz = doc.querySelector("[data-ofertas]");
  if (!raiz) return null;
  const lista = raiz.querySelector("[data-ofertas-lista]");
  const chips = raiz.querySelector("[data-ofertas-modalidades]");
  const busca = raiz.querySelector("[data-ofertas-busca]");
  const formato = raiz.querySelector("[data-ofertas-formato]");
  const contagem = raiz.querySelector("[data-ofertas-contagem]");
  const dialogo = raiz.querySelector("[data-ofertas-dialogo]");

  let catalogo;
  try { catalogo = await carregar(); } catch { lista.replaceChildren(el(doc, "li", { classe: "of-vazio", texto: "Não foi possível carregar as ofertas agora. Fale com a Recepção." })); return null; }
  const ofertas = Array.isArray(catalogo?.ofertas) ? catalogo.ofertas : [];
  const filtro = { modalidade: "todas", formato: "todos", termo: "" };

  formato.replaceChildren(...FORMATOS.map((f) => el(doc, "option", { value: f.id, texto: f.rotulo })));
  chips.replaceChildren(...MODALIDADES.map((m) => el(doc, "li", {}, [el(doc, "button", { type: "button", classe: "of-chip", "data-modalidade": m.id, "aria-pressed": String(m.id === "todas"), texto: m.rotulo })])));

  function cartao(oferta) {
    const preco = formatarPreco(oferta);
    const botao = el(doc, "button", { type: "button", classe: "of-acao", "data-oferta": oferta.id, texto: rotuloDaAcao(oferta) });
    return el(doc, "li", {}, [el(doc, "article", { classe: "of-cartao", "data-modalidade-oferta": oferta.modalidade }, [
      el(doc, "p", { classe: "of-etiqueta", texto: `${MODALIDADES.find((m) => m.id === oferta.modalidade)?.rotulo || "Oferta"} · ${oferta.formato === "online" ? "Online" : "Presencial"}` }),
      el(doc, "h3", { classe: "of-titulo", texto: oferta.titulo }),
      el(doc, "p", { classe: "of-resumo", texto: oferta.resumo }),
      el(doc, "dl", { classe: "of-fatos" }, [
        el(doc, "div", {}, [el(doc, "dt", { texto: "Com" }), el(doc, "dd", { texto: oferta.responsavel })]),
        el(doc, "div", {}, [el(doc, "dt", { texto: "Quando" }), el(doc, "dd", { texto: oferta.quando })]),
        el(doc, "div", {}, [el(doc, "dt", { texto: "Valor" }), el(doc, "dd", { classe: "of-preco", texto: preco })]),
        oferta.vagas ? el(doc, "div", {}, [el(doc, "dt", { texto: "Vagas" }), el(doc, "dd", { texto: `${oferta.vagas} (limitadas)` })]) : null,
      ]),
      botao,
    ])]);
  }

  function desenhar() {
    const achadas = filtrarOfertas(ofertas, filtro);
    lista.replaceChildren(...(achadas.length ? achadas.map(cartao) : [el(doc, "li", { classe: "of-vazio", texto: "Nenhuma oferta encontrada com esses filtros. Limpe a busca ou fale com a Recepção." })]));
    contagem.textContent = `${achadas.length} ${achadas.length === 1 ? "oferta" : "ofertas"}`;
    for (const botao of chips.querySelectorAll("[data-modalidade]")) botao.setAttribute("aria-pressed", String(botao.dataset.modalidade === filtro.modalidade));
  }

  chips.addEventListener("click", (e) => { const b = e.target.closest?.("[data-modalidade]"); if (!b) return; filtro.modalidade = b.dataset.modalidade; desenhar(); });
  busca.addEventListener("input", () => { filtro.termo = busca.value; desenhar(); });
  formato.addEventListener("change", () => { filtro.formato = formato.value; desenhar(); });

  /* ---------- caminho da oferta (diálogo) ---------- */
  const fluxo = { oferta: null, indice: 0, dados: {}, horario: "", forma: "", protocolo: "" };

  function aviso() {
    return el(doc, "p", { classe: "of-aviso", role: "note", texto: "Demonstração: nada é gravado, enviado ou cobrado." });
  }

  function campo(rotulo, nome, { tipo = "text", obrigatorio = false, erro = "", valor = "" } = {}) {
    const id = `of-${nome}`;
    const entrada = el(doc, tipo === "textarea" ? "textarea" : "input", { id, name: nome, type: tipo === "textarea" ? null : tipo, rows: tipo === "textarea" ? 3 : null, required: obrigatorio, autocomplete: nome === "email" ? "email" : nome === "nome" ? "name" : "off", "aria-invalid": erro ? "true" : null, "aria-describedby": erro ? `${id}-erro` : null });
    entrada.value = valor;
    return el(doc, "div", { classe: "of-campo" }, [el(doc, "label", { for: id, texto: obrigatorio ? `${rotulo} (obrigatório)` : rotulo }), entrada, erro ? el(doc, "p", { id: `${id}-erro`, classe: "of-erro", texto: erro }) : null]);
  }

  function passoAtual() { return passosDoFluxo(fluxo.oferta)[fluxo.indice]; }

  function mostrar(erros = {}) {
    const oferta = fluxo.oferta;
    const passos = passosDoFluxo(oferta);
    const passo = passoAtual();
    const corpo = [];
    corpo.push(el(doc, "p", { classe: "of-passo", texto: passos.length > 1 ? `Passo ${fluxo.indice + 1} de ${passos.length}: ${TITULO_DO_PASSO[passo]}` : TITULO_DO_PASSO[passo] }));
    corpo.push(el(doc, "h2", { id: "of-dialogo-titulo", classe: "of-dialogo-titulo", texto: oferta.titulo }));
    corpo.push(aviso());

    if (passo === "detalhes") {
      corpo.push(el(doc, "p", { texto: oferta.resumo }));
      corpo.push(el(doc, "ul", { classe: "of-detalhes" }, [
        el(doc, "li", { texto: `Com ${oferta.responsavel}` }), el(doc, "li", { texto: oferta.quando }),
        el(doc, "li", { texto: `Valor: ${formatarPreco(oferta)}` }), oferta.acaoNota ? el(doc, "li", { texto: oferta.acaoNota }) : null,
        el(doc, "li", { texto: `Como funciona: ${ACOES[oferta.acao]?.resumo || "Atendimento humano"}` }),
      ]));
      if (oferta.acao === "recepcao") corpo.push(el(doc, "a", { classe: "of-botao", href: linkDaRecepcao(catalogo.whatsapp, oferta), rel: "noreferrer", target: "_blank", texto: "Conversar com a Recepção no WhatsApp" }));
      if (oferta.acao === "marketplace") corpo.push(el(doc, "a", { classe: "of-botao", href: "marketplace.html", texto: "Ir para o Marketplace" }));
    } else if (passo === "horario") {
      corpo.push(el(doc, "fieldset", { classe: "of-grupo" }, [el(doc, "legend", { texto: "Horários de exemplo da demonstração" }), ...HORARIOS_DE_EXEMPLO.map((h) => el(doc, "label", { classe: "of-opcao" }, [el(doc, "input", { type: "radio", name: "horario", value: h, checked: fluxo.horario === h }), el(doc, "span", { texto: h })]))]));
      if (erros.horario) corpo.push(el(doc, "p", { classe: "of-erro", role: "alert", texto: erros.horario }));
    } else if (passo === "dados") {
      corpo.push(campo("Nome completo", "nome", { obrigatorio: true, erro: erros.nome, valor: fluxo.dados.nome || "" }));
      corpo.push(campo("E-mail", "email", { tipo: "email", obrigatorio: true, erro: erros.email, valor: fluxo.dados.email || "" }));
      corpo.push(campo("Telefone ou WhatsApp", "telefone", { tipo: "tel", valor: fluxo.dados.telefone || "" }));
      if (oferta.acao === "solicitar-agendamento") corpo.push(campo("Dia e período de preferência", "preferencia", { obrigatorio: true, erro: erros.preferencia, valor: fluxo.dados.preferencia || "" }));
      corpo.push(el(doc, "p", { classe: "of-nota", texto: "Use dados fictícios nesta demonstração." }));
    } else if (passo === "pagamento") {
      corpo.push(el(doc, "p", { texto: `Total: ${formatarPreco(oferta)}. No ambiente real, o pagamento seria feito no Mercado Pago (Pix ou cartão); aqui é só uma simulação.` }));
      corpo.push(el(doc, "fieldset", { classe: "of-grupo" }, [el(doc, "legend", { texto: "Forma de pagamento (simulada)" }), ...["Pix", "Cartão"].map((f) => el(doc, "label", { classe: "of-opcao" }, [el(doc, "input", { type: "radio", name: "forma", value: f, checked: (fluxo.forma || "Pix") === f }), el(doc, "span", { texto: f })]))]));
    } else if (passo === "confirmacao") {
      corpo.push(el(doc, "p", { classe: "of-confirmacao", role: "status", texto: textoDaConfirmacao(oferta) }));
      corpo.push(el(doc, "p", { classe: "of-protocolo", texto: `Protocolo demonstrativo: ${fluxo.protocolo}` }));
      corpo.push(el(doc, "p", { classe: "of-nota", texto: "Esta tela mostra o final do caminho. Nenhum dado foi guardado." }));
    }

    const ultimo = fluxo.indice === passos.length - 1;
    const botoes = [];
    if (fluxo.indice > 0 && passo !== "confirmacao") botoes.push(el(doc, "button", { type: "button", classe: "of-secundario", "data-fluxo": "voltar", texto: "Voltar" }));
    if (!ultimo) botoes.push(el(doc, "button", { type: "submit", classe: "of-botao", texto: passos[fluxo.indice + 1] === "confirmacao" ? "Confirmar (demonstração)" : "Continuar" }));
    botoes.push(el(doc, "button", { type: "button", classe: "of-secundario", "data-fluxo": "fechar", texto: ultimo ? "Fechar" : "Cancelar" }));
    const form = el(doc, "form", { novalidate: true, "data-fluxo-form": true }, [...corpo, el(doc, "div", { classe: "of-botoes" }, botoes)]);
    dialogo.setAttribute("aria-labelledby", "of-dialogo-titulo");
    dialogo.replaceChildren(form);
    const alvo = form.querySelector("[aria-invalid='true']") || form.querySelector("input:not([type=radio]),textarea,input[type=radio]:checked") || form.querySelector(".of-botao");
    alvo?.focus({ preventScroll: true });
  }

  function lerPasso() {
    const form = dialogo.querySelector("form");
    const passo = passoAtual();
    if (passo === "dados") {
      const dados = Object.fromEntries(new FormData(form));
      fluxo.dados = dados;
      const erros = validarDados({ ...dados }, { exigePreferencia: fluxo.oferta.acao === "solicitar-agendamento" });
      delete erros.horario;
      return erros;
    }
    if (passo === "horario") { fluxo.horario = new FormData(form).get("horario") || ""; return fluxo.horario ? {} : { horario: "Escolha um horário." }; }
    if (passo === "pagamento") fluxo.forma = new FormData(form).get("forma") || "Pix";
    return {};
  }

  function abrir(oferta, origem) {
    Object.assign(fluxo, { oferta, indice: 0, dados: {}, horario: "", forma: "", protocolo: "", origem });
    mostrar();
    if (!dialogo.open) dialogo.showModal();
  }

  dialogo.addEventListener("submit", (e) => {
    e.preventDefault();
    const erros = lerPasso();
    if (Object.keys(erros).length) { mostrar(erros); return; }
    fluxo.indice += 1;
    if (passoAtual() === "confirmacao") fluxo.protocolo = gerarProtocolo(fluxo.oferta);
    mostrar();
  });
  dialogo.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-fluxo]");
    if (!b) return;
    if (b.dataset.fluxo === "fechar") dialogo.close();
    else if (b.dataset.fluxo === "voltar") { lerPasso(); fluxo.indice = Math.max(0, fluxo.indice - 1); mostrar(); }
  });
  dialogo.addEventListener("close", () => { fluxo.origem?.focus?.({ preventScroll: true }); });
  lista.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-oferta]");
    const oferta = b && ofertas.find((o) => o.id === b.dataset.oferta);
    if (oferta) abrir(oferta, b);
  });

  desenhar();
  return { desenhar, abrir, filtro, ofertas, temCobranca };
}

if (typeof document !== "undefined" && !globalThis.__POTALA_TESTE__) {
  const iniciar = () => { iniciarOfertas(document).catch(() => { /* a página segue sem a vitrine */ }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
}
