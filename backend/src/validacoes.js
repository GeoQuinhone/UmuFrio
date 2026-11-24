// Validações puras de cadastro (Fase 9). Sem dependências, para poder ser
// testada sem banco. A mesma lógica existe em frontend/src/utils/validacoes.js.

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function ufValida(uf) {
  return UFS.includes(String(uf || "").trim().toUpperCase());
}

// Senha forte: mínimo de 8 caracteres, 1 caractere especial, fora da lista de
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

export function senhaValida(senha, contexto) {
  return mensagemSenha(senha, contexto) === null;
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
