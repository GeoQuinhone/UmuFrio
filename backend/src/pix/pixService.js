import crypto from "node:crypto";

import { erroHttp } from "../httpError.js";
import * as mercadoPago from "./mercadoPago.js";

// Regras de negócio do PIX. Todas as funções recebem `q(texto, parametros)`,
// que devolve as linhas do resultado — assim o mesmo código roda com o pool do
// Postgres na API e com um adaptador simples nos testes.

const COLUNAS = `
  id,
  ordem_id AS "ordemId",
  valor,
  status,
  modo,
  mp_payment_id AS "mpPaymentId",
  referencia,
  codigo_copia_cola AS "codigoCopiaECola",
  qr_code_base64 AS "qrCodeBase64",
  ticket_url AS "ticketUrl",
  criado_em AS "criadoEm",
  expira_em AS "expiraEm",
  aprovado_em AS "aprovadoEm"`;

function emCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

// O que o front recebe: sem o id interno do Mercado Pago.
export function serializarCobranca(cobranca, pagamentoConfirmado = false) {
  if (!cobranca) return null;
  const { mpPaymentId, ...publico } = cobranca;
  return { ...publico, valor: Number(cobranca.valor), pagamentoConfirmado };
}

async function carregarOrdem(q, ordemId) {
  const [ordem] = await q(
    `SELECT o.id,
            o.status,
            o.pagamento_confirmado AS "pagamentoConfirmado",
            o.valor_cobrado AS "valorCobrado",
            o.observacao_pagamento AS "observacao",
            s.valor AS "servicoValor",
            (SELECT COALESCE(SUM(m.quantidade * COALESCE(m.valor_unitario, p.valor_unitario)), 0)
               FROM movimentacoes_estoque m JOIN produtos p ON p.id = m.produto_id
              WHERE m.ordem_servico_id = o.id AND m.extra = 1)::float AS "extrasValor",
            s.nome AS "servicoNome",
            a.tecnico_id AS "tecnicoId",
            a.status AS "agendamentoStatus",
            c.nome AS "clienteNome"
       FROM ordens_servico o
       JOIN agendamentos a ON a.id = o.agendamento_id
       JOIN servicos s ON s.id = o.servico_id
       JOIN clientes c ON c.id = a.cliente_id
      WHERE o.id = $1`,
    [ordemId],
  );

  if (!ordem) throw erroHttp("Ordem de serviço não encontrada.", 404);
  return ordem;
}

function exigirAcesso(ordem, usuario) {
  if (usuario.perfil === "tecnico" && ordem.tecnicoId !== usuario.id) {
    throw erroHttp("Você não pode acessar esta ordem de serviço.", 403);
  }
}

async function ultimaCobranca(q, ordemId) {
  const [cobranca] = await q(
    `SELECT ${COLUNAS} FROM cobrancas_pix
      WHERE ordem_id = $1 ORDER BY id DESC LIMIT 1`,
    [ordemId],
  );
  return cobranca || null;
}

async function cobrancaPorId(q, id) {
  const [cobranca] = await q(
    `SELECT ${COLUNAS} FROM cobrancas_pix WHERE id = $1`,
    [id],
  );
  return cobranca || null;
}

async function mudarStatusPendente(q, id, status) {
  await q(
    `UPDATE cobrancas_pix SET status = $2 WHERE id = $1 AND status = 'pendente'`,
    [id, status],
  );
}

// Aprova a cobrança e confirma o pagamento da ordem num único comando SQL:
// ou os dois mudam, ou nenhum. Só aprova se ainda estiver pendente, então um
// webhook repetido (ou o "sincronizar" rodando junto) não faz nada de novo.
// Se o pagamento da ordem já tinha sido confirmado de outra forma, ele é
// preservado.
export async function aprovarCobranca(q, cobrancaId) {
  const [resultado] = await q(
    `WITH c AS (
       UPDATE cobrancas_pix
          SET status = 'aprovado', aprovado_em = now()
        WHERE id = $1 AND status = 'pendente'
        RETURNING id, ordem_id, valor, usuario_id
     ), atualizada AS (
       UPDATE ordens_servico o
          SET forma_pagamento = 'pix',
              pagamento_confirmado = 1,
              pagamento_confirmado_em = now(),
              valor_cobrado = c.valor,
              pagamento_usuario_id = COALESCE(c.usuario_id, o.pagamento_usuario_id)
         FROM c
        WHERE o.id = c.ordem_id AND o.pagamento_confirmado = 0
        RETURNING o.id
     )
     SELECT (SELECT count(*) FROM c)::int AS aprovadas,
            (SELECT count(*) FROM atualizada)::int AS "ordensConfirmadas"`,
    [cobrancaId],
  );

  return resultado;
}

// Atualiza a cobrança com o que o Mercado Pago informa (ou expira a cobrança
// vencida). Sempre devolve a linha atual.
export async function sincronizarCobranca(q, cobranca, deps = {}) {
  if (!cobranca || cobranca.status !== "pendente") return cobranca;

  if (cobranca.modo === "mercadopago" && cobranca.mpPaymentId) {
    try {
      const remoto = await mercadoPago.consultarPagamento(
        cobranca.mpPaymentId,
        deps,
      );

      if (remoto.status === "aprovado") {
        await aprovarCobranca(q, cobranca.id);
        return cobrancaPorId(q, cobranca.id);
      }

      if (remoto.status === "cancelado" || remoto.status === "expirado") {
        await mudarStatusPendente(q, cobranca.id, remoto.status);
        return cobrancaPorId(q, cobranca.id);
      }
    } catch (erro) {
      // Falha ao consultar o MP não deve derrubar a tela: mantemos pendente e
      // a próxima consulta tenta de novo.
      if (!erro.status || erro.status < 500) throw erro;
    }
  }

  const agora = deps.agora || new Date();
  if (cobranca.expiraEm && new Date(cobranca.expiraEm) <= agora) {
    await mudarStatusPendente(q, cobranca.id, "expirado");
    return cobrancaPorId(q, cobranca.id);
  }

  return cobranca;
}

export async function consultarCobranca(q, { ordemId, usuario }, deps = {}) {
  const ordem = await carregarOrdem(q, ordemId);
  exigirAcesso(ordem, usuario);

  const atual = await ultimaCobranca(q, ordemId);
  const sincronizada = await sincronizarCobranca(q, atual, deps);

  // Relê a ordem: o sincronismo pode ter confirmado o pagamento agora.
  const ordemAtual = sincronizada?.status === "aprovado"
    ? await carregarOrdem(q, ordemId)
    : ordem;

  return {
    modo: mercadoPago.modoPix(deps.env),
    cobranca: serializarCobranca(
      sincronizada,
      Boolean(ordemAtual.pagamentoConfirmado),
    ),
  };
}

export async function criarCobranca(q, { ordemId, usuario }, deps = {}) {
  const ordem = await carregarOrdem(q, ordemId);
  exigirAcesso(ordem, usuario);

  if (ordem.agendamentoStatus !== "agendado") {
    throw erroHttp("Este agendamento foi cancelado.", 409);
  }
  if (ordem.status === "aberta") {
    throw erroHttp(
      "O PIX só pode ser gerado depois que o atendimento for iniciado.",
      409,
    );
  }
  if (ordem.pagamentoConfirmado) {
    throw erroHttp("O pagamento deste atendimento já foi confirmado.", 409);
  }

  // Fase 8: o valor padrão do PIX é serviço + peças extras.
  const esperado = Number(ordem.servicoValor) + Number(ordem.extrasValor || 0);
  const valor = Number(ordem.valorCobrado ?? esperado);

  if (!Number.isFinite(valor) || emCentavos(valor) <= 0) {
    throw erroHttp("O valor a cobrar precisa ser maior que zero.", 400);
  }

  if (
    emCentavos(valor) !== emCentavos(esperado) &&
    !String(ordem.observacao || "").trim()
  ) {
    throw erroHttp(
      "O valor cobrado é diferente do valor do serviço (mais peças extras). Informe o motivo na observação antes de gerar o PIX.",
      400,
    );
  }

  const agora = deps.agora || new Date();
  const modo = mercadoPago.modoPix(deps.env);

  // Reaproveita o PIX pendente quando o valor não mudou; se mudou, cancela o
  // antigo e gera outro (o cliente não pode pagar um QR com valor desatualizado).
  const atual = await sincronizarCobranca(q, await ultimaCobranca(q, ordemId), deps);

  if (atual?.status === "pendente") {
    if (emCentavos(atual.valor) === emCentavos(valor) && atual.modo === modo) {
      return { reutilizada: true, cobranca: serializarCobranca(atual, false), modo };
    }
    await cancelarPendente(q, atual, deps);
  }

  const referencia = `OS-${ordemId}`;
  let dados;

  if (modo === "mercadopago") {
    const criada = await mercadoPago.criarPagamentoPix(
      {
        valor,
        descricao: `${ordem.servicoNome} - OS-${ordemId}`.slice(0, 250),
        referencia,
        nome: ordem.clienteNome,
        idempotencia: crypto.randomUUID(),
      },
      { ...deps, agora },
    );
    dados = {
      mpPaymentId: criada.id,
      codigoCopiaECola: criada.codigoCopiaECola,
      qrCodeBase64: criada.qrCodeBase64,
      ticketUrl: criada.ticketUrl,
      expiraEm: criada.expiraEm,
    };
  } else {
    const minutos = mercadoPago.configMercadoPago(deps.env).expiracaoMinutos;
    dados = {
      mpPaymentId: null,
      // Texto claramente fictício: não é um PIX real e nenhum banco o aceita.
      codigoCopiaECola: `SIMULADO-UMUFRIO-${referencia}-${crypto
        .randomBytes(6)
        .toString("hex")
        .toUpperCase()}`,
      qrCodeBase64: null,
      ticketUrl: null,
      expiraEm: new Date(agora.getTime() + minutos * 60 * 1000),
    };
  }

  try {
    const [criada] = await q(
      `INSERT INTO cobrancas_pix
         (ordem_id, usuario_id, valor, status, modo, mp_payment_id, referencia,
          codigo_copia_cola, qr_code_base64, ticket_url, expira_em)
       VALUES ($1, $2, $3, 'pendente', $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${COLUNAS}`,
      [
        ordemId,
        usuario.id,
        valor.toFixed(2),
        modo,
        dados.mpPaymentId,
        referencia,
        dados.codigoCopiaECola,
        dados.qrCodeBase64,
        dados.ticketUrl,
        dados.expiraEm,
      ],
    );

    // A ordem passa a mostrar PIX e o valor cobrado enquanto aguarda.
    await q(
      `UPDATE ordens_servico
          SET forma_pagamento = 'pix',
              valor_cobrado = COALESCE(valor_cobrado, $2),
              pagamento_usuario_id = $3
        WHERE id = $1 AND pagamento_confirmado = 0`,
      [ordemId, valor.toFixed(2), usuario.id],
    );

    return { reutilizada: false, cobranca: serializarCobranca(criada, false), modo };
  } catch (erro) {
    // Duas pessoas geraram ao mesmo tempo: vale a que entrou primeiro.
    if (erro?.code === "23505") {
      const existente = await ultimaCobranca(q, ordemId);
      if (existente?.status === "pendente") {
        return { reutilizada: true, cobranca: serializarCobranca(existente, false), modo };
      }
    }
    throw erro;
  }
}

async function cancelarPendente(q, cobranca, deps) {
  await mudarStatusPendente(q, cobranca.id, "cancelado");

  if (cobranca.modo === "mercadopago" && cobranca.mpPaymentId) {
    try {
      await mercadoPago.cancelarPagamento(cobranca.mpPaymentId, deps);
    } catch {
      // Se o MP não cancelar, o PIX antigo expira sozinho; localmente já está
      // cancelado e um pagamento tardio seria conferido manualmente.
    }
  }
}

export async function cancelarCobranca(q, { ordemId, usuario }, deps = {}) {
  const ordem = await carregarOrdem(q, ordemId);
  exigirAcesso(ordem, usuario);

  const atual = await sincronizarCobranca(q, await ultimaCobranca(q, ordemId), deps);

  if (!atual || atual.status !== "pendente") {
    throw erroHttp("Não há PIX pendente para cancelar.", 409);
  }

  await cancelarPendente(q, atual, deps);
  return serializarCobranca(await cobrancaPorId(q, atual.id), false);
}

// Apenas para demonstração, sem Mercado Pago: confirma como se o cliente
// tivesse pago. Não existe para cobranças reais.
export async function simularPagamento(q, { ordemId, usuario }, deps = {}) {
  const ordem = await carregarOrdem(q, ordemId);
  exigirAcesso(ordem, usuario);

  const atual = await sincronizarCobranca(q, await ultimaCobranca(q, ordemId), deps);

  if (!atual || atual.status !== "pendente") {
    throw erroHttp("Não há PIX pendente para confirmar.", 409);
  }
  if (atual.modo !== "simulado") {
    throw erroHttp(
      "Este PIX é real: a confirmação vem do Mercado Pago, não pode ser simulada.",
      409,
    );
  }

  await aprovarCobranca(q, atual.id);
  return serializarCobranca(await cobrancaPorId(q, atual.id), true);
}

// Webhook do Mercado Pago: só usamos o id do pagamento; o status verdadeiro é
// consultado direto na API (assim um aviso forjado não aprova nada).
export async function processarWebhook(q, { pagamentoId }, deps = {}) {
  if (!pagamentoId) return { ignorado: true };

  const [encontrada] = await q(
    `SELECT ${COLUNAS} FROM cobrancas_pix WHERE mp_payment_id = $1`,
    [String(pagamentoId)],
  );

  if (!encontrada) return { ignorado: true };

  const depois = await sincronizarCobranca(q, encontrada, deps);
  return { ignorado: false, status: depois.status, ordemId: depois.ordemId };
}
