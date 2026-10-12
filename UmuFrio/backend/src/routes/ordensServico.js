import { Router } from "express";
import {
  and,
  eq,
  sql,
} from "drizzle-orm";
import { db } from "../db/client.js";
import {
  ordensServico,
  agendamentos,
  servicos,
  servicoPecas,
  produtos,
  movimentacoesEstoque,
  clientes,
} from "../db/schema.js";
import {
  roles,
  validId,
} from "../security.js";

const router = Router();

// Junta a OS com o agendamento, o cliente e o serviço para já devolver os
// nomes prontos — assim o técnico (que não tem acesso às listas completas
// de clientes/serviços) também enxerga o nome do cliente e do serviço.
function selecaoComNomes() {
  return db
    .select({
      id: ordensServico.id,
      agendamentoId: ordensServico.agendamentoId,
      servicoId: ordensServico.servicoId,
      status: ordensServico.status,
      abertaEm: ordensServico.abertaEm,
      iniciadaEm: ordensServico.iniciadaEm,
      concluidaEm: ordensServico.concluidaEm,
      servicoNome: servicos.nome,
      servicoValor: servicos.valor,
      clienteId: agendamentos.clienteId,
      clienteNome: clientes.nome,
      tecnicoId: agendamentos.tecnicoId,
      agendamentoData: agendamentos.data,
      agendamentoHora: agendamentos.hora,
    })
    .from(ordensServico)
    .innerJoin(
      agendamentos,
      eq(ordensServico.agendamentoId, agendamentos.id),
    )
    .innerJoin(
      servicos,
      eq(ordensServico.servicoId, servicos.id),
    )
    .innerJoin(
      clientes,
      eq(agendamentos.clienteId, clientes.id),
    );
}

router.get(
  "/",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const rows = await selecaoComNomes();

      if (req.usuario.perfil === "tecnico") {
        return res.json(
          rows.filter(
            (ordem) => ordem.tecnicoId === req.usuario.id,
          ),
        );
      }

      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const rows = await selecaoComNomes().where(
        eq(ordensServico.id, id),
      );

      const ordem = rows[0];

      if (!ordem) {
        return res.status(404).json({
          error:
            "Ordem de serviço não encontrada.",
        });
      }

      if (
        req.usuario.perfil === "tecnico" &&
        ordem.tecnicoId !== req.usuario.id
      ) {
        return res.status(403).json({
          error: "Acesso negado.",
        });
      }

      res.json(ordem);
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
        agendamentoId,
        servicoId,
      } = req.body;

      const agendamentoIdNumerico =
        Number(agendamentoId);

      const servicoIdNumerico =
        Number(servicoId);

      if (
        !validId(agendamentoIdNumerico) ||
        !validId(servicoIdNumerico)
      ) {
        return res.status(400).json({
          error:
            "Selecione um agendamento e um serviço.",
        });
      }

      const ordem = await db.transaction(
        async (tx) => {
          const agendamentosEncontrados = await tx
            .select()
            .from(agendamentos)
            .where(
              eq(
                agendamentos.id,
                agendamentoIdNumerico,
              ),
            );

          const agendamento =
            agendamentosEncontrados[0];

          if (
            !agendamento ||
            agendamento.status !== "agendado"
          ) {
            const error = new Error(
              "O agendamento selecionado não está confirmado.",
            );
            error.status = 400;
            throw error;
          }

          const servicosEncontrados = await tx
            .select()
            .from(servicos)
            .where(
              eq(
                servicos.id,
                servicoIdNumerico,
              ),
            );

          if (!servicosEncontrados[0]) {
            const error = new Error(
              "Serviço não encontrado.",
            );
            error.status = 400;
            throw error;
          }

          const ordensExistentes = await tx
            .select()
            .from(ordensServico)
            .where(
              eq(
                ordensServico.agendamentoId,
                agendamentoIdNumerico,
              ),
            );

          if (ordensExistentes.length > 0) {
            const error = new Error(
              "Este agendamento já possui uma ordem de serviço.",
            );
            error.status = 409;
            throw error;
          }

          const [criada] = await tx
            .insert(ordensServico)
            .values({
              agendamentoId: agendamentoIdNumerico,
              servicoId: servicoIdNumerico,
              status: "aberta",
            })
            .returning();

          return criada;
        },
      );

      res.status(201).json(ordem);
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

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const {
        agendamentoId,
        servicoId,
      } = req.body;

      const agendamentoIdNumerico =
        Number(agendamentoId);

      const servicoIdNumerico =
        Number(servicoId);

      if (
        !validId(agendamentoIdNumerico) ||
        !validId(servicoIdNumerico)
      ) {
        return res.status(400).json({
          error:
            "Selecione um agendamento e um serviço.",
        });
      }

      const ordemAtualizada = await db.transaction(
        async (tx) => {
          const ordensEncontradas = await tx
            .select()
            .from(ordensServico)
            .where(eq(ordensServico.id, id));

          const ordem = ordensEncontradas[0];

          if (!ordem) {
            const error = new Error(
              "Ordem de serviço não encontrada.",
            );
            error.status = 404;
            throw error;
          }

          if (ordem.status !== "aberta") {
            const error = new Error(
              "Só é possível editar uma ordem de serviço enquanto ela estiver aberta (sem peças já debitadas do estoque).",
            );
            error.status = 409;
            throw error;
          }

          const agendamentosEncontrados = await tx
            .select()
            .from(agendamentos)
            .where(
              eq(
                agendamentos.id,
                agendamentoIdNumerico,
              ),
            );

          const agendamento =
            agendamentosEncontrados[0];

          if (
            !agendamento ||
            (agendamento.status !== "agendado" &&
              agendamentoIdNumerico !==
                ordem.agendamentoId)
          ) {
            const error = new Error(
              "O agendamento selecionado não está confirmado.",
            );
            error.status = 400;
            throw error;
          }

          const servicosEncontrados = await tx
            .select()
            .from(servicos)
            .where(
              eq(
                servicos.id,
                servicoIdNumerico,
              ),
            );

          if (!servicosEncontrados[0]) {
            const error = new Error(
              "Serviço não encontrado.",
            );
            error.status = 400;
            throw error;
          }

          if (
            agendamentoIdNumerico !==
            ordem.agendamentoId
          ) {
            const ordensExistentes = await tx
              .select()
              .from(ordensServico)
              .where(
                eq(
                  ordensServico.agendamentoId,
                  agendamentoIdNumerico,
                ),
              );

            if (ordensExistentes.length > 0) {
              const error = new Error(
                "Este agendamento já possui uma ordem de serviço.",
              );
              error.status = 409;
              throw error;
            }
          }

          const [atualizada] = await tx
            .update(ordensServico)
            .set({
              agendamentoId: agendamentoIdNumerico,
              servicoId: servicoIdNumerico,
            })
            .where(
              and(
                eq(ordensServico.id, id),
                eq(
                  ordensServico.status,
                  ordem.status,
                ),
              ),
            )
            .returning();

          if (!atualizada) {
            const error = new Error(
              "A ordem foi alterada. Atualize a tela e tente novamente.",
            );
            error.status = 409;
            throw error;
          }

          return atualizada;
        },
      );

      res.json(ordemAtualizada);
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
        const ordensEncontradas = await tx
          .select()
          .from(ordensServico)
          .where(eq(ordensServico.id, id));

        const ordem = ordensEncontradas[0];

        if (!ordem) {
          const error = new Error(
            "Ordem de serviço não encontrada.",
          );
          error.status = 404;
          throw error;
        }

        if (ordem.status === "concluida") {
          const error = new Error(
            "Não é possível excluir uma ordem de serviço já concluída, pois o histórico de movimentações de estoque precisa ser preservado.",
          );
          error.status = 409;
          throw error;
        }

        if (ordem.status === "andamento") {
          const movimentacoes = await tx
            .select()
            .from(movimentacoesEstoque)
            .where(
              eq(
                movimentacoesEstoque.ordemServicoId,
                id,
              ),
            );

          for (const movimentacao of movimentacoes) {
            if (movimentacao.tipo === "saida") {
              await tx
                .update(produtos)
                .set({
                  saldo: sql`${produtos.saldo} + ${movimentacao.quantidade}`,
                })
                .where(
                  eq(
                    produtos.id,
                    movimentacao.produtoId,
                  ),
                );
            }
          }

          await tx
            .delete(movimentacoesEstoque)
            .where(
              eq(
                movimentacoesEstoque.ordemServicoId,
                id,
              ),
            );
        }

        await tx
          .delete(ordensServico)
          .where(eq(ordensServico.id, id));
      });

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/avancar",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const ordemAtualizada = await db.transaction(
        async (tx) => {
          const ordensEncontradas = await tx
            .select()
            .from(ordensServico)
            .where(eq(ordensServico.id, id));

          const ordem = ordensEncontradas[0];

          if (!ordem) {
            const error = new Error(
              "Ordem de serviço não encontrada.",
            );
            error.status = 404;
            throw error;
          }

          const agendamentosEncontrados = await tx
            .select()
            .from(agendamentos)
            .where(
              eq(
                agendamentos.id,
                ordem.agendamentoId,
              ),
            );

          const agendamento =
            agendamentosEncontrados[0];

          if (
            req.usuario.perfil === "tecnico" &&
            agendamento?.tecnicoId !== req.usuario.id
          ) {
            const error = new Error(
              "Você não pode alterar esta ordem de serviço.",
            );
            error.status = 403;
            throw error;
          }

          const proximoStatus =
            ordem.status === "aberta"
              ? "andamento"
              : ordem.status === "andamento"
                ? "concluida"
                : null;

          if (!proximoStatus) {
            const error = new Error(
              "Esta ordem de serviço já está concluída.",
            );
            error.status = 409;
            throw error;
          }

          if (proximoStatus === "andamento") {
            const pecas = await tx
              .select({
                produtoId: servicoPecas.produtoId,
                quantidade:
                  servicoPecas.quantidadeNecessaria,
                nome: produtos.nome,
                saldo: produtos.saldo,
              })
              .from(servicoPecas)
              .innerJoin(
                produtos,
                eq(
                  servicoPecas.produtoId,
                  produtos.id,
                ),
              )
              .where(
                eq(
                  servicoPecas.servicoId,
                  ordem.servicoId,
                ),
              );

            for (const peca of pecas) {
              if (peca.saldo < peca.quantidade) {
                const error = new Error(
                  `Estoque insuficiente de "${peca.nome}". Necessário: ${peca.quantidade}. Disponível: ${peca.saldo}.`,
                );
                error.status = 409;
                throw error;
              }
            }

            for (const peca of pecas) {
              const [produtoAtualizado] =
                await tx
                  .update(produtos)
                  .set({
                    saldo: sql`${produtos.saldo} - ${peca.quantidade}`,
                  })
                  .where(
                    and(
                      eq(produtos.id, peca.produtoId),
                      sql`${produtos.saldo} >= ${peca.quantidade}`,
                    ),
                  )
                  .returning();

              if (!produtoAtualizado) {
                const error = new Error(
                  "O estoque foi alterado. Atualize a tela e tente novamente.",
                );
                error.status = 409;
                throw error;
              }

              await tx
                .insert(movimentacoesEstoque)
                .values({
                  produtoId: peca.produtoId,
                  usuarioId: req.usuario.id,
                  ordemServicoId: id,
                  tipo: "saida",
                  quantidade: peca.quantidade,
                });
            }
          }

          const [atualizada] = await tx
            .update(ordensServico)
            .set({
              status: proximoStatus,
              iniciadaEm:
                proximoStatus === "andamento"
                  ? new Date()
                  : ordem.iniciadaEm,
              concluidaEm:
                proximoStatus === "concluida"
                  ? new Date()
                  : ordem.concluidaEm,
            })
            .where(
              and(
                eq(ordensServico.id, id),
                eq(
                  ordensServico.status,
                  ordem.status,
                ),
              ),
            )
            .returning();

          if (!atualizada) {
            const error = new Error(
              "A ordem foi alterada. Atualize a tela e tente novamente.",
            );
            error.status = 409;
            throw error;
          }

          return atualizada;
        },
      );

      res.json(ordemAtualizada);
    } catch (error) {
      next(error);
    }
  },
);

// Peças extras (ponto 12): além das peças já vinculadas ao serviço (debitadas
// automaticamente ao avançar para "andamento"), o técnico pode precisar de
// peças adicionais durante o atendimento. Fica registrado com extra=1 para
// diferenciar do consumo padrão do serviço.
router.get(
  "/:id/pecas-extras",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!validId(id)) {
        return res.status(400).json({
          error: "ID inválido.",
        });
      }

      const rows = await db
        .select({
          id: movimentacoesEstoque.id,
          produtoId: movimentacoesEstoque.produtoId,
          produtoNome: produtos.nome,
          quantidade: movimentacoesEstoque.quantidade,
          data: movimentacoesEstoque.data,
        })
        .from(movimentacoesEstoque)
        .innerJoin(
          produtos,
          eq(movimentacoesEstoque.produtoId, produtos.id),
        )
        .where(
          and(
            eq(movimentacoesEstoque.ordemServicoId, id),
            eq(movimentacoesEstoque.extra, 1),
          ),
        )
        .orderBy(movimentacoesEstoque.data);

      res.json(rows);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/pecas-extras",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const produtoId = Number(req.body.produtoId);
      const quantidade = Number(req.body.quantidade);

      if (
        !validId(id) ||
        !validId(produtoId) ||
        !Number.isInteger(quantidade) ||
        quantidade <= 0
      ) {
        return res.status(400).json({
          error: "Informe uma peça e uma quantidade válidas.",
        });
      }

      await db.transaction(async (tx) => {
        const ordensEncontradas = await tx
          .select()
          .from(ordensServico)
          .where(eq(ordensServico.id, id));

        const ordem = ordensEncontradas[0];

        if (!ordem) {
          const error = new Error(
            "Ordem de serviço não encontrada.",
          );
          error.status = 404;
          throw error;
        }

        if (ordem.status !== "andamento") {
          const error = new Error(
            "Só é possível descontar peças extras com a ordem em andamento.",
          );
          error.status = 409;
          throw error;
        }

        const agendamentosEncontrados = await tx
          .select()
          .from(agendamentos)
          .where(eq(agendamentos.id, ordem.agendamentoId));

        const agendamento = agendamentosEncontrados[0];

        if (
          req.usuario.perfil === "tecnico" &&
          agendamento?.tecnicoId !== req.usuario.id
        ) {
          const error = new Error(
            "Você não pode alterar esta ordem de serviço.",
          );
          error.status = 403;
          throw error;
        }

        const produtosEncontrados = await tx
          .select()
          .from(produtos)
          .where(eq(produtos.id, produtoId));

        const produto = produtosEncontrados[0];

        if (!produto) {
          const error = new Error(
            "Produto não encontrado.",
          );
          error.status = 404;
          throw error;
        }

        if (produto.saldo < quantidade) {
          const error = new Error(
            `Estoque insuficiente de "${produto.nome}". Disponível: ${produto.saldo}.`,
          );
          error.status = 409;
          throw error;
        }

        const [produtoAtualizado] = await tx
          .update(produtos)
          .set({
            saldo: sql`${produtos.saldo} - ${quantidade}`,
          })
          .where(
            and(
              eq(produtos.id, produtoId),
              sql`${produtos.saldo} >= ${quantidade}`,
            ),
          )
          .returning();

        if (!produtoAtualizado) {
          const error = new Error(
            "O estoque foi alterado. Atualize a tela e tente novamente.",
          );
          error.status = 409;
          throw error;
        }

        await tx.insert(movimentacoesEstoque).values({
          produtoId,
          usuarioId: req.usuario.id,
          ordemServicoId: id,
          tipo: "saida",
          quantidade,
          extra: 1,
        });
      });

      res.status(201).json({ sucesso: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;