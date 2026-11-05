import { Router } from "express";

import { pool } from "../db/client.js";
import { roles } from "../security.js";
import {
  FUSO_PADRAO,
  gerarRelatorio,
  listarAtendimentos,
  tabelaParaCsv,
} from "../relatorios/consultas.js";

// Fase 4 — relatórios estratégicos. Somente o CEO acessa (nenhum outro perfil
// chega ao código das consultas).

const router = Router();

router.use(roles("ceo"));

const q = async (texto, parametros) =>
  (await pool.query(texto, parametros)).rows;

const fuso = () => process.env.RELATORIOS_FUSO || FUSO_PADRAO;

// GET /api/relatorios?de=AAAA-MM-DD&ate=AAAA-MM-DD
router.get("/", async (req, res, next) => {
  try {
    res.json(
      await gerarRelatorio(q, { de: req.query.de, ate: req.query.ate }, fuso()),
    );
  } catch (error) {
    next(error);
  }
});

// GET /api/relatorios/atendimentos?situacao=naoRealizados&de=...&ate=...
// (opcionais: tecnicoId, servicoId, motivo) — lista por trás dos números.
router.get("/atendimentos", async (req, res, next) => {
  try {
    res.json(
      await listarAtendimentos(
        q,
        { de: req.query.de, ate: req.query.ate },
        {
          situacao: req.query.situacao || "todos",
          tecnicoId: req.query.tecnicoId || null,
          servicoId: req.query.servicoId || null,
          motivo: req.query.motivo || null,
        },
        fuso(),
      ),
    );
  } catch (error) {
    next(error);
  }
});

// GET /api/relatorios/csv/:tabela?de=...&ate=...
router.get("/csv/:tabela", async (req, res, next) => {
  try {
    const relatorio = await gerarRelatorio(
      q,
      { de: req.query.de, ate: req.query.ate },
      fuso(),
    );
    const csv = tabelaParaCsv(req.params.tabela, relatorio);
    const { de, ate } = relatorio.periodo;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="umufrio-${req.params.tabela}-${de}-a-${ate}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
