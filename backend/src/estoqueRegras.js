// Regras puras de estoque, compartilhadas por notificações, relatórios e testes.
// Fase 8: uma única definição de "no mínimo" (antes a tela usava saldo < mínimo
// e o relatório saldo <= mínimo, e o produto "pixava" entre os dois).

export function situacaoEstoque(produto) {
  const saldo = Number(produto.saldo);
  const minimo = Number(produto.quantidadeMinima ?? produto.minimo ?? 0);
  if (!(saldo > 0)) return "zerado";
  if (saldo <= minimo) return "baixo";
  return "ok";
}
