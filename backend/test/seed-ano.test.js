import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUTOS, SERVICOS } from "../src/db/seedAno/dados.js";
import {
  diaDaSemana,
  ehFeriado,
  gerarDados,
  inicioDoPeriodo,
} from "../src/db/seedAno/gerador.js";
import { inserirLinhas, lit } from "../src/db/seedAno/sql.js";

// Testes do seed anual (db:seed-ano) sem banco: o gerador é uma função pura.

const HOJE = "2026-11-03";
const AGORA = new Date("2026-11-03T13:30:00Z"); // 10:30 em Brasília

function entrada(extra = {}) {
  const produtos = PRODUTOS.map((p, i) => ({
    id: i + 1,
    chave: p.chave,
    nome: p.nome,
    valorUnitario: p.valorUnitario,
    minimo: p.minimo,
    lote: p.lote,
    repDias: p.repDias,
  }));
  const idProduto = Object.fromEntries(produtos.map((p) => [p.chave, p.id]));
  const servicos = SERVICOS.map((s, i) => ({
    id: i + 1,
    chave: s.chave,
    nome: s.nome,
    valor: s.valor,
    pecas: Object.entries(s.pecas).map(([chave, quantidade]) => ({
      produtoId: idProduto[chave],
      quantidade,
    })),
  }));
  return {
    hoje: HOJE,
    agora: AGORA,
    usuarios: {
      ceoId: 1,
      atendenteId: 2,
      estoquistaId: 3,
      tecnicos: [{ id: 4 }, { id: 5 }, { id: 6 }, { id: 7, desde: "2026-06-05" }],
    },
    servicos,
    produtos,
    ...extra,
  };
}

const dados = gerarDados(entrada());
const agoraMs = AGORA.getTime();
const minutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dig(cpf.slice(0, 9));
  return cpf.slice(9) === `${d1}${dig(cpf.slice(0, 9) + d1)}`;
}

test("mesma entrada gera exatamente os mesmos dados", () => {
  const outra = gerarDados(entrada());
  assert.equal(JSON.stringify(outra), JSON.stringify(dados));
});

test("cobre pelo menos 12 meses de histórico e a agenda até 31/12", () => {
  assert.equal(dados.periodo.inicio, inicioDoPeriodo(HOJE));
  assert.equal(dados.periodo.inicio, "2025-10-01");
  assert.equal(dados.periodo.fim, "2026-12-31");

  const datas = dados.agendamentos.map((a) => a.data).sort();
  assert.ok(datas[0] <= "2025-11-03", "histórico começa há mais de 12 meses");
  assert.ok(datas.at(-1) >= "2026-12-22", "há agendamentos na última semana útil do ano");
  assert.ok(datas.at(-1) <= "2026-12-31", "nada depois de 31/12");
  assert.ok(dados.agendamentos.length >= 1000, "volume de dados grande");

  const futuros = dados.agendamentos.filter((a) => a.data > HOJE);
  assert.ok(futuros.length >= 100, "agenda futura preenchida");
  assert.ok(futuros.some((a) => a.data >= "2026-12-01"), "dezembro tem agendamentos");
});

test("nunca agenda em domingo nem feriado", () => {
  for (const a of dados.agendamentos) {
    assert.notEqual(diaDaSemana(a.data), 0, `domingo: ${a.data}`);
    assert.equal(ehFeriado(a.data), false, `feriado: ${a.data}`);
  }
  assert.equal(ehFeriado("2026-12-25"), true);
  assert.equal(ehFeriado("2026-02-17"), true); // carnaval
  assert.equal(ehFeriado("2026-04-03"), true); // sexta-feira santa
});

test("mesmo técnico: mínimo de 1h entre agendamentos e nenhum atendimento sobreposto", () => {
  const porTecnicoDia = new Map();
  for (const a of dados.agendamentos.filter((x) => x.status === "agendado")) {
    const chave = `${a.tecnico_id}|${a.data}`;
    if (!porTecnicoDia.has(chave)) porTecnicoDia.set(chave, []);
    porTecnicoDia.get(chave).push(a);
  }
  for (const [chave, lista] of porTecnicoDia) {
    lista.sort((x, y) => minutos(x.hora) - minutos(y.hora));
    for (let i = 1; i < lista.length; i += 1) {
      const folga = minutos(lista[i].hora) - minutos(lista[i - 1].hora);
      assert.ok(folga >= 60, `menos de 1h entre agendamentos em ${chave}`);
    }
  }

  const ordemDoAgendamento = new Map(dados.ordens.map((o) => [o.agendamento_id, o]));
  for (const lista of porTecnicoDia.values()) {
    const feitos = lista
      .map((a) => ordemDoAgendamento.get(a.id))
      .filter((o) => o?.iniciada_em)
      .sort((x, y) => x.iniciada_em - y.iniciada_em);
    for (let i = 1; i < feitos.length; i += 1) {
      const fim = feitos[i - 1].concluida_em ?? AGORA;
      assert.ok(feitos[i].iniciada_em >= fim, "atendimentos do mesmo técnico se sobrepõem");
    }
  }
});

test("cancelado e não realizado não têm ordem; os demais têm exatamente uma", () => {
  const porAgendamento = new Map();
  for (const o of dados.ordens) {
    assert.equal(porAgendamento.has(o.agendamento_id), false, "ordem duplicada");
    porAgendamento.set(o.agendamento_id, o);
  }
  for (const a of dados.agendamentos) {
    if (a.status === "cancelado") {
      assert.equal(porAgendamento.has(a.id), false, "cancelado com ordem");
      assert.ok(a.cancelado_em, "cancelado sem data");
      assert.ok(a.cancelado_em.getTime() <= agoraMs, "cancelamento no futuro");
      if (a.nao_realizado) assert.ok(a.motivo_nao_realizado, "não realizado sem motivo");
    } else {
      assert.ok(porAgendamento.has(a.id), "agendamento ativo sem ordem");
      assert.equal(a.nao_realizado, 0);
    }
  }
});

test("linha do tempo, pagamento e valor cobrado seguem as regras do sistema", () => {
  const valorDoServico = new Map(entrada().servicos.map((s) => [s.id, s.valor]));
  for (const o of dados.ordens) {
    if (o.status === "aberta") {
      assert.equal(o.iniciada_em, null);
      assert.equal(o.pagamento_confirmado, 0);
      continue;
    }
    assert.ok(o.iniciada_em, "iniciada sem horário");
    assert.ok(o.iniciada_em.getTime() <= agoraMs, "início no futuro");
    assert.ok(o.iniciada_em >= o.aberta_em, "iniciada antes de aberta");

    if (o.status === "andamento") {
      assert.equal(o.concluida_em, null);
      assert.equal(o.pagamento_confirmado, 0);
    } else {
      assert.ok(o.concluida_em >= o.iniciada_em);
      assert.ok(o.concluida_em.getTime() <= agoraMs, "conclusão no futuro");
    }

    const cobrado = Number(o.valor_cobrado);
    assert.ok(cobrado > 0, "valor cobrado precisa ser maior que zero");
    if (Math.round(cobrado * 100) !== Math.round(valorDoServico.get(o.servico_id) * 100)) {
      assert.ok(o.observacao_pagamento?.trim(), "valor diferente do serviço exige observação");
    }

    if (o.pagamento_confirmado) {
      assert.equal(o.status, "concluida");
      assert.ok(["pix", "dinheiro", "cartao_debito", "cartao_credito"].includes(o.forma_pagamento));
      assert.ok(o.pagamento_confirmado_em >= o.concluida_em, "pago antes de concluir");
      assert.ok(o.pagamento_confirmado_em.getTime() <= agoraMs, "pagamento no futuro");
      assert.ok(o.pagamento_usuario_id);
    } else {
      assert.equal(o.forma_pagamento, null);
    }
  }
});

test("serviços de valor antigo (inativos) só antes da mudança de preço", () => {
  const chaves = new Map(entrada().servicos.map((s) => [s.id, s.chave]));
  const dataDaOrdem = new Map(dados.agendamentos.map((a) => [a.id, a.data]));
  for (const o of dados.ordens) {
    const chave = chaves.get(o.servico_id);
    const data = dataDaOrdem.get(o.agendamento_id);
    if (chave.endsWith("_antigo")) assert.ok(data < "2026-03-01", `${chave} usado em ${data}`);
    if (["limpeza12", "limpeza18", "instalacao12"].includes(chave)) {
      assert.ok(data >= "2026-03-01", `${chave} usado antes da mudança: ${data}`);
    }
  }
});

test("estoque: nunca negativo, saldo final bate com as movimentações e nada no futuro", () => {
  const saldo = new Map();
  for (const m of dados.movimentacoes) {
    assert.ok(m.data.getTime() <= agoraMs, "movimentação no futuro");
    const atual = (saldo.get(m.produto_id) ?? 0) + (m.tipo === "entrada" ? m.quantidade : -m.quantidade);
    assert.ok(atual >= 0, `saldo negativo do produto ${m.produto_id}`);
    saldo.set(m.produto_id, atual);
  }
  for (const [id, valor] of Object.entries(dados.saldos)) {
    assert.equal(saldo.get(Number(id)) ?? 0, valor, `saldo final do produto ${id}`);
  }
  assert.ok(dados.resumo.abaixoDoMinimo.length >= 1, "pelo menos um alerta de estoque mínimo");
});

test("toda ordem iniciada baixou as peças do serviço; extras são marcados", () => {
  const servicos = new Map(entrada().servicos.map((s) => [s.id, s]));
  const saidasPorOrdem = new Map();
  for (const m of dados.movimentacoes.filter((x) => x.tipo === "saida" && x.ordem_servico_id)) {
    if (!saidasPorOrdem.has(m.ordem_servico_id)) saidasPorOrdem.set(m.ordem_servico_id, []);
    saidasPorOrdem.get(m.ordem_servico_id).push(m);
  }
  for (const o of dados.ordens) {
    const saidas = saidasPorOrdem.get(o.id) ?? [];
    if (!o.iniciada_em) {
      assert.equal(saidas.length, 0, "ordem não iniciada baixou estoque");
      continue;
    }
    for (const peca of servicos.get(o.servico_id).pecas) {
      const total = saidas
        .filter((s) => s.produto_id === peca.produtoId && s.extra === 0)
        .reduce((soma, s) => soma + s.quantidade, 0);
      assert.equal(total, peca.quantidade, "peça do serviço não baixada");
    }
  }
  assert.ok(dados.movimentacoes.some((m) => m.extra === 1), "há peças extras");
});

test("PIX: cada ordem paga em PIX tem uma cobrança aprovada com o mesmo valor e horário", () => {
  const aprovadasPorOrdem = new Map();
  for (const p of dados.pix) {
    assert.equal(p.modo, "simulado");
    assert.equal(p.mp_payment_id, null);
    assert.equal(p.referencia, `OS-${p.ordem_id}`);
    assert.ok(p.expira_em > p.criado_em);
    if (p.status === "aprovado") {
      assert.ok(p.aprovado_em >= p.criado_em && p.aprovado_em <= p.expira_em);
      assert.equal(aprovadasPorOrdem.has(p.ordem_id), false, "duas aprovadas na mesma ordem");
      aprovadasPorOrdem.set(p.ordem_id, p);
    } else {
      assert.equal(p.aprovado_em, null);
    }
  }
  for (const o of dados.ordens) {
    const aprovada = aprovadasPorOrdem.get(o.id);
    if (o.forma_pagamento === "pix") {
      assert.ok(aprovada, "ordem paga em PIX sem cobrança aprovada");
      assert.equal(aprovada.valor, o.valor_cobrado);
      assert.equal(aprovada.aprovado_em.getTime(), o.pagamento_confirmado_em.getTime());
    } else {
      assert.equal(aprovada, undefined);
    }
  }
});

test("check-in e check-out: um de cada por ordem, só em atendimentos feitos, fora do raio com justificativa", () => {
  const vistos = new Set();
  const ordens = new Map(dados.ordens.map((o) => [o.id, o]));
  for (const r of dados.registros) {
    const chave = `${r.ordem_id}|${r.tipo}`;
    assert.equal(vistos.has(chave), false, "registro duplicado");
    vistos.add(chave);

    const ordem = ordens.get(r.ordem_id);
    assert.ok(ordem.iniciada_em, "registro em ordem não iniciada");
    if (r.tipo === "checkout") assert.equal(ordem.status, "concluida");
    assert.ok(r.criado_em.getTime() <= agoraMs);
    assert.equal(r.dentro_raio, r.distancia_m <= r.raio_m);
    if (!r.dentro_raio) assert.ok(r.justificativa, "fora do raio sem justificativa");
  }
  assert.ok(dados.registros.some((r) => !r.dentro_raio), "há registros fora do raio");
});

test("clientes: CPFs válidos e únicos, inativos sem agendamentos depois de inativados", () => {
  const cpfs = new Set();
  for (const c of dados.clientes) {
    assert.ok(cpfValido(c.cpf), `CPF inválido: ${c.cpf}`);
    assert.equal(cpfs.has(c.cpf), false, "CPF repetido");
    cpfs.add(c.cpf);
    assert.match(c.cep, /^\d{8}$/);
    assert.equal(c.estado, "PR");
    assert.ok(c.latitude && c.longitude && c.geo_endereco);
  }
  const inativos = dados.clientes.filter((c) => c.status === "inativo");
  assert.equal(inativos.length, 12);
  const dataInativacao = new Map(inativos.map((c) => [c.id, c._inativoDesde]));
  for (const a of dados.agendamentos) {
    const desde = dataInativacao.get(a.cliente_id);
    if (desde) assert.ok(a.data < desde, "agendamento de cliente inativo após a inativação");
  }
  assert.ok(dados.clientes.some((c) => c.nome === "Romário Rocha" && c.telefone === "(44) 99804-9224"));
});

test("relatórios ficam cheios: faturamento em todos os meses de 12 meses e sazonalidade", () => {
  const meses = Object.keys(dados.resumo.faturamentoPorMes).filter((m) => m >= "2025-11" && m <= "2026-10");
  assert.equal(meses.length, 12);
  for (const m of meses) assert.ok(dados.resumo.faturamentoPorMes[m] > 5000, `faturamento baixo em ${m}`);
  // Verão fatura mais que inverno.
  assert.ok(dados.resumo.faturamentoPorMes["2026-01"] > dados.resumo.faturamentoPorMes["2026-07"] * 1.5);
  assert.ok(dados.resumo.aReceber > 0);
});

test("SQL: valores são escapados e o INSERT mantém ids explícitos", () => {
  assert.equal(lit("O'Brien"), "'O''Brien'");
  assert.equal(lit(null), "NULL");
  assert.equal(lit(12.5), "12.5");
  assert.equal(lit(true), "TRUE");
  assert.equal(lit(new Date("2026-01-02T03:04:05Z")), "'2026-01-02T03:04:05.000Z'");
  assert.throws(() => lit(Number.NaN));

  const [comando] = inserirLinhas("t", ["id", "nome"], [{ id: 1, nome: "a'b" }, { id: 2, nome: "c" }]);
  assert.match(comando, /^INSERT INTO t \(id, nome\) OVERRIDING SYSTEM VALUE VALUES/);
  assert.match(comando, /\(1, 'a''b'\)/);
  assert.equal(inserirLinhas("t", ["id"], Array.from({ length: 600 }, (_, i) => ({ id: i }))).length, 3);
});

test("semFuturo: nenhum agendamento depois de hoje", () => {
  const d = gerarDados(entrada({ semFuturo: true }));
  assert.ok(d.agendamentos.length > 100);
  assert.ok(d.agendamentos.every((a) => a.data <= d.periodo.hoje));
  assert.equal(d.periodo.fim, d.periodo.hoje);
});
