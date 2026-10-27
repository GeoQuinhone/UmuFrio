// Respostas do modo demonstração (sem chave de IA): regras simples por palavras-
// chave, usando os serviços e os dados reais cadastrados. Serve também de
// plano B quando a IA não responde.

const sem = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const tem = (texto, palavras) => palavras.some((p) => texto.includes(p));

const moeda = (v) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function achaServico(servicos, ...radicais) {
  return servicos.find((s) => tem(sem(s.nome), radicais));
}

function descreveServico(s) {
  const partes = [`${s.nome}: ${moeda(s.valor)}`];
  if (s.descricao) partes.push(s.descricao);
  return partes.join(" — ");
}

const AVISO_VALOR =
  "Os valores são de tabela e podem mudar conforme o local e as peças necessárias.";

export function responderDemonstracao(mensagem, contexto) {
  const t = sem(mensagem);
  const { servicos, empresa, horario, cidade } = contexto;

  if (tem(t, ["atendente", "humano", "pessoa", "whatsapp", "zap", "telefone", "contato", "ligar"])) {
    return {
      resposta: "Claro! Nosso time atende pelo WhatsApp. Toque no botão abaixo para falar com um atendente.",
      encaminhar: true,
    };
  }

  if (tem(t, ["agendar", "agendamento", "marcar", "visita", "orcamento", "reservar"])) {
    return {
      resposta:
        "Os agendamentos e orçamentos são feitos por um atendente, que confirma data, horário e endereço com você. Toque no botão abaixo para falar pelo WhatsApp.",
      encaminhar: true,
    };
  }

  const instalacao = tem(t, ["instal"]) ? achaServico(servicos, "instala") : null;
  const manutencao = tem(t, ["manuten", "limpeza", "revisao", "conserto", "consertar"])
    ? achaServico(servicos, "manuten")
    : null;
  const retirada = tem(t, ["retirad", "retirar", "remover", "remocao", "desinstal"])
    ? achaServico(servicos, "retirad")
    : null;
  const especificos = [instalacao, manutencao, retirada].filter(Boolean);

  if (especificos.length) {
    return {
      resposta: `${especificos.map(descreveServico).join("\n")}\n\n${AVISO_VALOR} Para agendar, fale com um atendente.`,
      encaminhar: true,
    };
  }

  if (tem(t, ["preco", "valor", "valores", "quanto", "custa", "cobram", "tabela", "servico"])) {
    if (!servicos.length) {
      return {
        resposta: "No momento não consigo mostrar os valores aqui. Um atendente pode passar tudo certinho pelo WhatsApp.",
        encaminhar: true,
      };
    }
    return {
      resposta: `Nossos serviços:\n${servicos.map(descreveServico).join("\n")}\n\n${AVISO_VALOR}`,
      encaminhar: false,
    };
  }

  if (tem(t, ["horario", "funciona", "abre", "fecha", "aberto", "atendem"])) {
    return { resposta: `Atendemos: ${horario}.`, encaminhar: false };
  }

  if (tem(t, ["endereco", "onde", "fica", "regiao", "cidade", "atende em", "localizacao"])) {
    return {
      resposta: `Atendemos em ${cidade} e região. Para confirmar se chegamos até o seu endereço, fale com um atendente.`,
      encaminhar: true,
    };
  }

  if (tem(t, ["pagamento", "pagar", "pix", "cartao", "dinheiro", "parcel"])) {
    return {
      resposta: "Aceitamos PIX, dinheiro, cartão de débito e cartão de crédito.",
      encaminhar: false,
    };
  }

  if (tem(t, ["oi", "ola", "bom dia", "boa tarde", "boa noite", "e ai", "hello"]) && t.length < 25) {
    return {
      resposta: `Olá! Sou o assistente virtual da ${empresa}. Posso falar sobre serviços, valores, horário de atendimento e formas de pagamento. Como posso ajudar?`,
      encaminhar: false,
    };
  }

  if (tem(t, ["obrigad", "valeu", "ok", "certo"]) && t.length < 25) {
    return { resposta: "Por nada! Se precisar de mais alguma coisa, é só chamar.", encaminhar: false };
  }

  return {
    resposta:
      "Não tenho essa informação por aqui. Um atendente pode te ajudar pelo WhatsApp — toque no botão abaixo.",
    encaminhar: true,
  };
}
