import test from "node:test";
import assert from "node:assert/strict";
import {
  UFS, ufValida, nomePessoaValido, razaoSocialValida, nomeClienteValido, numeroImovelValido,
} from "../src/validacoes.js";
import { normalizarVinculos } from "../src/despesasRegras.js";
import { LIMITE_QUANTIDADE, quantidadeDentroDoLimite } from "../src/estoqueRegras.js";

test("UF: só os 27 estados válidos", () => {
  assert.equal(UFS.length, 27);
  for (const uf of ["PR", "sp", " RJ "]) assert.ok(ufValida(uf), uf);
  for (const uf of ["XX", "AA", "ZZ", "P", "PRR", "", null, "12", "ab"]) assert.ok(!ufValida(uf), String(uf));
});

test("nome de pessoa não aceita número", () => {
  for (const n of ["Maria da Silva", "João D'Ávila", "Ana-Clara", "José Jr."]) assert.ok(nomePessoaValido(n), n);
  for (const n of ["Maria 2", "J0ão", "123", "", " ", "A", "Maria@Silva", "Ana_1"]) assert.ok(!nomePessoaValido(n), n);
});

test("razão social aceita números, nome de pessoa não", () => {
  assert.ok(razaoSocialValida("Frio 24h Ltda"));
  assert.ok(razaoSocialValida("A & B Refrigeração (Matriz)"));
  assert.ok(!razaoSocialValida("Frio <script>"));
  assert.ok(nomeClienteValido("Frio 24h Ltda", "PJ"));
  assert.ok(!nomeClienteValido("Frio 24h Ltda", "PF"));
});

test("número do imóvel: só dígitos", () => {
  for (const n of ["1", "123", "999999"]) assert.ok(numeroImovelValido(n), n);
  for (const n of ["12A", "S/N", "abc", "", "1234567", "-1", "1.5"]) assert.ok(!numeroImovelValido(n), n);
});

test("limite de estoque realista (200)", () => {
  assert.equal(LIMITE_QUANTIDADE, 200);
  assert.ok(quantidadeDentroDoLimite(0));
  assert.ok(quantidadeDentroDoLimite(200));
  assert.ok(!quantidadeDentroDoLimite(201));
  assert.ok(!quantidadeDentroDoLimite(-1));
  assert.ok(!quantidadeDentroDoLimite(1.5));
});

test("despesa: vínculo só com a categoria certa", () => {
  assert.deepEqual(normalizarVinculos("combustivel", { veiculoId: "3", funcionarioId: 9 }), { veiculoId: 3, funcionarioId: null });
  assert.deepEqual(normalizarVinculos("manutencao", { veiculoId: 4 }), { veiculoId: 4, funcionarioId: null });
  assert.deepEqual(normalizarVinculos("salarios", { veiculoId: 3, funcionarioId: "7" }), { veiculoId: null, funcionarioId: 7 });
  assert.deepEqual(normalizarVinculos("aluguel", { veiculoId: 3, funcionarioId: 7 }), { veiculoId: null, funcionarioId: null });
  assert.deepEqual(normalizarVinculos("combustivel", {}), { veiculoId: null, funcionarioId: null });
  assert.deepEqual(normalizarVinculos("combustivel", { veiculoId: "" }), { veiculoId: null, funcionarioId: null });
  assert.ok(normalizarVinculos("combustivel", { veiculoId: "abc" }).erro);
  assert.ok(normalizarVinculos("salarios", { funcionarioId: -2 }).erro);
});
