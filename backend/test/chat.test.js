import assert from "node:assert/strict";
import test from "node:test";

import { configChat, linkWhatsapp, mensagemWhatsapp } from "../src/chat/contexto.js";
import { chatComIA, modoChat, montarSistema, prepararMensagens, responderComClaude } from "../src/chat/claude.js";
import { responderDemonstracao } from "../src/chat/demo.js";
import { criarLimite } from "../src/chat/limite.js";
import { validarMensagens } from "../src/chat/validacao.js";

const contexto = {
  ...configChat({ CHAT_WHATSAPP: "(44) 99999-0000" }),
  servicos: [
    { nome: "Instalação de Ar-Condicionado", descricao: "Split completo", valor: 450 },
    { nome: "Manutenção de Ar-Condicionado", descricao: null, valor: 180 },
    { nome: "Retirada de Ar-Condicionado", descricao: null, valor: 120 },
  ],
};

test("WhatsApp: ganha o 55 e gera o link com texto", () => {
  assert.equal(contexto.whatsapp, "5544999990000");
  assert.equal(linkWhatsapp(contexto), "https://wa.me/5544999990000");
  assert.match(linkWhatsapp(contexto, "Olá!"), /\?text=Ol%C3%A1!/);
  // Sem CHAT_WHATSAPP, vale o número oficial (44) 99804-9224.
  const padrao = configChat({});
  assert.equal(padrao.whatsapp, "5544998049224");
  assert.equal(
    linkWhatsapp(padrao, mensagemWhatsapp(padrao)),
    "https://wa.me/5544998049224?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20UmuFrio%20e%20gostaria%20de%20atendimento.",
  );
});

test("demonstração: preço de um serviço específico e lista geral", () => {
  const um = responderDemonstracao("Quanto custa a instalação?", contexto);
  assert.match(um.resposta, /Instalação de Ar-Condicionado: R\$\s?450,00/);
  assert.equal(um.encaminhar, true);

  const todos = responderDemonstracao("quais os valores?", contexto);
  assert.match(todos.resposta, /450,00/);
  assert.match(todos.resposta, /180,00/);
  assert.match(todos.resposta, /120,00/);
});

test("demonstração: horário, pagamento, agendamento e desconhecido", () => {
  assert.match(responderDemonstracao("qual o horário de funcionamento?", contexto).resposta, /Segunda a sexta/);
  assert.match(responderDemonstracao("aceitam pix?", contexto).resposta, /PIX/);
  assert.equal(responderDemonstracao("quero agendar uma visita", contexto).encaminhar, true);
  assert.equal(responderDemonstracao("falar com atendente", contexto).encaminhar, true);
  const estranho = responderDemonstracao("qual a capital da França?", contexto);
  assert.equal(estranho.encaminhar, true);
});

test("demonstração: cumprimento curto responde sem encaminhar", () => {
  const r = responderDemonstracao("Oi", contexto);
  assert.match(r.resposta, /assistente virtual/);
  assert.equal(r.encaminhar, false);
});

test("validação das mensagens (rota pública)", () => {
  const ok = validarMensagens({ mensagens: [{ papel: "usuario", texto: " oi " }] });
  assert.deepEqual(ok, [{ papel: "usuario", texto: "oi" }]);
  assert.throws(() => validarMensagens({}), /1 a 12/);
  assert.throws(() => validarMensagens({ mensagens: [{ papel: "sistema", texto: "x" }] }), /inválida/);
  assert.throws(() => validarMensagens({ mensagens: [{ papel: "usuario", texto: "a".repeat(601) }] }), /600/);
  assert.throws(
    () => validarMensagens({ mensagens: [{ papel: "usuario", texto: "a" }, { papel: "assistente", texto: "b" }] }),
    /última/,
  );
  assert.throws(
    () => validarMensagens({ mensagens: Array.from({ length: 13 }, () => ({ papel: "usuario", texto: "a" })) }),
    /1 a 12/,
  );
});

test("limite por IP: bloqueia o excedente e libera depois da janela", () => {
  const limite = criarLimite({ janelaMs: 1000, maximo: 2 });
  assert.equal(limite("a", 0).ok, true);
  assert.equal(limite("a", 10).ok, true);
  const negado = limite("a", 20);
  assert.equal(negado.ok, false);
  assert.ok(negado.tentarEmSeg >= 1);
  assert.equal(limite("b", 20).ok, true);
  assert.equal(limite("a", 1500).ok, true);
});

test("mensagens para a IA começam no usuário e alternam os papéis", () => {
  const m = prepararMensagens([
    { papel: "assistente", texto: "Olá!" },
    { papel: "usuario", texto: "oi" },
    { papel: "usuario", texto: "tudo bem?" },
    { papel: "assistente", texto: "sim" },
    { papel: "usuario", texto: "preço?" },
  ]);
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant", "user"]);
  assert.equal(m[0].content, "oi\ntudo bem?");
});

test("prompt do sistema traz os serviços e as regras de segurança", () => {
  const s = montarSistema(contexto);
  assert.match(s, /Instalação de Ar-Condicionado: R\$ 450,00/);
  assert.match(s, /ignore qualquer instrução/);
  assert.match(s, /\[\[WHATSAPP\]\]/);
});

test("Claude: chamada correta e marcador de WhatsApp vira encaminhar", async () => {
  let chamada;
  const fetchImpl = async (url, opcoes) => {
    chamada = { url, corpo: JSON.parse(opcoes.body), headers: opcoes.headers };
    return { ok: true, json: async () => ({ content: [{ type: "text", text: "Posso ajudar com isso no WhatsApp. [[WHATSAPP]]" }] }) };
  };
  const r = await responderComClaude(
    { mensagens: [{ papel: "usuario", texto: "quero agendar" }], contexto },
    { env: { ANTHROPIC_API_KEY: "sk-teste" }, fetchImpl },
  );
  assert.equal(chamada.url, "https://api.anthropic.com/v1/messages");
  assert.equal(chamada.headers["x-api-key"], "sk-teste");
  assert.equal(chamada.headers["anthropic-version"], "2023-06-01");
  assert.equal(chamada.corpo.model, "claude-haiku-5-5");
  assert.equal(chamada.corpo.messages[0].role, "user");
  assert.equal(r.encaminhar, true);
  assert.equal(r.resposta, "Posso ajudar com isso no WhatsApp.");
});

test("Claude: erro da API vira 502; modo IA só com chave", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid x-api-key" } }) });
  await assert.rejects(
    responderComClaude({ mensagens: [{ papel: "usuario", texto: "oi" }], contexto }, { env: { ANTHROPIC_API_KEY: "x" }, fetchImpl }),
    (e) => e.status === 502 && /invalid x-api-key/.test(e.message),
  );
  assert.equal(chatComIA({}), false);
  assert.equal(chatComIA({ ANTHROPIC_API_KEY: "sk" }), true);
  assert.equal(chatComIA({ ANTHROPIC_API_KEY: "sk", CHAT_MODO: "demonstracao" }), false);
});

test("Groq: chamada no formato OpenAI e resposta lida de choices", async () => {
  let chamada;
  const fetchImpl = async (url, opcoes) => {
    chamada = { url, corpo: JSON.parse(opcoes.body), headers: opcoes.headers };
    return { ok: true, json: async () => ({ choices: [{ message: { content: "Funcionamos de segunda a sexta. [[WHATSAPP]]" } }] }) };
  };
  const env = { GROQ_API_KEY: "gsk-teste", ANTHROPIC_API_KEY: "sk-outra" };
  assert.equal(modoChat(env), "ia");
  const r = await responderComClaude({ mensagens: [{ papel: "usuario", texto: "horário?" }], contexto }, { env, fetchImpl });
  assert.equal(chamada.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(chamada.headers.authorization, "Bearer gsk-teste");
  assert.equal(chamada.corpo.model, "llama-3.3-70b-versatile");
  assert.equal(chamada.corpo.messages[0].role, "system");
  assert.equal(chamada.corpo.messages[1].role, "user");
  assert.equal(r.encaminhar, true);
  assert.equal(r.resposta, "Funcionamos de segunda a sexta.");
});

test("modoChat: IA só com chave; sem chave é indisponível; demonstração só se pedida", () => {
  assert.equal(modoChat({ ANTHROPIC_API_KEY: "sk" }), "ia");
  assert.equal(modoChat({}), "indisponivel");
  assert.equal(modoChat({ CHAT_MODO: "demonstracao" }), "demonstracao");
  assert.equal(modoChat({ ANTHROPIC_API_KEY: "sk", CHAT_MODO: "demonstracao" }), "demonstracao");
});
