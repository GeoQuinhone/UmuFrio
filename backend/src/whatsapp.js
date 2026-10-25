// Aviso ao cliente pelo WhatsApp quando o atendimento é iniciado ou concluído.
//
// O envio automático usa a WhatsApp Cloud API (oficial da Meta) com modelos
// (templates) aprovados. Sem as variáveis WHATSAPP_TOKEN e
// WHATSAPP_PHONE_NUMBER_ID o envio automático fica desligado, e a tela oferece
// o link wa.me como alternativa (o técnico só toca em "enviar").
//
// Os modelos precisam ter 4 variáveis no corpo, nesta ordem:
//   {{1}} nome do cliente, {{2}} serviço, {{3}} horário, {{4}} técnico.

const EVENTOS = {
  iniciado: {
    template: () => process.env.WHATSAPP_TEMPLATE_INICIADO || "servico_iniciado",
    verbo: "iniciado",
    final: "",
  },
  concluido: {
    template: () => process.env.WHATSAPP_TEMPLATE_CONCLUIDO || "servico_concluido",
    verbo: "concluído",
    final: " Obrigado pela confiança!",
  },
};

// "(44) 99999-9999" → "5544999999999". Aceita número já com 55 na frente.
export function telefoneParaWhatsApp(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");

  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (
    digitos.startsWith("55") &&
    (digitos.length === 12 || digitos.length === 13)
  ) {
    return digitos;
  }

  return null;
}

// Horário no fuso de Brasília, independente do fuso do servidor (o Render
// roda em UTC).
export function formatarHora(data) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(data));
}

export function montarMensagem(evento, dados) {
  const { verbo, final } = EVENTOS[evento];
  const empresa = process.env.EMPRESA_NOME || "UmuFrio";

  return (
    `Olá, ${dados.clienteNome}! Seu serviço de ${dados.servicoNome} foi ` +
    `${verbo} às ${dados.hora} pelo técnico ${dados.tecnicoNome}.${final} ` +
    `– ${empresa}`
  );
}

function envioAutomaticoConfigurado() {
  return Boolean(
    process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

async function enviarTemplate(numero, evento, dados) {
  const versao = process.env.WHATSAPP_API_VERSION || "v23.0";
  const url = `https://graph.facebook.com/${versao}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const parametros = [
    dados.clienteNome,
    dados.servicoNome,
    dados.hora,
    dados.tecnicoNome,
  ].map((texto) => ({ type: "text", text: String(texto) }));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: numero,
      type: "template",
      template: {
        name: EVENTOS[evento].template(),
        language: { code: process.env.WHATSAPP_TEMPLATE_IDIOMA || "pt_BR" },
        components: [{ type: "body", parameters: parametros }],
      },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    throw new Error(
      corpo?.error?.message || `WhatsApp respondeu com status ${response.status}`,
    );
  }
}

// Nunca lança erro: o atendimento já foi salvo, e uma falha no WhatsApp não
// pode desfazer isso. O resultado diz à tela o que aconteceu.
//   status: "enviado" | "nao_configurado" | "erro" | "telefone_invalido"
export async function avisarCliente(evento, dados) {
  if (!EVENTOS[evento]) return null;

  const numero = telefoneParaWhatsApp(dados.clienteTelefone);
  if (!numero) return { status: "telefone_invalido" };

  const dadosComHora = { ...dados, hora: formatarHora(dados.horario) };
  const mensagem = montarMensagem(evento, dadosComHora);
  const link = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

  if (!envioAutomaticoConfigurado()) {
    return { status: "nao_configurado", link };
  }

  try {
    await enviarTemplate(numero, evento, dadosComHora);
    return { status: "enviado", link };
  } catch (error) {
    console.error("Falha ao enviar aviso pelo WhatsApp:", error.message);
    return { status: "erro", link };
  }
}
