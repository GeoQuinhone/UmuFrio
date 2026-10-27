import crypto from "node:crypto";

import { erroHttp } from "../httpError.js";

// Cliente mínimo da API do Mercado Pago para PIX. Usa o fetch nativo do Node
// (18+), sem dependências novas. `fetchImpl` e `env` podem ser trocados nos
// testes.
//
// Variáveis de ambiente (todas opcionais — sem MP_ACCESS_TOKEN o sistema usa o
// modo simulado):
//   MP_ACCESS_TOKEN        token de acesso (use o de TESTE para desenvolver)
//   PIX_MODO               "simulado" força o modo simulado mesmo com token
//   MP_NOTIFICATION_URL    URL pública https para o aviso automático (webhook)
//   MP_WEBHOOK_SECRET      segredo da assinatura do webhook (painel do MP)
//   MP_PAYER_EMAIL_PADRAO  e-mail enviado quando o cliente não tem e-mail
//   PIX_EXPIRACAO_MINUTOS  validade do PIX (padrão 30)

const API_PADRAO = "https://api.mercadopago.com";
const TIMEOUT_MS = 15000;

function entre(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

export function configMercadoPago(env = process.env) {
  return {
    token: String(env.MP_ACCESS_TOKEN || "").trim(),
    forcarSimulado: String(env.PIX_MODO || "").trim() === "simulado",
    apiUrl: String(env.MP_API_URL || API_PADRAO).replace(/\/+$/, ""),
    notificationUrl: String(env.MP_NOTIFICATION_URL || "").trim(),
    webhookSecret: String(env.MP_WEBHOOK_SECRET || "").trim(),
    emailPadrao: String(
      env.MP_PAYER_EMAIL_PADRAO || "cliente@umufrio.com.br",
    ).trim(),
    expiracaoMinutos: entre(
      Number(env.PIX_EXPIRACAO_MINUTOS) || 30,
      5,
      1440,
    ),
  };
}

export function modoPix(env = process.env) {
  const config = configMercadoPago(env);
  return config.token && !config.forcarSimulado ? "mercadopago" : "simulado";
}

// Status do Mercado Pago -> status interno da cobrança.
export function traduzirStatus(pagamento) {
  const status = String(pagamento?.status || "");
  const detalhe = String(pagamento?.status_detail || "");

  if (status === "approved") return "aprovado";
  if (status === "cancelled" && /expired/i.test(detalhe)) return "expirado";
  if (status === "cancelled" || status === "rejected") return "cancelado";
  // pending, in_process, authorized e qualquer outro seguem como pendentes.
  return "pendente";
}

// O Mercado Pago aceita a data de expiração em ISO 8601 com fuso. O Brasil
// não tem horário de verão desde 2019, então -03:00 é fixo.
export function dataComFuso(data) {
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().replace("Z", "-03:00");
}

async function chamar(config, caminho, { method = "GET", body, idempotencia, fetchImpl }) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

  const headers = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };
  if (idempotencia) headers["X-Idempotency-Key"] = idempotencia;

  let resposta;
  try {
    resposta = await fetchImpl(`${config.apiUrl}${caminho}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controle.signal,
    });
  } catch (erro) {
    throw erroHttp(
      erro?.name === "AbortError"
        ? "O Mercado Pago demorou para responder. Tente novamente."
        : "Não foi possível falar com o Mercado Pago. Verifique a conexão.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }

  let dados = null;
  try {
    dados = await resposta.json();
  } catch {
    // resposta sem corpo JSON
  }

  if (!resposta.ok) {
    const motivo =
      dados?.cause?.[0]?.description ||
      dados?.message ||
      `erro ${resposta.status}`;
    // Não repassamos o status do MP: 401 deles significaria "sessão expirada"
    // para o nosso front. Aqui é sempre falha do gateway.
    throw erroHttp(`Mercado Pago recusou a operação: ${motivo}`, 502);
  }

  return dados;
}

export async function criarPagamentoPix(
  { valor, descricao, referencia, email, nome, idempotencia },
  { env = process.env, fetchImpl = globalThis.fetch, agora = new Date() } = {},
) {
  const config = configMercadoPago(env);

  const corpo = {
    transaction_amount: Number(Number(valor).toFixed(2)),
    description: descricao,
    payment_method_id: "pix",
    external_reference: referencia,
    date_of_expiration: dataComFuso(
      new Date(agora.getTime() + config.expiracaoMinutos * 60 * 1000),
    ),
    payer: {
      email: email || config.emailPadrao,
      first_name: String(nome || "Cliente").split(/\s+/)[0],
    },
  };

  if (config.notificationUrl) corpo.notification_url = config.notificationUrl;

  const dados = await chamar(config, "/v1/payments", {
    method: "POST",
    body: corpo,
    idempotencia,
    fetchImpl,
  });

  const transacao = dados?.point_of_interaction?.transaction_data || {};

  if (!dados?.id || !transacao.qr_code) {
    throw erroHttp(
      "O Mercado Pago não devolveu o código PIX. Confira o token e se a conta tem PIX habilitado.",
      502,
    );
  }

  return {
    id: String(dados.id),
    status: traduzirStatus(dados),
    codigoCopiaECola: transacao.qr_code,
    qrCodeBase64: transacao.qr_code_base64 || null,
    ticketUrl: transacao.ticket_url || null,
    expiraEm: dados.date_of_expiration
      ? new Date(dados.date_of_expiration)
      : new Date(agora.getTime() + config.expiracaoMinutos * 60 * 1000),
  };
}

export async function consultarPagamento(
  id,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  const config = configMercadoPago(env);
  const dados = await chamar(config, `/v1/payments/${encodeURIComponent(id)}`, {
    fetchImpl,
  });
  return { id: String(dados.id), status: traduzirStatus(dados), bruto: dados };
}

export async function cancelarPagamento(
  id,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  const config = configMercadoPago(env);
  await chamar(config, `/v1/payments/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { status: "cancelled" },
    fetchImpl,
  });
}

// Valida a assinatura do webhook (cabeçalho x-signature). Sem segredo
// configurado não exigimos assinatura — nesse caso a consulta direta à API do
// Mercado Pago, feita depois, é quem decide se o pagamento foi aprovado.
export function assinaturaWebhookValida(
  { xSignature, xRequestId, dataId },
  segredo,
) {
  if (!segredo) return true;
  if (!xSignature) return false;

  const partes = Object.fromEntries(
    String(xSignature)
      .split(",")
      .map((trecho) => trecho.trim().split("="))
      .filter((par) => par.length === 2),
  );

  if (!partes.ts || !partes.v1) return false;

  const id = /^[a-z0-9]+$/i.test(String(dataId || ""))
    ? String(dataId).toLowerCase()
    : String(dataId || "");

  let manifesto = "";
  if (id) manifesto += `id:${id};`;
  if (xRequestId) manifesto += `request-id:${xRequestId};`;
  manifesto += `ts:${partes.ts};`;

  const esperado = crypto
    .createHmac("sha256", segredo)
    .update(manifesto)
    .digest("hex");

  const recebido = String(partes.v1);
  if (recebido.length !== esperado.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(recebido),
    Buffer.from(esperado),
  );
}
