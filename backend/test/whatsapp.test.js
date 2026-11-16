import test from "node:test";
import assert from "node:assert/strict";
import {
  avisarCliente,
  esquecerTokenGupshup,
  montarMensagem,
  provedorDoEvento,
  requisicaoGupshup,
  telefoneParaWhatsApp,
} from "../src/whatsapp.js";

const VARIAVEIS = [
  "GUPSHUP_API_KEY",
  "GUPSHUP_CUSTOMER_SECRET",
  "GUPSHUP_APP_ID",
  "GUPSHUP_SOURCE",
  "GUPSHUP_APP_NAME",
  "GUPSHUP_TEMPLATE_INICIADO",
  "GUPSHUP_TEMPLATE_CONCLUIDO",
  "GUPSHUP_TEMPLATE_NAO_REALIZADO",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
];

const DADOS = {
  clienteNome: "Maria Santos",
  clienteTelefone: "(44) 99999-0000",
  servicoNome: "Limpeza de split",
  tecnicoNome: "Carlos Pereira",
  horario: "2026-11-13T17:30:00Z", // 14:30 em Brasília
};

// Cada teste começa sem nenhuma configuração de WhatsApp e restaura o fetch.
function ambiente(variaveis = {}) {
  for (const nome of VARIAVEIS) delete process.env[nome];
  Object.assign(process.env, variaveis);
  esquecerTokenGupshup();
}

const GUPSHUP = {
  GUPSHUP_API_KEY: "chave-de-teste",
  GUPSHUP_SOURCE: "554498890148",
  GUPSHUP_APP_NAME: "UmufrioAvisos",
  GUPSHUP_TEMPLATE_INICIADO: "id-iniciado",
  GUPSHUP_TEMPLATE_CONCLUIDO: "id-concluido",
  GUPSHUP_TEMPLATE_NAO_REALIZADO: "id-nao-realizado",
};

test("telefone do cadastro vira o formato do WhatsApp", () => {
  assert.equal(telefoneParaWhatsApp("(44) 99999-0000"), "5544999990000");
  assert.equal(telefoneParaWhatsApp("5544999990000"), "5544999990000");
  assert.equal(telefoneParaWhatsApp("123"), null);
});

test("texto do link segue os modelos, inclusive o de não realizado", () => {
  const dados = { ...DADOS, hora: "14:30" };
  assert.match(montarMensagem("iniciado", dados), /foi iniciado às 14:30 pelo técnico Carlos Pereira/);
  assert.match(montarMensagem("concluido", dados), /Obrigado pela confiança!/);
  assert.match(montarMensagem("nao_realizado", dados), /não foi possível realizar o atendimento/);
});

test("escolhe o Gupshup quando configurado, senão a Meta, senão nenhum", () => {
  ambiente();
  assert.equal(provedorDoEvento("iniciado"), null);

  ambiente({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" });
  assert.equal(provedorDoEvento("iniciado"), "meta");

  ambiente(GUPSHUP);
  assert.equal(provedorDoEvento("nao_realizado"), "gupshup");

  // Sem o ID do modelo daquele evento, o Gupshup não é usado para ele.
  ambiente({ ...GUPSHUP, GUPSHUP_TEMPLATE_NAO_REALIZADO: "" });
  assert.equal(provedorDoEvento("nao_realizado"), null);
});

test("chamada ao Gupshup leva chave, número, app e as 4 variáveis em ordem", () => {
  ambiente(GUPSHUP);
  const { url, opcoes } = requisicaoGupshup(
    "5544999990000",
    "nao_realizado",
    { ...DADOS, hora: "14:30" },
    "chave-de-teste",
  );
  const corpo = new URLSearchParams(opcoes.body);

  assert.equal(url, "https://api.gupshup.io/wa/api/v1/template/msg");
  assert.equal(opcoes.headers.apikey, "chave-de-teste");
  assert.equal(corpo.get("source"), "554498890148");
  assert.equal(corpo.get("destination"), "5544999990000");
  assert.equal(corpo.get("src.name"), "UmufrioAvisos");
  assert.deepEqual(JSON.parse(corpo.get("template")), {
    id: "id-nao-realizado",
    params: ["Maria Santos", "Limpeza de split", "14:30", "Carlos Pereira"],
  });
});

test("aviso enviado, recusado e sem configuração (rede simulada)", async (t) => {
  const fetchOriginal = global.fetch;
  t.after(() => {
    global.fetch = fetchOriginal;
  });
  const erroOriginal = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = erroOriginal;
  });

  ambiente(GUPSHUP);
  global.fetch = async () =>
    new Response(JSON.stringify({ status: "submitted", messageId: "x" }), { status: 202 });
  const ok = await avisarCliente("iniciado", DADOS);
  assert.equal(ok.status, "enviado");
  assert.match(ok.link, /^https:\/\/wa\.me\/5544999990000\?text=/);

  global.fetch = async () =>
    new Response(JSON.stringify({ status: "error", message: "Insufficient balance" }), { status: 400 });
  const falhou = await avisarCliente("concluido", DADOS);
  assert.equal(falhou.status, "erro");
  assert.ok(falhou.link, "sem envio automático, a tela ainda oferece o link");

  ambiente();
  const desligado = await avisarCliente("nao_realizado", DADOS);
  assert.equal(desligado.status, "nao_configurado");

  const semTelefone = await avisarCliente("iniciado", { ...DADOS, clienteTelefone: "12" });
  assert.equal(semTelefone.status, "telefone_invalido");
});

test("com o segredo da conta, gera o token e o reaproveita enquanto vale", async (t) => {
  const fetchOriginal = global.fetch;
  t.after(() => {
    global.fetch = fetchOriginal;
  });

  const { GUPSHUP_API_KEY, ...semChave } = GUPSHUP;
  ambiente({ ...semChave, GUPSHUP_CUSTOMER_SECRET: "segredo-de-teste", GUPSHUP_APP_ID: "app-1" });
  assert.equal(provedorDoEvento("iniciado"), "gupshup");

  const chamadas = [];
  global.fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (url.endsWith("/auth/app-token")) {
      return new Response(
        JSON.stringify({ token: "token-24h", expiresAt: Date.now() + 24 * 60 * 60 * 1000 }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ status: "submitted" }), { status: 202 });
  };

  assert.equal((await avisarCliente("iniciado", DADOS)).status, "enviado");
  assert.equal((await avisarCliente("concluido", DADOS)).status, "enviado");

  const pedidosDeToken = chamadas.filter((c) => c.url.endsWith("/auth/app-token"));
  assert.equal(pedidosDeToken.length, 1, "o token é pedido uma vez e reaproveitado");
  assert.equal(pedidosDeToken[0].url, "https://api.gupshup.io/wa/app/app-1/auth/app-token");
  assert.equal(pedidosDeToken[0].opcoes.headers["X-Customer-Secret"], "segredo-de-teste");

  const envios = chamadas.filter((c) => c.url.endsWith("/template/msg"));
  assert.equal(envios.length, 2);
  assert.ok(envios.every((c) => c.opcoes.headers.apikey === "token-24h"));
});

test("segredo recusado vira erro e a tela oferece o link", async (t) => {
  const fetchOriginal = global.fetch;
  const erroOriginal = console.error;
  console.error = () => {};
  t.after(() => {
    global.fetch = fetchOriginal;
    console.error = erroOriginal;
  });

  ambiente({ ...GUPSHUP, GUPSHUP_CUSTOMER_SECRET: "errado", GUPSHUP_APP_ID: "app-1" });
  global.fetch = async () =>
    new Response(JSON.stringify({ error: "SECRET_INVALID", message: "Secret does not match" }), { status: 401 });

  const resultado = await avisarCliente("iniciado", DADOS);
  assert.equal(resultado.status, "erro");
  assert.ok(resultado.link);
});
