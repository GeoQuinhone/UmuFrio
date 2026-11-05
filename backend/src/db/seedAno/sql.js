// Montagem de SQL do seed anual. Todos os valores vêm do próprio gerador (nada
// de entrada de usuário), mas mesmo assim tudo é escapado.

export function lit(valor) {
  if (valor === null || valor === undefined) return "NULL";
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new Error("Data inválida no seed.");
    return `'${valor.toISOString()}'`;
  }
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new Error("Número inválido no seed.");
    return String(valor);
  }
  if (typeof valor === "boolean") return valor ? "TRUE" : "FALSE";
  return `'${String(valor).replace(/'/g, "''")}'`;
}

export function inserirLinhas(tabela, colunas, linhas, tamanho = 250) {
  const comandos = [];
  for (let i = 0; i < linhas.length; i += tamanho) {
    const bloco = linhas
      .slice(i, i + tamanho)
      .map((linha) => `(${colunas.map((c) => lit(linha[c])).join(", ")})`)
      .join(",\n");
    comandos.push(
      `INSERT INTO ${tabela} (${colunas.join(", ")}) OVERRIDING SYSTEM VALUE VALUES\n${bloco};`,
    );
  }
  return comandos;
}

