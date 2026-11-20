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

// Limites do cadastro de produto (Funcionalidade 5 da documentação de testes):
// valor de 0 até 99.999.999,99 (o máximo de numeric(10,2) no banco); saldo e
// quantidade mínima inteiros a partir de 0, com teto de segurança de
// 99.999.999 para não estourar a coluna integer do banco.
// Um único ponto de ajuste (o front tem as mesmas constantes em utils/estoque.js).
export const LIMITE_QUANTIDADE = 99999999; // saldo máximo por produto e por lançamento
export const LIMITE_VALOR_UNITARIO = 99999999.99; // R$ por unidade

export const MENSAGEM_LIMITE_VALOR =
  "Não é possível cadastrar produtos com valor acima de R$ 99.999.999,99.";
export const MENSAGEM_LIMITE_QUANTIDADE =
  "Não é possível cadastrar produtos com mais de 99.999.999 unidades.";

export function quantidadeDentroDoLimite(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= LIMITE_QUANTIDADE;
}
