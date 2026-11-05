// Validação de documentos (CPF/CNPJ) — funções puras, sem banco.

export const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

export function cpfValido(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(cpf.slice(0, 9));
  const d2 = digito(cpf.slice(0, 9) + d1);
  return cpf.slice(9, 11) === `${d1}${d2}`;
}

// Fase 8: cliente pode ser pessoa física (CPF) ou jurídica (CNPJ).
export function cnpjValido(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 12) + d1);
  return cnpj.slice(12, 14) === `${d1}${d2}`;
}

// "PF" quando o documento tem 11 dígitos, "PJ" quando tem 14.
export function tipoPessoaDoDocumento(value) {
  const n = onlyDigits(value).length;
  return n === 14 ? "PJ" : n === 11 ? "PF" : null;
}

export function documentoValido(value) {
  const tipo = tipoPessoaDoDocumento(value);
  return tipo === "PJ" ? cnpjValido(value) : tipo === "PF" ? cpfValido(value) : false;
}

