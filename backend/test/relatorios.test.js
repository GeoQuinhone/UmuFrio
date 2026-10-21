import assert from "node:assert/strict";
import test from "node:test";

import {
  hojeNoFuso,
  periodoPadrao,
  tabelaParaCsv,
  validarPeriodo,
} from "../src/relatorios/consultas.js";

// Testes sem banco: cobrem o período e a exportação CSV.

test("período padrão: do dia 1º do mês até hoje, no fuso de São Paulo", () => {
  // 02:00 UTC de 1º/11 ainda é 31/10 em São Paulo (UTC-3).
  const agora = new Date("2026-11-01T02:00:00Z");
  assert.equal(hojeNoFuso("America/Sao_Paulo", agora), "2026-10-31");
  assert.deepEqual(periodoPadrao("America/Sao_Paulo", agora), {
    de: "2026-10-01",
    ate: "2026-10-31",
  });
});

test("valida o período informado", () => {
  assert.deepEqual(validarPeriodo({ de: "2026-10-01", ate: "2026-10-14" }), {
    de: "2026-10-01",
    ate: "2026-10-14",
  });
  assert.throws(() => validarPeriodo({ de: "01/10/2026", ate: "2026-10-14" }), /AAAA-MM-DD/);
  assert.throws(() => validarPeriodo({ de: "2026-02-30", ate: "2026-03-05" }), /AAAA-MM-DD/);
  assert.throws(() => validarPeriodo({ de: "2026-10-14", ate: "2026-10-01" }), /anterior/);
  assert.throws(() => validarPeriodo({ de: "2025-01-01", ate: "2026-10-14" }), /366/);
});

const relatorio = {
  faturamento: {
    porPeriodo: [{ inicio: "2026-10-01", quantidade: 2, total: 1234.5 }],
    porForma: [{ forma: "pix", quantidade: 2, total: 1234.5 }],
  },
  atendimentos: {
    motivos: [{ motivo: "=HYPERLINK(\"http://x\")", quantidade: 1 }],
  },
};

test("CSV: BOM, separador ;, decimal com vírgula e CRLF", () => {
  const csv = tabelaParaCsv("faturamento-por-periodo", relatorio);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("\r\n"));
  assert.ok(csv.includes("2026-10-01;2;1234,50"));
});

test("CSV: neutraliza fórmulas em texto livre e escapa aspas", () => {
  const csv = tabelaParaCsv("atendimentos-motivos", relatorio);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")";1`));
});

test("CSV: tabela inexistente dá 404", () => {
  assert.throws(
    () => tabelaParaCsv("nao-existe", relatorio),
    (erro) => erro.status === 404,
  );
});
