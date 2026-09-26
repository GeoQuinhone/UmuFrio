import { Router } from "express";
import {
  and,
  eq,
  lt,
  sql,
} from "drizzle-orm";
import { db } from "../db/client.js";
import {
  produtos,
  movimentacoesEstoque,
} from "../db/schema.js";
import {
  roles,
  validId,
} from "../security.js";

const router = Router();

function quantidadeValida(valor) {
  return (
    Number.isInteger(Number(valor)) &&
    Number(valor) > 0
  );
}

router.get(
  "/",
  roles("ceo", "estoquista", "atendente"),
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(produtos)
        .orderBy(produtos.nome);

      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/alertas",
  roles("ceo", "estoquista"),
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(produtos)
        .where(
          lt(
            produtos.saldo,
            produtos.quantidadeMinima,
          ),
        )
        .orderBy(produtos.nome);

      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/movimentacoes",
  roles("ceo", "estoquista"),
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(movimentacoesEstoque)
        .orderBy(
          sql`${movimentacoesEstoque.data} desc`,
        );

      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/",
  roles("ceo", "estoquista"),
  async (req, res, next) => {
    try {
      const {
        nome,
        valorUnitario,
        saldo = 0,
        quantidadeMinima = 0,
      } = req.body;

      if (
        !nome?.trim() ||
        !Number.isFinite(Number(valorUnitario)) ||
        Number(valorUnitario) < 0 ||
        !Number.isInteger(Number(saldo)) ||
        Number(saldo) < 0 ||
        !Number.isInteger(Number(quantidadeMinima)) ||
        Number(quantidadeMinima) < 0
      ) {
        return res.status(400).json({
          error: "Dados do produto inválidos.",
        });
      }

      const [produto] = await db
        .insert(produtos)
        .values({
          nome: nome.trim(),
          valorUnitario: String(valorUnitario),
          saldo: Number(saldo),
          quantidadeMinima: Number(
            quantidadeMinima,
          ),
        })
        .returning();

      res.status(201).json(produto);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id",
  roles("ceo", "estoquista"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const {
        nome,
        valorUnitario,
        quantidadeMinima = 0,
      } = req.body;

      if (
        !validId(id) ||
        !nome?.trim() ||
        !Number.isFinite(Number(valorUnitario)) ||
        Number(valorUnitario) < 0 ||
        !Number.isInteger(Number(quantidadeMinima)) ||
        Number(quantidadeMinima) < 0
      ) {
        return res.status(400).json({
          error: "Dados do produto inválidos.",
        });
      }

      const [produto] = await db
        .update(produtos)
        .set({
          nome: nome.trim(),
          valorUnitario: String(valorUnitario),
          quantidadeMinima: Number(
            quantidadeMinima,
          ),
        })
        .where(eq(produtos.id, id))
        .returning();

      if (!produto) {
        return res.status(404).json({
          error: "Produto não encontrado.",
        });
      }

      res.json(produto);
    } catch (error) {
      next(error);
    }
  },
);

async function movimentarEstoque(
  req,
  res,
  next,
  tipo,
) {
  try {
    const id = Number(req.params.id);
    const quantidade = Number(req.body.quantidade);

    if (
      !validId(id) ||
      !quantidadeValida(quantidade)
    ) {
      return res.status(400).json({
        error:
          "Informe uma quantidade inteira maior que zero.",
      });
    }

    const resultado = await db.transaction(
      async (tx) => {
        const condicao =
          tipo === "saida"
            ? and(
                eq(produtos.id, id),
                sql`${produtos.saldo} >= ${quantidade}`,
              )
            : eq(produtos.id, id);

        const [atualizado] = await tx
          .update(produtos)
          .set({
            saldo:
              tipo === "entrada"
                ? sql`${produtos.saldo} + ${quantidade}`
                : sql`${produtos.saldo} - ${quantidade}`,
          })
          .where(condicao)
          .returning();

        if (!atualizado) {
          const existente = await tx
            .select({ id: produtos.id })
            .from(produtos)
            .where(eq(produtos.id, id));

          if (!existente[0]) {
            return {
              produtoNaoEncontrado: true,
            };
          }

          const error = new Error(
            tipo === "saida"
              ? "Saldo insuficiente ou alterado. Tente novamente."
              : "O produto foi alterado. Tente novamente.",
          );

          error.status = 409;
          throw error;
        }

        await tx
          .insert(movimentacoesEstoque)
          .values({
            produtoId: id,
            usuarioId: req.usuario.id,
            tipo,
            quantidade,
          });

        return {
          produto: atualizado,
        };
      },
    );

    if (resultado.produtoNaoEncontrado) {
      return res.status(404).json({
        error: "Produto não encontrado.",
      });
    }

    res.json(resultado.produto);
  } catch (error) {
    next(error);
  }
}

router.patch(
  "/:id/entrada",
  roles("ceo", "estoquista"),
  (req, res, next) =>
    movimentarEstoque(
      req,
      res,
      next,
      "entrada",
    ),
);

router.patch(
  "/:id/saida",
  roles("ceo", "estoquista"),
  (req, res, next) =>
    movimentarEstoque(
      req,
      res,
      next,
      "saida",
    ),
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

      await db
        .delete(produtos)
        .where(eq(produtos.id, id));

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export default router;