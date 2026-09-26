import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  servicos,
  servicoPecas,
  produtos,
} from "../db/schema.js";
import { roles, validId } from "../security.js";

const router = Router();

async function incluirPecas(servico) {
  if (!servico) {
    return servico;
  }

  const pecas = await db
    .select({
      id: servicoPecas.id,
      produtoId: servicoPecas.produtoId,
      quantidadeNecessaria:
        servicoPecas.quantidadeNecessaria,
      produtoNome: produtos.nome,
    })
    .from(servicoPecas)
    .innerJoin(
      produtos,
      eq(servicoPecas.produtoId, produtos.id),
    )
    .where(eq(servicoPecas.servicoId, servico.id));

  return {
    ...servico,
    pecas,
  };
}

router.get(
  "/",
  roles("ceo", "atendente"),
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(servicos)
        .orderBy(servicos.nome);

      res.json(await Promise.all(rows.map(incluirPecas)));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id",
  roles("ceo", "atendente"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const rows = await db
        .select()
        .from(servicos)
        .where(eq(servicos.id, id));

      if (!rows[0]) {
        return res.status(404).json({
          error: "Serviço não encontrado.",
        });
      }

      res.json(await incluirPecas(rows[0]));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/",
  roles("ceo", "atendente"),
  async (req, res, next) => {
    try {
      const {
        nome,
        descricao,
        valor,
        pecas = [],
      } = req.body;

      if (
        !nome?.trim() ||
        !Number.isFinite(Number(valor)) ||
        Number(valor) < 0 ||
        !Array.isArray(pecas)
      ) {
        return res.status(400).json({
          error: "Informe nome, valor e peças válidos.",
        });
      }

      for (const peca of pecas) {
        if (
          !validId(peca.produtoId) ||
          !Number.isInteger(
            Number(peca.quantidadeNecessaria),
          ) ||
          Number(peca.quantidadeNecessaria) <= 0
        ) {
          return res.status(400).json({
            error: "Existe uma peça com dados inválidos.",
          });
        }
      }

      const servico = await db.transaction(async (tx) => {
        const [novoServico] = await tx
          .insert(servicos)
          .values({
            nome: nome.trim(),
            descricao: descricao?.trim() || null,
            valor: String(valor),
          })
          .returning();

        if (pecas.length > 0) {
          await tx
            .insert(servicoPecas)
            .values(
              pecas.map((peca) => ({
                servicoId: novoServico.id,
                produtoId: Number(peca.produtoId),
                quantidadeNecessaria: Number(
                  peca.quantidadeNecessaria,
                ),
              })),
            );
        }

        return novoServico;
      });

      res.status(201).json(await incluirPecas(servico));
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id",
  roles("ceo", "atendente"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const {
        nome,
        descricao,
        valor,
      } = req.body;

      if (
        !validId(id) ||
        !nome?.trim() ||
        !Number.isFinite(Number(valor)) ||
        Number(valor) < 0
      ) {
        return res.status(400).json({
          error: "Dados inválidos.",
        });
      }

      const [servico] = await db
        .update(servicos)
        .set({
          nome: nome.trim(),
          descricao: descricao?.trim() || null,
          valor: String(valor),
        })
        .where(eq(servicos.id, id))
        .returning();

      if (!servico) {
        return res.status(404).json({
          error: "Serviço não encontrado.",
        });
      }

      res.json(await incluirPecas(servico));
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id/pecas",
  roles("ceo", "atendente"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { pecas } = req.body;

      if (
        !validId(id) ||
        !Array.isArray(pecas) ||
        pecas.some(
          (peca) =>
            !validId(peca.produtoId) ||
            !Number.isInteger(
              Number(peca.quantidadeNecessaria),
            ) ||
            Number(peca.quantidadeNecessaria) <= 0,
        )
      ) {
        return res.status(400).json({
          error: "Lista de peças inválida.",
        });
      }

      const servico = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(servicos)
          .where(eq(servicos.id, id));

        if (!rows[0]) {
          return null;
        }

        await tx
          .delete(servicoPecas)
          .where(eq(servicoPecas.servicoId, id));

        if (pecas.length > 0) {
          await tx
            .insert(servicoPecas)
            .values(
              pecas.map((peca) => ({
                servicoId: id,
                produtoId: Number(peca.produtoId),
                quantidadeNecessaria: Number(
                  peca.quantidadeNecessaria,
                ),
              })),
            );
        }

        return rows[0];
      });

      if (!servico) {
        return res.status(404).json({
          error: "Serviço não encontrado.",
        });
      }

      res.json(await incluirPecas(servico));
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id",
  roles("ceo"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(servicoPecas)
          .where(eq(servicoPecas.servicoId, id));

        await tx
          .delete(servicos)
          .where(eq(servicos.id, id));
      });

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;