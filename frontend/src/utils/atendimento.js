// Funções compartilhadas pela tela de Agendamentos (agendamento + ordem de
// serviço unificados, ponto 10) e pelo pagamento (pontos 11 e 17).

export const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "cartao_credito", label: "Cartão de crédito" },
];

export function formaPagamentoLabel(valor) {
  return FORMAS_PAGAMENTO.find((forma) => forma.value === valor)?.label || "—";
}

export function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoeda(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "—";
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function osCode(id) {
  return id ? `OS-${id}` : "—";
}

// Estado exibido para o atendimento, combinando o status do agendamento
// (agendado/cancelado) com o da ordem de serviço (aberta/andamento/concluída).
export function estadoDoAtendimento(atendimento) {
  if (atendimento.naoRealizado) {
    return { key: "nao_realizado", label: "Não realizado", tone: "red" };
  }
  if (atendimento.status === "cancelado") {
    return { key: "cancelado", label: "Cancelado", tone: "red" };
  }
  if (atendimento.ordemStatus === "concluida") {
    return { key: "concluida", label: "Concluído", tone: "green" };
  }
  if (atendimento.ordemStatus === "andamento") {
    return { key: "andamento", label: "Em andamento", tone: "blue" };
  }
  return { key: "agendado", label: "Agendado", tone: "amber" };
}

export function atendimentoEncerrado(atendimento) {
  return atendimento.status === "cancelado";
}

// Só pode ser editado/cancelado/marcado como não realizado enquanto o
// atendimento não começou (sem OS ainda, ou com a OS aberta).
export function atendimentoNaoIniciado(atendimento) {
  return (
    atendimento.status === "agendado" &&
    (!atendimento.ordemId || atendimento.ordemStatus === "aberta")
  );
}

export function podeRegistrarPagamento(atendimento) {
  return (
    atendimento.status === "agendado" &&
    ["andamento", "concluida"].includes(atendimento.ordemStatus)
  );
}

// Valor a exibir: o cobrado, se já registrado, senão o de tabela do serviço.
export function valorDoAtendimento(atendimento) {
  if (atendimento.valorCobrado !== null && atendimento.valorCobrado !== undefined) return atendimento.valorCobrado;
  if (atendimento.servicoValor === null || atendimento.servicoValor === undefined) return null;
  return Number(atendimento.servicoValor) + Number(atendimento.extrasValor ?? 0);
}

export function pagamentoConfirmado(atendimento) {
  return Boolean(atendimento.pagamentoConfirmado);
}


// Fase 8: link do WhatsApp para o técnico falar com o cliente (wa.me), com uma
// mensagem pronta. Devolve null se o telefone não tiver DDD + número válidos.
export function linkWhatsappCliente(atendimento, tecnicoNome = "") {
  const digitos = String(atendimento?.clienteTelefone || "").replace(/\D/g, "");
  let numero = null;
  if (digitos.length === 10 || digitos.length === 11) numero = `55${digitos}`;
  else if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) numero = digitos;
  if (!numero) return null;

  const hora = atendimento?.hora ? String(atendimento.hora).slice(0, 5) : "";
  const quando = hora ? ` hoje às ${hora}` : "";
  const servico = atendimento?.servicoNome ? ` (${atendimento.servicoNome})` : "";
  const quem = tecnicoNome ? `${tecnicoNome.split(/\s+/)[0]}, da UmuFrio` : "da UmuFrio";
  const texto = `Olá, ${atendimento?.clienteNome || ""}! Aqui é ${quem}. Estou entrando em contato sobre o atendimento${servico}${quando}.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkLigacao(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  return digitos.length >= 10 ? `tel:+55${digitos.replace(/^55(?=\d{12,13}$)/, "")}` : null;
}
