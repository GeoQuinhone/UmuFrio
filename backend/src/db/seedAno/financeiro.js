import { criarRng, somarDias } from "./gerador.js";

/*
 * Despesas (Fase 8/9) e notificações do CEO (Fase 8) do seed anual.
 * Funções puras: recebem os dados já gerados e devolvem linhas prontas.
 * Nada é lançado depois de "hoje".
 */

const dois = (n) => String(n).padStart(2, "0");
const arredondar = (v) => Math.round(v * 100) / 100;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function mesesDoPeriodo(inicio, hoje) {
  const lista = [];
  let ano = Number(inicio.slice(0, 4));
  let mes = Number(inicio.slice(5, 7));
  const fimAno = Number(hoje.slice(0, 4));
  const fimMes = Number(hoje.slice(5, 7));
  while (ano < fimAno || (ano === fimAno && mes <= fimMes)) {
    lista.push({ ano, mes, chave: `${ano}-${dois(mes)}` });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return lista;
}

const dataDoMes = (m, dia) => `${m.ano}-${dois(m.mes)}-${dois(dia)}`;
const mesAnterior = (m) => (m.mes === 1 ? { ano: m.ano - 1, mes: 12 } : { ano: m.ano, mes: m.mes - 1 });

export function gerarDespesas({ inicio, hoje, usuarios, veiculos, faturamentoPorMes, semente = 20261123 }) {
  const rng = criarRng(semente);
  const linhas = [];
  const add = (d) => {
    if (d.data > hoje || d.data < inicio) return;
    linhas.push({
      descricao: d.descricao,
      categoria: d.categoria,
      valor: arredondar(d.valor),
      data: d.data,
      observacao: d.observacao || null,
      usuario_id: d.usuarioId ?? usuarios.ceoId,
      veiculo_id: d.veiculoId ?? null,
      funcionario_id: d.funcionarioId ?? null,
    });
  };

  const meses = mesesDoPeriodo(inicio, hoje);

  // ---- salários (pagos no dia 5 do mês seguinte), vinculados ao funcionário
  const equipe = [
    { id: usuarios.ceoId, nome: usuarios.ceoNome, valor: 2200, rotulo: "Pró-labore" },
    { id: usuarios.atendenteId, nome: usuarios.atendenteNome, valor: 1500, rotulo: "Salário" },
    { id: usuarios.estoquistaId, nome: usuarios.estoquistaNome, valor: 1500, rotulo: "Salário" },
    ...usuarios.tecnicos.map((t) => ({ id: t.id, nome: t.nome, valor: 1650, rotulo: "Salário", desde: t.desde })),
  ];
  for (const m of meses) {
    const ref = mesAnterior(m);
    const dataPagamento = dataDoMes(m, 5);
    for (const f of equipe) {
      if (f.desde && dataDoMes(ref, 28) < f.desde) continue; // ainda não trabalhava no mês de referência
      add({
        descricao: `${f.rotulo} — ${f.nome} (${MESES[ref.mes - 1]}/${ref.ano})`,
        categoria: "salarios",
        valor: f.valor,
        data: dataPagamento,
        funcionarioId: f.id,
      });
    }
  }

  // ---- custos fixos mensais
  for (const m of meses) {
    const mesTxt = `${MESES[m.mes - 1]}/${m.ano}`;
    add({ descricao: `Aluguel do galpão — ${mesTxt}`, categoria: "aluguel", valor: 1200, data: dataDoMes(m, 10) });
    add({ descricao: `Energia elétrica — ${mesTxt}`, categoria: "outros", valor: 260 + rng.inteiro(0, 110), data: dataDoMes(m, 15) });
    add({ descricao: `Internet e telefone — ${mesTxt}`, categoria: "outros", valor: 129.9, data: dataDoMes(m, 12) });
    add({ descricao: `Contabilidade — ${mesTxt}`, categoria: "outros", valor: 350, data: dataDoMes(m, 8) });
    add({
      descricao: `Anúncios online — ${mesTxt}`,
      categoria: "marketing",
      valor: 200 + rng.inteiro(0, 20) * 10,
      data: dataDoMes(m, 3),
      usuarioId: usuarios.atendenteId,
    });

    // DAS (Simples): ~4,5% do faturamento confirmado do mês anterior, vence dia 20.
    const ref = mesAnterior(m);
    const fat = faturamentoPorMes[`${ref.ano}-${dois(ref.mes)}`];
    if (fat) {
      add({
        descricao: `DAS Simples Nacional — ${MESES[ref.mes - 1]}/${ref.ano}`,
        categoria: "impostos",
        valor: fat * 0.045,
        data: dataDoMes(m, 20),
        observacao: "Alíquota estimada de 4,5% sobre o faturamento do mês.",
      });
    }
  }

  // ---- combustível: cada veículo com técnico abastece a cada 6 a 9 dias
  const postos = ["Posto Ipiranga", "Posto Shell", "Posto BR", "Posto Petrobras"];
  for (const v of veiculos.filter((x) => x.status === "ativo" && x.tecnicoId)) {
    let data = somarDias(inicio, rng.inteiro(0, 6));
    while (data <= hoje) {
      add({
        descricao: `Abastecimento — ${v.modelo} ${v.placa}`,
        categoria: "combustivel",
        valor: 110 + rng.inteiro(0, 70) + (v.modelo === "Fiorino" ? 15 : 0),
        data,
        observacao: rng.escolher(postos),
        veiculoId: v.id,
        usuarioId: v.tecnicoId,
      });
      data = somarDias(data, rng.inteiro(6, 9));
    }
  }

  // ---- manutenção dos veículos, vinculada ao veículo
  const servicosFrota = [
    { nome: "Troca de óleo e filtros", min: 260, max: 420, cada: [120, 150] },
    { nome: "Alinhamento e balanceamento", min: 140, max: 220, cada: [200, 260] },
    { nome: "Pastilhas e discos de freio", min: 380, max: 640, cada: [330, 420] },
  ];
  for (const v of veiculos.filter((x) => x.status === "ativo" && x.tecnicoId)) {
    for (const s of servicosFrota) {
      let data = somarDias(inicio, rng.inteiro(10, s.cada[1]));
      while (data <= hoje) {
        add({
          descricao: `${s.nome} — ${v.modelo} ${v.placa}`,
          categoria: "manutencao",
          valor: s.min + rng.inteiro(0, s.max - s.min),
          data,
          observacao: "Oficina parceira.",
          veiculoId: v.id,
        });
        data = somarDias(data, rng.inteiro(s.cada[0], s.cada[1]));
      }
    }
  }
  const parado = veiculos.find((x) => x.status === "manutencao");
  if (parado) {
    add({ descricao: `Reparo de motor — ${parado.modelo} ${parado.placa}`, categoria: "manutencao", valor: 1850, data: somarDias(hoje, -38), observacao: "Veículo parado na oficina; orçamento aprovado pelo CEO.", veiculoId: parado.id });
    add({ descricao: `Peças do reparo — ${parado.modelo} ${parado.placa}`, categoria: "manutencao", valor: 620, data: somarDias(hoje, -24), veiculoId: parado.id });
  }
  const inativo = veiculos.find((x) => x.status === "inativo");
  if (inativo) {
    add({ descricao: `Revisão antes da baixa — ${inativo.modelo} ${inativo.placa}`, categoria: "manutencao", valor: 640, data: somarDias(hoje, -330), veiculoId: inativo.id });
  }

  // ---- ferramentas e outros eventuais
  const ferramentas = [
    ["Bomba de vácuo", 890], ["Manifold digital", 1250], ["Jogo de chaves e alicates", 420],
    ["Furadeira de impacto", 560], ["Escada articulada", 380], ["Máquina de lavar a jato", 1150], ["Kit de flangeadores", 310],
  ];
  ferramentas.forEach(([nome, valor], i) => {
    add({ descricao: nome, categoria: "ferramentas", valor, data: somarDias(inicio, 25 + i * 52 + rng.inteiro(0, 12)), usuarioId: usuarios.estoquistaId });
  });
  add({ descricao: "Uniformes e EPIs da equipe", categoria: "outros", valor: 1380, data: somarDias(inicio, 40) });
  add({ descricao: "Uniformes e EPIs — novo técnico", categoria: "outros", valor: 460, data: somarDias(hoje, -148) });
  add({ descricao: "Adesivação dos veículos", categoria: "marketing", valor: 1900, data: somarDias(inicio, 95) });
  add({ descricao: "Confraternização de fim de ano", categoria: "outros", valor: 1250, data: `${Number(inicio.slice(0, 4))}-12-19` });

  linhas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  linhas.forEach((l, i) => {
    l.id = i + 1;
    l.criado_em = new Date(`${l.data}T09:00:00-03:00`);
  });
  return linhas;
}

// Notificações do sino: avisos dos últimos 20 dias. Só as mais recentes ficam
// não lidas, como se o CEO tivesse aberto o sistema por último há ~3 dias.
export function gerarNotificacoes({ agora, ordens, agendamentos, clientes, produtos, saldos, nomesTecnicos }) {
  const agoraMs = agora.getTime();
  const DIA = 24 * 60 * 60 * 1000;
  const janela = agoraMs - 20 * DIA;
  const corteLida = agoraMs - 3 * DIA;
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));
  const agPorId = new Map(agendamentos.map((a) => [a.id, a]));
  const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const itens = [];
  const novo = (quando, dados) => {
    const t = quando.getTime();
    if (t < janela || t > agoraMs) return;
    itens.push({ ...dados, criada_em: quando, lida_em: t < corteLida ? new Date(t + 3 * 60 * 60 * 1000) : null });
  };

  for (const os of ordens) {
    const ag = agPorId.get(os.agendamento_id);
    const cliente = clientePorId.get(ag.cliente_id);
    const tecnico = nomesTecnicos.get(ag.tecnico_id) || "Técnico";
    if (os.iniciada_em) {
      novo(os.iniciada_em, { tipo: "atendimento_iniciado", titulo: "Atendimento iniciado", mensagem: `${tecnico} iniciou ${os._servico.nome} em ${cliente.nome}.`, agendamento_id: ag.id, ordem_id: os.id, produto_id: null });
    }
    if (os.concluida_em) {
      const pendente = !os.pagamento_confirmado;
      novo(os.concluida_em, {
        tipo: "atendimento_concluido",
        titulo: "Atendimento concluído",
        mensagem: `${tecnico} concluiu ${os._servico.nome} em ${cliente.nome}.${pendente ? ` Pagamento pendente: ${brl(os.valor_cobrado)}.` : ""}`.slice(0, 300),
        agendamento_id: ag.id, ordem_id: os.id, produto_id: null,
      });
    }
  }
  for (const ag of agendamentos) {
    if (!ag.cancelado_em) continue;
    const cliente = clientePorId.get(ag.cliente_id);
    if (ag.nao_realizado) {
      novo(ag.cancelado_em, { tipo: "nao_realizado", titulo: "Atendimento não realizado", mensagem: `${cliente.nome}: ${ag.motivo_nao_realizado}`.slice(0, 300), agendamento_id: ag.id, ordem_id: null, produto_id: null });
    } else {
      novo(ag.cancelado_em, { tipo: "cancelado", titulo: "Agendamento cancelado", mensagem: `${cliente.nome} cancelou o atendimento de ${ag.data.split("-").reverse().join("/")}.`, agendamento_id: ag.id, ordem_id: null, produto_id: null });
    }
  }
  // Estoque: um aviso (não lido) por produto que terminou no mínimo ou zerado.
  for (const p of produtos) {
    const saldo = saldos[p.id];
    if (saldo > p.minimo) continue;
    itens.push({
      tipo: saldo <= 0 ? "estoque_zerado" : "estoque_baixo",
      titulo: saldo <= 0 ? "Estoque zerado" : "Estoque no mínimo",
      mensagem: saldo <= 0 ? `${p.nome} acabou (saldo 0). Reponha o estoque.` : `${p.nome} está com ${saldo} un. (mínimo ${p.minimo}).`,
      agendamento_id: null, ordem_id: null, produto_id: p.id,
      criada_em: new Date(agoraMs - 6 * 60 * 60 * 1000), lida_em: null,
    });
  }

  itens.sort((a, b) => a.criada_em - b.criada_em);
  itens.forEach((n, i) => (n.id = i + 1));
  return itens;
}
