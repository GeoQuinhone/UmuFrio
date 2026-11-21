// Validações puras de cadastro (Fase 9). Sem dependências, para poder ser
// testada sem banco. A mesma lógica existe em frontend/src/utils/validacoes.js.

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function ufValida(uf) {
  return UFS.includes(String(uf || "").trim().toUpperCase());
}

// Senha: no mínimo 6 caracteres e não pode ser formada só por espaços
// (defeito CT27 da documentação de testes).
export function senhaValida(senha) {
  const s = String(senha ?? "");
  return s.length >= 6 && s.trim().length > 0;
}

// E-mail no formato nome@dominio.ext, conferido também no servidor
// (defeito CT37: antes só a tela conferia).
export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
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
