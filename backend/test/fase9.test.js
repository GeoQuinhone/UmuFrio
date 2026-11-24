import test from "node:test";
import assert from "node:assert/strict";
import {
  UFS, ufValida, nomePessoaValido, razaoSocialValida, nomeClienteValido, numeroImovelValido,
  senhaValida, mensagemSenha, emailValido,
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

test("limite de estoque (99.999.999 unidades)", () => {
  assert.equal(LIMITE_QUANTIDADE, 99999999);
  assert.ok(quantidadeDentroDoLimite(0));
  assert.ok(quantidadeDentroDoLimite(1));
  assert.ok(quantidadeDentroDoLimite(99999999));
  assert.ok(!quantidadeDentroDoLimite(100000000));
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

test("senha forte: 8+ caracteres, 1 especial, não comum e sem o nome do e-mail", () => {
  for (const v of ["Abc@1234", "Senha#Forte9", "tempo!2025"]) assert.ok(senhaValida(v), v);
  for (const v of ["", "a", "abc12", "      ", null, undefined, "123456", "12345678", "abc12345", "Abc@12", "aaaaaaaa"]) {
    assert.ok(!senhaValida(v), String(v));
  }
  assert.ok(!senhaValida("joao@2024!", { email: "joao@umufrio.com.br" }));
  assert.ok(!senhaValida("Carla#2025", { nome: "Carla Nunes" }));
  assert.match(mensagemSenha("abcdefgh"), /especial/);
});

test("e-mail: formato conferido no servidor (CT33 e CT37)", () => {
  for (const v of ["ana@teste.com", "ANA@Teste.com", "a.b@empresa.com.br"]) assert.ok(emailValido(v), v);
  for (const v of ["anateste.com", "ana@", "@teste.com", "ana@teste", "", "ana @teste.com"]) assert.ok(!emailValido(v), v);
});
