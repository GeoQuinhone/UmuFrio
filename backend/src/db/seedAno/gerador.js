import {
  BAIRROS,
  CENTRO_UMUARAMA,
  EMPRESAS,
  EXTRAS,
  FORMAS_PAGAMENTO,
  JUSTIFICATIVAS_FORA_DO_RAIO,
  MOTIVOS_NAO_REALIZADO,
  OBS_ACRESCIMO,
  OBS_DESCONTO,
  PESOS_SERVICO,
  PRIMEIROS_F,
  PRIMEIROS_M,
  RUAS,
  SAZONALIDADE,
  SERVICOS,
  SOBRENOMES,
} from "./dados.js";

/*
 * Gerador do seed anual. É uma função PURA: recebe quem são os usuários,
 * serviços e produtos que já estão no banco e devolve as linhas prontas de
 * clientes, agendamentos, ordens, pagamentos, PIX, estoque e check-ins.
 * Não acessa o banco e dá sempre o mesmo resultado para a mesma entrada
 * (semente fixa), o que permite testar as regras do sistema sem banco.
 *
 * Regras do sistema que ele respeita:
 *  - mesmo técnico: pelo menos 1h entre dois agendamentos (aqui, sem sobreposição);
 *  - cancelado e "não realizado" não têm ordem de serviço;
 *  - peças do serviço saem do estoque quando o atendimento é iniciado;
 *  - valor cobrado diferente do valor do serviço sempre tem observação;
 *  - estoque nunca fica negativo;
 *  - nada é iniciado/concluído/pago depois do "agora".
 */

const MIN = 60 * 1000;
const RAIO_M = 150;

// ---------------------------------------------------------------- aleatório

function criarRng(semente) {
  let a = semente >>> 0;
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inteiro = (min, max) => min + Math.floor(proximo() * (max - min + 1));
  const chance = (p) => proximo() < p;
  const escolher = (lista) => lista[Math.floor(proximo() * lista.length)];
  const sorteio = (itens, peso) => {
    const total = itens.reduce((s, item) => s + peso(item), 0);
    let alvo = proximo() * total;
    for (const item of itens) {
      alvo -= peso(item);
      if (alvo < 0) return item;
    }
    return itens[itens.length - 1];
  };
  return { proximo, inteiro, chance, escolher, sorteio };
}

// -------------------------------------------------------------------- datas

const dois = (n) => String(n).padStart(2, "0");

export function somarDias(data, dias) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(de, ate) {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);
}

export function diaDaSemana(data) {
  return new Date(`${data}T12:00:00Z`).getUTCDay(); // 0 = domingo
}

// Instante (Date) de uma data + minutos desde a meia-noite, no horário de Brasília.
export function instante(data, minutos) {
  return new Date(`${data}T${dois(Math.floor(minutos / 60))}:${dois(minutos % 60)}:00-03:00`);
}

export function horaTexto(minutos) {
  return `${dois(Math.floor(minutos / 60))}:${dois(minutos % 60)}:00`;
}

function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

const cacheFeriados = new Map();

export function feriadosDoAno(ano) {
  if (cacheFeriados.has(ano)) return cacheFeriados.get(ano);
  const p = pascoa(ano);
  const lista = new Set(
    ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map(
      (md) => `${ano}-${md}`,
    ),
  );
  [-48, -47, -2, 60].forEach((d) => lista.add(somarDias(p, d))); // carnaval, sexta-feira santa, Corpus Christi
  cacheFeriados.set(ano, lista);
  return lista;
}

export const ehFeriado = (data) => feriadosDoAno(Number(data.slice(0, 4))).has(data);
export const diaUtil = (data) => diaDaSemana(data) !== 0 && !ehFeriado(data);

function proximoDiaUtil(data) {
  let d = data;
  while (!diaUtil(d)) d = somarDias(d, 1);
  return d;
}

// ------------------------------------------------------------------ pessoas

function digitoCpf(numeros) {
  let soma = 0;
  for (let i = 0; i < numeros.length; i += 1) soma += Number(numeros[i]) * (numeros.length + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfDe(base9) {
  const d1 = digitoCpf(base9);
  return `${base9}${d1}${digitoCpf(`${base9}${d1}`)}`;
}

function gerarClientes({ rng, telefoneWhatsapp, inicio, hoje }) {
  const cpfsUsados = new Set();
  const novoCpf = () => {
    for (;;) {
      const base = String(rng.inteiro(100000000, 999999998));
      if (/^(\d)\1{8}$/.test(base)) continue;
      const cpf = cpfDe(base);
      if (cpfsUsados.has(cpf)) continue;
      cpfsUsados.add(cpf);
      return cpf;
    }
  };
  const celular = () => `(44) 9${rng.inteiro(8000, 9999)}-${String(rng.inteiro(0, 9999)).padStart(4, "0")}`;
  const fixo = () => `(44) 36${rng.inteiro(20, 29)}-${String(rng.inteiro(0, 9999)).padStart(4, "0")}`;

  const endereco = () => {
    const bairro = rng.escolher(BAIRROS);
    const cep = `${bairro.cep}${String(rng.inteiro(100, 999))}`;
    return {
      bairro,
      cep,
      logradouro: rng.escolher(RUAS),
      numero: String(rng.inteiro(12, 4900)),
    };
  };

  const clientes = [];
  const adicionar = (dados) => {
    const e = endereco();
    const lat = CENTRO_UMUARAMA.lat + e.bairro.dLat + (rng.proximo() - 0.5) * 0.008;
    const lng = CENTRO_UMUARAMA.lng + e.bairro.dLng + (rng.proximo() - 0.5) * 0.008;
    const cliente = {
      nome: dados.nome,
      cpf: dados.cpf || novoCpf(),
      telefone: dados.telefone,
      cep: e.cep,
      logradouro: e.logradouro,
      numero: e.numero,
      bairro: e.bairro.nome,
      cidade: "Umuarama",
      estado: "PR",
      tipo_residencia: dados.tipo,
      complemento: dados.complemento || null,
      status: "ativo",
      inativado_em: null,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
      geo_endereco: [e.logradouro, e.numero, e.bairro.nome, "Umuarama", "PR", e.cep].join("|"),
      geocodificado_em: instante(inicio, 8 * 60),
      _comercial: Boolean(dados.intervalo),
      _intervalo: dados.intervalo || 0,
      _peso: dados.intervalo ? 2.2 + rng.proximo() * 1.5 : 0.4 + rng.proximo() * 2.2,
    };
    clientes.push(cliente);
  };

  // Cliente usado para testar o aviso por WhatsApp (mesmo do seed antigo).
  adicionar({ nome: "Romário Rocha", telefone: telefoneWhatsapp, tipo: "casa" });

  for (const empresa of EMPRESAS) {
    adicionar({
      nome: empresa.nome,
      telefone: fixo(),
      tipo: "barracao",
      intervalo: empresa.intervalo,
      complemento: rng.chance(0.4) ? `Sala ${rng.inteiro(1, 12)}` : null,
    });
  }

  const nomesUsados = new Set(clientes.map((c) => c.nome));
  while (clientes.length < 150) {
    const feminino = rng.chance(0.52);
    const nome = `${rng.escolher(feminino ? PRIMEIROS_F : PRIMEIROS_M)} ${rng.escolher(SOBRENOMES)} ${rng.escolher(SOBRENOMES)}`;
    if (nomesUsados.has(nome)) continue;
    nomesUsados.add(nome);
    const apto = rng.chance(0.33);
    adicionar({
      nome,
      telefone: celular(),
      tipo: apto ? "apartamento" : "casa",
      complemento: apto ? `Bloco ${rng.escolher(["A", "B", "C"])}, apto ${rng.inteiro(11, 84)}` : null,
    });
  }

  // 12 clientes inativos (mudaram de cidade, deixaram de ser clientes...),
  // sempre residenciais, inativados entre 2 e 10 meses atrás.
  const residenciais = clientes.filter((c) => !c._comercial && c.nome !== "Romário Rocha");
  const inativos = [];
  while (inativos.length < 12) {
    const c = rng.escolher(residenciais);
    if (!inativos.includes(c)) inativos.push(c);
  }
  for (const c of inativos) {
    const dias = rng.inteiro(30, 240);
    const quando = somarDias(hoje, -dias);
    c.status = "inativo";
    c.inativado_em = instante(quando, 9 * 60 + rng.inteiro(0, 480));
    c._inativoDesde = quando;
  }

  clientes.forEach((c, i) => {
    c.id = i + 1;
  });
  return clientes;
}

// ------------------------------------------------------------------- agenda

const SABADO_ULTIMO_INICIO = 11 * 60 + 30;
const SEMANA_ULTIMO_INICIO = 16 * 60 + 30;
const DESLOCAMENTO_MIN = 20;
const FIM_DO_EXPEDIENTE = 19 * 60 + 30;

const arredondaCima30 = (m) => Math.ceil(m / 30) * 30;

function estacao(mes) {
  if (mes >= 11 || mes <= 3) return "verao";
  if (mes >= 5 && mes <= 8) return "inverno";
  return "meio";
}

// Mês de início: o dia 1º de 13 meses atrás (assim há pelo menos 12 meses completos).
export function inicioDoPeriodo(hoje) {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const total = ano * 12 + (mes - 1) - 13;
  return `${Math.floor(total / 12)}-${dois((total % 12) + 1)}-01`;
}

export function fimDoPeriodo(hoje) {
  return `${hoje.slice(0, 4)}-12-31`;
}

function demandaDoDia({ rng, data, hoje, fim, tecnicosAtivos }) {
  const mes = Number(data.slice(5, 7));
  let n = 4.8 * SAZONALIDADE[mes];
  if (diaDaSemana(data) === 6) n *= 0.55;

  // Agenda futura: a mais próxima está mais cheia; dezembro esvazia.
  if (data > hoje) {
    const proporcao = diasEntre(hoje, data) / Math.max(1, diasEntre(hoje, fim));
    n *= 0.85 - 0.4 * proporcao;
    if (data >= `${data.slice(0, 4)}-12-21`) n *= 0.45;
  }

  n *= 0.7 + rng.proximo() * 0.6;
  return Math.max(0, Math.min(Math.round(n), tecnicosAtivos * 5));
}

function escolherServico({ rng, data }) {
  const est = estacao(Number(data.slice(5, 7)));
  const bases = SERVICOS.filter((s) => !s.substitui);
  return rng.sorteio(bases, (s) => PESOS_SERVICO[s.chave][est]).chave;
}

// Serviço vigente na data (usa a versão antiga, inativa, antes da mudança de preço).
function variantePorData(chave, data) {
  const antigo = SERVICOS.find((s) => s.substitui === chave);
  return antigo && data < antigo.ate ? antigo.chave : chave;
}

function planejarAgenda({ rng, clientes, tecnicos, inicio, fim, hoje }) {
  const dias = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (diaUtil(d)) dias.push(d);

  // Demanda recorrente: contratos de manutenção preventiva das empresas.
  const recorrentes = new Map();
  for (const c of clientes.filter((x) => x._comercial)) {
    let d = somarDias(inicio, rng.inteiro(0, c._intervalo - 1));
    while (d <= fim) {
      const util = proximoDiaUtil(d);
      if (util <= fim) {
        if (!recorrentes.has(util)) recorrentes.set(util, []);
        recorrentes.get(util).push({ cliente: c, chave: "preventiva" });
      }
      d = somarDias(d, c._intervalo + rng.inteiro(-5, 5));
    }
  }

  const ativoNaData = (c, data) => c.status === "ativo" || data < c._inativoDesde;
  const agenda = [];

  for (const data of dias) {
    const tecnicosDoDia = tecnicos.filter((t) => t.disponivel(data));
    if (!tecnicosDoDia.length) continue;

    const pedidos = [];
    for (const r of recorrentes.get(data) || []) {
      if (ativoNaData(r.cliente, data)) pedidos.push(r);
    }

    const alvo = demandaDoDia({ rng, data, hoje, fim, tecnicosAtivos: tecnicosDoDia.length });
    const elegiveis = clientes.filter((c) => ativoNaData(c, data));
    while (pedidos.length < alvo) {
      const cliente = rng.sorteio(elegiveis, (c) => c._peso);
      pedidos.push({ cliente, chave: escolherServico({ rng, data }) });
    }

    // Embaralha para o recorrente não ficar sempre no primeiro horário.
    for (let i = pedidos.length - 1; i > 0; i -= 1) {
      const j = rng.inteiro(0, i);
      [pedidos[i], pedidos[j]] = [pedidos[j], pedidos[i]];
    }

    const livres = new Map(
      tecnicosDoDia.map((t) => [t.id, rng.chance(0.2) ? 7 * 60 + 30 : 8 * 60]),
    );
    const limite = diaDaSemana(data) === 6 ? SABADO_ULTIMO_INICIO : SEMANA_ULTIMO_INICIO;

    for (const pedido of pedidos) {
      const servico = SERVICOS.find((s) => s.chave === variantePorData(pedido.chave, data));
      const duracao = rng.inteiro(servico.dur[0], servico.dur[1]);

      // Técnico que fica livre primeiro (empate: o de menor id, para ser estável).
      const candidatos = [...livres.entries()]
        .map(([id, livre]) => {
          let inicioMin = arredondaCima30(livre);
          if (inicioMin >= 12 * 60 && inicioMin < 13 * 60 + 30) inicioMin = 13 * 60 + 30;
          return { id, inicioMin };
        })
        .filter((c) => c.inicioMin <= limite && c.inicioMin + duracao <= FIM_DO_EXPEDIENTE)
        .sort((a, b) => a.inicioMin - b.inicioMin || a.id - b.id);

      if (!candidatos.length) continue; // dia lotado: o pedido é perdido

      const { id: tecnicoId, inicioMin } = candidatos[0];
      livres.set(tecnicoId, inicioMin + duracao + DESLOCAMENTO_MIN);
      agenda.push({ data, inicioMin, duracao, tecnicoId, cliente: pedido.cliente, servicoChave: servico.chave });
    }
  }

  agenda.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.inicioMin - b.inicioMin || a.tecnicoId - b.tecnicoId));
  return agenda;
}

// ---------------------------------------------------------------- principal

const dinheiro = (n) => (Math.round(n * 100) / 100).toFixed(2);

function metrosParaGraus(lat, nMetros, eMetros) {
  return {
    dLat: nMetros / 111320,
    dLng: eMetros / (111320 * Math.cos((lat * Math.PI) / 180)),
  };
}

export function gerarDados(entrada) {
  const {
    hoje,
    agora,
    usuarios,
    servicos: servicosDb,
    produtos: produtosDb,
    semente = 20261103,
    telefoneWhatsapp = "(44) 99804-9224",
  } = entrada;

  const rng = criarRng(semente);
  const inicio = inicioDoPeriodo(hoje);
  const fim = fimDoPeriodo(hoje);
  const agoraMs = agora.getTime();

  const servicoPorChave = new Map(servicosDb.map((s) => [s.chave, s]));
  const produtoPorChave = new Map(produtosDb.map((p) => [p.chave, p]));

  const tecnicos = usuarios.tecnicos.map((t, i) => ({
    ...t,
    disponivel: (data) => {
      if (t.desde && data < t.desde) return false;
      // Segundo técnico: três semanas de férias em janeiro.
      if (i === 1) {
        const ano = Number(inicio.slice(0, 4)) + 1;
        if (data >= `${ano}-01-12` && data <= `${ano}-01-30`) return false;
      }
      return true;
    },
  }));

  const clientes = gerarClientes({ rng, telefoneWhatsapp, inicio, hoje });
  const agenda = planejarAgenda({ rng, clientes, tecnicos, inicio, fim, hoje });

  const agendamentos = [];
  const ordens = [];
  const pix = [];
  const registros = [];
  const consumos = []; // eventos de estoque: { t, osId, tecnicoId, produtoId, qtd, extra }

  const tecnicoPorId = new Map(usuarios.tecnicos.map((t) => [t.id, t]));
  let pixId = 0;
  let registroId = 0;

  agenda.forEach((item, indice) => {
    const agId = indice + 1;
    const servico = servicoPorChave.get(item.servicoChave);
    const inicioMs = instante(item.data, item.inicioMin).getTime();
    const hora = horaTexto(item.inicioMin);
    const passado = inicioMs <= agoraMs;

    // ---- situação do agendamento
    let situacao = "aberta"; // aberta | cancelado | nao_realizado | executado
    if (passado) {
      const sorteio = rng.proximo();
      if (sorteio < 0.045) situacao = "cancelado";
      else if (sorteio < 0.075) situacao = "nao_realizado";
      else situacao = "executado";
    } else if (rng.chance(0.045)) {
      situacao = "cancelado";
    }

    const ag = {
      id: agId,
      cliente_id: item.cliente.id,
      tecnico_id: item.tecnicoId,
      data: item.data,
      hora,
      status: situacao === "cancelado" || situacao === "nao_realizado" ? "cancelado" : "agendado",
      cancelado_em: null,
      nao_realizado: situacao === "nao_realizado" ? 1 : 0,
      motivo_nao_realizado: null,
    };

    if (situacao === "cancelado") {
      const antes = rng.inteiro(3 * 60, 3 * 24 * 60) * MIN;
      ag.cancelado_em = new Date(Math.min(inicioMs - antes, agoraMs - 5 * MIN));
    } else if (situacao === "nao_realizado") {
      ag.cancelado_em = new Date(Math.min(inicioMs + rng.inteiro(15, 45) * MIN, agoraMs));
      ag.motivo_nao_realizado = rng.sorteio(MOTIVOS_NAO_REALIZADO, (m) => m.peso).texto;
    }
    agendamentos.push(ag);
    if (situacao === "cancelado" || situacao === "nao_realizado") return;

    // ---- ordem de serviço
    const abertaEm = (() => {
      const antes = rng.inteiro(1, 9) * 24 * 60 * MIN + rng.inteiro(0, 6 * 60) * MIN;
      const t = Math.min(inicioMs - antes, agoraMs - rng.inteiro(30, 3 * 24 * 60) * MIN);
      return new Date(t);
    })();

    const os = {
      id: 0, // preenchido abaixo, na ordem do agendamento
      agendamento_id: agId,
      servico_id: servico.id,
      status: "aberta",
      aberta_em: abertaEm,
      iniciada_em: null,
      concluida_em: null,
      valor_cobrado: null,
      forma_pagamento: null,
      pagamento_confirmado: 0,
      pagamento_confirmado_em: null,
      observacao_pagamento: null,
      pagamento_usuario_id: null,
      _tecnicoId: item.tecnicoId,
      _cliente: item.cliente,
      _servico: servico,
    };
    ordens.push(os);

    if (situacao !== "executado") return;

    const iniciadaMs = inicioMs + rng.inteiro(0, 20) * MIN;
    if (iniciadaMs > agoraMs) return; // ainda não começou: fica aberta

    os.status = "andamento";
    os.iniciada_em = new Date(iniciadaMs);
    os.valor_cobrado = dinheiro(servico.valor);

    const concluidaMs = iniciadaMs + item.duracao * MIN;
    const concluida = concluidaMs <= agoraMs;
    if (concluida) {
      os.status = "concluida";
      os.concluida_em = new Date(concluidaMs);
    }

    // ---- consumo de peças do serviço (saem quando o atendimento é iniciado)
    for (const peca of servico.pecas) {
      consumos.push({ t: iniciadaMs, os, tecnicoId: item.tecnicoId, produtoId: peca.produtoId, qtd: peca.quantidade, extra: 0 });
    }

    // ---- peça extra (durante o atendimento)
    const extras = [];
    if (rng.chance(0.11)) {
      const escolhida = rng.sorteio(EXTRAS, (e) => e.peso);
      const produto = produtoPorChave.get(escolhida.chave);
      if (produto) {
        const qtd = rng.inteiro(escolhida.qtd[0], escolhida.qtd[1]);
        const t = Math.min(iniciadaMs + rng.inteiro(10, 35) * MIN, concluida ? concluidaMs - MIN : agoraMs);
        extras.push({ produto, qtd });
        consumos.push({ t, os, tecnicoId: item.tecnicoId, produtoId: produto.id, qtd, extra: 1 });
      }
    }

    // ---- check-in / check-out
    if (rng.chance(0.88)) {
      const lat = Number(item.cliente.latitude);
      const lng = Number(item.cliente.longitude);
      const fora = rng.chance(0.08);
      const nM = fora ? rng.inteiro(220, 600) * (rng.chance(0.5) ? 1 : -1) : rng.inteiro(-60, 60);
      const eM = fora ? rng.inteiro(100, 400) * (rng.chance(0.5) ? 1 : -1) : rng.inteiro(-60, 60);
      const { dLat, dLng } = metrosParaGraus(lat, nM, eM);
      const distancia = Math.round(Math.hypot(nM, eM));
      registros.push({
        ordem: os,
        tipo: "checkin",
        usuario_id: item.tecnicoId,
        latitude: (lat + dLat).toFixed(6),
        longitude: (lng + dLng).toFixed(6),
        precisao_m: (rng.inteiro(50, 400) / 10).toFixed(1),
        distancia_m: distancia,
        raio_m: RAIO_M,
        dentro_raio: distancia <= RAIO_M,
        justificativa: distancia > RAIO_M ? rng.escolher(JUSTIFICATIVAS_FORA_DO_RAIO) : null,
        criado_em: new Date(iniciadaMs - rng.inteiro(2, 8) * MIN),
      });

      if (concluida && rng.chance(0.92)) {
        const nM2 = Math.round(nM / 2);
        const eM2 = Math.round(eM / 2);
        const g = metrosParaGraus(lat, nM2, eM2);
        const d2 = Math.round(Math.hypot(nM2, eM2));
        registros.push({
          ordem: os,
          tipo: "checkout",
          usuario_id: item.tecnicoId,
          latitude: (lat + g.dLat).toFixed(6),
          longitude: (lng + g.dLng).toFixed(6),
          precisao_m: (rng.inteiro(50, 400) / 10).toFixed(1),
          distancia_m: d2,
          raio_m: RAIO_M,
          dentro_raio: d2 <= RAIO_M,
          justificativa: d2 > RAIO_M ? "Saí do local para ligar ao cliente." : null,
          criado_em: new Date(concluidaMs + rng.inteiro(1, 5) * MIN),
        });
      }
    }

    if (!concluida) return;

    // ---- valor cobrado
    let valor = servico.valor;
    let observacao = null;
    const cobrouExtra = extras.length && rng.chance(0.6);
    if (cobrouExtra) {
      const e = extras[0];
      valor += e.produto.valorUnitario * e.qtd;
      observacao = `Peça extra: ${e.produto.nome} (${e.qtd}).`;
    } else if (rng.chance(0.06)) {
      valor += rng.inteiro(2, 16) * 5;
      observacao = rng.escolher(OBS_ACRESCIMO);
    } else if (rng.chance(0.06)) {
      valor = Math.max(10, valor - rng.inteiro(2, 12) * 5);
      observacao = rng.escolher(OBS_DESCONTO);
    }
    os.valor_cobrado = dinheiro(valor);
    os.observacao_pagamento = observacao ? observacao.slice(0, 255) : null;

    // ---- pagamento: quase tudo recebido; os últimos dias e uma fração pequena
    // do passado ficam "a receber".
    const diasDesdeConclusao = (agoraMs - concluidaMs) / (24 * 60 * MIN);
    const naoPago = rng.chance(diasDesdeConclusao <= 5 ? 0.2 : diasDesdeConclusao <= 45 ? 0.012 : 0.005);
    if (naoPago) return;

    const forma = rng.sorteio(FORMAS_PAGAMENTO, (f) => f.peso).forma;
    let confirmadoMs;
    let pixPrincipal = null;

    if (forma === "pix") {
      const criadoMs = concluidaMs + rng.inteiro(-3, 4) * MIN;
      // O pagamento nunca é confirmado antes de o atendimento ser concluído.
      confirmadoMs = Math.max(criadoMs + rng.inteiro(1, 20) * MIN, concluidaMs + MIN);
      pixPrincipal = { criadoMs, confirmadoMs };
    } else if (forma === "dinheiro") {
      confirmadoMs = concluidaMs + rng.inteiro(1, 25) * MIN;
    } else {
      confirmadoMs = concluidaMs + (rng.chance(0.1) ? rng.inteiro(20, 28) * 60 * MIN : rng.inteiro(2, 30) * MIN);
    }
    if (confirmadoMs > agoraMs) return; // pagamento ainda não aconteceu

    os.forma_pagamento = forma;
    os.pagamento_confirmado = 1;
    os.pagamento_confirmado_em = new Date(confirmadoMs);
    const quem = rng.proximo();
    os.pagamento_usuario_id = quem < 0.55 ? item.tecnicoId : quem < 0.9 ? usuarios.atendenteId : usuarios.ceoId;

    if (pixPrincipal) {
      const tentativas = [];
      const sorte = rng.proximo();
      if (sorte < 0.06) {
        const criado = pixPrincipal.criadoMs - rng.inteiro(45, 90) * MIN;
        tentativas.push({ status: "expirado", criado, aprovado: null });
      } else if (sorte < 0.09) {
        const criado = pixPrincipal.criadoMs - rng.inteiro(8, 20) * MIN;
        tentativas.push({ status: "cancelado", criado, aprovado: null });
      }
      tentativas.push({ status: "aprovado", criado: pixPrincipal.criadoMs, aprovado: pixPrincipal.confirmadoMs });

      for (const t of tentativas) {
        pixId += 1;
        pix.push({
          id: pixId,
          ordem: os,
          usuario_id: item.tecnicoId,
          valor: os.valor_cobrado,
          status: t.status,
          modo: "simulado",
          mp_payment_id: null,
          codigo_copia_cola: `SIMULADO-UMUFRIO-OS-{OS}-${pixId.toString(16).toUpperCase().padStart(6, "0")}`,
          qr_code_base64: null,
          ticket_url: null,
          criado_em: new Date(t.criado),
          expira_em: new Date(t.criado + 30 * MIN),
          aprovado_em: t.aprovado ? new Date(t.aprovado) : null,
        });
      }
    }
  });

  // Ids das ordens na ordem dos agendamentos (que já está por data e hora).
  ordens.forEach((os, i) => {
    os.id = i + 1;
  });
  for (const p of pix) {
    p.ordem_id = p.ordem.id;
    p.referencia = `OS-${p.ordem.id}`;
    p.codigo_copia_cola = p.codigo_copia_cola.replace("{OS}", p.ordem.id);
  }
  pix.sort((a, b) => a.criado_em - b.criado_em);
  pix.forEach((p, i) => {
    p.id = i + 1;
  });

  registros.sort((a, b) => a.criado_em - b.criado_em);
  for (const r of registros) {
    registroId += 1;
    r.id = registroId;
    r.ordem_id = r.ordem.id;
  }

  // ------------------------------------------------------------------ estoque
  const estoque = simularEstoque({ produtos: produtosDb, consumos, usuarios, inicio, agoraMs, hoje, agora });

  return {
    periodo: { inicio, fim, hoje },
    clientes,
    agendamentos,
    ordens,
    pix,
    registros,
    movimentacoes: estoque.movimentacoes,
    saldos: estoque.saldos,
    resumo: resumir({ clientes, agendamentos, ordens, pix, registros, estoque, produtosDb }),
  };
}

// Reproduz o estoque ao longo do tempo: entrada inicial, saídas dos atendimentos,
// reposição quando chega no mínimo (com atraso do fornecedor) e reposição de
// emergência se o saldo não cobrir uma saída. Duas peças ficam abaixo do mínimo
// no fim, para o alerta de reposição aparecer.
function simularEstoque({ produtos, consumos, usuarios, inicio, agoraMs, hoje, agora }) {
  const saldo = new Map(produtos.map((p) => [p.id, 0]));
  const pendentes = new Map(); // produtoId -> { t, qtd }
  const movs = [];
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

  const entrada = (produto, qtd, t) => {
    saldo.set(produto.id, saldo.get(produto.id) + qtd);
    movs.push({ produto_id: produto.id, usuario_id: usuarios.estoquistaId, ordem_servico_id: null, tipo: "entrada", quantidade: qtd, data: new Date(t), extra: 0 });
  };
  const saida = (produto, qtd, t, usuarioId, ordemId, extra) => {
    saldo.set(produto.id, saldo.get(produto.id) - qtd);
    movs.push({ produto_id: produto.id, usuario_id: usuarioId, ordem_servico_id: ordemId, tipo: "saida", quantidade: qtd, data: new Date(t), extra });
  };

  const abertura = instante(somarDias(inicio, -1), 8 * 60).getTime();
  for (const p of produtos) entrada(p, p.lote * 2, abertura);

  const aplicarPendentes = (ate) => {
    for (const [id, pend] of [...pendentes.entries()]) {
      if (pend.t <= ate) {
        entrada(produtoPorId.get(id), pend.qtd, pend.t);
        pendentes.delete(id);
      }
    }
  };

  // Retirada para "obra grande": derruba o saldo de duas peças para abaixo do
  // mínimo cerca de 40 horas antes de agora (baixa manual, sem ordem de serviço).
  const ajusteT = agoraMs - 40 * 60 * MIN;
  const alvosAjuste = produtos.filter((p) => ["filtro", "cobre38"].includes(p.chave));
  const eventos = [
    ...consumos.map((c) => ({ ...c, tipo: "consumo" })),
    ...alvosAjuste.map((p) => ({ t: ajusteT, tipo: "ajuste", produtoId: p.id })),
  ].sort((a, b) => a.t - b.t);

  const diaUtilDepois = (t, dias) => {
    const dataLocal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(t));
    let d = dataLocal;
    let restante = dias;
    while (restante > 0) {
      d = somarDias(d, 1);
      if (diaUtil(d)) restante -= 1;
    }
    return instante(d, 8 * 60 + 30).getTime();
  };

  for (const ev of eventos) {
    aplicarPendentes(ev.t);
    const produto = produtoPorId.get(ev.produtoId);

    if (ev.tipo === "ajuste") {
      const sobra = saldo.get(produto.id) - Math.max(produto.minimo - 1, 0);
      if (sobra > 0) saida(produto, sobra, ev.t, usuarios.estoquistaId, null, 0);
      if (!pendentes.has(produto.id)) pendentes.set(produto.id, { t: diaUtilDepois(ev.t, produto.repDias + 2), qtd: produto.lote });
      continue;
    }

    if (saldo.get(produto.id) < ev.qtd) {
      // Compra de emergência no começo do dia do atendimento.
      const dataLocal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ev.t));
      const manha = Math.min(instante(dataLocal, 7 * 60 + 30).getTime(), ev.t - 30 * MIN);
      const falta = ev.qtd - saldo.get(produto.id);
      entrada(produto, Math.max(produto.lote, falta + produto.minimo), manha);
      pendentes.delete(produto.id);
    }

    saida(produto, ev.qtd, ev.t, ev.tecnicoId, ev.os.id, ev.extra);

    if (saldo.get(produto.id) <= produto.minimo && !pendentes.has(produto.id)) {
      pendentes.set(produto.id, { t: diaUtilDepois(ev.t, produto.repDias), qtd: produto.lote });
    }
  }
  aplicarPendentes(agoraMs);

  // A movimentação nunca pode estar no futuro.
  for (const m of movs) if (m.data.getTime() > agoraMs) m.data = new Date(agoraMs);
  movs.sort((a, b) => a.data - b.data || (a.tipo === b.tipo ? 0 : a.tipo === "entrada" ? -1 : 1));
  movs.forEach((m, i) => {
    m.id = i + 1;
  });

  return { movimentacoes: movs, saldos: Object.fromEntries([...saldo.entries()]) };
}

function resumir({ clientes, agendamentos, ordens, pix, registros, estoque, produtosDb }) {
  const porStatusOs = {};
  for (const os of ordens) porStatusOs[os.status] = (porStatusOs[os.status] || 0) + 1;

  const faturamentoPorMes = {};
  let aReceber = 0;
  for (const os of ordens) {
    if (os.status !== "concluida") continue;
    if (os.pagamento_confirmado) {
      const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(os.pagamento_confirmado_em).slice(0, 7);
      faturamentoPorMes[mes] = (faturamentoPorMes[mes] || 0) + Number(os.valor_cobrado);
    } else {
      aReceber += Number(os.valor_cobrado);
    }
  }

  const abaixoDoMinimo = produtosDb
    .filter((p) => estoque.saldos[p.id] <= p.minimo)
    .map((p) => `${p.nome} (${estoque.saldos[p.id]}/${p.minimo})`);

  return {
    clientes: clientes.length,
    clientesInativos: clientes.filter((c) => c.status === "inativo").length,
    agendamentos: agendamentos.length,
    cancelados: agendamentos.filter((a) => a.status === "cancelado" && !a.nao_realizado).length,
    naoRealizados: agendamentos.filter((a) => a.nao_realizado).length,
    ordens: ordens.length,
    ordensPorStatus: porStatusOs,
    cobrancasPix: pix.length,
    registrosLocalizacao: registros.length,
    movimentacoes: estoque.movimentacoes.length,
    faturamentoPorMes: Object.fromEntries(
      Object.entries(faturamentoPorMes).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
    aReceber: Math.round(aReceber * 100) / 100,
    abaixoDoMinimo,
  };
}
