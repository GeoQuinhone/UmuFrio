import { Router } from "express";

import { pool } from "../db/client.js";
import { roles, validId } from "../security.js";
import {
  assinaturaWebhookValida,
  configMercadoPago,
} from "../pix/mercadoPago.js";
import {
  cancelarCobranca,
  consultarCobranca,
  criarCobranca,
  processarWebhook,
  simularPagamento,
} from "../pix/pixService.js";

// Fase 4 — PIX / Mercado Pago.
//
// `router` (autenticado) é montado em /api/ordens-servico e cria as rotas
// /:id/pix. `webhookRouter` é público (o Mercado Pago não envia o nosso token)
// e fica em /api/pix/webhook; ele não confia no corpo da requisição: só usa o
// id do pagamento e consulta o status direto na API do Mercado Pago.

const q = async (texto, parametros) =>
  (await pool.query(texto, parametros)).rows;

const router = Router();
const perfis = roles("ceo", "atendente", "tecnico");

function idDaOrdem(req, res) {
  const id = Number(req.params.id);
  if (!validId(id)) {
    res.status(400).json({ error: "ID inválido." });
    return null;
  }
  return id;
}

router.get("/:id/pix", perfis, async (req, res, next) => {
  try {
    const ordemId = idDaOrdem(req, res);
    if (!ordemId) return;
    res.json(await consultarCobranca(q, { ordemId, usuario: req.usuario }));
  } catch (error) {
    next(error);
  }
});

router.post("/:id/pix", perfis, async (req, res, next) => {
  try {
    const ordemId = idDaOrdem(req, res);
    if (!ordemId) return;
    const resultado = await criarCobranca(q, { ordemId, usuario: req.usuario });
    res.status(resultado.reutilizada ? 200 : 201).json(resultado);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/pix/cancelar", perfis, async (req, res, next) => {
  try {
    const ordemId = idDaOrdem(req, res);
    if (!ordemId) return;
    res.json({
      cobranca: await cancelarCobranca(q, { ordemId, usuario: req.usuario }),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/pix/simular", perfis, async (req, res, next) => {
  try {
    const ordemId = idDaOrdem(req, res);
    if (!ordemId) return;
    res.json({
      cobranca: await simularPagamento(q, { ordemId, usuario: req.usuario }),
    });
  } catch (error) {
    next(error);
  }
});

export const webhookRouter = Router();

webhookRouter.post("/", async (req, res, next) => {
  try {
    const tipo = req.body?.type || req.query?.type || req.body?.topic || req.query?.topic;
    const pagamentoId =
      req.body?.data?.id || req.query?.["data.id"] || req.query?.id;

    // Só nos interessa aviso de pagamento; qualquer outro tipo recebe 200 para
    // o Mercado Pago não ficar reenviando.
    if (tipo && tipo !== "payment") {
      return res.status(200).json({ ok: true, ignorado: true });
    }

    const valida = assinaturaWebhookValida(
      {
        xSignature: req.headers["x-signature"],
        xRequestId: req.headers["x-request-id"],
        dataId: req.query?.["data.id"] || pagamentoId,
      },
      configMercadoPago().webhookSecret,
    );

    if (!valida) {
      return res.status(401).json({ error: "Assinatura inválida." });
    }

    const resultado = await processarWebhook(q, { pagamentoId });
    res.status(200).json({ ok: true, ...resultado });
  } catch (error) {
    next(error);
  }
});

export default router;
