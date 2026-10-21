import { erroHttp } from "../httpError.js";

// Relatórios estratégicos (Fase 4, somente CEO).
//
// Critérios (mostrados também na tela):
//  - Faturamento: pagamentos CONFIRMADOS dentro do período (data da confirmação).
//  - Serviços, técnicos e atendimentos: atendimentos AGENDADOS dentro do período.
//  - Estoque: saídas registradas no período; "abaixo do mínimo" é a situação de hoje.
//
// Todas as funções recebem `q(texto, parametros)` (linhas do resultado), como o
// serviço de PIX, para rodar com o pool do Postgres ou com um adaptador de teste.

export const FUSO_PADRAO = "America/Sao_Paulo";
const MAX_DIAS = 366;
const LIMITE_DIAS_POR_DIA = 62; // acima disso o gráfico agrupa por mês

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(texto) {
  if (!DATA_ISO.test(String(texto || ""))) return false;
  const [a, m, d] = texto.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return (
    data.getUTCFullYear() === a &&
    data.getUTCMonth() === m - 1 &&
    data.getUTCDate() === d
  );
}

function diasEntre(de, ate) {
  return Math.round((Date.parse(ate) - Date.parse(de)) / 86400000) + 1;
}

export function hojeNoFuso(fuso = FUSO_PADRAO, agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

// Sem datas informadas: do dia 1º do mês atual até hoje.
export function periodoPadrao(fuso = FUSO_PADRAO, agora = new Date()) {
  const ate = hojeNoFuso(fuso, agora);
  return { de: `${ate.slice(0, 8)}01`, ate };
}

export function validarPeriodo({ de, ate }, fuso = FUSO_PADRAO, agora = new Date()) {
  const padrao = periodoPadrao(fuso, agora);
  const inicio = de || padrao.de;
  const fim = ate || padrao.ate;

  if (!dataValida(inicio) || !dataValida(fim)) {
    throw erroHttp("Informe as datas no formato AAAA-MM-DD.", 400);
  }
  if (fim < inicio) {
    throw erroHttp("A data final não pode ser anterior à data inicial.", 400);
  }
  if (diasEntre(inicio, fim) > MAX_DIAS) {
    throw erroHttp(`O período máximo é de ${MAX_DIAS} dias.`, 400);
  }

  return { de: inicio, ate: fim };
}

// Valor do atendimento: o cobrado, se já registrado, senão o de tabela.
const VALOR = "COALESCE(o.valor_cobrado, s.valor)";

const MINUTOS_ATENDIMENTO = `extract(epoch FROM (o.concluida_em - o.iniciada_em)) / 60`;
const COM_TEMPO = `o.status = 'concluida' AND o.iniciada_em IS NOT NULL AND o.concluida_em >= o.iniciada_em`;

function numero(valor) {
  return valor === null || valor === undefined ? 0 : Number(valor);
}

function arredondar(valor, casas = 2) {
  const fator = 10 ** casas;
  return Math.round(numero(valor) * fator) / fator;
}

async function faturamento(q, { de, ate, fuso }) {
  const confirmadoNoPeriodo = `
    o.pagamento_confirmado = 1
    AND (o.pagamento_confirmado_em::timestamptz AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date`;

  const porMes = diasEntre(de, ate) > LIMITE_DIAS_POR_DIA;

  const [porForma, porPeriodo, [aberto]] = await Promise.all([
    q(
      `SELECT COALESCE(o.forma_pagamento, 'nao_informada') AS forma,
              count(*)::int AS quantidade,
              COALESCE(sum(${VALOR}), 0)::float8 AS total
         FROM ordens_servico o
         JOIN servicos s ON s.id = o.servico_id
        WHERE ${confirmadoNoPeriodo}
        GROUP BY 1
        ORDER BY total DESC, forma`,
      [de, ate, fuso],
    ),
    q(
      `WITH serie AS (
         SELECT generate_series(
                  date_trunc($4, $1::date)::date,
                  $2::date,
                  $5::interval
                )::date AS inicio
       ), recebido AS (
         SELECT date_trunc($4, (o.pagamento_confirmado_em::timestamptz AT TIME ZONE $3))::date AS inicio,
                sum(${VALOR}) AS total,
                count(*) AS quantidade
           FROM ordens_servico o
           JOIN servicos s ON s.id = o.servico_id
          WHERE ${confirmadoNoPeriodo}
          GROUP BY 1
       )
       SELECT to_char(serie.inicio, 'YYYY-MM-DD') AS inicio,
              COALESCE(recebido.total, 0)::float8 AS total,
              COALESCE(recebido.quantidade, 0)::int AS quantidade
         FROM serie
         LEFT JOIN recebido ON recebido.inicio = serie.inicio
        ORDER BY serie.inicio`,
      [de, ate, fuso, porMes ? "month" : "day", porMes ? "1 month" : "1 day"],
    ),
    q(
      `SELECT count(*)::int AS quantidade,
              COALESCE(sum(${VALOR}), 0)::float8 AS total
         FROM ordens_servico o
         JOIN agendamentos a ON a.id = o.agendamento_id
         JOIN servicos s ON s.id = o.servico_id
        WHERE o.status IN ('andamento', 'concluida')
          AND o.pagamento_confirmado = 0
          AND a.status = 'agendado'`,
    ),
  ]);

  const quantidade = porForma.reduce((s, l) => s + numero(l.quantidade), 0);
  const total = porForma.reduce((s, l) => s + numero(l.total), 0);

  return {
    total: arredondar(total),
    quantidade,
    ticketMedio: quantidade > 0 ? arredondar(total / quantidade) : 0,
    aReceber: {
      quantidade: numero(aberto?.quantidade),
      total: arredondar(aberto?.total),
    },
    agrupamento: porMes ? "mes" : "dia",
    porForma: porForma.map((l) => ({
      forma: l.forma,
      quantidade: numero(l.quantidade),
      total: arredondar(l.total),
    })),
    porPeriodo: porPeriodo.map((l) => ({
      inicio: l.inicio,
      total: arredondar(l.total),
      quantidade: numero(l.quantidade),
    })),
  };
}

async function servicosETecnicos(q, { de, ate }) {
  const [ranking, tecnicos] = await Promise.all([
    q(
      `SELECT s.id,
              s.nome,
              count(*)::int AS quantidade,
              COALESCE(sum(${VALOR}), 0)::float8 AS receita,
              COALESCE(sum(${VALOR}) FILTER (WHERE o.pagamento_confirmado = 1), 0)::float8 AS recebido
         FROM agendamentos a
         JOIN ordens_servico o ON o.agendamento_id = a.id
         JOIN servicos s ON s.id = o.servico_id
        WHERE a.status = 'agendado'
          AND o.status = 'concluida'
          AND a.data BETWEEN $1::date AND $2::date
        GROUP BY s.id, s.nome
        ORDER BY quantidade DESC, receita DESC, s.nome`,
      [de, ate],
    ),
    q(
      `SELECT u.id,
              u.nome,
              count(*) FILTER (WHERE a.status = 'agendado' AND o.status = 'concluida')::int AS concluidos,
              COALESCE(sum(${VALOR}) FILTER (WHERE a.status = 'agendado' AND o.status = 'concluida'), 0)::float8 AS receita,
              count(*) FILTER (WHERE a.nao_realizado = 1)::int AS "naoRealizados",
              round(avg(${MINUTOS_ATENDIMENTO}) FILTER (WHERE ${COM_TEMPO}))::int AS "tempoMedioMin"
         FROM agendamentos a
         JOIN usuarios u ON u.id = a.tecnico_id
         LEFT JOIN ordens_servico o ON o.agendamento_id = a.id
         LEFT JOIN servicos s ON s.id = o.servico_id
        WHERE a.data BETWEEN $1::date AND $2::date
        GROUP BY u.id, u.nome
        ORDER BY concluidos DESC, receita DESC, u.nome`,
      [de, ate],
    ),
  ]);

  const totalConcluidos = ranking.reduce((s, l) => s + numero(l.quantidade), 0);

  return {
    totalConcluidos,
    ranking: ranking.map((l) => ({
      id: l.id,
      nome: l.nome,
      quantidade: numero(l.quantidade),
      receita: arredondar(l.receita),
      recebido: arredondar(l.recebido),
    })),
    tecnicos: tecnicos.map((l) => ({
      id: l.id,
      nome: l.nome,
      concluidos: numero(l.concluidos),
      receita: arredondar(l.receita),
      naoRealizados: numero(l.naoRealizados),
      tempoMedioMin: l.tempoMedioMin === null || l.tempoMedioMin === undefined ? null : Number(l.tempoMedioMin),
    })),
  };
}

async function estoque(q, { de, ate, fuso }) {
  const [consumo, [entradas], abaixoMinimo] = await Promise.all([
    q(
      `SELECT p.id,
              p.nome,
              sum(m.quantidade)::int AS quantidade,
              COALESCE(sum(m.quantidade) FILTER (WHERE m.extra = 1), 0)::int AS extras,
              (sum(m.quantidade) * p.valor_unitario)::float8 AS custo,
              count(DISTINCT m.ordem_servico_id)::int AS ordens,
              p.saldo,
              p.quantidade_minima AS minimo
         FROM movimentacoes_estoque m
         JOIN produtos p ON p.id = m.produto_id
        WHERE m.tipo = 'saida'
          AND (m.data::timestamptz AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
        GROUP BY p.id, p.nome, p.valor_unitario, p.saldo, p.quantidade_minima
        ORDER BY quantidade DESC, p.nome
        LIMIT 15`,
      [de, ate, fuso],
    ),
    q(
      `SELECT COALESCE(sum(m.quantidade), 0)::int AS quantidade
         FROM movimentacoes_estoque m
        WHERE m.tipo = 'entrada'
          AND (m.data::timestamptz AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date`,
      [de, ate, fuso],
    ),
    q(
      `SELECT id, nome, saldo, quantidade_minima AS minimo
         FROM produtos
        WHERE saldo <= quantidade_minima
        ORDER BY (saldo - quantidade_minima), nome`,
    ),
  ]);

  const custoPecas = consumo.reduce((s, l) => s + numero(l.custo), 0);
  const unidades = consumo.reduce((s, l) => s + numero(l.quantidade), 0);
  const unidadesExtras = consumo.reduce((s, l) => s + numero(l.extras), 0);

  return {
    unidadesConsumidas: unidades,
    unidadesExtras,
    entradas: numero(entradas?.quantidade),
    custoPecas: arredondar(custoPecas),
    maisConsumidos: consumo.map((l) => ({
      id: l.id,
      nome: l.nome,
      quantidade: numero(l.quantidade),
      extras: numero(l.extras),
      custo: arredondar(l.custo),
      ordens: numero(l.ordens),
      saldo: numero(l.saldo),
      minimo: numero(l.minimo),
    })),
    abaixoMinimo: abaixoMinimo.map((l) => ({
      id: l.id,
      nome: l.nome,
      saldo: numero(l.saldo),
      minimo: numero(l.minimo),
    })),
  };
}

async function atendimentos(q, { de, ate }) {
  const [[resumo], motivos, [local]] = await Promise.all([
    q(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE a.status = 'agendado' AND o.status = 'concluida')::int AS concluidos,
              count(*) FILTER (WHERE a.status = 'agendado' AND o.status = 'andamento')::int AS "emAndamento",
              count(*) FILTER (WHERE a.status = 'agendado' AND (o.id IS NULL OR o.status = 'aberta'))::int AS agendados,
              count(*) FILTER (WHERE a.status = 'cancelado' AND a.nao_realizado = 0)::int AS cancelados,
              count(*) FILTER (WHERE a.nao_realizado = 1)::int AS "naoRealizados",
              round(avg(${MINUTOS_ATENDIMENTO}) FILTER (WHERE ${COM_TEMPO}))::int AS "tempoMedioMin"
         FROM agendamentos a
         LEFT JOIN ordens_servico o ON o.agendamento_id = a.id
        WHERE a.data BETWEEN $1::date AND $2::date`,
      [de, ate],
    ),
    q(
      `SELECT COALESCE(NULLIF(trim(a.motivo_nao_realizado), ''), 'Não informado') AS motivo,
              count(*)::int AS quantidade
         FROM agendamentos a
        WHERE a.nao_realizado = 1
          AND a.data BETWEEN $1::date AND $2::date
        GROUP BY 1
        ORDER BY quantidade DESC, motivo
        LIMIT 10`,
      [de, ate],
    ),
    // Fase 5: check-in/check-out geolocalizados dos atendimentos do período.
    q(
      `SELECT count(*) FILTER (WHERE r.tipo = 'checkin')::int AS checkins,
              count(*) FILTER (WHERE r.tipo = 'checkout')::int AS checkouts,
              count(*) FILTER (WHERE r.dentro_raio = false)::int AS "foraDoRaio",
              count(*) FILTER (WHERE r.dentro_raio IS NULL)::int AS "semReferencia"
         FROM registros_localizacao r
         JOIN ordens_servico o ON o.id = r.ordem_id
         JOIN agendamentos a ON a.id = o.agendamento_id
        WHERE a.data BETWEEN $1::date AND $2::date`,
      [de, ate],
    ),
  ]);

  const concluidos = numero(resumo?.concluidos);
  const cancelados = numero(resumo?.cancelados);
  const naoRealizados = numero(resumo?.naoRealizados);
  const finalizados = concluidos + cancelados + naoRealizados;

  return {
    total: numero(resumo?.total),
    concluidos,
    emAndamento: numero(resumo?.emAndamento),
    agendados: numero(resumo?.agendados),
    cancelados,
    naoRealizados,
    taxaConclusao: finalizados > 0 ? arredondar((concluidos / finalizados) * 100, 1) : null,
    tempoMedioMin:
      resumo?.tempoMedioMin === null || resumo?.tempoMedioMin === undefined
        ? null
        : Number(resumo.tempoMedioMin),
    motivos: motivos.map((l) => ({
      motivo: l.motivo,
      quantidade: numero(l.quantidade),
    })),
    localizacao: {
      checkins: numero(local?.checkins),
      checkouts: numero(local?.checkouts),
      foraDoRaio: numero(local?.foraDoRaio),
      semReferencia: numero(local?.semReferencia),
    },
  };
}

export async function gerarRelatorio(q, periodo, fuso = FUSO_PADRAO) {
  const { de, ate } = validarPeriodo(periodo, fuso);
  const base = { de, ate, fuso };

  // Em sequência (e não em paralelo) para não esgotar o pool de conexões.
  const fat = await faturamento(q, base);
  const serv = await servicosETecnicos(q, base);
  const est = await estoque(q, base);
  const atend = await atendimentos(q, base);

  return {
    periodo: { de, ate, dias: diasEntre(de, ate) },
    faturamento: fat,
    servicos: serv,
    estoque: est,
    atendimentos: atend,
  };
}

// ---------------------------------------------------------------- CSV

const NOMES_FORMA = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_debito: "Cartão de débito",
  cartao_credito: "Cartão de crédito",
  nao_informada: "Não informada",
};

// Cada tabela exportável: colunas (título + tipo) e como extrair as linhas.
export const TABELAS_CSV = {
  "faturamento-por-periodo": {
    titulo: "Faturamento por período",
    colunas: [
      { chave: "inicio", titulo: "Início do período", tipo: "texto" },
      { chave: "quantidade", titulo: "Pagamentos", tipo: "int" },
      { chave: "total", titulo: "Total recebido (R$)", tipo: "moeda" },
    ],
    linhas: (r) => r.faturamento.porPeriodo,
  },
  "faturamento-por-forma": {
    titulo: "Faturamento por forma de pagamento",
    colunas: [
      { chave: "forma", titulo: "Forma de pagamento", tipo: "texto" },
      { chave: "quantidade", titulo: "Pagamentos", tipo: "int" },
      { chave: "total", titulo: "Total recebido (R$)", tipo: "moeda" },
    ],
    linhas: (r) =>
      r.faturamento.porForma.map((l) => ({ ...l, forma: NOMES_FORMA[l.forma] || l.forma })),
  },
  "servicos-ranking": {
    titulo: "Serviços mais realizados",
    colunas: [
      { chave: "nome", titulo: "Serviço", tipo: "texto" },
      { chave: "quantidade", titulo: "Concluídos", tipo: "int" },
      { chave: "receita", titulo: "Receita (R$)", tipo: "moeda" },
      { chave: "recebido", titulo: "Já recebido (R$)", tipo: "moeda" },
    ],
    linhas: (r) => r.servicos.ranking,
  },
  tecnicos: {
    titulo: "Produtividade por técnico",
    colunas: [
      { chave: "nome", titulo: "Técnico", tipo: "texto" },
      { chave: "concluidos", titulo: "Concluídos", tipo: "int" },
      { chave: "naoRealizados", titulo: "Não realizados", tipo: "int" },
      { chave: "receita", titulo: "Receita (R$)", tipo: "moeda" },
      { chave: "tempoMedioMin", titulo: "Tempo médio (min)", tipo: "int" },
    ],
    linhas: (r) => r.servicos.tecnicos,
  },
  "estoque-consumo": {
    titulo: "Peças mais consumidas",
    colunas: [
      { chave: "nome", titulo: "Peça", tipo: "texto" },
      { chave: "quantidade", titulo: "Unidades consumidas", tipo: "int" },
      { chave: "extras", titulo: "Unidades extras", tipo: "int" },
      { chave: "ordens", titulo: "Atendimentos", tipo: "int" },
      { chave: "custo", titulo: "Custo (R$)", tipo: "moeda" },
      { chave: "saldo", titulo: "Saldo atual", tipo: "int" },
    ],
    linhas: (r) => r.estoque.maisConsumidos,
  },
  "estoque-abaixo-minimo": {
    titulo: "Estoque abaixo do mínimo",
    colunas: [
      { chave: "nome", titulo: "Peça", tipo: "texto" },
      { chave: "saldo", titulo: "Saldo atual", tipo: "int" },
      { chave: "minimo", titulo: "Mínimo", tipo: "int" },
    ],
    linhas: (r) => r.estoque.abaixoMinimo,
  },
  "atendimentos-situacao": {
    titulo: "Atendimentos por situação",
    colunas: [
      { chave: "situacao", titulo: "Situação", tipo: "texto" },
      { chave: "quantidade", titulo: "Quantidade", tipo: "int" },
    ],
    linhas: (r) => [
      { situacao: "Concluídos", quantidade: r.atendimentos.concluidos },
      { situacao: "Em andamento", quantidade: r.atendimentos.emAndamento },
      { situacao: "Agendados", quantidade: r.atendimentos.agendados },
      { situacao: "Cancelados", quantidade: r.atendimentos.cancelados },
      { situacao: "Não realizados", quantidade: r.atendimentos.naoRealizados },
    ],
  },
  "atendimentos-motivos": {
    titulo: "Motivos de não realização",
    colunas: [
      { chave: "motivo", titulo: "Motivo", tipo: "texto" },
      { chave: "quantidade", titulo: "Quantidade", tipo: "int" },
    ],
    linhas: (r) => r.atendimentos.motivos,
  },
};

function celulaCsv(valor, tipo) {
  if (valor === null || valor === undefined || valor === "") return "";
  let texto;
  if (tipo === "moeda") texto = Number(valor).toFixed(2).replace(".", ",");
  else if (tipo === "int") texto = String(Math.round(Number(valor)));
  else texto = String(valor);

  // Planilhas executam texto que começa com = + - @ como fórmula; o apóstrofo
  // neutraliza (só em texto livre — números têm tipo próprio).
  if (tipo === "texto" && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;

  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// CSV pensado para o Excel em português: separador ";", decimal com vírgula,
// UTF-8 com BOM (acentos corretos) e quebra de linha CRLF.
export function tabelaParaCsv(slug, relatorio) {
  const tabela = TABELAS_CSV[slug];
  if (!tabela) throw erroHttp("Relatório não encontrado.", 404);

  const cabecalho = tabela.colunas.map((c) => celulaCsv(c.titulo, "texto")).join(";");
  const linhas = tabela.linhas(relatorio).map((linha) =>
    tabela.colunas.map((c) => celulaCsv(linha[c.chave], c.tipo)).join(";"),
  );

  return `﻿${[cabecalho, ...linhas].join("\r\n")}\r\n`;
}
