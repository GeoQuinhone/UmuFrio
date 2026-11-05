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


// Fase 8: soma do valor das peças extras (quantidade x valor unitário gravado
// na movimentação; se faltar, o valor atual do produto) de uma ordem. É
// cobrada do cliente junto com o valor do serviço.
export function sqlValorExtras(ordemIdRef) {
  return sql`(SELECT COALESCE(SUM(m.quantidade * COALESCE(m.valor_unitario, p.valor_unitario)), 0)
      FROM movimentacoes_estoque m JOIN produtos p ON p.id = m.produto_id
      WHERE m.ordem_servico_id = ${ordemIdRef} AND m.extra = 1)`;
}

export async function valorExtrasDaOrdem(executor, ordemId) {
  const resultado = await executor.execute(sql`SELECT ${sqlValorExtras(sql`${ordemId}::int`)} AS total`);
  const linha = (resultado.rows ?? resultado)[0];
  return Number(linha?.total ?? 0);
}
