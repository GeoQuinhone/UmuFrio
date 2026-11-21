import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { API_URL, apiRequest } from "../api.js";
import AtendimentoDialog from "../components/AtendimentoDialog.jsx";
import PagamentoDialog from "../components/PagamentoDialog.jsx";
import Icon from "../components/Icon.jsx";
import Layout from "../components/Layout.jsx";
import { formaPagamentoLabel, formatMoeda } from "../utils/atendimento.js";
import { categoriaLabel } from "../utils/despesas.js";
import { baixarArquivo, gerarRelatorioPdf } from "../utils/relatorioPdf.js";
import "./relatorios.css";

// Fase 4 — relatórios estratégicos (somente CEO). Todos os números vêm do
// servidor (GET /api/relatorios); aqui só apresentamos e exportamos em CSV.

const ABAS = [
  { id: "faturamento", label: "Faturamento" },
  { id: "servicos", label: "Serviços e técnicos" },
  { id: "estoque", label: "Estoque" },
  { id: "atendimentos", label: "Atendimentos" },
];

const CRITERIOS = {
  faturamento:
    "Considera pagamentos confirmados dentro do período, pela data da confirmação (regime de caixa). Gastos = custo das peças usadas nos atendimentos do período + despesas lançadas no período; lucro = faturamento - gastos. “A receber” é o que está em aberto hoje (em andamento ou concluído e ainda não pago). A comparação usa o período anterior de mesma duração.",
  servicos:
    "Considera os atendimentos agendados dentro do período. Receita = valor cobrado nos concluídos (inclui peças extras); recebido = parte já confirmada; participação = fatia da receita total. Clique em um serviço ou técnico para ver os atendimentos.",
  estoque:
    "Considera as saídas de estoque feitas no período. O custo usa o preço unitário registrado na movimentação. “No mínimo ou abaixo” (saldo menor ou igual ao mínimo) e o valor em estoque mostram a situação de hoje.",
  atendimentos:
    "Considera os atendimentos agendados dentro do período, pela data do agendamento. Os check-ins são os registrados nesses atendimentos; “fora do raio” é a posição do técnico além do limite do endereço do cliente. Clique em uma situação para ver os pedidos; o olho mostra os detalhes de cada um.",
};

const SITUACOES = [
  { chave: "concluidos", label: "Concluídos", cor: "#2f9e6e" },
  { chave: "emAndamento", label: "Em andamento", cor: "#2f6fb5" },
  { chave: "agendados", label: "Agendados", cor: "#8a97a0" },
  { chave: "naoRealizados", label: "Não realizados", cor: "#d08a00" },
  { chave: "cancelados", label: "Cancelados", cor: "#c8473f" },
];

const TABELAS_CSV = {
  faturamento: [
    ["faturamento-por-periodo", "Faturamento por período"],
    ["faturamento-por-forma", "Por forma de pagamento"],
    ["faturamento-pagos", "Quem pagou"],
    ["faturamento-pendentes", "Quem falta pagar"],
    ["gastos-por-categoria", "Gastos e lucro"],
  ],
  servicos: [
    ["servicos-ranking", "Ranking de serviços"],
    ["tecnicos", "Desempenho dos técnicos"],
  ],
  estoque: [
    ["estoque-consumo", "Consumo de peças"],
    ["estoque-abaixo-minimo", "Abaixo do mínimo"],
  ],
  atendimentos: [
    ["atendimentos-situacao", "Situação dos atendimentos"],
    ["atendimentos-motivos", "Motivos de não realização"],
  ],
};

function dataIso(data) {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function atalhos() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const trintaDias = new Date(ano, mes, hoje.getDate() - 29);
  return [
    { id: "mes", label: "Mês atual", de: dataIso(new Date(ano, mes, 1)), ate: dataIso(hoje) },
    {
      id: "mes-anterior",
      label: "Mês anterior",
      de: dataIso(new Date(ano, mes - 1, 1)),
      ate: dataIso(new Date(ano, mes, 0)),
    },
    { id: "30", label: "Últimos 30 dias", de: dataIso(trintaDias), ate: dataIso(hoje) },
    { id: "ano", label: "Ano atual", de: dataIso(new Date(ano, 0, 1)), ate: dataIso(hoje) },
  ];
}

function numero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

function duracao(minutos) {
  if (minutos === null || minutos === undefined) return "—";
  const total = Math.round(Number(minutos));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function percentual(valor) {
  if (valor === null || valor === undefined) return "—";
  return `${Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function dataCurta(iso, agrupamento) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
  if (agrupamento === "mes") return `${mes}/${ano}`;
  return `${dia}/${mes}`;
}

function dataBr(iso) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function Cartao({ rotulo, valor, detalhe }) {
  return (
    <article className="rel-card">
      <span>{rotulo}</span>
      <strong>{valor}</strong>
      {detalhe && <small>{detalhe}</small>}
    </article>
  );
}

function Vazio({ texto }) {
  return <p className="rel-empty">{texto}</p>;
}

// Barras horizontais: comparação de magnitude entre categorias.
function BarrasHorizontais({ itens, formatar, vazio, rotuloDe }) {
  if (!itens.length) return <Vazio texto={vazio} />;
  const maximo = Math.max(...itens.map((i) => i.valor), 0) || 1;
  return (
    <ul className="rel-hbars">
      {itens.map((item) => (
        <li key={item.chave}>
          <div className="rel-hbar-head">
            <span>{rotuloDe ? rotuloDe(item) : item.rotulo}</span>
            <strong>{formatar(item.valor)}</strong>
          </div>
          <div className="rel-hbar-track" aria-hidden="true">
            <div
              className="rel-hbar-fill"
              style={{
                width: `${Math.max((item.valor / maximo) * 100, item.valor > 0 ? 1.5 : 0)}%`,
                ...(item.cor ? { background: item.cor } : {}),
              }}
            />
          </div>
          {item.detalhe && <small>{item.detalhe}</small>}
        </li>
      ))}
    </ul>
  );
}

// Gráfico de barras do faturamento no tempo (SVG, sem biblioteca).
function GraficoFaturamento({ pontos, agrupamento }) {
  const [ativo, setAtivo] = useState(null);
  const [tabela, setTabela] = useState(false);

  if (!pontos.length) return <Vazio texto="Nenhum pagamento confirmado neste período." />;

  const largura = 760;
  const altura = 250;
  const margem = { topo: 14, direita: 8, base: 30, esquerda: 56 };
  const areaL = largura - margem.esquerda - margem.direita;
  const areaA = altura - margem.topo - margem.base;
  const maximo = Math.max(...pontos.map((p) => Number(p.total)), 1);
  const passo = Math.pow(10, Math.floor(Math.log10(maximo)));
  const teto = Math.ceil(maximo / passo) * passo;
  const linhas = [0, 0.25, 0.5, 0.75, 1].map((f) => teto * f);
  const faixa = areaL / pontos.length;
  const larguraBarra = Math.min(24, Math.max(faixa - 4, 3));
  const cadaRotulo = Math.ceil(pontos.length / 10);

  const compacto = (v) =>
    v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(Math.round(v));

  return (
    <div className="rel-chart">
      <div className="rel-chart-tools">
        <button
          type="button"
          className="rel-link"
          aria-pressed={tabela}
          onClick={() => setTabela((v) => !v)}
        >
          {tabela ? "Ver gráfico" : "Ver como tabela"}
        </button>
      </div>

      {tabela ? (
        <div className="rel-table-wrap">
          <table className="rel-table">
            <thead>
              <tr>
                <th>{agrupamento === "mes" ? "Mês" : "Dia"}</th>
                <th className="num">Pagamentos</th>
                <th className="num">Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.inicio}>
                  <td>{agrupamento === "mes" ? dataCurta(p.inicio, "mes") : dataBr(p.inicio)}</td>
                  <td className="num">{numero(p.quantidade)}</td>
                  <td className="num">{formatMoeda(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rel-chart-box">
          <svg
            viewBox={`0 0 ${largura} ${altura}`}
            role="img"
            aria-label={`Faturamento por ${agrupamento === "mes" ? "mês" : "dia"}`}
            onMouseLeave={() => setAtivo(null)}
          >
            {linhas.map((valor) => {
              const y = margem.topo + areaA - (valor / teto) * areaA;
              return (
                <g key={valor}>
                  <line className="rel-grid" x1={margem.esquerda} x2={largura - margem.direita} y1={y} y2={y} />
                  <text className="rel-axis" x={margem.esquerda - 8} y={y + 4} textAnchor="end">
                    {compacto(valor)}
                  </text>
                </g>
              );
            })}

            {pontos.map((p, i) => {
              const total = Number(p.total);
              const h = (total / teto) * areaA;
              const x = margem.esquerda + faixa * i + (faixa - larguraBarra) / 2;
              const y = margem.topo + areaA - h;
              const r = Math.min(4, larguraBarra / 2, h);
              const caminho =
                h > 0
                  ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + larguraBarra - r} Q${x + larguraBarra},${y} ${x + larguraBarra},${y + r} V${y + h} Z`
                  : "";
              return (
                <g key={p.inicio}>
                  {caminho && (
                    <path
                      d={caminho}
                      className={`rel-bar ${ativo === i ? "is-active" : ""}`}
                    />
                  )}
                  {i % cadaRotulo === 0 && (
                    <text
                      className="rel-axis"
                      x={x + larguraBarra / 2}
                      y={altura - 10}
                      textAnchor="middle"
                    >
                      {dataCurta(p.inicio, agrupamento)}
                    </text>
                  )}
                  <rect
                    x={margem.esquerda + faixa * i}
                    y={margem.topo}
                    width={faixa}
                    height={areaA}
                    fill="transparent"
                    onMouseEnter={() => setAtivo(i)}
                    onFocus={() => setAtivo(i)}
                    onBlur={() => setAtivo(null)}
                    tabIndex={0}
                    aria-label={`${agrupamento === "mes" ? dataCurta(p.inicio, "mes") : dataBr(p.inicio)}: ${formatMoeda(total)}, ${p.quantidade} pagamento(s)`}
                  />
                </g>
              );
            })}
          </svg>

          {ativo !== null && (
            <div
              className="rel-tooltip"
              role="status"
              style={{
                left: `${((margem.esquerda + faixa * ativo + faixa / 2) / largura) * 100}%`,
              }}
            >
              <strong>
                {agrupamento === "mes"
                  ? dataCurta(pontos[ativo].inicio, "mes")
                  : dataBr(pontos[ativo].inicio)}
              </strong>
              <span>{formatMoeda(pontos[ativo].total)}</span>
              <small>{numero(pontos[ativo].quantidade)} pagamento(s)</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const NOMES_SITUACAO = {
  concluido: "Concluído",
  andamento: "Em andamento",
  agendado: "Agendado",
  cancelado: "Cancelado",
  nao_realizado: "Não realizado",
};

const SITUACAO_TOM = {
  concluido: "ok",
  andamento: "info",
  agendado: "neutro",
  cancelado: "erro",
  nao_realizado: "aviso",
};

function horaPeriodo(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

// Fase 11: lista completa de agendamentos, carregada no 1º "Ver detalhes".
let cacheAgendamentos = null;

// Fase 11: abre a mesma janela de detalhes do Agendamentos, só para consulta.
// Procura pelo id do agendamento ou da ordem de serviço (as listas de
// pagamento trazem o id da ordem). Lá estão telefone, Ligar e WhatsApp.
function useDetalhesAtendimento({ permitirPagamento = false, onPago } = {}) {
  const [detalhe, setDetalhe] = useState(null);
  const [erroDetalhe, setErroDetalhe] = useState("");
  // Fase 11: em "Falta pagar", dá para registrar o pagamento pela própria janela.
  const [pagando, setPagando] = useState(null);
  const [sucesso, setSucesso] = useState("");

  async function verDetalhes({ id, ordemId }) {
    setErroDetalhe("");
    try {
      if (!cacheAgendamentos) cacheAgendamentos = apiRequest("/agendamentos");
      const lista = await cacheAgendamentos;
      const encontrado = lista.find((item) => (ordemId ? item.ordemId === ordemId : item.id === id));
      if (!encontrado) throw new Error("Atendimento não encontrado.");
      setDetalhe(encontrado);
    } catch (falha) {
      cacheAgendamentos = null;
      setErroDetalhe(falha.message);
    }
  }

  // Pagamento confirmado com o serviço em andamento já conclui (a mesma regra
  // da tela de Agendamentos). Depois, o relatório é atualizado.
  async function concluirSePreciso(atendimento) {
    if (atendimento.ordemStatus === "andamento") {
      await apiRequest(`/ordens-servico/${atendimento.ordemId}/avancar`, { method: "PATCH", body: "{}" });
    }
  }

  function terminarPagamento(mensagem) {
    cacheAgendamentos = null;
    setPagando(null);
    setDetalhe(null);
    setSucesso(mensagem);
    onPago?.();
  }

  async function salvarPagamento(payload) {
    const atendimento = pagando;
    await apiRequest(`/ordens-servico/${atendimento.ordemId}/pagamento`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (payload.pagamentoConfirmado) {
      await concluirSePreciso(atendimento);
      terminarPagamento(`Pagamento de ${atendimento.clienteNome} registrado.`);
    }
  }

  async function pixAprovado() {
    const atendimento = pagando;
    try {
      await concluirSePreciso(atendimento);
    } finally {
      terminarPagamento(`PIX de ${atendimento.clienteNome} aprovado.`);
    }
  }

  const janela = (
    <>
      {detalhe && !pagando && (
        <AtendimentoDialog
          atendimento={detalhe}
          perfil="ceo"
          somenteLeitura
          onPagamento={permitirPagamento && !detalhe.pagamentoConfirmado ? () => setPagando(detalhe) : undefined}
          onClose={() => setDetalhe(null)}
        />
      )}
      {pagando && (
        <PagamentoDialog
          atendimento={pagando}
          perfil="ceo"
          onSave={salvarPagamento}
          onPagamentoConfirmado={pixAprovado}
          onClose={() => setPagando(null)}
        />
      )}
    </>
  );
  const aviso = (
    <>
      {erroDetalhe && <p className="catalog-form-error" role="alert">{erroDetalhe}</p>}
      {sucesso && <p className="success-banner" role="status">{sucesso}</p>}
    </>
  );
  return { verDetalhes, janela, aviso };
}

// Fase 11: olho "Ver detalhes" usado nas listas do relatório.
function BotaoVer({ cliente, onClick }) {
  return (
    <button type="button" className="rel-ver" aria-label={`Ver detalhes do atendimento de ${cliente}`} title="Ver detalhes" onClick={onClick}>
      <Icon name="eye" size={16} />
    </button>
  );
}

// Lista dos atendimentos por trás de um número do relatório (ponto: clicar em
// "não realizado" mostra os pedidos). Busca em /relatorios/atendimentos.
function ListaAtendimentos({ periodo, filtro, titulo, onFechar }) {
  const [estado, setEstado] = useState({ carregando: true, erro: "", dados: null });
  const chave = JSON.stringify([periodo, filtro]);

  useEffect(() => {
    let ativo = true;
    cacheAgendamentos = null; // lista nova: os detalhes voltam a vir atualizados
    setEstado({ carregando: true, erro: "", dados: null });
    const params = new URLSearchParams({ de: periodo.de, ate: periodo.ate, situacao: filtro.situacao || "todos" });
    if (filtro.tecnicoId) params.set("tecnicoId", filtro.tecnicoId);
    if (filtro.servicoId) params.set("servicoId", filtro.servicoId);
    if (filtro.motivo) params.set("motivo", filtro.motivo);
    apiRequest(`/relatorios/atendimentos?${params}`)
      .then((dados) => ativo && setEstado({ carregando: false, erro: "", dados }))
      .catch((falha) => ativo && setEstado({ carregando: false, erro: falha.message, dados: null }));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const { carregando, erro, dados } = estado;
  const { verDetalhes, janela, aviso } = useDetalhesAtendimento();

  // Fase 11: ao abrir (ou trocar) a lista, a tela rola até ela. Rola de novo
  // quando os dados chegam, porque enquanto carrega a lista é curta e a página
  // ainda não tem altura para levá-la até o topo.
  const secaoRef = useRef(null);
  useEffect(() => {
    secaoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [chave, carregando]);

  return (
    <section ref={secaoRef} className="rel-panel rel-drill" aria-live="polite">
      <div className="rel-drill-head">
        <h3>{titulo}</h3>
        <div className="rel-drill-actions">
          {filtro.situacao === "naoRealizados" && (
            <Link className="rel-link" to="/agendamentos?aba=nao_realizados">Abrir em Agendamentos</Link>
          )}
          <button type="button" className="rel-link" onClick={onFechar}>Fechar lista</button>
        </div>
      </div>
      {carregando && <Vazio texto="Carregando pedidos..." />}
      {erro && <p className="catalog-form-error" role="alert">{erro}</p>}
      {aviso}
      {dados && dados.linhas.length === 0 && <Vazio texto="Nenhum pedido encontrado." />}
      {dados && dados.linhas.length > 0 && (
        <>
          <div className="rel-table-wrap">
            <table className="rel-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Técnico</th>
                  <th>Situação</th>
                  <th className="num">Valor</th>
                  <th><span className="rel-sr">Ver detalhes</span></th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{dataBr(l.data)} {l.hora}</td>
                    <td>{l.cliente}</td>
                    <td>{l.servico || "—"}</td>
                    <td>{l.tecnico}</td>
                    <td>
                      <span className={`rel-tag rel-tag-${SITUACAO_TOM[l.situacao] || "neutro"}`}>
                        {NOMES_SITUACAO[l.situacao] || l.situacao}
                      </span>
                      {l.situacao === "concluido" && (
                        <small className={`rel-motivo ${l.pago ? "rel-motivo-ok" : "rel-motivo-aviso"}`}>
                          {l.pago ? "Pago" : "Pagamento pendente"}
                        </small>
                      )}
                    </td>
                    <td className="num">{l.valor === null ? "—" : formatMoeda(l.valor)}</td>
                    <td>
                      <BotaoVer cliente={l.cliente} onClick={() => verDetalhes({ id: l.id })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dados.total > dados.linhas.length && (
            <p className="rel-hint">Mostrando os {dados.linhas.length} mais recentes de {dados.total}. Reduza o período para ver os demais.</p>
          )}
        </>
      )}
      {janela}
    </section>
  );
}

function Variacao({ valor }) {
  if (valor === null || valor === undefined) return "sem base de comparação";
  const sinal = valor > 0 ? "+" : "";
  return `${sinal}${Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. período anterior`;
}

// Fase 11: uma cor para cada forma de pagamento (selos e barras).
const COR_FORMA = {
  dinheiro: "#1e8a5a",
  pix: "#1c8fb8",
  cartao_debito: "#7b5cc4",
  cartao_credito: "#d9822b",
};

function SeloForma({ forma }) {
  return <span className={`rel-forma rel-forma-${forma || "sem"}`}>{formaPagamentoLabel(forma)}</span>;
}

// Fase 11: até 7 dias normal; de 8 a 30 amarelo; acima de 30 vermelho.
function classeDias(dias) {
  const d = Number(dias) || 0;
  if (d > 30) return "rel-dias-atrasado";
  if (d > 7) return "rel-dias-atencao";
  return "";
}

// Quem já pagou no período e quem ainda falta pagar.
function PagosEPendentes({ f, onAtualizar }) {
  const [vista, setVista] = useState("pendentes");
  const { verDetalhes, janela, aviso } = useDetalhesAtendimento({
    permitirPagamento: true,
    onPago: onAtualizar,
  });
  const lista = vista === "pagos" ? f.pagos : f.pendentes;
  const total = vista === "pagos" ? f.quantidade : f.aReceber.quantidade;

  return (
    <section className="rel-panel">
      <div className="rel-drill-head">
        <h3>Pagamentos: quem pagou e quem falta</h3>
        <div className="rel-segment" role="tablist" aria-label="Pagamentos">
          {/* Fase 11: "Falta pagar" em vermelho (atenção) e "Já pagaram" em verde. */}
          <button type="button" role="tab" aria-selected={vista === "pendentes"} className={`rel-seg-falta ${vista === "pendentes" ? "is-active" : ""}`} onClick={() => setVista("pendentes")}>
            Falta pagar (<span className="rel-seg-num">{numero(f.aReceber.quantidade)}</span>)
          </button>
          <button type="button" role="tab" aria-selected={vista === "pagos"} className={`rel-seg-pagos ${vista === "pagos" ? "is-active" : ""}`} onClick={() => setVista("pagos")}>
            Já pagaram ({numero(f.quantidade)})
          </button>
        </div>
      </div>

      {aviso}
      {lista.length === 0 ? (
        <Vazio texto={vista === "pagos" ? "Nenhum pagamento confirmado neste período." : "Nenhum pagamento pendente. Tudo em dia!"} />
      ) : (
        <div className="rel-table-wrap">
          <table className="rel-table">
            <thead>
              {vista === "pagos" ? (
                <tr>
                  <th>Pago em</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Forma</th>
                  <th className="num">Valor</th>
                  <th><span className="rel-sr">Ver detalhes</span></th>
                </tr>
              ) : (
                <tr>
                  <th>Atendimento</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th className="num">Em aberto</th>
                  <th className="num">Valor</th>
                  <th><span className="rel-sr">Ver detalhes</span></th>
                </tr>
              )}
            </thead>
            <tbody>
              {lista.map((l) =>
                vista === "pagos" ? (
                  <tr key={l.id}>
                    <td>{horaPeriodo(l.pagoEm)}</td>
                    <td>{l.cliente}</td>
                    <td>{l.servico}</td>
                    <td><SeloForma forma={l.forma} /></td>
                    <td className="num">{formatMoeda(l.valor)}</td>
                    <td><BotaoVer cliente={l.cliente} onClick={() => verDetalhes({ ordemId: l.id })} /></td>
                  </tr>
                ) : (
                  <tr key={l.id}>
                    <td>{dataBr(l.data)} {l.hora}</td>
                    <td>{l.cliente}</td>
                    <td>{l.servico}{l.ordemStatus !== "concluida" && <em className="rel-tag rel-tag-info rel-tag-inline">Em andamento</em>}</td>
                    {/* Fase 11: quanto mais tempo em aberto, mais forte o alerta. */}
                    <td className="num">
                      {classeDias(l.diasEmAberto) ? (
                        <span className={`rel-dias ${classeDias(l.diasEmAberto)}`}>{l.diasEmAberto} d</span>
                      ) : (
                        `${l.diasEmAberto} d`
                      )}
                    </td>
                    <td className="num rel-valor-pendente">{formatMoeda(l.valor)}</td>
                    <td><BotaoVer cliente={l.cliente} onClick={() => verDetalhes({ ordemId: l.id })} /></td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {total > lista.length && (
        <p className="rel-hint">Mostrando {lista.length} de {numero(total)}. A lista completa está no CSV.</p>
      )}
      {janela}
    </section>
  );
}

function PainelFaturamento({ dados, onAtualizar }) {
  const f = dados.faturamento;
  return (
    <>
      <section className="rel-cards" aria-label="Resumo do faturamento">
        <Cartao rotulo="Faturamento" valor={formatMoeda(f.total)} detalhe={`${numero(f.quantidade)} pagamento(s) · ${Variacao({ valor: f.anterior?.variacaoPercentual })}`} />
        <Cartao rotulo="Gastos" valor={formatMoeda(f.gastos?.total)} detalhe={`Peças ${formatMoeda(f.gastos?.pecas)} · despesas ${formatMoeda(f.gastos?.despesas)}`} />
        <Cartao
          rotulo="Lucro"
          valor={formatMoeda(f.lucro)}
          detalhe={f.margemPercentual === null || f.margemPercentual === undefined ? "sem faturamento no período" : `margem de ${percentual(f.margemPercentual)}`}
        />
        <Cartao rotulo="Ticket médio" valor={formatMoeda(f.ticketMedio)} detalhe="por pagamento confirmado" />
        <Cartao
          rotulo="A receber"
          valor={formatMoeda(f.aReceber.total)}
          detalhe={`${numero(f.aReceber.quantidade)} atendimento(s) em aberto`}
        />
      </section>

      <section className="rel-panel">
        <div className="rel-drill-head">
          <h3>Gastos e lucro do período</h3>
          <Link className="rel-link" to="/despesas">Gerenciar despesas</Link>
        </div>
        <div className="rel-lucro">
          <div><span>Recebido</span><strong>{formatMoeda(f.total)}</strong></div>
          <div className="is-menos"><span>− Peças usadas</span><strong>{formatMoeda(f.gastos?.pecas)}</strong></div>
          <div className="is-menos"><span>− Despesas</span><strong>{formatMoeda(f.gastos?.despesas)}</strong></div>
          <div className={`is-total ${f.lucro < 0 ? "is-negativo" : ""}`}><span>= Lucro</span><strong>{formatMoeda(f.lucro)}</strong></div>
        </div>
        <BarrasHorizontais
          vazio="Nenhuma despesa lançada neste período. Cadastre em Despesas para ver o lucro real."
          formatar={formatMoeda}
          itens={(f.gastos?.porCategoria || []).map((c) => ({
            chave: c.categoria,
            rotulo: categoriaLabel(c.categoria),
            valor: Number(c.total),
            detalhe: `${numero(c.quantidade)} lançamento(s)`,
          }))}
        />
      </section>


      <section className="rel-panel">
        <h3>Faturamento por {f.agrupamento === "mes" ? "mês" : "dia"}</h3>
        <GraficoFaturamento pontos={f.porPeriodo} agrupamento={f.agrupamento} />
      </section>

      <section className="rel-panel">
        <h3>Por forma de pagamento</h3>
        <BarrasHorizontais
          vazio="Nenhum pagamento confirmado neste período."
          formatar={formatMoeda}
          itens={f.porForma.map((i) => ({
            chave: i.forma || "sem",
            rotulo: i.forma ? formaPagamentoLabel(i.forma) : "Não informada",
            // Fase 11: mesma cor do selo da forma de pagamento.
            cor: COR_FORMA[i.forma],
            valor: Number(i.total),
            detalhe: `${numero(i.quantidade)} pagamento(s)`,
          }))}
        />
      </section>

      <PagosEPendentes f={f} onAtualizar={onAtualizar} />
    </>
  );
}

function PainelServicos({ dados, periodo }) {
  const s = dados.servicos;
  const [lista, setLista] = useState(null);

  return (
    <>
      <section className="rel-cards" aria-label="Resumo de serviços">
        <Cartao rotulo="Serviços concluídos" valor={numero(s.totalConcluidos)} />
        <Cartao rotulo="Receita dos concluídos" valor={formatMoeda(s.receitaTotal)} detalhe="inclui peças extras" />
        <Cartao rotulo="Serviços diferentes" valor={numero(s.ranking.length)} detalhe="com atendimentos no período" />
        <Cartao rotulo="Técnicos ativos" valor={numero(s.tecnicos.length)} />
      </section>

      <section className="rel-panel">
        <h3>Serviços mais realizados</h3>
        <BarrasHorizontais
          vazio="Nenhum serviço concluído neste período."
          formatar={(v) => `${numero(v)}×`}
          itens={s.ranking.map((i) => ({
            chave: i.id,
            rotulo: i.nome,
            valor: Number(i.quantidade),
            detalhe: `Receita ${formatMoeda(i.receita)} (${percentual(i.participacao)}) · ticket ${formatMoeda(i.ticketMedio)} · recebido ${formatMoeda(i.recebido)}${i.aReceber > 0 ? ` · a receber ${formatMoeda(i.aReceber)}` : ""}`,
          }))}
          // Fase 11: clicar no próprio nome do serviço abre os atendimentos
          // dele (antes havia uma fileira de botões repetindo os nomes).
          rotuloDe={(item) => (
            <button
              type="button"
              className="rel-nome-link"
              title="Ver os atendimentos deste serviço"
              onClick={() => setLista({ titulo: `Atendimentos concluídos — ${item.rotulo}`, filtro: { situacao: "concluidos", servicoId: item.chave } })}
            >
              {item.rotulo}
            </button>
          )}
        />
      </section>

      <section className="rel-panel">
        <h3>Desempenho dos técnicos</h3>
        {s.tecnicos.length === 0 ? (
          <Vazio texto="Nenhum atendimento com técnico neste período." />
        ) : (
          <div className="rel-table-wrap">
            <table className="rel-table">
              <thead>
                <tr>
                  <th>Técnico</th>
                  <th className="num">Concluídos</th>
                  <th className="num">Receita</th>
                  <th className="num">Ticket médio</th>
                  <th className="num">A receber</th>
                  <th className="num">Não realizados</th>
                  <th className="num">Cancelados</th>
                  <th className="num">Taxa de conclusão</th>
                  <th><span className="rel-sr">Ver</span></th>
                </tr>
              </thead>
              <tbody>
                {s.tecnicos.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <button
                        type="button"
                        className="rel-nome-link"
                        title="Ver os atendimentos deste técnico"
                        onClick={() => setLista({ titulo: `Atendimentos de ${t.nome}`, filtro: { situacao: "todos", tecnicoId: t.id } })}
                      >
                        {t.nome}
                      </button>
                    </td>
                    <td className="num">{numero(t.concluidos)}</td>
                    <td className="num">{formatMoeda(t.receita)}</td>
                    <td className="num">{formatMoeda(t.ticketMedio)}</td>
                    <td className="num">{formatMoeda(t.aReceber)}</td>
                    <td className="num">{numero(t.naoRealizados)}</td>
                    <td className="num">{numero(t.cancelados)}</td>
                    <td className="num">{percentual(t.taxaConclusao)}</td>
                    <td>
                      <button
                        type="button"
                        className="rel-link"
                        onClick={() => setLista({ titulo: `Atendimentos de ${t.nome}`, filtro: { situacao: "todos", tecnicoId: t.id } })}
                      >
                        Ver pedidos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {lista && <ListaAtendimentos periodo={periodo} filtro={lista.filtro} titulo={lista.titulo} onFechar={() => setLista(null)} />}
    </>
  );
}

function PainelEstoque({ dados }) {
  const e = dados.estoque;
  return (
    <>
      <section className="rel-cards" aria-label="Resumo do estoque">
        <Cartao rotulo="Unidades consumidas" valor={numero(e.unidadesConsumidas)} detalhe={`${numero(e.unidadesExtras)} como peças extras`} />
        <Cartao rotulo="Custo das peças" valor={formatMoeda(e.custoPecas)} detalhe="consumo do período" />
        <Cartao rotulo="Entradas no período" valor={numero(e.entradas)} detalhe={`${formatMoeda(e.valorEntradas)} em compras`} />
        <Cartao rotulo="Valor em estoque" valor={formatMoeda(e.valorEmEstoque)} detalhe={`${numero(e.produtos)} produto(s) · ${numero(e.zerados)} zerado(s)`} />
      </section>

      {e.abaixoMinimo.length > 0 && (
        <section className="rel-panel rel-alert" aria-label="Produtos abaixo do mínimo">
          <h3>
            <Icon name="alertTriangle" size={16} />
            No estoque mínimo ou abaixo ({e.abaixoMinimo.length})
          </h3>
          <ul className="rel-list">
            {e.abaixoMinimo.map((p) => (
              <li key={p.id}>
                <span>{p.nome}{p.situacao === "zerado" && <em className="rel-tag rel-tag-erro rel-tag-inline">Zerado</em>}</span>
                <strong>
                  {numero(p.saldo)} de {numero(p.minimo)}
                </strong>
              </li>
            ))}
          </ul>
          <Link className="rel-link" to="/estoque">Abrir Estoque</Link>
        </section>
      )}

      <section className="rel-panel">
        <h3>Peças mais consumidas</h3>
        <BarrasHorizontais
          vazio="Nenhuma saída de estoque neste período."
          formatar={(v) => `${numero(v)} un.`}
          itens={e.maisConsumidos.map((i) => ({
            chave: i.id,
            rotulo: i.nome,
            valor: Number(i.quantidade),
            detalhe: `Custo ${formatMoeda(i.custo)} · ${numero(i.ordens)} ordem(ns) · saldo ${numero(i.saldo)} (mín. ${numero(i.minimo)})`,
          }))}
        />
      </section>
    </>
  );
}

function PainelAtendimentos({ dados, periodo }) {
  const a = dados.atendimentos;
  const [lista, setLista] = useState(null);
  return (
    <>
      <section className="rel-cards" aria-label="Resumo dos atendimentos">
        <Cartao rotulo="Atendimentos" valor={numero(a.total)} detalhe="agendados no período" />
        <Cartao rotulo="Taxa de conclusão" valor={percentual(a.taxaConclusao)} detalhe={`${numero(a.concluidos)} concluídos`} />
        <Cartao rotulo="Tempo médio" valor={duracao(a.tempoMedioMin)} detalhe="de execução" />
      </section>

      {a.localizacao && (
        <section className="rel-cards" aria-label="Check-in e check-out">
          <Cartao rotulo="Check-ins" valor={numero(a.localizacao.checkins)} detalhe={`${numero(a.localizacao.checkouts)} check-out(s)`} />
          <Cartao
            rotulo="Fora do raio"
            valor={numero(a.localizacao.foraDoRaio)}
            detalhe="registrados com justificativa"
          />
          <Cartao
            rotulo="Sem referência"
            valor={numero(a.localizacao.semReferencia)}
            detalhe="endereço sem coordenadas"
          />
        </section>
      )}

      <section className="rel-panel">
        <h3>Situação dos atendimentos</h3>
        {a.total === 0 ? (
          <Vazio texto="Nenhum atendimento neste período." />
        ) : (
          <ul className="rel-status">
            {SITUACOES.map((s) => (
              <li key={s.chave}>
                <span className="rel-dot" style={{ background: s.cor }} aria-hidden="true" />
                <button
                  type="button"
                  className="rel-status-label rel-status-button"
                  disabled={!Number(a[s.chave])}
                  aria-label={`Ver pedidos: ${s.label} (${numero(a[s.chave])})`}
                  onClick={() => setLista({ titulo: `${s.label} no período`, filtro: { situacao: s.chave } })}
                >
                  {s.label}
                </button>
                <div className="rel-hbar-track" aria-hidden="true">
                  <div
                    className="rel-hbar-fill"
                    style={{
                      width: `${(Number(a[s.chave] || 0) / a.total) * 100}%`,
                      background: s.cor,
                    }}
                  />
                </div>
                <strong>{numero(a[s.chave])}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Fase 11: sem o quadro de motivos; o motivo aparece nos detalhes (olho). */}

      {lista && <ListaAtendimentos periodo={periodo} filtro={lista.filtro} titulo={lista.titulo} onFechar={() => setLista(null)} />}
    </>
  );
}

export default function Relatorios({ onBack }) {
  const opcoes = useMemo(atalhos, []);
  const [de, setDe] = useState(opcoes[0].de);
  const [ate, setAte] = useState(opcoes[0].ate);
  const [periodo, setPeriodo] = useState({ de: opcoes[0].de, ate: opcoes[0].ate });
  const [aba, setAba] = useState("faturamento");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroCsv, setErroCsv] = useState("");
  const [baixando, setBaixando] = useState("");

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    apiRequest(`/relatorios?de=${periodo.de}&ate=${periodo.ate}`)
      .then((resposta) => ativo && setDados(resposta))
      .catch((falha) => ativo && setErro(falha.message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [periodo]);

  // Fase 11: depois de registrar um pagamento pelo relatório, atualiza os
  // números sem piscar a tela.
  const atualizarDados = useCallback(() => {
    apiRequest(`/relatorios?de=${periodo.de}&ate=${periodo.ate}`)
      .then(setDados)
      .catch((falha) => setErro(falha.message));
  }, [periodo]);

  const intervaloInvalido = !de || !ate || de > ate;
  const mudou = de !== periodo.de || ate !== periodo.ate;

  function aplicar(event) {
    event.preventDefault();
    if (intervaloInvalido) return;
    setPeriodo({ de, ate });
  }

  function escolherAtalho(opcao) {
    setDe(opcao.de);
    setAte(opcao.ate);
    setPeriodo({ de: opcao.de, ate: opcao.ate });
  }

  const baixarPdf = useCallback(
    (qual) => {
      setErroCsv("");
      try {
        const { bytes, nome } = gerarRelatorioPdf({
          dados,
          aba: qual,
          abas: ABAS,
          criterios: CRITERIOS,
          situacoes: SITUACOES,
        });
        baixarArquivo(bytes, nome);
      } catch (falha) {
        setErroCsv(`Não foi possível gerar o PDF: ${falha.message}`);
      }
    },
    [dados],
  );

  const baixarCsv = useCallback(
    async (slug) => {
      setErroCsv("");
      setBaixando(slug);
      try {
        const resposta = await fetch(
          `${API_URL}/relatorios/csv/${slug}?de=${periodo.de}&ate=${periodo.ate}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } },
        );
        if (!resposta.ok) {
          let mensagem = "Não foi possível gerar o CSV.";
          try {
            mensagem = (await resposta.json()).error || mensagem;
          } catch {
            // sem corpo JSON
          }
          throw new Error(mensagem);
        }
        const blob = await resposta.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `umufrio-${slug}-${periodo.de}-a-${periodo.ate}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (falha) {
        setErroCsv(falha.message);
      } finally {
        setBaixando("");
      }
    },
    [periodo],
  );

  return (
    <Layout
      title="Relatórios"
      subtitle="Visão estratégica do negócio. Acesso restrito ao CEO."
      onBack={onBack}
    >
      <div className="rel-page">
        <form className="rel-filters" onSubmit={aplicar}>
          <div className="rel-presets" role="group" aria-label="Períodos rápidos">
            {opcoes.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                className={`rel-chip ${periodo.de === opcao.de && periodo.ate === opcao.ate ? "is-active" : ""}`}
                onClick={() => escolherAtalho(opcao)}
              >
                {opcao.label}
              </button>
            ))}
          </div>
          <div className="rel-dates">
            <label>
              <span>De</span>
              <input
                type="date"
                className="input"
                value={de}
                max={ate || undefined}
                onChange={(event) => setDe(event.target.value)}
              />
            </label>
            <label>
              <span>Até</span>
              <input
                type="date"
                className="input"
                value={ate}
                min={de || undefined}
                onChange={(event) => setAte(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn-primary"
              disabled={intervaloInvalido || !mudou}
            >
              Aplicar
            </button>
          </div>
          {intervaloInvalido && (
            <p className="field-error" role="alert">
              A data inicial deve ser anterior ou igual à final.
            </p>
          )}
        </form>

        {erro && (
          <p className="catalog-form-error" role="alert">
            {erro}
          </p>
        )}

        <div className="schedule-tabs rel-tabs" role="tablist" aria-label="Relatórios">
          {ABAS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`rel-aba-${item.id}`}
              aria-selected={aba === item.id}
              aria-controls="rel-painel"
              className={`schedule-tab ${aba === item.id ? "is-active" : ""}`}
              onClick={() => setAba(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!dados && carregando && <p className="rel-empty">Carregando relatório...</p>}

        {dados && (
          <div
            id="rel-painel"
            role="tabpanel"
            aria-labelledby={`rel-aba-${aba}`}
            aria-busy={carregando}
            className={`rel-body ${carregando ? "is-loading" : ""}`}
          >
            <div className="rel-toolbar">
              <p className="rel-period">
                {dataBr(dados.periodo.de)} a {dataBr(dados.periodo.ate)} ·{" "}
                {numero(dados.periodo.dias)} dia(s)
              </p>
              <div className="rel-exports">
                <button
                  type="button"
                  className="btn-primary rel-export"
                  onClick={() => baixarPdf(aba)}
                  disabled={carregando}
                >
                  <Icon name="download" size={15} />
                  PDF desta aba
                </button>
                <button
                  type="button"
                  className="btn-ghost rel-export"
                  onClick={() => baixarPdf("todas")}
                  disabled={carregando}
                >
                  <Icon name="download" size={15} />
                  PDF completo
                </button>
                {TABELAS_CSV[aba].map(([slug, rotulo]) => (
                  <button
                    key={slug}
                    type="button"
                    className="btn-ghost rel-export"
                    onClick={() => baixarCsv(slug)}
                    disabled={Boolean(baixando)}
                  >
                    <Icon name="download" size={15} />
                    {baixando === slug ? "Gerando..." : `CSV · ${rotulo}`}
                  </button>
                ))}
              </div>
            </div>

            {erroCsv && (
              <p className="catalog-form-error" role="alert">
                {erroCsv}
              </p>
            )}

            {aba === "faturamento" && <PainelFaturamento dados={dados} onAtualizar={atualizarDados} />}
            {aba === "servicos" && <PainelServicos dados={dados} periodo={dados.periodo} />}
            {aba === "estoque" && <PainelEstoque dados={dados} />}
            {aba === "atendimentos" && <PainelAtendimentos dados={dados} periodo={dados.periodo} />}

            <p className="rel-criteria">
              <strong>Como é calculado:</strong> {CRITERIOS[aba]}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
