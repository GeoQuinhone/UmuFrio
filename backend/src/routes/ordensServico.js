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
} from "../db/schema.js";
import {
  roles,
  validId,
} from "../security.js";

const router = Router();

router.get(
  "/",
  roles("ceo", "atendente", "tecnico"),
  async (req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(ordensServico);

      if (req.usuario.perfil === "tecnico") {
        const agendaTecnico = await db
          .select({
            id: agendamentos.id,
          })
          .from(agendamentos)
          .where(
            eq(
              agendamentos.tecnicoId,
              req.usuario.id,
            ),
          );

        const agendamentoIds = new Set(
          agendaTecnico.map(
            (agendamento) => agendamento.id,
          ),
        );

        return res.json(
          rows.filter((ordem) =>
            agendamentoIds.has(
              ordem.agendamentoId,
            ),
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

      const rows = await db
        .select()
        .from(ordensServico)
        .where(eq(ordensServico.id, id));

      const ordem = rows[0];

      if (!ordem) {
        return res.status(404).json({
          error:
            "Ordem de serviço não encontrada.",
        });
      }

      if (req.usuario.perfil === "tecnico") {
        const agendaTecnico = await db
          .select()
          .from(agendamentos)
          .where(
            and(
              eq(
                agendamentos.id,
                ordem.agendamentoId,
              ),
              eq(
                agendamentos.tecnicoId,
                req.usuario.id,
              ),
            ),
          );

        if (!agendaTecnico[0]) {
          return res.status(403).json({
            error: "Acesso negado.",
          });
        }
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

export default router;