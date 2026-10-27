import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  assinaturaWebhookValida,
  configMercadoPago,
  criarPagamentoPix,
  dataComFuso,
  modoPix,
  traduzirStatus,
} from "../src/pix/mercadoPago.js";

// Testes sem rede e sem banco: o fetch do Mercado Pago é simulado.

test("modo PIX: simulado sem token, real com token, forçado por PIX_MODO", () => {
  assert.equal(modoPix({}), "simulado");
  assert.equal(modoPix({ MP_ACCESS_TOKEN: "TEST-abc" }), "mercadopago");
  assert.equal(
    modoPix({ MP_ACCESS_TOKEN: "TEST-abc", PIX_MODO: "simulado" }),
    "simulado",
  );
});

test("validade do PIX fica entre 5 e 1440 minutos", () => {
  assert.equal(configMercadoPago({}).expiracaoMinutos, 30);
  assert.equal(configMercadoPago({ PIX_EXPIRACAO_MINUTOS: "1" }).expiracaoMinutos, 5);
  assert.equal(configMercadoPago({ PIX_EXPIRACAO_MINUTOS: "999999" }).expiracaoMinutos, 1440);
});

test("traduz os status do Mercado Pago", () => {
  assert.equal(traduzirStatus({ status: "approved" }), "aprovado");
  assert.equal(traduzirStatus({ status: "pending" }), "pendente");
  assert.equal(traduzirStatus({ status: "in_process" }), "pendente");
  assert.equal(traduzirStatus({ status: "rejected" }), "cancelado");
  assert.equal(traduzirStatus({ status: "cancelled" }), "cancelado");
  assert.equal(
    traduzirStatus({ status: "cancelled", status_detail: "expired" }),
    "expirado",
  );
});

test("data de expiração usa o fuso -03:00", () => {
  assert.equal(
    dataComFuso(new Date("2026-10-14T15:00:00.000Z")),
    "2026-10-14T12:00:00.000-03:00",
  );
});

test("cria o PIX no Mercado Pago com valor, referência e idempotência", async () => {
  let chamada;
  const fetchImpl = async (url, opcoes) => {
    chamada = { url, opcoes };
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: 123456,
        status: "pending",
        date_of_expiration: "2026-10-14T12:30:00.000-03:00",
        point_of_interaction: {
          transaction_data: {
            qr_code: "00020126...",
            qr_code_base64: "iVBORw0KGgo=",
            ticket_url: "https://mp.com/ticket",
          },
        },
      }),
    };
  };

  const resultado = await criarPagamentoPix(
    {
      valor: 450,
      descricao: "OS-2",
      referencia: "UMUFRIO-OS-2",
      nome: "Carlos Lima",
      idempotencia: "chave-1",
    },
    { env: { MP_ACCESS_TOKEN: "TEST-abc" }, fetchImpl, agora: new Date("2026-10-14T15:00:00Z") },
  );

  const corpo = JSON.parse(chamada.opcoes.body);
  assert.equal(chamada.url, "https://api.mercadopago.com/v1/payments");
  assert.equal(chamada.opcoes.headers.Authorization, "Bearer TEST-abc");
  assert.equal(chamada.opcoes.headers["X-Idempotency-Key"], "chave-1");
  assert.equal(corpo.transaction_amount, 450);
  assert.equal(corpo.payment_method_id, "pix");
  assert.equal(corpo.external_reference, "UMUFRIO-OS-2");
  assert.equal(corpo.payer.first_name, "Carlos");
  assert.equal(resultado.id, "123456");
  assert.equal(resultado.status, "pendente");
  assert.equal(resultado.codigoCopiaECola, "00020126...");
});

test("erro do Mercado Pago vira 502 com mensagem clara", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ message: "invalid access token" }),
  });
  await assert.rejects(
    criarPagamentoPix(
      { valor: 10, descricao: "x", referencia: "r", idempotencia: "k" },
      { env: { MP_ACCESS_TOKEN: "ruim" }, fetchImpl },
    ),
    (erro) => erro.status === 502 && /invalid access token/.test(erro.message),
  );
});

test("assinatura do webhook: sem segredo aceita; com segredo valida o HMAC", () => {
  assert.equal(assinaturaWebhookValida({}, ""), true);

  const segredo = "segredo-do-painel";
  const ts = "1700000000";
  const manifesto = `id:abc123;request-id:req-1;ts:${ts};`;
  const v1 = crypto.createHmac("sha256", segredo).update(manifesto).digest("hex");

  const base = { xRequestId: "req-1", dataId: "ABC123" };
  assert.equal(
    assinaturaWebhookValida({ ...base, xSignature: `ts=${ts},v1=${v1}` }, segredo),
    true,
  );
  assert.equal(
    assinaturaWebhookValida({ ...base, xSignature: `ts=${ts},v1=${"0".repeat(64)}` }, segredo),
    false,
  );
  assert.equal(assinaturaWebhookValida({ ...base }, segredo), false);
});
