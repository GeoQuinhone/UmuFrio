import { Router } from "express";

import { pool } from "../db/client.js";
import { roles, validId } from "../security.js";
import {
  consultarLocalizacao,
  registrarLocalizacao,
} from "../checkin/checkinService.js";

// Fase 5 — check-in/check-out geolocalizado. Montado em /api/ordens-servico.
//   GET  /:id/localizacao  consulta (ceo, atendente e o técnico responsável)
//   POST /:id/checkin      registra o check-in (técnico responsável)
//   POST /:id/checkout     registra o check-out (técnico responsável)

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

router.get("/:id/localizacao", perfis, async (req, res, next) => {
  try {
    const ordemId = idDaOrdem(req, res);
    if (!ordemId) return;
    res.json(await consultarLocalizacao(q, { ordemId, usuario: req.usuario }));
  } catch (error) {
    next(error);
  }
});

for (const tipo of ["checkin", "checkout"]) {
  router.post(`/:id/${tipo}`, roles("tecnico"), async (req, res, next) => {
    try {
      const ordemId = idDaOrdem(req, res);
      if (!ordemId) return;
      const registro = await registrarLocalizacao(q, {
        ordemId,
        tipo,
        usuario: req.usuario,
        posicao: req.body,
        justificativa: req.body?.justificativa,
      });
      res.status(201).json({ registro });
    } catch (error) {
      next(error);
    }
  });
}

export default router;
