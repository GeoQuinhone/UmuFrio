// Validações puras de cadastro (Fase 9). Sem dependências, para poder ser
// testada sem banco. A mesma lógica existe em frontend/src/utils/validacoes.js.

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function ufValida(uf) {
  return UFS.includes(String(uf || "").trim().toUpperCase());
}

// Nome de pessoa: só letras (com acentos), espaço, apóstrofo, hífen e ponto.
export function nomePessoaValido(nome) {
  const t = String(nome || "").trim();
  return t.length >= 2 && t.length <= 120 && /^[\p{L}][\p{L}\s'.-]*$/u.test(t);
}

// Razão social (pessoa jurídica) pode ter números e símbolos comuns: "Frio 24h Ltda", "A & B".
export function razaoSocialValida(nome) {
  const t = String(nome || "").trim();
  return t.length >= 2 && t.length <= 120 && /^[\p{L}\p{N}][\p{L}\p{N}\s'.&/,()-]*$/u.test(t);
}

export function nomeClienteValido(nome, tipoPessoa) {
  return tipoPessoa === "PJ" ? razaoSocialValida(nome) : nomePessoaValido(nome);
}

// Número do imóvel: somente dígitos (1 a 6).
export function numeroImovelValido(numero) {
  return /^\d{1,6}$/.test(String(numero || "").trim());
}
