/*
 * AGENDA DE ATENDIMENTOS — SIMULAÇÃO PARA APRESENTAÇÃO. Nada é gravado, reservado, cobrado ou enviado.
 * Todo texto entra por textContent.
 */
import { formatarPreco } from "../ofertas/ofertas-modelo.js";
import {
  AVISO_DA_AGENDA, DATAS_DE_EXEMPLO, HORARIOS_DE_EXEMPLO, PASSOS, ROTULO_DOS_PASSOS,
  confirmar, escolher, estadoInicial, podeAvancar, profissionaisDoServico, resumoDaSimulacao, servicosDeAtendimento,
} from "./agenda-demo-modelo.js";

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

export async function iniciarAgenda(doc = document, { carregar = () => fetch("ofertas/catalogo-demonstracao.json").then((r) => r.json()) } = {}) {
  const raiz = doc.querySelector("[data-agenda]");
  if (!raiz) return null;
  const trilha = raiz.querySelector("[data-agenda-trilha]");
  const palco = raiz.querySelector("[data-agenda-palco]");
  let catalogo;
  try { catalogo = await carregar(); } catch { palco.replaceChildren(el(doc, "p", { classe: "of-vazio", texto: "Não foi possível carregar os atendimentos agora." })); return null; }
  const servicos = servicosDeAtendimento(Array.isArray(catalogo?.ofertas) ? catalogo.ofertas : []);
  let estado = estadoInicial();

  function desenharTrilha() {
    trilha.replaceChildren(...PASSOS.map((p, i) => el(doc, "li", { classe: "ap-passo", "aria-current": i === estado.indice ? "step" : null, "data-feito": String(i < estado.indice), texto: `${i + 1}. ${ROTULO_DOS_PASSOS[p]}` })));
  }

  function opcoes(nome, legenda, itens, selecionado) {
    return el(doc, "fieldset", { classe: "of-grupo" }, [
      el(doc, "legend", { texto: legenda }),
      ...itens.map((it) => el(doc, "label", { classe: `of-opcao${it.desabilitado ? " ap-indisponivel" : ""}` }, [
        el(doc, "input", { type: "radio", name: nome, value: it.id, checked: selecionado === it.id, disabled: Boolean(it.desabilitado) }),
        el(doc, "span", { texto: it.rotulo }),
      ])),
    ]);
  }

  function corpoDoPasso(passo) {
    if (passo === "servico") {
      return opcoes("servico", "Qual atendimento você procura?", servicos.map((s) => ({ id: s.id, rotulo: `${s.titulo} · ${formatarPreco(s)} · ${s.formato === "online" ? "online" : "presencial"}` })), estado.servico?.id);
    }
    if (passo === "profissional") {
      const lista = profissionaisDoServico(estado.servico);
      return opcoes("profissional", `Quem atende ${estado.servico.titulo}?`, lista.map((p) => ({ id: p.id, rotulo: p.nome })), estado.profissional?.id);
    }
    if (passo === "data") return opcoes("data", "Datas de exemplo desta demonstração", DATAS_DE_EXEMPLO, estado.data?.id);
    if (passo === "horario") {
      return opcoes("horario", "Horários de exemplo (o das 10h30 aparece como ocupado, só para mostrar esse estado)", HORARIOS_DE_EXEMPLO.map((h) => ({ id: h.id, rotulo: h.disponivel ? h.rotulo : `${h.rotulo} — ocupado`, desabilitado: !h.disponivel })), estado.horario?.id);
    }
    if (passo === "resumo") {
      const r = resumoDaSimulacao(estado);
      return el(doc, "dl", { classe: "ap-resumo" }, [
        ["Atendimento", r.servico], ["Profissional", r.profissional], ["Data", r.data], ["Horário", r.horario], ["Formato", r.formato], ["Valor", r.valor],
      ].map(([t, v]) => el(doc, "div", {}, [el(doc, "dt", { texto: t }), el(doc, "dd", { texto: v })])));
    }
    const r = resumoDaSimulacao(estado);
    return el(doc, "div", { classe: "ap-confirmacao" }, [
      el(doc, "p", { classe: "of-simulacao", role: "alert", texto: AVISO_DA_AGENDA }),
      el(doc, "p", { classe: "of-confirmacao", role: "status", texto: `Confirmação simulada: ${r.servico} com ${r.profissional}, ${r.data}, ${r.horario}.` }),
      el(doc, "p", { classe: "of-protocolo", texto: `Protocolo demonstrativo: ${estado.protocolo}` }),
      el(doc, "p", { classe: "of-nota", texto: "Esta tela mostra o final do caminho. Nenhum dado foi guardado e nenhum horário real foi bloqueado." }),
    ]);
  }

  function desenhar(erro = "") {
    desenharTrilha();
    const passo = PASSOS[estado.indice];
    const ultimo = passo === "confirmacao";
    const botoes = [];
    if (estado.indice > 0 && !ultimo) botoes.push(el(doc, "button", { type: "button", classe: "of-secundario", "data-agenda-voltar": true, texto: "Voltar" }));
    if (!ultimo) botoes.push(el(doc, "button", { type: "submit", classe: "of-botao", texto: passo === "resumo" ? "Confirmar (simulação)" : "Continuar" }));
    if (ultimo) botoes.push(el(doc, "button", { type: "button", classe: "of-botao", "data-agenda-recomecar": true, texto: "Simular outro atendimento" }));
    const form = el(doc, "form", { novalidate: true, "aria-labelledby": "ap-passo-titulo" }, [
      el(doc, "h2", { id: "ap-passo-titulo", classe: "of-dialogo-titulo", texto: ROTULO_DOS_PASSOS[passo] }),
      corpoDoPasso(passo),
      erro ? el(doc, "p", { classe: "of-erro", role: "alert", texto: erro }) : null,
      el(doc, "div", { classe: "of-botoes" }, botoes),
    ]);
    palco.replaceChildren(form);
    form.querySelector("input:checked, input:not(:disabled), button")?.focus({ preventScroll: true });
  }

  const valorDoPasso = (form, passo) => {
    const id = new FormData(form).get(passo);
    if (!id) return null;
    if (passo === "servico") return servicos.find((s) => s.id === id) || null;
    if (passo === "profissional") return profissionaisDoServico(estado.servico).find((p) => p.id === id) || null;
    if (passo === "data") return DATAS_DE_EXEMPLO.find((d) => d.id === id) || null;
    if (passo === "horario") return HORARIOS_DE_EXEMPLO.find((h) => h.id === id && h.disponivel) || null;
    return null;
  };

  palco.addEventListener("submit", (e) => {
    e.preventDefault();
    const passo = PASSOS[estado.indice];
    if (!["resumo", "confirmacao"].includes(passo)) estado = escolher(estado, passo, valorDoPasso(e.target, passo));
    if (!podeAvancar(estado)) { desenhar("Escolha uma opção para continuar."); return; }
    estado = passo === "resumo" ? confirmar(estado) : { ...estado, indice: estado.indice + 1 };
    desenhar();
  });
  palco.addEventListener("click", (e) => {
    if (e.target.closest?.("[data-agenda-voltar]")) { estado = { ...estado, indice: Math.max(0, estado.indice - 1) }; desenhar(); }
    else if (e.target.closest?.("[data-agenda-recomecar]")) { estado = estadoInicial(); desenhar(); }
  });

  desenhar();
  return { desenhar, estado: () => estado };
}

if (typeof document !== "undefined" && !globalThis.__POTALA_TESTE__) {
  const iniciar = () => { iniciarAgenda(document).catch(() => { /* a página segue sem a agenda */ }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  else iniciar();
}
