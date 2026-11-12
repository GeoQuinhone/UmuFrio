import test from "node:test";
import assert from "node:assert/strict";

import { gerarDespesas } from "../src/db/seedAno/financeiro.js";
import { normalizarVinculos } from "../src/despesasRegras.js";
import { CATEGORIAS_DESPESA } from "../src/relatorios/consultas.js";
import { USUARIOS_BASE, EMAIL_CEO } from "../src/db/seedAno/dados.js";

const usuarios = {
  ceoId: 1, ceoNome: "Mário Alfaro", atendenteId: 2, atendenteNome: "Bruno", estoquistaId: 3, estoquistaNome: "Carla",
  tecnicos: [
    { id: 4, nome: "Diego", desde: null },
    { id: 5, nome: "Priscila", desde: "2026-06-25" },
  ],
};
const veiculos = [
  { id: 1, placa: "AAA1A11", modelo: "Strada", status: "ativo", tecnicoId: 4 },
  { id: 2, placa: "BBB2B22", modelo: "Fiorino", status: "manutencao", tecnicoId: null },
];
const entrada = { inicio: "2025-10-01", hoje: "2026-11-23", usuarios, veiculos, faturamentoPorMes: { "2026-10": 30000 } };

test("seed: e-mails seguem nomefuncao@umufrio.com.br e o CEO é o definido", () => {
  assert.equal(USUARIOS_BASE.find((u) => u.perfil === "ceo").email, "alfaromario2024@umufrio.com.br");
  assert.equal(EMAIL_CEO, "alfaromario2024@umufrio.com.br");
  for (const u of USUARIOS_BASE.filter((x) => x.perfil !== "ceo")) {
    const primeiroNome = u.nome.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    assert.equal(u.email, `${primeiroNome}${u.perfil === "estoquista" ? "estoquista" : u.perfil}@umufrio.com.br`);
  }
});

test("seed: despesas dentro do período, nunca depois de hoje, categorias válidas", () => {
  const d = gerarDespesas(entrada);
  assert.ok(d.length > 100);
  for (const x of d) {
    assert.ok(x.data >= entrada.inicio && x.data <= entrada.hoje, x.data);
    assert.ok(CATEGORIAS_DESPESA.includes(x.categoria), x.categoria);
    assert.ok(x.valor > 0);
  }
});

test("seed: vínculos respeitam as regras da Fase 9", () => {
  for (const x of gerarDespesas(entrada)) {
    const regra = normalizarVinculos(x.categoria, { veiculoId: x.veiculo_id, funcionarioId: x.funcionario_id });
    assert.equal(regra.veiculoId, x.veiculo_id);
    assert.equal(regra.funcionarioId, x.funcionario_id);
    if (x.categoria === "combustivel" || x.categoria === "manutencao") assert.ok(x.veiculo_id);
    if (x.categoria === "salarios") assert.ok(x.funcionario_id);
  }
});

test("seed: técnico novo só recebe salário depois de entrar", () => {
  const sal = gerarDespesas(entrada).filter((x) => x.funcionario_id === 5);
  assert.ok(sal.length > 0 && sal.length < 8);
  assert.ok(sal.every((x) => x.data >= "2026-07-01"));
});

test("seed: resultado estável para a mesma entrada", () => {
  assert.deepEqual(gerarDespesas(entrada), gerarDespesas(entrada));
});
