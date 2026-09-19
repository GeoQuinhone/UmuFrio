import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { ordensServico, agendamentos, servicos, servicoPecas, produtos, movimentacoesEstoque } from "../db/schema.js";

const router = Router();

const STATUS_FLOW = ["aberta", "andamento", "concluida"];


router.get("/", async (req, res, next) => {
  try {
    const rows = await db.select().from(ordensServico);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

//  (RN-01: só depois de agendamento confirmado; RN-02: 1 OS por agendamento; exige o serviço prestado)
router.post("/", async (req, res, next) => {
  try {
    const { agendamentoId, servicoId } = req.body;
    if (!agendamentoId) {
      return res.status(400).json({ error: "Selecione um agendamento confirmado." });
    }
    if (!servicoId) {
      return res.status(400).json({ error: "Selecione o serviço que será prestado." });
    }

    const [agendamento] = await db.select().from(agendamentos).where(eq(agendamentos.id, agendamentoId));
    if (!agendamento || agendamento.status !== "agendado") {
      return res.status(400).json({ error: "O agendamento selecionado não está confirmado." });
    }

    const [servico] = await db.select().from(servicos).where(eq(servicos.id, servicoId));
    if (!servico) {
      return res.status(400).json({ error: "Serviço não encontrado." });
    }

    const existentes = await db.select().from(ordensServico).where(eq(ordensServico.agendamentoId, agendamentoId));
    if (existentes.length > 0) {
      return res.status(409).json({ error: "Este agendamento já possui uma ordem de serviço." });
    }

    const [created] = await db
      .insert(ordensServico)
      .values({ agendamentoId, servicoId, status: "aberta" })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// RN-02: status só avança, nunca volta
// Regra de negócio central: ao entrar em "andamento", debita do estoque as peças
// vinculadas ao serviço da OS (tabela servico_pecas), na quantidade configurada,
// e registra a movimentação (tipo "saida") vinculada a esta OS.
router.patch("/:id/avancar", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(ordensServico).where(eq(ordensServico.id, id));
    if (!current) return res.status(404).json({ error: "Ordem de serviço não encontrada." });

    const idx = STATUS_FLOW.indexOf(current.status);
    if (idx === STATUS_FLOW.length - 1) {
      return res.status(409).json({ error: "Esta ordem de serviço já está concluída." });
    }
    const proximo = STATUS_FLOW[idx + 1];

    // Transação: ou debita tudo certinho, ou nada é alterado (evita estoque
    // debitado parcialmente se faltar peça no meio do caminho).
    const updated = await db.transaction(async (tx) => {
      if (proximo === "andamento") {
        const pecasNecessarias = await tx
          .select({
            produtoId: servicoPecas.produtoId,
            quantidadeNecessaria: servicoPecas.quantidadeNecessaria,
            produtoNome: produtos.nome,
            saldo: produtos.saldo,
          })
          .from(servicoPecas)
          .innerJoin(produtos, eq(servicoPecas.produtoId, produtos.id))
          .where(eq(servicoPecas.servicoId, current.servicoId));

        // Confere se há saldo suficiente de todas as peças antes de debitar qualquer uma
        for (const peca of pecasNecessarias) {
          if (peca.saldo < peca.quantidadeNecessaria) {
            const err = new Error(
              `Estoque insuficiente de "${peca.produtoNome}" para iniciar este serviço (necessário: ${peca.quantidadeNecessaria}, disponível: ${peca.saldo}).`,
            );
            err.status = 409;
            throw err;
          }
        }

        for (const peca of pecasNecessarias) {
          await tx
            .update(produtos)
            .set({ saldo: peca.saldo - peca.quantidadeNecessaria })
            .where(eq(produtos.id, peca.produtoId));
          await tx.insert(movimentacoesEstoque).values({
            produtoId: peca.produtoId,
            usuarioId: req.body.usuarioId ?? null,
            ordemServicoId: id,
            tipo: "saida",
            quantidade: peca.quantidadeNecessaria,
          });
        }
      }

      const [row] = await tx
        .update(ordensServico)
        .set({ status: proximo, concluidaEm: proximo === "concluida" ? new Date() : current.concluidaEm })
        .where(eq(ordensServico.id, id))
        .returning();
      return row;
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
