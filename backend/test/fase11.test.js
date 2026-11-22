import test from "node:test";
import assert from "node:assert/strict";
import {
  janelaCheckin,
  justificativaValida,
  registrarLocalizacao,
} from "../src/checkin/checkinService.js";

// Fase 11: check-in só no dia do atendimento e justificativa de verdade.

test("janela do check-in: o dia todo do atendimento, das 07:00 às 23:59 (Brasília)", () => {
  const janela = janelaCheckin("2026-11-30", "15:00");
  assert.equal(janela.abre.toISOString(), "2026-11-30T10:00:00.000Z"); // 07:00 em Brasília
  assert.equal(janela.fecha.toISOString(), "2026-12-01T02:59:59.999Z"); // 23:59 em Brasília
  assert.equal(janelaCheckin(null, "07:30"), null);
  assert.equal(janelaCheckin("2026-11-30", null), null);
});

test("justificativa precisa de pelo menos duas palavras", () => {
  assert.ok(justificativaValida("sem vaga"));
  assert.ok(justificativaValida("Estacionei na rua de trás"));
  for (const v of ["ffffff", "", "   ", "a b", "ok", null]) assert.ok(!justificativaValida(v), String(v));
});

// Banco simulado: devolve a ordem, nenhum registro anterior e grava o novo.
function bancoFalso(ordem) {
  return async (texto) => {
    if (texto.includes("FROM ordens_servico")) return [ordem];
    if (texto.includes("FROM registros_localizacao")) return [];
    if (texto.includes("INSERT INTO registros_localizacao")) return [{ id: 1, tipo: "checkin" }];
    return [];
  };
}

const ORDEM = {
  id: 10,
  status: "aberta",
  tecnicoId: 7,
  agendamentoStatus: "agendado",
  dataAgendada: "2026-11-30",
  horaAgendada: "07:30",
  clienteId: 3,
  latitude: -23.7661,
  longitude: -53.3206,
  logradouro: "Rua A", numero: "1", bairro: "Centro", cidade: "Umuarama", estado: "PR", cep: "87500000",
};
ORDEM.geoEndereco = null; // força o uso do geocodificador simulado

const ENTRADA = {
  ordemId: 10,
  tipo: "checkin",
  usuario: { id: 7, perfil: "tecnico" },
  posicao: { latitude: -23.7661, longitude: -53.3206 },
};
const opcoes = (agora) => ({
  agora: new Date(agora),
  geocodificar: async () => ({ latitude: -23.7661, longitude: -53.3206 }),
});

test("check-in antes do dia é recusado com a hora em que libera", async () => {
  await assert.rejects(
    registrarLocalizacao(bancoFalso(ORDEM), ENTRADA, opcoes("2026-11-20T23:44:00Z")),
    (erro) => erro.status === 409 && /a partir de 30\/11 às 07:00/.test(erro.message),
  );
});

test("check-in depois do dia é recusado", async () => {
  await assert.rejects(
    registrarLocalizacao(bancoFalso(ORDEM), ENTRADA, opcoes("2026-12-01T12:00:00Z")),
    (erro) => erro.status === 409 && /já passou/.test(erro.message),
  );
});

test("check-in no dia, dentro do raio, é aceito", async () => {
  const registro = await registrarLocalizacao(bancoFalso(ORDEM), ENTRADA, opcoes("2026-11-30T10:00:00Z"));
  assert.equal(registro.tipo, "checkin");
});

test("fora do raio: 'ffffff' não serve de justificativa", async () => {
  const longe = { ...ENTRADA, posicao: { latitude: -23.80, longitude: -53.36 }, justificativa: "ffffff" };
  await assert.rejects(
    registrarLocalizacao(bancoFalso(ORDEM), longe, opcoes("2026-11-30T10:00:00Z")),
    (erro) => erro.status === 400 && /duas palavras/.test(erro.message),
  );
});
