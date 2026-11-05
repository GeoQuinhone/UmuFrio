import { PAGINA, PdfDoc } from "./pdfDoc.js";
import { categoriaLabel } from "./despesas.js";
import { formaPagamentoLabel, formatMoeda } from "./atendimento.js";

// Fase 6 — monta o PDF dos relatórios a partir dos mesmos dados que a tela
// já recebeu do servidor (GET /api/relatorios). Nada é recalculado aqui.

const COR = {
  marca: "#21295c",
  texto: "#1f3037",
  suave: "#5d6f76",
  linha: "#d5dfe2",
  fundo: "#f2f7f8",
  barra: "#2f6fb5",
  alerta: "#fdf0d5",
  alertaTexto: "#6f4700",
};
const M = 40; // margem
const LARGURA = PAGINA.largura - M * 2;
const TOPO_CORPO = 78;
const BASE_CORPO = PAGINA.altura - 48;

const numero = (v) => Number(v || 0).toLocaleString("pt-BR");
const moeda = (v) => formatMoeda(v).replace(/ /g, " ");
const percentual = (v) =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function duracao(min) {
  if (min === null || min === undefined) return "—";
  const total = Math.round(Number(min));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function dataBr(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function dataCurta(iso, agrupamento) {
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return agrupamento === "mes" ? `${m}/${a}` : `${d}/${m}`;
}

function agora() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

class Fluxo {
  constructor(doc, periodo, titulo) {
    this.doc = doc;
    this.periodo = periodo;
    this.titulo = titulo;
    this.y = TOPO_CORPO;
    this.cabecalho(true);
  }

  cabecalho(completo) {
    const { doc } = this;
    if (completo) {
      doc.retangulo(0, 0, PAGINA.largura, 62, { fill: COR.marca });
      doc.texto("UmuFrio", M, 28, { tamanho: 17, negrito: true, cor: "#ffffff" });
      doc.texto("GESTÃO TÉCNICA", M, 42, { tamanho: 7.5, cor: "#9fd6d9" });
      doc.texto(this.titulo, PAGINA.largura - M, 28, { tamanho: 12, negrito: true, cor: "#ffffff", alinhar: "direita" });
      doc.texto(
        `Período: ${dataBr(this.periodo.de)} a ${dataBr(this.periodo.ate)} (${numero(this.periodo.dias)} dia(s))`,
        PAGINA.largura - M,
        43,
        { tamanho: 8.5, cor: "#dfe7ee", alinhar: "direita" },
      );
      this.y = TOPO_CORPO;
    } else {
      doc.texto(`UmuFrio · ${this.titulo}`, M, 36, { tamanho: 8.5, cor: COR.suave });
      doc.linha(M, 42, PAGINA.largura - M, 42);
      this.y = 62;
    }
  }

  garantir(altura) {
    if (this.y + altura <= BASE_CORPO) return false;
    this.doc.novaPagina();
    this.cabecalho(false);
    return true;
  }

  titulo2(texto) {
    this.garantir(40);
    this.doc.texto(texto, M, this.y + 12, { tamanho: 12, negrito: true, cor: COR.marca });
    this.y += 22;
  }

  paragrafo(texto, { tamanho = 9, cor = COR.suave, negrito = false } = {}) {
    for (const linha of this.doc.quebrar(texto, LARGURA, tamanho, negrito)) {
      this.garantir(tamanho + 4);
      this.doc.texto(linha, M, this.y + tamanho, { tamanho, cor, negrito });
      this.y += tamanho + 3.5;
    }
    this.y += 4;
  }

  vazio(texto) {
    this.paragrafo(texto, { cor: COR.suave });
  }

  espaco(h = 8) {
    this.y += h;
  }

  cartoes(itens) {
    const { doc } = this;
    const gap = 10;
    const w = (LARGURA - gap * (itens.length - 1)) / itens.length;
    const h = 58;
    this.garantir(h + 10);
    itens.forEach((item, i) => {
      const x = M + i * (w + gap);
      doc.retangulo(x, this.y, w, h, { fill: COR.fundo, stroke: COR.linha });
      doc.texto(doc.ajustar(item.rotulo, w - 16, 8), x + 8, this.y + 15, { tamanho: 8, cor: COR.suave });
      doc.texto(doc.ajustar(item.valor, w - 16, 15, true), x + 8, this.y + 35, { tamanho: 15, negrito: true, cor: COR.marca });
      if (item.detalhe) {
        doc.texto(doc.ajustar(item.detalhe, w - 16, 7.5), x + 8, this.y + 49, { tamanho: 7.5, cor: COR.suave });
      }
    });
    this.y += h + 12;
  }

  // Barras horizontais: itens = [{rotulo, valor, texto, detalhe}]
  barrasH(itens, cor = COR.barra) {
    const { doc } = this;
    const maximo = Math.max(...itens.map((i) => i.valor), 0) || 1;
    for (const item of itens) {
      const alturaItem = item.detalhe ? 38 : 28;
      this.garantir(alturaItem + 4);
      doc.texto(doc.ajustar(item.rotulo, LARGURA - 110, 9), M, this.y + 9, { tamanho: 9 });
      doc.texto(item.texto, PAGINA.largura - M, this.y + 9, { tamanho: 9, negrito: true, alinhar: "direita" });
      doc.retangulo(M, this.y + 14, LARGURA, 6, { fill: "#e6eef0" });
      const w = Math.max((item.valor / maximo) * LARGURA, item.valor > 0 ? 2 : 0);
      if (w > 0) doc.retangulo(M, this.y + 14, w, 6, { fill: item.cor || cor });
      if (item.detalhe) doc.texto(doc.ajustar(item.detalhe, LARGURA, 7.5), M, this.y + 30, { tamanho: 7.5, cor: COR.suave });
      this.y += alturaItem;
    }
    this.y += 6;
  }

  tabela(colunas, linhas) {
    const { doc } = this;
    const somaPesos = colunas.reduce((s, c) => s + c.peso, 0);
    const larguras = colunas.map((c) => (c.peso / somaPesos) * LARGURA);
    const alturaLinha = 18;
    const desenharCabecalho = () => {
      doc.retangulo(M, this.y, LARGURA, alturaLinha, { fill: COR.marca });
      let x = M;
      colunas.forEach((c, i) => {
        const alvo = c.alinhar === "direita" ? x + larguras[i] - 6 : x + 6;
        doc.texto(doc.ajustar(c.titulo, larguras[i] - 12, 8, true), alvo, this.y + 12, {
          tamanho: 8,
          negrito: true,
          cor: "#ffffff",
          alinhar: c.alinhar === "direita" ? "direita" : "esquerda",
        });
        x += larguras[i];
      });
      this.y += alturaLinha;
    };
    this.garantir(alturaLinha * 2 + 4);
    desenharCabecalho();
    linhas.forEach((linha, idx) => {
      if (this.garantir(alturaLinha + 2)) desenharCabecalho();
      if (idx % 2 === 1) doc.retangulo(M, this.y, LARGURA, alturaLinha, { fill: COR.fundo });
      let x = M;
      linha.forEach((celula, i) => {
        const c = colunas[i];
        const alvo = c.alinhar === "direita" ? x + larguras[i] - 6 : x + 6;
        doc.texto(doc.ajustar(celula, larguras[i] - 12, 8.5), alvo, this.y + 12, {
          tamanho: 8.5,
          alinhar: c.alinhar === "direita" ? "direita" : "esquerda",
        });
        x += larguras[i];
      });
      this.y += alturaLinha;
    });
    doc.linha(M, this.y, M + LARGURA, this.y);
    this.y += 12;
  }

  // Faturamento no tempo: barras verticais.
  graficoColunas(pontos, agrupamento) {
    const { doc } = this;
    const altura = 150;
    const esquerda = 52;
    this.garantir(altura + 40);
    const areaL = LARGURA - esquerda;
    const maximo = Math.max(...pontos.map((p) => Number(p.total)), 1);
    const passo = Math.pow(10, Math.floor(Math.log10(maximo)));
    const teto = Math.ceil(maximo / passo) * passo;
    const topo = this.y + 6;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const y = topo + altura - f * altura;
      doc.linha(M + esquerda, y, M + LARGURA, y, { cor: "#e1e9eb", espessura: 0.5 });
      const v = teto * f;
      const rotulo = v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(Math.round(v));
      doc.texto(rotulo, M + esquerda - 5, y + 3, { tamanho: 7, cor: COR.suave, alinhar: "direita" });
    }
    const faixa = areaL / pontos.length;
    const larg = Math.min(22, Math.max(faixa - 3, 2));
    const cada = Math.ceil(pontos.length / 12);
    pontos.forEach((p, i) => {
      const h = (Number(p.total) / teto) * altura;
      const x = M + esquerda + faixa * i + (faixa - larg) / 2;
      if (h > 0) doc.retangulo(x, topo + altura - h, larg, h, { fill: COR.barra });
      if (i % cada === 0) {
        doc.texto(dataCurta(p.inicio, agrupamento), x + larg / 2, topo + altura + 12, {
          tamanho: 7,
          cor: COR.suave,
          alinhar: "centro",
        });
      }
    });
    this.y = topo + altura + 24;
  }
}

function painelFaturamento(f, dados) {
  const t = dados.faturamento;
  const variacao = t.anterior?.variacaoPercentual;
  f.cartoes([
    {
      rotulo: "Faturamento",
      valor: moeda(t.total),
      detalhe: `${numero(t.quantidade)} pagamento(s)${variacao === null || variacao === undefined ? "" : ` · ${variacao > 0 ? "+" : ""}${percentual(variacao)} vs. anterior`}`,
    },
    { rotulo: "Gastos", valor: moeda(t.gastos?.total), detalhe: `Pecas ${moeda(t.gastos?.pecas)} · despesas ${moeda(t.gastos?.despesas)}` },
    { rotulo: "Lucro", valor: moeda(t.lucro), detalhe: t.margemPercentual === null || t.margemPercentual === undefined ? "sem faturamento" : `margem de ${percentual(t.margemPercentual)}` },
  ]);
  f.cartoes([
    { rotulo: "Ticket médio", valor: moeda(t.ticketMedio), detalhe: "por pagamento confirmado" },
    { rotulo: "A receber", valor: moeda(t.aReceber.total), detalhe: `${numero(t.aReceber.quantidade)} atendimento(s) em aberto` },
  ]);
  if (t.gastos?.porCategoria?.length) {
    f.titulo2("Despesas por categoria");
    f.barrasH(
      t.gastos.porCategoria.map((c) => ({
        rotulo: categoriaLabel(c.categoria),
        valor: Number(c.total),
        texto: moeda(c.total),
        detalhe: `${numero(c.quantidade)} lancamento(s)`,
      })),
    );
  }
  f.titulo2(`Faturamento por ${t.agrupamento === "mes" ? "mês" : "dia"}`);
  if (!t.porPeriodo.length) f.vazio("Nenhum pagamento confirmado neste período.");
  else {
    f.graficoColunas(t.porPeriodo, t.agrupamento);
    f.tabela(
      [
        { titulo: t.agrupamento === "mes" ? "Mês" : "Dia", peso: 3 },
        { titulo: "Pagamentos", peso: 2, alinhar: "direita" },
        { titulo: "Faturamento", peso: 3, alinhar: "direita" },
      ],
      t.porPeriodo
        .filter((p) => Number(p.quantidade) > 0)
        .map((p) => [t.agrupamento === "mes" ? dataCurta(p.inicio, "mes") : dataBr(p.inicio), numero(p.quantidade), moeda(p.total)]),
    );
  }
  f.titulo2("Por forma de pagamento");
  if (!t.porForma.length) f.vazio("Nenhum pagamento confirmado neste período.");
  else
    f.barrasH(
      t.porForma.map((i) => ({
        rotulo: i.forma ? formaPagamentoLabel(i.forma) : "Não informada",
        valor: Number(i.total),
        texto: moeda(i.total),
        detalhe: `${numero(i.quantidade)} pagamento(s)`,
      })),
    );

  const LIMITE = 30;
  f.titulo2(`Quem falta pagar (${numero(t.aReceber.quantidade)})`);
  if (!t.pendentes?.length) f.vazio("Nenhum pagamento pendente.");
  else {
    f.tabela(
      [
        { titulo: "Atendimento", peso: 3 },
        { titulo: "Cliente", peso: 4 },
        { titulo: "Serviço", peso: 4 },
        { titulo: "Em aberto", peso: 2, alinhar: "direita" },
        { titulo: "Valor", peso: 3, alinhar: "direita" },
      ],
      t.pendentes.slice(0, LIMITE).map((l) => [`${dataBr(l.data)} ${l.hora}`, l.cliente, l.servico, `${l.diasEmAberto} d`, moeda(l.valor)]),
    );
    if (t.pendentes.length > LIMITE) f.paragrafo(`Mostrando ${LIMITE} de ${numero(t.aReceber.quantidade)}. A lista completa está no CSV.`, { tamanho: 8, cor: COR.suave });
  }

  f.titulo2(`Quem já pagou (${numero(t.quantidade)})`);
  if (!t.pagos?.length) f.vazio("Nenhum pagamento confirmado neste período.");
  else {
    f.tabela(
      [
        { titulo: "Cliente", peso: 4 },
        { titulo: "Serviço", peso: 4 },
        { titulo: "Forma", peso: 3 },
        { titulo: "Valor", peso: 3, alinhar: "direita" },
      ],
      t.pagos.slice(0, LIMITE).map((l) => [l.cliente, l.servico, formaPagamentoLabel(l.forma), moeda(l.valor)]),
    );
    if (t.pagos.length > LIMITE) f.paragrafo(`Mostrando ${LIMITE} de ${numero(t.quantidade)}. A lista completa está no CSV.`, { tamanho: 8, cor: COR.suave });
  }
}

function painelServicos(f, dados) {
  const s = dados.servicos;
  f.cartoes([
    { rotulo: "Serviços concluídos", valor: numero(s.totalConcluidos) },
    { rotulo: "Serviços diferentes", valor: numero(s.ranking.length), detalhe: "com atendimentos no período" },
    { rotulo: "Técnicos ativos", valor: numero(s.tecnicos.length) },
  ]);
  f.titulo2("Serviços mais realizados");
  if (!s.ranking.length) f.vazio("Nenhum serviço concluído neste período.");
  else
    f.barrasH(
      s.ranking.map((i) => ({
        rotulo: i.nome,
        valor: Number(i.quantidade),
        texto: `${numero(i.quantidade)}×`,
        detalhe: `Receita ${moeda(i.receita)} (${percentual(i.participacao)}) · ticket ${moeda(i.ticketMedio)} · recebido ${moeda(i.recebido)}`,
      })),
    );
  f.titulo2("Desempenho dos técnicos");
  if (!s.tecnicos.length) f.vazio("Nenhum atendimento com técnico neste período.");
  else
    f.tabela(
      [
        { titulo: "Técnico", peso: 4 },
        { titulo: "Concl.", peso: 2, alinhar: "direita" },
        { titulo: "Receita", peso: 3, alinhar: "direita" },
        { titulo: "Ticket", peso: 3, alinhar: "direita" },
        { titulo: "Não real.", peso: 2, alinhar: "direita" },
        { titulo: "Taxa", peso: 2, alinhar: "direita" },
        { titulo: "Tempo", peso: 3, alinhar: "direita" },
      ],
      s.tecnicos.map((t) => [t.nome, numero(t.concluidos), moeda(t.receita), moeda(t.ticketMedio), numero(t.naoRealizados), percentual(t.taxaConclusao), duracao(t.tempoMedioMin)]),
    );
}

function painelEstoque(f, dados) {
  const e = dados.estoque;
  f.cartoes([
    { rotulo: "Unidades consumidas", valor: numero(e.unidadesConsumidas), detalhe: `${numero(e.unidadesExtras)} como peças extras` },
    { rotulo: "Custo das peças", valor: moeda(e.custoPecas), detalhe: "consumo do período" },
    { rotulo: "Entradas no período", valor: numero(e.entradas), detalhe: `${moeda(e.valorEntradas)} em compras` },
  ]);
  f.cartoes([
    { rotulo: "Valor em estoque", valor: moeda(e.valorEmEstoque), detalhe: `${numero(e.produtos)} produto(s) · ${numero(e.zerados)} zerado(s)` },
  ]);
  if (e.abaixoMinimo.length) {
    f.titulo2(`No estoque mínimo ou abaixo (${e.abaixoMinimo.length})`);
    f.tabela(
      [
        { titulo: "Produto", peso: 5 },
        { titulo: "Saldo", peso: 2, alinhar: "direita" },
        { titulo: "Mínimo", peso: 2, alinhar: "direita" },
      ],
      e.abaixoMinimo.map((p) => [p.nome, numero(p.saldo), numero(p.minimo)]),
    );
  }
  f.titulo2("Peças mais consumidas");
  if (!e.maisConsumidos.length) f.vazio("Nenhuma saída de estoque neste período.");
  else
    f.barrasH(
      e.maisConsumidos.map((i) => ({
        rotulo: i.nome,
        valor: Number(i.quantidade),
        texto: `${numero(i.quantidade)} un.`,
        detalhe: `Custo ${moeda(i.custo)} · ${numero(i.ordens)} ordem(ns) · saldo ${numero(i.saldo)} (mín. ${numero(i.minimo)})`,
      })),
    );
}

function painelAtendimentos(f, dados, situacoes) {
  const a = dados.atendimentos;
  f.cartoes([
    { rotulo: "Atendimentos", valor: numero(a.total), detalhe: "agendados no período" },
    { rotulo: "Taxa de conclusão", valor: percentual(a.taxaConclusao), detalhe: `${numero(a.concluidos)} concluídos` },
    { rotulo: "Tempo médio", valor: duracao(a.tempoMedioMin), detalhe: "de execução" },
  ]);
  if (a.localizacao) {
    f.cartoes([
      { rotulo: "Check-ins", valor: numero(a.localizacao.checkins), detalhe: `${numero(a.localizacao.checkouts)} check-out(s)` },
      { rotulo: "Fora do raio", valor: numero(a.localizacao.foraDoRaio), detalhe: "registrados com justificativa" },
      { rotulo: "Sem referência", valor: numero(a.localizacao.semReferencia), detalhe: "endereço sem coordenadas" },
    ]);
  }
  f.titulo2("Situação dos atendimentos");
  if (a.total === 0) f.vazio("Nenhum atendimento neste período.");
  else
    f.barrasH(
      situacoes.map((s) => ({
        rotulo: s.label,
        valor: Number(a[s.chave] || 0),
        texto: numero(a[s.chave]),
        cor: s.cor,
      })),
    );
  f.titulo2("Motivos de não realização");
  if (!a.motivos.length) f.vazio("Nenhum atendimento não realizado neste período.");
  else f.tabela([{ titulo: "Motivo", peso: 6 }, { titulo: "Quantidade", peso: 2, alinhar: "direita" }], a.motivos.map((m) => [m.motivo, numero(m.quantidade)]));
}

const PAINEIS = {
  faturamento: painelFaturamento,
  servicos: painelServicos,
  estoque: painelEstoque,
  atendimentos: painelAtendimentos,
};

// aba: id de uma aba ou "todas". Devolve { bytes, nome }.
export function gerarRelatorioPdf({ dados, aba, abas, criterios, situacoes }) {
  const doc = new PdfDoc();
  const unica = aba !== "todas";
  const rotuloAba = abas.find((a) => a.id === aba)?.label;
  const titulo = unica ? `Relatório de ${rotuloAba}` : "Relatório completo";
  doc.rodape = (d, numeroPagina, total) => {
    d.linha(M, PAGINA.altura - 36, PAGINA.largura - M, PAGINA.altura - 36);
    d.texto(`UmuFrio Gestão Técnica · gerado em ${agora()}`, M, PAGINA.altura - 22, { tamanho: 7.5, cor: COR.suave });
    d.texto(`Página ${numeroPagina} de ${total}`, PAGINA.largura - M, PAGINA.altura - 22, {
      tamanho: 7.5,
      cor: COR.suave,
      alinhar: "direita",
    });
  };

  const f = new Fluxo(doc, dados.periodo, titulo);
  const lista = unica ? abas.filter((a) => a.id === aba) : abas;
  lista.forEach((item, i) => {
    if (!unica) {
      if (i > 0) {
        doc.novaPagina();
        f.cabecalho(false);
      }
      f.garantir(30);
      doc.retangulo(M, f.y, LARGURA, 22, { fill: COR.fundo });
      doc.texto(item.label, M + 8, f.y + 15, { tamanho: 12, negrito: true, cor: COR.marca });
      f.y += 32;
    }
    PAINEIS[item.id](f, dados, situacoes);
    f.espaco(4);
    f.paragrafo(`Como é calculado: ${criterios[item.id]}`, { tamanho: 8, cor: COR.suave });
  });

  const slug = unica ? aba : "completo";
  return {
    bytes: doc.gerar(),
    nome: `umufrio-relatorio-${slug}-${dados.periodo.de}-a-${dados.periodo.ate}.pdf`,
  };
}

export function baixarArquivo(bytes, nome, tipo = "application/pdf") {
  const blob = new Blob([bytes], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
