import { Router } from "express";
import { eq, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { produtos, movimentacoesEstoque } from "../db/schema.js";

const router = Router();


router.get("/", async (req, res, next) => {
  try {
    const rows = await db.select().from(produtos).orderBy(produtos.nome);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

//  (peças com saldo abaixo da quantidade mínima configurada)
router.get("/alertas", async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(produtos)
      .where(lt(produtos.saldo, produtos.quantidadeMinima))
      .orderBy(produtos.nome);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { nome, valorUnitario, saldo, quantidadeMinima } = req.body;
    if (!nome?.trim()) {
      return res.status(400).json({ error: "Informe o nome do produto." });
    }
    if (valorUnitario === undefined || valorUnitario === null || Number(valorUnitario) < 0) {
      return res.status(400).json({ error: "Informe o valor unitário da peça." });
    }
    const saldoInicial = Number(saldo) || 0;
    if (saldoInicial < 0) {
      return res.status(400).json({ error: "O saldo inicial não pode ser negativo." });
    }
    const minimo = Number(quantidadeMinima) || 0;
    if (minimo < 0) {
      return res.status(400).json({ error: "A quantidade mínima não pode ser negativa." });
    }

    const [created] = await db
      .insert(produtos)
      .values({
        nome: nome.trim(),
        valorUnitario: String(valorUnitario),
        saldo: saldoInicial,
        quantidadeMinima: minimo,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

//  (edita nome, valor unitário e quantidade mínima)
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(produtos).where(eq(produtos.id, id));
    if (!current) return res.status(404).json({ error: "Produto não encontrado." });

    const { nome, valorUnitario, quantidadeMinima } = req.body;
    if (!nome?.trim()) {
      return res.status(400).json({ error: "Informe o nome do produto." });
    }
    if (valorUnitario === undefined || valorUnitario === null || Number(valorUnitario) < 0) {
      return res.status(400).json({ error: "Informe o valor unitário da peça." });
    }
    const minimo = Number(quantidadeMinima) || 0;
    if (minimo < 0) {
      return res.status(400).json({ error: "A quantidade mínima não pode ser negativa." });
    }

    const [updated] = await db
      .update(produtos)
      .set({ nome: nome.trim(), valorUnitario: String(valorUnitario), quantidadeMinima: minimo })
      .where(eq(produtos.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

//  (RN-02: quantidade > 0)
router.patch("/:id/entrada", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const quantidade = Number(req.body.quantidade);
    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({ error: "Informe uma quantidade maior que zero." });
    }

    const [produto] = await db.select().from(produtos).where(eq(produtos.id, id));
    if (!produto) return res.status(404).json({ error: "Produto não encontrado." });

    const [updated] = await db
      .update(produtos)
      .set({ saldo: produto.saldo + quantidade })
      .where(eq(produtos.id, id))
      .returning();
    await db.insert(movimentacoesEstoque).values({
      produtoId: id,
      usuarioId: req.body.usuarioId ?? null,
      tipo: "entrada",
      quantidade,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

//  (RN-01: não permite retirar mais que o saldo disponível)
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

    const [updated] = await db
      .update(produtos)
      .set({ saldo: produto.saldo - quantidade })
      .where(eq(produtos.id, id))
      .returning();
    await db.insert(movimentacoesEstoque).values({
      produtoId: id,
      usuarioId: req.body.usuarioId ?? null,
      tipo: "saida",
      quantidade,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

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
