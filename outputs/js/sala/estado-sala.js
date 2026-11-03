/*
 * ESTADOS DA SALA DE ATENDIMENTO.
 *
 * Funções puras: o banco decide o estado (`appointment_room_context`), aqui só
 * se escolhe o que mostrar. Nada daqui concede acesso.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pedidoDoEndereco(parametros) {
  const valor = parametros?.get?.("pedido");
  return typeof valor === "string" && UUID.test(valor.trim()) ? valor.trim().toLowerCase() : null;
}

export function caminhoDaSala(requestId) {
  if (!UUID.test(String(requestId))) throw new TypeError("Identificador de atendimento inválido.");
  return `/sala-atendimento.html?pedido=${encodeURIComponent(String(requestId).toLowerCase())}`;
}

const HORA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const quando = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.valueOf()) ? HORA.format(d) : ""; };

export function visaoDoContexto(contexto) {
  const estado = contexto?.state;
  switch (estado) {
    case "open":
      return { estado, podeEntrar: true, titulo: "Sua sala está aberta", texto: "Entre quando estiver pronto(a). A câmera e o microfone só ligam se você permitir." };
    case "too_early":
      return { estado, podeEntrar: false, titulo: "Ainda não é a hora", texto: `A sala abre em ${quando(contexto.opens_at)}.` };
    case "expired":
      return { estado, podeEntrar: false, titulo: "Esta sala já fechou", texto: "O horário deste atendimento terminou." };
    case "closed":
      return { estado, podeEntrar: false, titulo: "Atendimento encerrado", texto: "O profissional encerrou a sala." };
    case "cancelled":
      return { estado, podeEntrar: false, titulo: "Atendimento cancelado", texto: "Este atendimento foi cancelado e a sala não está disponível." };
    case "not_confirmed":
      return { estado, podeEntrar: false, titulo: "Atendimento sem sala", texto: "A sala só existe para atendimentos online com reserva confirmada." };
    default:
      return { estado: "denied", podeEntrar: false, titulo: "Sala indisponível", texto: "Não encontramos uma sala para você neste endereço." };
  }
}

export function mensagemDeErro(erro) {
  const codigo = String(erro?.code ?? "");
  const status = Number(erro?.status ?? 0);
  if (codigo === "42501" || status === 401 || status === 403) return "Seu acesso não permite entrar nesta sala. Entre na sua conta e tente de novo.";
  if (codigo === "54000" || status === 429) return "Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.";
  if (codigo === "P0001") return "A sala não está disponível agora.";
  if (codigo === "22023") return "Revise a mensagem e envie de novo.";
  if (status === 0 || codigo === "network") return "Sem conexão. Tentando reconectar…";
  return "Não foi possível concluir. Tente de novo em instantes.";
}

export const erroDeRede = (erro) => !erro || erro.code === "network" || Number(erro.status ?? 0) === 0;
