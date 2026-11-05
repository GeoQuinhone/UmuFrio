// Máscaras de digitação (aplicadas em tempo real nos campos de formulário).
// Usadas por Clientes.jsx, Usuarios.jsx e Login.jsx (cadastro inicial do CEO).

export function somenteDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}

// Formata progressivamente enquanto o usuário digita: 000.000.000-00
export function mascaraCpf(valor) {
  const digits = somenteDigitos(valor).slice(0, 11);
  const partes = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
  ].filter(Boolean);
  let resultado = partes.join(".");
  if (digits.length > 9) {
    resultado += `-${digits.slice(9, 11)}`;
  }
  return resultado;
}

// Formata progressivamente: (00) 0000-0000 ou (00) 00000-0000 (celular)
export function mascaraTelefone(valor) {
  const digits = somenteDigitos(valor).slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const resto = digits.slice(2);
  if (resto.length <= 4) {
    return `(${ddd}) ${resto}`;
  }
  if (digits.length <= 10) {
    // fixo: (00) 0000-0000
    return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4, 8)}`;
  }
  // celular: (00) 00000-0000
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5, 9)}`;
}

// Formata progressivamente: 00000-000
export function mascaraCep(valor) {
  const digits = somenteDigitos(valor).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

// Formata progressivamente um valor monetário em reais: 1.234,56
export function mascaraMoeda(valor) {
  const digits = somenteDigitos(valor).replace(/^0+(?=\d)/, "");
  if (digits.length === 0) return "";
  const comZeros = digits.padStart(3, "0");
  const centavos = comZeros.slice(-2);
  const inteiro = comZeros.slice(0, -2).replace(/^0+(?=\d)/, "");
  const inteiroFormatado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${inteiroFormatado},${centavos}`;
}

// Converte o texto mascarado ("1.234,56") de volta para número (1234.56)
export function moedaParaNumero(valorMascarado) {
  const limpo = String(valorMascarado || "")
    .replace(/\./g, "")
    .replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

// Valida CPF pelo algoritmo oficial dos dígitos verificadores (não só o tamanho)
export function cpfValido(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais

  const calcularDigito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * (base.length + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const digito1 = calcularDigito(cpf.slice(0, 9));
  const digito2 = calcularDigito(cpf.slice(0, 9) + digito1);

  return cpf.slice(9, 11) === `${digito1}${digito2}`;
}

// ---- Fase 8: cliente pode ser pessoa física (CPF) ou jurídica (CNPJ) ----

// 00.000.000/0000-00
export function mascaraCnpj(valor) {
  const d = somenteDigitos(valor).slice(0, 14);
  let r = d.slice(0, 2);
  if (d.length > 2) r += `.${d.slice(2, 5)}`;
  if (d.length > 5) r += `.${d.slice(5, 8)}`;
  if (d.length > 8) r += `/${d.slice(8, 12)}`;
  if (d.length > 12) r += `-${d.slice(12, 14)}`;
  return r;
}

export function cnpjValido(valor) {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
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

export function mascaraDocumento(valor, tipo = "PF") {
  return tipo === "PJ" ? mascaraCnpj(valor) : mascaraCpf(valor);
}

export function documentoValido(valor, tipo = "PF") {
  return tipo === "PJ" ? cnpjValido(valor) : cpfValido(valor);
}

// Formata um documento já salvo (só dígitos) conforme o tamanho.
export function formatarDocumento(valor) {
  const d = somenteDigitos(valor);
  if (d.length === 14) return mascaraCnpj(d);
  if (d.length === 11) return mascaraCpf(d);
  return valor || "—";
}

export function tipoDoDocumento(valor) {
  return somenteDigitos(valor).length === 14 ? "PJ" : "PF";
}
