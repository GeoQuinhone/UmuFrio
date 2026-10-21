// Informações públicas da empresa usadas pelo chat. Nada de dados de clientes:
// só o que já poderia estar num site (serviços ativos, preços de tabela,
// horário e contato).

// Número oficial de atendimento (Fase 6): (44) 9804-9224. Pode ser trocado com
// CHAT_WHATSAPP no .env, sem mexer no código.
export const WHATSAPP_PADRAO = "4498049224";

export function mensagemWhatsapp(config) {
  return `Olá! Vim pelo site da ${config.empresa} e gostaria de atendimento.`;
}

export function configChat(env = process.env) {
  const digitos = String(env.CHAT_WHATSAPP || WHATSAPP_PADRAO).replace(/\D/g, "");
  // Número brasileiro sem o código do país (10 ou 11 dígitos) ganha o 55.
  const whatsapp =
    digitos.length >= 10 && digitos.length <= 11 ? `55${digitos}` : digitos;
  return {
    empresa: String(env.CHAT_EMPRESA_NOME || "UmuFrio").trim(),
    whatsapp,
    horario: String(
      env.CHAT_HORARIO || "Segunda a sexta, das 8h às 18h, e sábado, das 8h às 12h",
    ).trim(),
    cidade: String(env.CHAT_CIDADE || "Umuarama/PR").trim(),
  };
}

export function linkWhatsapp(config, texto) {
  if (!config.whatsapp) return null;
  const base = `https://wa.me/${config.whatsapp}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

export async function carregarContexto(q, env = process.env) {
  const config = configChat(env);
  const servicos = await q(
    `SELECT nome, descricao, valor::float8 AS valor
       FROM servicos WHERE ativo = 1 ORDER BY nome`,
    [],
  );
  return { ...config, servicos };
}
