import { eq, sql } from "drizzle-orm";
import {
  ordensServico,
  produtos,
  movimentacoesEstoque,
} from "./db/schema.js";
import { erroHttp } from "./httpError.js";

export { erroHttp };

// Exclui uma ordem de serviço dentro de uma transação. Se ela estava em
// andamento, as peças já debitadas (do serviço e as extras) voltam ao
// estoque e as movimentações dela são removidas. Ordens concluídas não podem
// ser excluídas: o histórico de estoque e de pagamento precisa ser preservado.
export async function excluirOrdem(tx, ordemId) {
  const [ordem] = await tx
    .select()
    .from(ordensServico)
    .where(eq(ordensServico.id, ordemId));

  if (!ordem) {
    throw erroHttp("Ordem de serviço não encontrada.", 404);
  }

  if (ordem.status === "concluida") {
    throw erroHttp(
      "Não é possível excluir um atendimento já concluído, pois o histórico de estoque e de pagamento precisa ser preservado.",
      409,
    );
  }

  if (ordem.status === "andamento") {
    const movimentacoes = await tx
      .select()
      .from(movimentacoesEstoque)
      .where(eq(movimentacoesEstoque.ordemServicoId, ordemId));

    for (const movimentacao of movimentacoes) {
      if (movimentacao.tipo === "saida") {
        await tx
          .update(produtos)
          .set({
            saldo: sql`${produtos.saldo} + ${movimentacao.quantidade}`,
          })
          .where(eq(produtos.id, movimentacao.produtoId));
      }
    }

    await tx
      .delete(movimentacoesEstoque)
      .where(eq(movimentacoesEstoque.ordemServicoId, ordemId));
  }

  await tx.delete(ordensServico).where(eq(ordensServico.id, ordemId));

  return ordem;
}
