// Validações e filtros de digitação do cadastro (Fase 9).
// Espelho de backend/src/validacoes.js: o back-end sempre revalida.

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function ufValida(uf) {
  return UFS.includes(String(uf || "").trim().toUpperCase());
}

export function nomePessoaValido(nome) {
  const t = String(nome || "").trim();
  return t.length >= 2 && t.length <= 120 && /^[\p{L}][\p{L}\s'.-]*$/u.test(t);
}

export function razaoSocialValida(nome) {
  const t = String(nome || "").trim();
  return t.length >= 2 && t.length <= 120 && /^[\p{L}\p{N}][\p{L}\p{N}\s'.&/,()-]*$/u.test(t);
}

export function nomeClienteValido(nome, tipoPessoa) {
  return tipoPessoa === "PJ" ? razaoSocialValida(nome) : nomePessoaValido(nome);
}

export function numeroImovelValido(numero) {
  return /^\d{1,6}$/.test(String(numero || "").trim());
}

// Filtros aplicados enquanto a pessoa digita.
export function filtrarNomePessoa(valor) {
  return String(valor || "").replace(/[^\p{L}\s'.-]/gu, "").slice(0, 120);
}

export function filtrarRazaoSocial(valor) {
  return String(valor || "").replace(/[^\p{L}\p{N}\s'.&/,()-]/gu, "").slice(0, 120);
}

export function filtrarNumeroImovel(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 6);
}
