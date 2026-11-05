import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { situacaoEstoque } from "../src/estoqueRegras.js";
import { tabelaParaCsv, CATEGORIAS_DESPESA } from "../src/relatorios/consultas.js";

test("CNPJ: aceita válido, recusa dígito errado e repetido", async () => {
  const { cnpjValido, cpfValido, documentoValido, tipoPessoaDoDocumento } = await import("../src/documentos.js");
  assert.equal(cnpjValido("11.222.333/0001-81"), true);
  assert.equal(cnpjValido("11222333000182"), false);
  assert.equal(cnpjValido("00000000000000"), false);
  assert.equal(cnpjValido("123"), false);
  assert.equal(tipoPessoaDoDocumento("11222333000181"), "PJ");
  assert.equal(tipoPessoaDoDocumento("529.982.247-25"), "PF");
  assert.equal(tipoPessoaDoDocumento("1234"), null);
  assert.equal(documentoValido("529.982.247-25"), cpfValido("52998224725"));
  assert.equal(documentoValido("11.222.333/0001-81"), true);
  assert.equal(documentoValido("11.222.333/0001-80"), false);
});

test("estoque: mínimo é inclusivo e zerado tem prioridade", () => {
  assert.equal(situacaoEstoque({ saldo: 11, quantidadeMinima: 10 }), "ok");
  assert.equal(situacaoEstoque({ saldo: 10, quantidadeMinima: 10 }), "baixo");
  assert.equal(situacaoEstoque({ saldo: 3, quantidadeMinima: 10 }), "baixo");
  assert.equal(situacaoEstoque({ saldo: 0, quantidadeMinima: 10 }), "zerado");
  assert.equal(situacaoEstoque({ saldo: 0, quantidadeMinima: 0 }), "zerado");
  assert.equal(situacaoEstoque({ saldo: "5", quantidadeMinima: "05" }), "baixo");
  assert.equal(situacaoEstoque({ saldo: 1, quantidadeMinima: 0 }), "ok");
});

const relatorio = {
  faturamento: {
    total: 1000,
    gastos: { pecas: 200, despesas: 150, total: 350, porCategoria: [{ categoria: "combustivel", total: 150 }] },
    lucro: 650,
    pagos: [{ pagoEm: "2026-11-03T13:00:00Z", cliente: "A", servico: "S", tecnico: "T", forma: "pix", valor: 500 }],
    pendentes: [{ data: "2026-11-01", cliente: "B", servico: "S", tecnico: "T", diasEmAberto: 4, valor: 300 }],
  },
};

test("CSV de gastos e lucro soma corretamente", () => {
  const csv = tabelaParaCsv("gastos-por-categoria", relatorio);
  assert.ok(csv.includes("Faturamento recebido;1000,00"));
  assert.ok(csv.includes("Custo das peças;-200,00"));
  assert.ok(csv.includes("Despesa: combustivel;-150,00"));
  assert.ok(csv.includes("Lucro;650,00"));
});

test("CSV de pagos e pendentes", () => {
  assert.ok(tabelaParaCsv("faturamento-pagos", relatorio).includes(";A;S;T;PIX;500,00"));
  assert.ok(tabelaParaCsv("faturamento-pendentes", relatorio).includes("2026-11-01;B;S;T;4;300,00"));
});

test("categorias de despesa são as esperadas", () => {
  assert.ok(CATEGORIAS_DESPESA.includes("combustivel"));
  assert.ok(CATEGORIAS_DESPESA.includes("outros"));
});

// Auditoria de permissões (ponto 17): toda rota autenticada precisa declarar
// quem pode usá-la (roles) ou delegar a checagem a um serviço que verifica o
// perfil. Rotas públicas são só auth, chat e o webhook do PIX.
const PUBLICAS = new Set(["auth.js", "chat.js"]);
const COM_CHECAGEM_INTERNA = new Set(["pix.js", "checkin.js"]);

test("toda rota autenticada declara permissão por perfil", () => {
  const dir = new URL("../src/routes/", import.meta.url);
  for (const arquivo of readdirSync(dir)) {
    if (!arquivo.endsWith(".js") || PUBLICAS.has(arquivo)) continue;
    const fonte = readFileSync(new URL(arquivo, dir), "utf8");
    const usaRouterUse = /router\.use\(\s*roles\(/.test(fonte);
    const definicoes = [...fonte.matchAll(/router\.(get|post|put|patch|delete)\(/g)];
    for (const def of definicoes) {
      const trecho = fonte.slice(def.index, def.index + 400);
      const declara = usaRouterUse || /roles\(|perfis\b/.test(trecho);
      assert.ok(declara, `${arquivo}: rota sem controle de perfil perto de "${trecho.slice(0, 50).replace(/\s+/g, " ")}"`);
    }
    if (COM_CHECAGEM_INTERNA.has(arquivo)) continue;
  }
});

test("rotas de gestão financeira são exclusivas do CEO", () => {
  const dir = new URL("../src/routes/", import.meta.url);
  for (const arquivo of ["relatorios.js", "despesas.js", "notificacoes.js", "usuarios.js", "veiculos.js"]) {
    const fonte = readFileSync(new URL(arquivo, dir), "utf8");
    const perfisUsados = [...fonte.matchAll(/roles\(([^)]*)\)/g)].map((m) => m[1]);
    for (const p of perfisUsados) {
      if (arquivo === "usuarios.js" && p.includes("atendente")) continue; // /tecnicos
      assert.equal(p.replace(/\s/g, ""), '"ceo"', `${arquivo} deve ser só CEO, mas usa roles(${p})`);
    }
  }
});

test("serviços: alterar preço e peças é só do CEO", () => {
  const fonte = readFileSync(new URL("../src/routes/servicos.js", import.meta.url), "utf8");
  const escritas = [...fonte.matchAll(/router\.(post|put|patch|delete)\(\s*"[^"]*",\s*roles\(([^)]*)\)/g)];
  assert.ok(escritas.length >= 5);
  for (const m of escritas) assert.equal(m[2].replace(/\s/g, ""), '"ceo"');
});
