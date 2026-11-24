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

// Senha forte (espelho de backend/src/validacoes.js; o servidor sempre revalida): mínimo de 8 caracteres, 1 caractere especial, fora da lista de
// senhas comuns e sem conter o nome do e-mail nem o primeiro nome.
const SENHA_MINIMA = 8;
const SENHAS_COMUNS = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345",
  "senha", "senha123", "password", "qwerty", "abc123", "admin", "admin123",
  "111111", "000000", "umufrio", "umufrio123",
]);

// Devolve a mensagem do problema, ou null quando a senha é aceita.
export function mensagemSenha(senha, { email = "", nome = "" } = {}) {
  const s = String(senha ?? "");
  const minuscula = s.toLowerCase();

  if (s.trim().length === 0) return "A senha não pode ser só espaços.";
  if (s.length < SENHA_MINIMA) return `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`;
  if (SENHAS_COMUNS.has(minuscula) || /^(.)\1+$/.test(s)) return "Essa senha é muito comum. Escolha outra.";
  if (!/[^\p{L}\p{N}\s]/u.test(s)) return "A senha deve ter pelo menos um caractere especial (ex.: ! @ # $ %).";

  const nomeEmail = String(email).split("@")[0].toLowerCase();
  if (nomeEmail.length >= 3 && minuscula.includes(nomeEmail)) return "A senha não pode conter o nome do e-mail.";

  const primeiroNome = String(nome).trim().split(/\s+/)[0].toLowerCase();
  if (primeiroNome.length >= 3 && minuscula.includes(primeiroNome)) return "A senha não pode conter o seu nome.";

  return null;
}
