import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { servicos, servicoPecas, produtos } from "../db/schema.js";

const router = Router();

//  (lista serviços já com as peças vinculadas de cada um)
router.get("/", async (req, res, next) => {
  try {
    const rows = await db.select().from(servicos).orderBy(servicos.nome);

    const comPecas = await Promise.all(
      rows.map(async (servico) => {
        const pecas = await db
          .select({
            id: servicoPecas.id,
            produtoId: servicoPecas.produtoId,
            quantidadeNecessaria: servicoPecas.quantidadeNecessaria,
            produtoNome: produtos.nome,
          })
          .from(servicoPecas)
          .innerJoin(produtos, eq(servicoPecas.produtoId, produtos.id))
          .where(eq(servicoPecas.servicoId, servico.id));
        return { ...servico, pecas };
      }),
    );

    res.json(comPecas);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id));
    if (!servico) return res.status(404).json({ error: "Serviço não encontrado." });

    const pecas = await db
      .select({
        id: servicoPecas.id,
        produtoId: servicoPecas.produtoId,
        quantidadeNecessaria: servicoPecas.quantidadeNecessaria,
        produtoNome: produtos.nome,
      })
      .from(servicoPecas)
      .innerJoin(produtos, eq(servicoPecas.produtoId, produtos.id))
      .where(eq(servicoPecas.servicoId, id));

    res.json({ ...servico, pecas });
  } catch (err) {
    next(err);
  }
});

//  (cria o serviço; opcionalmente já com as peças vinculadas)
router.post("/", async (req, res, next) => {
  try {
    const { nome, descricao, valor, pecas } = req.body;
    if (!nome?.trim()) {
      return res.status(400).json({ error: "Informe o nome do serviço." });
    }
    if (valor === undefined || valor === null || Number(valor) < 0) {
      return res.status(400).json({ error: "Informe o valor do serviço." });
    }
    if (pecas && !Array.isArray(pecas)) {
      return res.status(400).json({ error: "As peças vinculadas devem ser uma lista." });
    }
    for (const p of pecas ?? []) {
      if (!p.produtoId || !p.quantidadeNecessaria || Number(p.quantidadeNecessaria) <= 0) {
        return res.status(400).json({ error: "Cada peça vinculada precisa de produtoId e uma quantidade necessária maior que zero." });
      }
    }

    const [created] = await db
      .insert(servicos)
      .values({ nome: nome.trim(), descricao: descricao?.trim() || null, valor: String(valor) })
      .returning();

    let pecasCriadas = [];
    if (pecas && pecas.length > 0) {
      pecasCriadas = await db
        .insert(servicoPecas)
        .values(
          pecas.map((p) => ({
            servicoId: created.id,
            produtoId: Number(p.produtoId),
            quantidadeNecessaria: Number(p.quantidadeNecessaria),
          })),
        )
        .returning();
    }

    res.status(201).json({ ...created, pecas: pecasCriadas });
  } catch (err) {
    next(err);
  }
});

// (edita nome/descrição/valor)
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(servicos).where(eq(servicos.id, id));
    if (!current) return res.status(404).json({ error: "Serviço não encontrado." });

    const { nome, descricao, valor } = req.body;
    if (!nome?.trim()) {
      return res.status(400).json({ error: "Informe o nome do serviço." });
    }
    if (valor === undefined || valor === null || Number(valor) < 0) {
      return res.status(400).json({ error: "Informe o valor do serviço." });
    }

    const [updated] = await db
      .update(servicos)
      .set({ nome: nome.trim(), descricao: descricao?.trim() || null, valor: String(valor) })
      .where(eq(servicos.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

//  (substitui a lista completa de peças vinculadas ao serviço)
router.put("/:id/pecas", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id));
    if (!servico) return res.status(404).json({ error: "Serviço não encontrado." });

    const { pecas } = req.body;
    if (!Array.isArray(pecas)) {
      return res.status(400).json({ error: "Informe a lista de peças (pode ser vazia)." });
    }
    for (const p of pecas) {
      if (!p.produtoId || !p.quantidadeNecessaria || Number(p.quantidadeNecessaria) <= 0) {
        return res.status(400).json({ error: "Cada peça vinculada precisa de produtoId e uma quantidade necessária maior que zero." });
      }
    }

    await db.delete(servicoPecas).where(eq(servicoPecas.servicoId, id));

    let pecasCriadas = [];
    if (pecas.length > 0) {
      pecasCriadas = await db
        .insert(servicoPecas)
        .values(
          pecas.map((p) => ({
            servicoId: id,
            produtoId: Number(p.produtoId),
            quantidadeNecessaria: Number(p.quantidadeNecessaria),
          })),
        )
        .returning();
    }

    res.json({ ...servico, pecas: pecasCriadas });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await db.delete(servicoPecas).where(eq(servicoPecas.servicoId, id));
    await db.delete(servicos).where(eq(servicos.id, id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
