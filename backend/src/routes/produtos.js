import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { produtos, movimentacoesEstoque } from "../db/schema.js";

const router = Router();

// get
router.get("/", async (req, res, next) => {
  try {
    const rows = await db.select().from(produtos).orderBy(produtos.nome);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// post novo produto 
router.post("/", async (req, res, next) => {
  try {
    const { nome, saldo } = req.body;
    if (!nome?.trim()) {
      return res.status(400).json({ error: "Informe o nome do produto." });
    }
    const saldoInicial = Number(saldo) || 0;
    if (saldoInicial < 0) {
      return res.status(400).json({ error: "O saldo inicial não pode ser negativo." });
    }

    const [result] = await db.insert(produtos).values({ nome: nome.trim(), saldo: saldoInicial });
    const [created] = await db.select().from(produtos).where(eq(produtos.id, result.insertId));
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// patch rn02 quantidade tem que ser maior que 0
router.patch("/:id/entrada", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const quantidade = Number(req.body.quantidade);
    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({ error: "Informe uma quantidade maior que zero." });
    }

    const [produto] = await db.select().from(produtos).where(eq(produtos.id, id));
    if (!produto) return res.status(404).json({ error: "Produto não encontrado." });

    await db.update(produtos).set({ saldo: produto.saldo + quantidade }).where(eq(produtos.id, id));
    await db.insert(movimentacoesEstoque).values({
      produtoId: id,
      usuarioId: req.body.usuarioId ?? null,
      tipo: "entrada",
      quantidade,
    });

    const [updated] = await db.select().from(produtos).where(eq(produtos.id, id));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// patch Rn01 nao permite retirar mais que o saldo disponivel
router.patch("/:id/saida", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const quantidade = Number(req.body.quantidade);
    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({ error: "Informe uma quantidade maior que zero." });
    }

    const [produto] = await db.select().from(produtos).where(eq(produtos.id, id));
    if (!produto) return res.status(404).json({ error: "Produto não encontrado." });
    if (quantidade > produto.saldo) {
      return res.status(409).json({ error: `Saldo insuficiente de "${produto.nome}" (disponível: ${produto.saldo}).` });
    }

    await db.update(produtos).set({ saldo: produto.saldo - quantidade }).where(eq(produtos.id, id));
    await db.insert(movimentacoesEstoque).values({
      produtoId: id,
      usuarioId: req.body.usuarioId ?? null,
      tipo: "saida",
      quantidade,
    });

    const [updated] = await db.select().from(produtos).where(eq(produtos.id, id));
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// delete
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await db.delete(produtos).where(eq(produtos.id, id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
