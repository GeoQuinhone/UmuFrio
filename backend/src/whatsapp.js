// Aviso ao cliente pelo WhatsApp quando o atendimento é iniciado, concluído
// ou marcado como não realizado.
//
// O envio automático usa modelos (templates) aprovados pela Meta, por um de
// dois caminhos, escolhido pelas variáveis de ambiente:
//   1. Gupshup (parceiro oficial da Meta): GUPSHUP_SOURCE, GUPSHUP_APP_NAME,
//      o ID de cada modelo (GUPSHUP_TEMPLATE_*) e a credencial: de preferência
//      o segredo da conta (GUPSHUP_CUSTOMER_SECRET) com o ID do app
//      (GUPSHUP_APP_ID), do qual o sistema tira sozinho um token de 24 horas;
//      ou uma chave fixa (GUPSHUP_API_KEY), que o Gupshup desliga em 31/03/2027.
//   2. WhatsApp Cloud API direto na Meta: WHATSAPP_TOKEN e
//      WHATSAPP_PHONE_NUMBER_ID.
// Sem nenhum deles o envio automático fica desligado, e a tela oferece o link
// wa.me como alternativa (quem está no sistema só toca em "enviar").
//
// Os modelos têm 4 variáveis no corpo, sempre enviadas nesta ordem:
//   {{1}} nome do cliente, {{2}} serviço, {{3}} horário, {{4}} técnico.

const GUPSHUP_URL = "https://api.gupshup.io/wa/api/v1/template/msg";

// Token do app (CAT) em memória, renovado alguns minutos antes de vencer.
let tokenGupshup = { valor: null, expiraEm: 0 };
const MARGEM_RENOVACAO_MS = 10 * 60 * 1000;

function usaSegredoGupshup() {
  return Boolean(process.env.GUPSHUP_CUSTOMER_SECRET && process.env.GUPSHUP_APP_ID);
}

// O Gupshup devolve a validade em milissegundos ou como data ISO.
function instanteDe(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : new Date(valor).getTime();
}

function tokenAindaVale(token) {
  return Boolean(token?.valor) && token.expiraEm - Date.now() > MARGEM_RENOVACAO_MS;
}

// O token também fica no banco (tabela tokens_integracao): o processo do
// Render reinicia ao "acordar", e o Gupshup só aceita 3 tokens ativos por app.
// O banco é carregado só aqui, para os testes funcionarem sem DATABASE_URL;
// se ele falhar, o envio segue só com o token em memória.
async function poolDoBanco() {
  try {
    return (await import("./db/client.js")).pool;
  } catch {
    return null;
  }
}

async function lerTokenSalvo() {
  try {
    const pool = await poolDoBanco();
    if (!pool) return null;
    const { rows } = await pool.query(
      "SELECT valor, expira_em FROM tokens_integracao WHERE nome = 'gupshup'",
    );
    return rows[0]
      ? { valor: rows[0].valor, expiraEm: new Date(rows[0].expira_em).getTime() }
      : null;
  } catch {
    return null;
  }
}

async function salvarToken(token) {
  try {
    const pool = await poolDoBanco();
    if (!pool) return;
    await pool.query(
      `INSERT INTO tokens_integracao (nome, valor, expira_em, atualizado_em)
       VALUES ('gupshup', $1, $2, now())
       ON CONFLICT (nome) DO UPDATE
         SET valor = EXCLUDED.valor, expira_em = EXCLUDED.expira_em, atualizado_em = now()`,
      [token.valor, new Date(token.expiraEm)],
    );
  } catch (error) {
    console.error("Não foi possível guardar o token do Gupshup no banco:", error.message);
  }
}

// Onde o token é guardado: no banco, por padrão. Os testes trocam por um
// armazenamento falso para nunca ler nem gravar no banco de quem roda.
let armazenamentoToken = { ler: lerTokenSalvo, salvar: salvarToken };

export function definirArmazenamentoToken(armazenamento) {
  armazenamentoToken = armazenamento;
}

async function credencialGupshup() {
  if (!usaSegredoGupshup()) return process.env.GUPSHUP_API_KEY;

  if (tokenAindaVale(tokenGupshup)) return tokenGupshup.valor;

  const salvo = await armazenamentoToken.ler();
  if (tokenAindaVale(salvo)) {
    tokenGupshup = salvo;
    return salvo.valor;
  }

  const response = await fetch(
    `https://api.gupshup.io/wa/app/${process.env.GUPSHUP_APP_ID}/auth/app-token`,
    {
      method: "POST",
      headers: { "X-Customer-Secret": process.env.GUPSHUP_CUSTOMER_SECRET.trim() },
      signal: AbortSignal.timeout(10000),
    },
  );
  const corpo = await response.json().catch(() => null);
  const valor = corpo?.token || corpo?.data?.token;

  if (!response.ok || !valor) {
    throw new Error(
      corpo?.message || `Gupshup não gerou o token (status ${response.status})`,
    );
  }

  const expiraEm = instanteDe(corpo.expiresAt || corpo.data?.expiresAt);
  tokenGupshup = {
    valor,
    expiraEm: Number.isFinite(expiraEm) ? expiraEm : Date.now() + 23 * 60 * 60 * 1000,
  };
  await armazenamentoToken.salvar(tokenGupshup);
  return valor;
}

// Usado pelos testes para começar sem token guardado.
export function esquecerTokenGupshup() {
  tokenGupshup = { valor: null, expiraEm: 0 };
}

const EVENTOS = {
  iniciado: {
    templateMeta: () => process.env.WHATSAPP_TEMPLATE_INICIADO || "servico_iniciado",
    templateGupshup: () => process.env.GUPSHUP_TEMPLATE_INICIADO,
    texto: (d) =>
      `Olá, ${d.clienteNome}! Seu serviço de ${d.servicoNome} foi iniciado ` +
      `às ${d.hora} pelo técnico ${d.tecnicoNome}.`,
  },
  concluido: {
    templateMeta: () => process.env.WHATSAPP_TEMPLATE_CONCLUIDO || "servico_concluido",
    templateGupshup: () => process.env.GUPSHUP_TEMPLATE_CONCLUIDO,
    texto: (d) =>
      `Olá, ${d.clienteNome}! Seu serviço de ${d.servicoNome} foi concluído ` +
      `às ${d.hora} pelo técnico ${d.tecnicoNome}. Obrigado pela confiança!`,
  },
  nao_realizado: {
    templateMeta: () =>
      process.env.WHATSAPP_TEMPLATE_NAO_REALIZADO || "servico_nao_realizado",
    templateGupshup: () => process.env.GUPSHUP_TEMPLATE_NAO_REALIZADO,
    texto: (d) =>
      `Olá, ${d.clienteNome}! Nosso técnico ${d.tecnicoNome} foi até o local ` +
      `às ${d.hora} para o serviço de ${d.servicoNome}, mas não foi possível ` +
      `realizar o atendimento. Entre em contato conosco para remarcar.`,
  },
};

// "(44) 99999-9999" → "5544999999999". Aceita número já com 55 na frente.
export function telefoneParaWhatsApp(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");

  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (
    digitos.startsWith("55") &&
    (digitos.length === 12 || digitos.length === 13)
  ) {
    return digitos;
  }

  return null;
}

// Horário no fuso de Brasília, independente do fuso do servidor (o Render
// roda em UTC).
export function formatarHora(data) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(data));
}

// Mesmo texto dos modelos, usado no link wa.me.
export function montarMensagem(evento, dados) {
  const empresa = process.env.EMPRESA_NOME || "UmuFrio";
  return `${EVENTOS[evento].texto(dados)} – ${empresa}`;
}

function parametros(dados) {
  return [dados.clienteNome, dados.servicoNome, dados.hora, dados.tecnicoNome].map(
    (texto) => String(texto ?? ""),
  );
}

// Lista de números liberados (WHATSAPP_NUMEROS_PERMITIDOS, separados por
// vírgula). Enquanto ela existir, o envio automático só vai para esses
// números: o banco de demonstração tem clientes com celulares inventados, que
// podem ser de pessoas reais. Sem a variável, o envio vale para todos.
export function numeroLiberado(numero) {
  const lista = String(process.env.WHATSAPP_NUMEROS_PERMITIDOS || "")
    .split(",")
    .map((item) => telefoneParaWhatsApp(item))
    .filter(Boolean);

  return lista.length === 0 || lista.includes(numero);
}

// Qual caminho de envio automático está configurado para este evento.
export function provedorDoEvento(evento) {
  if (
    (usaSegredoGupshup() || process.env.GUPSHUP_API_KEY) &&
    process.env.GUPSHUP_SOURCE &&
    EVENTOS[evento].templateGupshup()
  ) {
    return "gupshup";
  }

  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return "meta";
  }

  return null;
}

// Monta a chamada à API do Gupshup (separada do envio para poder ser testada).
export function requisicaoGupshup(numero, evento, dados, credencial) {
  const corpo = new URLSearchParams({
    channel: "whatsapp",
    source: String(process.env.GUPSHUP_SOURCE).replace(/\D/g, ""),
    destination: numero,
    "src.name": process.env.GUPSHUP_APP_NAME || "",
    template: JSON.stringify({
      id: EVENTOS[evento].templateGupshup(),
      params: parametros(dados),
    }),
  });

  return {
    url: GUPSHUP_URL,
    opcoes: {
      method: "POST",
      headers: {
        apikey: credencial,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: corpo.toString(),
    },
  };
}

async function enviarGupshup(numero, evento, dados) {
  const credencial = await credencialGupshup();
  const { url, opcoes } = requisicaoGupshup(numero, evento, dados, credencial);
  const response = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(10000) });
  const corpo = await response.json().catch(() => null);

  // O Gupshup aceita a mensagem e entrega depois; "submitted" ou "success"
  // indicam que ela entrou na fila de envio.
  if (!response.ok || !["submitted", "success"].includes(corpo?.status)) {
    throw new Error(
      corpo?.message || `Gupshup respondeu com status ${response.status}`,
    );
  }
}

async function enviarMeta(numero, evento, dados) {
  const versao = process.env.WHATSAPP_API_VERSION || "v23.0";
  const url = `https://graph.facebook.com/${versao}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: numero,
      type: "template",
      template: {
        name: EVENTOS[evento].templateMeta(),
        language: { code: process.env.WHATSAPP_TEMPLATE_IDIOMA || "pt_BR" },
        components: [
          {
            type: "body",
            parameters: parametros(dados).map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    throw new Error(
      corpo?.error?.message || `WhatsApp respondeu com status ${response.status}`,
    );
  }
}

// Nunca lança erro: o atendimento já foi salvo, e uma falha no WhatsApp não
// pode desfazer isso. O resultado diz à tela o que aconteceu.
//   status: "enviado" | "nao_configurado" | "erro" | "telefone_invalido"
export async function avisarCliente(evento, dados) {
  if (!EVENTOS[evento]) return null;

  const numero = telefoneParaWhatsApp(dados.clienteTelefone);
  if (!numero) return { status: "telefone_invalido" };

  const dadosComHora = { ...dados, hora: formatarHora(dados.horario) };
  const mensagem = montarMensagem(evento, dadosComHora);
  const link = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

  // Fora da lista de números liberados, a tela oferece o link (como quando o
  // envio automático não está configurado) e ninguém recebe nada sozinho.
  const provedor = provedorDoEvento(evento);
  if (!provedor || !numeroLiberado(numero)) {
    return { status: "nao_configurado", link };
  }

  try {
    if (provedor === "gupshup") {
      await enviarGupshup(numero, evento, dadosComHora);
    } else {
      await enviarMeta(numero, evento, dadosComHora);
    }
    return { status: "enviado", link };
  } catch (error) {
    console.error("Falha ao enviar aviso pelo WhatsApp:", error.message);
    return { status: "erro", link };
  }
}
