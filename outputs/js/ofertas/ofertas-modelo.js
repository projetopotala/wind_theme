/*
 * OFERTAS: regras puras da vitrine comercial (PROTÓTIPO DE DEMONSTRAÇÃO).
 *
 * Nada aqui grava dados, chama pagamento ou envia mensagem. A vitrine mostra o que a
 * oferta é, quanto custa, quem conduz, quando acontece e qual ação faz sentido para ela:
 * nem tudo vira venda online. Cada ação tem o seu próprio caminho até a confirmação
 * demonstrativa.
 */

export const MODALIDADES = Object.freeze([
  { id: "todas", rotulo: "Tudo" },
  { id: "curso", rotulo: "Cursos e workshops" },
  { id: "recorrente", rotulo: "Aulas e atividades recorrentes" },
  { id: "atendimento", rotulo: "Atendimentos" },
  { id: "solidario", rotulo: "Solidários e gratuitos" },
  { id: "evento", rotulo: "Eventos e vivências" },
  { id: "produto", rotulo: "Produtos" },
]);

export const FORMATOS = Object.freeze([
  { id: "todos", rotulo: "Online e presencial" },
  { id: "presencial", rotulo: "Presencial" },
  { id: "online", rotulo: "Online" },
]);

/* Cada ação: rótulo do botão, passos do caminho e se o passo de pagamento entra. */
export const ACOES = Object.freeze({
  inscrever: { rotulo: "Inscrever-se", resumo: "Inscrição com pagamento", passos: ["detalhes", "dados", "pagamento", "confirmacao"] },
  "reservar-vaga": { rotulo: "Reservar vaga", resumo: "Vaga reservada; pagamento quando houver preço", passos: ["detalhes", "dados", "pagamento", "confirmacao"] },
  "solicitar-agendamento": { rotulo: "Solicitar agendamento", resumo: "A Recepção confirma o horário com você", passos: ["detalhes", "dados", "confirmacao"] },
  agendar: { rotulo: "Agendar", resumo: "Você escolhe o horário na agenda", passos: ["detalhes", "horario", "dados", "confirmacao"] },
  pagar: { rotulo: "Pagar", resumo: "Pagamento direto", passos: ["detalhes", "dados", "pagamento", "confirmacao"] },
  participar: { rotulo: "Participar gratuitamente", resumo: "Participação gratuita", passos: ["detalhes", "dados", "confirmacao"] },
  recepcao: { rotulo: "Falar com a Recepção", resumo: "Atendimento humano", passos: ["detalhes"] },
  marketplace: { rotulo: "Ver no Marketplace", resumo: "Segue para o Marketplace, projeto separado", passos: ["detalhes"] },
});

export const HORARIOS_DE_EXEMPLO = Object.freeze(["Terça, 10h", "Quarta, 15h", "Sexta, 9h30"]);

const semAcento = (valor) => String(valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function formatarPreco(oferta) {
  const centavos = oferta?.precoCentavos;
  const nota = oferta?.precoNota ? ` ${oferta.precoNota}` : "";
  if (centavos === 0) return oferta?.contrapartida ? `Contrapartida: ${oferta.contrapartida}` : "Gratuito";
  if (centavos == null) return oferta?.precoNota ? oferta.precoNota.charAt(0).toUpperCase() + oferta.precoNota.slice(1) : "Valor a combinar";
  const reais = (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
  return `${reais}${nota}`;
}

export function temCobranca(oferta) {
  return Number(oferta?.precoCentavos) > 0;
}

/* O pagamento só entra no caminho quando existe preço para cobrar. */
export function passosDoFluxo(oferta) {
  const acao = ACOES[oferta?.acao];
  if (!acao) return ["detalhes"];
  return acao.passos.filter((passo) => passo !== "pagamento" || temCobranca(oferta));
}

export function rotuloDaAcao(oferta) {
  return ACOES[oferta?.acao]?.rotulo || "Falar com a Recepção";
}

export function filtrarOfertas(ofertas = [], { modalidade = "todas", formato = "todos", termo = "" } = {}) {
  const termos = semAcento(termo).split(/\s+/).filter(Boolean);
  return ofertas.filter((oferta) => {
    if (modalidade !== "todas" && oferta.modalidade !== modalidade) return false;
    if (formato !== "todos" && oferta.formato !== formato) return false;
    if (!termos.length) return true;
    const texto = semAcento([oferta.titulo, oferta.resumo, oferta.responsavel, oferta.quando].join(" "));
    return termos.every((palavra) => texto.includes(palavra));
  });
}

export function validarDados({ nome = "", email = "", horario = "", preferencia = "" } = {}, { exigeHorario = false, exigePreferencia = false } = {}) {
  const erros = {};
  if (String(nome).trim().length < 3) erros.nome = "Informe seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) erros.email = "Informe um e-mail válido.";
  if (exigeHorario && !String(horario).trim()) erros.horario = "Escolha um horário.";
  if (exigePreferencia && String(preferencia).trim().length < 3) erros.preferencia = "Conte qual dia e período você prefere.";
  return erros;
}

/* Protocolo da confirmação demonstrativa: nunca se parece com um protocolo real. */
export function gerarProtocolo(oferta, instante = Date.now(), aleatorio = Math.random()) {
  const base = `${oferta?.id || "oferta"}|${instante}|${aleatorio}`;
  let hash = 5381;
  for (const letra of base) hash = ((hash << 5) + hash + letra.charCodeAt(0)) >>> 0;
  return `DEMO-${hash.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
}

/* Aviso fixo da confirmação: a vitrine é demonstrativa e nada do que ela mostra aconteceu de verdade. */
export const AVISO_SIMULACAO = "SIMULAÇÃO: nada foi registrado, reservado, cobrado nem enviado.";

export function textoDaConfirmacao(oferta) {
  switch (oferta?.acao) {
    case "inscrever": return "No ambiente real, a inscrição seria registrada e você receberia a confirmação por e-mail.";
    case "reservar-vaga": return temCobranca(oferta)
      ? "No ambiente real, a vaga seria reservada após a aprovação do pagamento."
      : "No ambiente real, a vaga seria reservada e a Recepção confirmaria a presença.";
    case "solicitar-agendamento": return "No ambiente real, o pedido iria para a Recepção, que combinaria o horário com o profissional.";
    case "agendar": return "No ambiente real, o horário ficaria agendado e você receberia o lembrete.";
    case "pagar": return "No ambiente real, o pagamento seria processado e o recibo chegaria por e-mail.";
    case "participar": return "No ambiente real, sua participação ficaria registrada.";
    default: return "";
  }
}

export function linkDaRecepcao(whatsapp, oferta) {
  const numero = String(whatsapp || "").replace(/\D/g, "");
  const texto = `Olá! Quero saber mais sobre: ${oferta?.titulo || "uma atividade do Instituto"}.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
