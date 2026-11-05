import { erroHttp } from "../httpError.js";

// Relatórios estratégicos (Fase 4, somente CEO).
//
// Critérios (mostrados também na tela):
//  - Faturamento: pagamentos CONFIRMADOS dentro do período (data da confirmação).
//  - Serviços, técnicos e atendimentos: atendimentos AGENDADOS dentro do período.
//  - Estoque: saídas registradas no período; "abaixo do mínimo" é a situação de hoje.
//  - Gastos e lucro (Fase 8, regime de caixa): lucro = faturamento recebido no
//    período - custo das peças consumidas em atendimentos - despesas lançadas.
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

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const CATEGORIAS_DESPESA = [
  "combustivel",
  "salarios",
  "aluguel",
  "manutencao",
  "ferramentas",
  "marketing",
  "impostos",
  "outros",
];

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

  const anteriorAte = somarDias(de, -1);
  const anteriorDe = somarDias(anteriorAte, -(diasEntre(de, ate) - 1));

  const [porForma, porPeriodo, [aberto], pagos, pendentes, [anterior], [pecas], despesasCat] = await Promise.all([
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
    // Fase 8: quem já pagou no período (lista) e quem falta pagar (hoje).
    q(
      `SELECT o.id, c.nome AS cliente, s.nome AS servico, u.nome AS tecnico,
              COALESCE(o.forma_pagamento, 'nao_informada') AS forma,
              ${VALOR}::float8 AS valor,
              o.pagamento_confirmado_em AS "pagoEm"
         FROM ordens_servico o
         JOIN servicos s ON s.id = o.servico_id
         JOIN agendamentos a ON a.id = o.agendamento_id
         JOIN clientes c ON c.id = a.cliente_id
         JOIN usuarios u ON u.id = a.tecnico_id
        WHERE ${confirmadoNoPeriodo}
        ORDER BY o.pagamento_confirmado_em DESC, o.id DESC
        LIMIT 300`,
      [de, ate, fuso],
    ),
    q(
      `SELECT o.id, c.nome AS cliente, s.nome AS servico, u.nome AS tecnico,
              o.status AS "ordemStatus",
              to_char(a.data, 'YYYY-MM-DD') AS data,
              to_char(a.hora, 'HH24:MI') AS hora,
              ${VALOR}::float8 AS valor,
              (CURRENT_DATE - a.data)::int AS "diasEmAberto"
         FROM ordens_servico o
         JOIN servicos s ON s.id = o.servico_id
         JOIN agendamentos a ON a.id = o.agendamento_id
         JOIN clientes c ON c.id = a.cliente_id
         JOIN usuarios u ON u.id = a.tecnico_id
        WHERE o.status IN ('andamento', 'concluida')
          AND o.pagamento_confirmado = 0
          AND a.status = 'agendado'
        ORDER BY a.data, a.hora, o.id
        LIMIT 300`,
    ),
    q(
      `SELECT count(*)::int AS quantidade,
              COALESCE(sum(${VALOR}), 0)::float8 AS total
         FROM ordens_servico o
         JOIN servicos s ON s.id = o.servico_id
        WHERE o.pagamento_confirmado = 1
          AND (o.pagamento_confirmado_em::timestamptz AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date`,
      [anteriorDe, anteriorAte, fuso],
    ),
    q(
      `SELECT COALESCE(sum(m.quantidade * COALESCE(m.valor_unitario, p.valor_unitario)), 0)::float8 AS total
         FROM movimentacoes_estoque m
         JOIN produtos p ON p.id = m.produto_id
        WHERE m.tipo = 'saida'
          AND m.ordem_servico_id IS NOT NULL
          AND (m.data::timestamptz AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date`,
      [de, ate, fuso],
    ),
    q(
      `SELECT categoria, count(*)::int AS quantidade, sum(valor)::float8 AS total
         FROM despesas
        WHERE data BETWEEN $1::date AND $2::date
        GROUP BY categoria
        ORDER BY total DESC, categoria`,
      [de, ate],
    ),
  ]);

  const quantidade = porForma.reduce((s, l) => s + numero(l.quantidade), 0);
  const total = porForma.reduce((s, l) => s + numero(l.total), 0);

  const custoPecas = arredondar(pecas?.total);
  const totalDespesas = arredondar(despesasCat.reduce((s, l) => s + numero(l.total), 0));
  const gastosTotal = arredondar(custoPecas + totalDespesas);
  const lucro = arredondar(total - gastosTotal);
  const totalAnterior = arredondar(anterior?.total);

  return {
    total: arredondar(total),
    quantidade,
    ticketMedio: quantidade > 0 ? arredondar(total / quantidade) : 0,
    anterior: {
      de: anteriorDe,
      ate: anteriorAte,
      total: totalAnterior,
      quantidade: numero(anterior?.quantidade),
      variacaoPercentual:
        totalAnterior > 0 ? arredondar(((total - totalAnterior) / totalAnterior) * 100, 1) : null,
    },
    gastos: {
      pecas: custoPecas,
      despesas: totalDespesas,
      total: gastosTotal,
      porCategoria: despesasCat.map((l) => ({
        categoria: l.categoria,
        quantidade: numero(l.quantidade),
        total: arredondar(l.total),
      })),
    },
    lucro,
    margemPercentual: total > 0 ? arredondar((lucro / total) * 100, 1) : null,
    pagos: pagos.map((l) => ({
      id: l.id,
      cliente: l.cliente,
      servico: l.servico,
      tecnico: l.tecnico,
      forma: l.forma,
      valor: arredondar(l.valor),
      pagoEm: l.pagoEm,
    })),
    pendentes: pendentes.map((l) => ({
      id: l.id,
      cliente: l.cliente,
      servico: l.servico,
      tecnico: l.tecnico,
      ordemStatus: l.ordemStatus,
      data: l.data,
      hora: l.hora,
      valor: arredondar(l.valor),
      diasEmAberto: Math.max(0, numero(l.diasEmAberto)),
    })),
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
              count(*) FILTER (WHERE a.status = 'cancelado' AND a.nao_realizado = 0)::int AS cancelados,
              COALESCE(sum(${VALOR}) FILTER (WHERE a.status = 'agendado' AND o.status = 'concluida' AND o.pagamento_confirmado = 0), 0)::float8 AS "aReceber",
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
  const receitaTotal = ranking.reduce((s, l) => s + numero(l.receita), 0);

  return {
    totalConcluidos,
    receitaTotal: arredondar(receitaTotal),
    ranking: ranking.map((l) => ({
      id: l.id,
      nome: l.nome,
      quantidade: numero(l.quantidade),
      receita: arredondar(l.receita),
      recebido: arredondar(l.recebido),
      aReceber: arredondar(numero(l.receita) - numero(l.recebido)),
      ticketMedio: numero(l.quantidade) > 0 ? arredondar(numero(l.receita) / numero(l.quantidade)) : 0,
      participacao: receitaTotal > 0 ? arredondar((numero(l.receita) / receitaTotal) * 100, 1) : null,
    })),
    tecnicos: tecnicos.map((l) => ({
      id: l.id,
      nome: l.nome,
      concluidos: numero(l.concluidos),
      receita: arredondar(l.receita),
      naoRealizados: numero(l.naoRealizados),
      cancelados: numero(l.cancelados),
      aReceber: arredondar(l.aReceber),
      ticketMedio: numero(l.concluidos) > 0 ? arredondar(numero(l.receita) / numero(l.concluidos)) : 0,
      taxaConclusao:
        numero(l.concluidos) + numero(l.naoRealizados) + numero(l.cancelados) > 0
          ? arredondar((numero(l.concluidos) / (numero(l.concluidos) + numero(l.naoRealizados) + numero(l.cancelados))) * 100, 1)
          : null,
      tempoMedioMin: l.tempoMedioMin === null || l.tempoMedioMin === undefined ? null : Number(l.tempoMedioMin),
    })),
  };
}

async function estoque(q, { de, ate, fuso }) {
  const [consumo, [entradas], abaixoMinimo, [posicao]] = await Promise.all([
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
      `SELECT COALESCE(sum(m.quantidade), 0)::int AS quantidade,
              COALESCE(sum(m.quantidade * COALESCE(m.valor_unitario, p.valor_unitario)), 0)::float8 AS valor
         FROM movimentacoes_estoque m
         JOIN produtos p ON p.id = m.produto_id
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
    q(
      `SELECT count(*)::int AS produtos,
              count(*) FILTER (WHERE saldo <= 0)::int AS zerados,
              COALESCE(sum(saldo * valor_unitario), 0)::float8 AS "valorEmEstoque"
         FROM produtos`,
    ),
  ]);

  const custoPecas = consumo.reduce((s, l) => s + numero(l.custo), 0);
  const unidades = consumo.reduce((s, l) => s + numero(l.quantidade), 0);
  const unidadesExtras = consumo.reduce((s, l) => s + numero(l.extras), 0);

  return {
    unidadesConsumidas: unidades,
    unidadesExtras,
    entradas: numero(entradas?.quantidade),
    valorEntradas: arredondar(entradas?.valor),
    produtos: numero(posicao?.produtos),
    zerados: numero(posicao?.zerados),
    valorEmEstoque: arredondar(posicao?.valorEmEstoque),
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
      situacao: numero(l.saldo) <= 0 ? "zerado" : "baixo",
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

// Fase 8: lista dos atendimentos por trás de um número do relatório (clicar em
// "Não realizados", "Concluídos"... mostra os pedidos). Filtros opcionais por
// técnico e por serviço.
export const SITUACOES_LISTA = {
  todos: "TRUE",
  concluidos: "(a.status = 'agendado' AND o.status = 'concluida')",
  emAndamento: "(a.status = 'agendado' AND o.status = 'andamento')",
  agendados: "(a.status = 'agendado' AND (o.id IS NULL OR o.status = 'aberta'))",
  cancelados: "(a.status = 'cancelado' AND a.nao_realizado = 0)",
  naoRealizados: "(a.nao_realizado = 1)",
};

export async function listarAtendimentos(q, periodo, { situacao = "todos", tecnicoId = null, servicoId = null, motivo = null } = {}, fuso = FUSO_PADRAO) {
  const { de, ate } = validarPeriodo(periodo, fuso);
  const filtro = SITUACOES_LISTA[situacao];
  if (!filtro) throw erroHttp("Situação inválida.", 400);

  const params = [de, ate];
  let extra = "";
  if (tecnicoId) {
    params.push(Number(tecnicoId));
    extra += ` AND a.tecnico_id = $${params.length}`;
  }
  if (servicoId) {
    params.push(Number(servicoId));
    extra += ` AND o.servico_id = $${params.length}`;
  }
  if (motivo) {
    params.push(String(motivo));
    extra += ` AND COALESCE(NULLIF(trim(a.motivo_nao_realizado), ''), 'Não informado') = $${params.length}`;
  }

  const linhas = await q(
    `SELECT a.id,
            to_char(a.data, 'YYYY-MM-DD') AS data,
            to_char(a.hora, 'HH24:MI') AS hora,
            c.nome AS cliente,
            u.nome AS tecnico,
            s.nome AS servico,
            a.motivo_nao_realizado AS motivo,
            CASE
              WHEN a.nao_realizado = 1 THEN 'nao_realizado'
              WHEN a.status = 'cancelado' THEN 'cancelado'
              WHEN o.status = 'concluida' THEN 'concluido'
              WHEN o.status = 'andamento' THEN 'andamento'
              ELSE 'agendado'
            END AS situacao,
            ${VALOR}::float8 AS valor,
            COALESCE(o.pagamento_confirmado, 0)::int AS pago,
            count(*) OVER ()::int AS "totalLinhas"
       FROM agendamentos a
       JOIN clientes c ON c.id = a.cliente_id
       JOIN usuarios u ON u.id = a.tecnico_id
       LEFT JOIN ordens_servico o ON o.agendamento_id = a.id
       LEFT JOIN servicos s ON s.id = o.servico_id
      WHERE a.data BETWEEN $1::date AND $2::date
        AND ${filtro}${extra}
      ORDER BY a.data DESC, a.hora DESC, a.id DESC
      LIMIT 300`,
    params,
  );

  return {
    periodo: { de, ate },
    situacao,
    total: linhas.length ? numero(linhas[0].totalLinhas) : 0,
    linhas: linhas.map((l) => ({
      id: l.id,
      data: l.data,
      hora: l.hora,
      cliente: l.cliente,
      tecnico: l.tecnico,
      servico: l.servico,
      motivo: l.motivo,
      situacao: l.situacao,
      valor: l.valor === null || l.valor === undefined ? null : arredondar(l.valor),
      pago: Boolean(l.pago),
    })),
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
  "faturamento-pagos": {
    titulo: "Pagamentos recebidos",
    colunas: [
      { chave: "pagoEm", titulo: "Pago em", tipo: "texto" },
      { chave: "cliente", titulo: "Cliente", tipo: "texto" },
      { chave: "servico", titulo: "Serviço", tipo: "texto" },
      { chave: "tecnico", titulo: "Técnico", tipo: "texto" },
      { chave: "forma", titulo: "Forma", tipo: "texto" },
      { chave: "valor", titulo: "Valor (R$)", tipo: "moeda" },
    ],
    linhas: (r) =>
      r.faturamento.pagos.map((l) => ({
        ...l,
        pagoEm: l.pagoEm ? new Date(l.pagoEm).toLocaleString("pt-BR", { timeZone: FUSO_PADRAO }) : "",
        forma: NOMES_FORMA[l.forma] || l.forma,
      })),
  },
  "faturamento-pendentes": {
    titulo: "Pagamentos pendentes",
    colunas: [
      { chave: "data", titulo: "Data", tipo: "texto" },
      { chave: "cliente", titulo: "Cliente", tipo: "texto" },
      { chave: "servico", titulo: "Serviço", tipo: "texto" },
      { chave: "tecnico", titulo: "Técnico", tipo: "texto" },
      { chave: "diasEmAberto", titulo: "Dias em aberto", tipo: "int" },
      { chave: "valor", titulo: "Valor (R$)", tipo: "moeda" },
    ],
    linhas: (r) => r.faturamento.pendentes,
  },
  "gastos-por-categoria": {
    titulo: "Gastos e lucro",
    colunas: [
      { chave: "categoria", titulo: "Item", tipo: "texto" },
      { chave: "total", titulo: "Valor (R$)", tipo: "moeda" },
    ],
    linhas: (r) => [
      { categoria: "Faturamento recebido", total: r.faturamento.total },
      { categoria: "Custo das peças", total: -r.faturamento.gastos.pecas },
      ...r.faturamento.gastos.porCategoria.map((c) => ({
        categoria: `Despesa: ${c.categoria}`,
        total: -c.total,
      })),
      { categoria: "Lucro", total: r.faturamento.lucro },
    ],
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
