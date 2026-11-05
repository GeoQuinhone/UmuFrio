import { Router } from "express";
import { pool } from "../db/client.js";
import { roles, validId } from "../security.js";
import {
  listarNotificacoes,
  marcarLida,
  marcarTodasLidas,
} from "../notificacoes.js";

// Notificações do sino: somente o CEO (ele é quem acompanha estoque, caixa e
// ocorrências). Além dos avisos gravados, devolve um resumo "ao vivo" das
// pendências (pagamentos em aberto e estoque crítico), que não depende de
// evento: some sozinho quando o problema é resolvido.

const router = Router();

router.use(roles("ceo"));

router.get("/", async (_req, res, next) => {
  try {
    const { itens, naoLidas } = await listarNotificacoes();

    const [pend] = (
      await pool.query(
        `SELECT
           (SELECT count(*)::int FROM ordens_servico o
             WHERE o.status = 'concluida' AND o.pagamento_confirmado = 0) AS "pagamentosPendentes",
           (SELECT COALESCE(sum(COALESCE(o.valor_cobrado, s.valor)), 0)::float
              FROM ordens_servico o JOIN servicos s ON s.id = o.servico_id
             WHERE o.status = 'concluida' AND o.pagamento_confirmado = 0) AS "valorPendente",
           (SELECT count(*)::int FROM produtos WHERE saldo <= 0) AS "estoqueZerado",
           (SELECT count(*)::int FROM produtos WHERE saldo > 0 AND saldo <= quantidade_minima) AS "estoqueBaixo"`,
      )
    ).rows;

    res.json({ itens, naoLidas, pendencias: pend });
  } catch (error) {
    next(error);
  }
});

router.patch("/lidas", async (_req, res, next) => {
  try {
    await marcarTodasLidas();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/lida", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(400).json({ error: "ID inválido." });
    await marcarLida(id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
