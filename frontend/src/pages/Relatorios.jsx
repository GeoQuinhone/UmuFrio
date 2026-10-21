import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL, apiRequest } from "../api.js";
import Icon from "../components/Icon.jsx";
import Layout from "../components/Layout.jsx";
import { formaPagamentoLabel, formatMoeda } from "../utils/atendimento.js";
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
    "Considera pagamentos confirmados dentro do período, pela data da confirmação. “A receber” é o que está em aberto hoje (agendado, em andamento ou concluído e ainda não pago).",
  servicos:
    "Considera os atendimentos agendados dentro do período. Receita = valor cobrado nos concluídos; recebido = parte já confirmada.",
  estoque:
    "Considera as saídas de estoque feitas no período. O custo usa o preço unitário atual do produto. “Abaixo do mínimo” mostra a situação de hoje.",
  atendimentos:
    "Considera os atendimentos agendados dentro do período, pela data do agendamento. Os check-ins são os registrados nesses atendimentos; “fora do raio” é a posição do técnico além do limite do endereço do cliente.",
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
              style={{ width: `${Math.max((item.valor / maximo) * 100, item.valor > 0 ? 1.5 : 0)}%` }}
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

function PainelFaturamento({ dados }) {
  const f = dados.faturamento;
  return (
    <>
      <section className="rel-cards" aria-label="Resumo do faturamento">
        <Cartao rotulo="Faturamento" valor={formatMoeda(f.total)} detalhe={`${numero(f.quantidade)} pagamento(s)`} />
        <Cartao rotulo="Ticket médio" valor={formatMoeda(f.ticketMedio)} detalhe="por pagamento confirmado" />
        <Cartao
          rotulo="A receber"
          valor={formatMoeda(f.aReceber.total)}
          detalhe={`${numero(f.aReceber.quantidade)} atendimento(s) em aberto`}
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
            valor: Number(i.total),
            detalhe: `${numero(i.quantidade)} pagamento(s)`,
          }))}
        />
      </section>
    </>
  );
}

function PainelServicos({ dados }) {
  const s = dados.servicos;
  return (
    <>
      <section className="rel-cards" aria-label="Resumo de serviços">
        <Cartao rotulo="Serviços concluídos" valor={numero(s.totalConcluidos)} />
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
            detalhe: `Receita ${formatMoeda(i.receita)} · recebido ${formatMoeda(i.recebido)}`,
          }))}
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
                  <th className="num">Não realizados</th>
                  <th className="num">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {s.tecnicos.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nome}</td>
                    <td className="num">{numero(t.concluidos)}</td>
                    <td className="num">{formatMoeda(t.receita)}</td>
                    <td className="num">{numero(t.naoRealizados)}</td>
                    <td className="num">{duracao(t.tempoMedioMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function PainelEstoque({ dados }) {
  const e = dados.estoque;
  return (
    <>
      <section className="rel-cards" aria-label="Resumo do estoque">
        <Cartao rotulo="Unidades consumidas" valor={numero(e.unidadesConsumidas)} detalhe={`${numero(e.unidadesExtras)} como peças extras`} />
        <Cartao rotulo="Custo das peças" valor={formatMoeda(e.custoPecas)} detalhe="a preço unitário atual" />
        <Cartao rotulo="Entradas no período" valor={numero(e.entradas)} detalhe="unidades recebidas" />
      </section>

      {e.abaixoMinimo.length > 0 && (
        <section className="rel-panel rel-alert" aria-label="Produtos abaixo do mínimo">
          <h3>
            <Icon name="alertTriangle" size={16} />
            Abaixo do estoque mínimo ({e.abaixoMinimo.length})
          </h3>
          <ul className="rel-list">
            {e.abaixoMinimo.map((p) => (
              <li key={p.id}>
                <span>{p.nome}</span>
                <strong>
                  {numero(p.saldo)} de {numero(p.minimo)}
                </strong>
              </li>
            ))}
          </ul>
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

function PainelAtendimentos({ dados }) {
  const a = dados.atendimentos;
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
                <span className="rel-status-label">{s.label}</span>
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

      <section className="rel-panel">
        <h3>Motivos de não realização</h3>
        {a.motivos.length === 0 ? (
          <Vazio texto="Nenhum atendimento não realizado neste período." />
        ) : (
          <ul className="rel-list">
            {a.motivos.map((m) => (
              <li key={m.motivo}>
                <span>{m.motivo}</span>
                <strong>{numero(m.quantidade)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
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

            {aba === "faturamento" && <PainelFaturamento dados={dados} />}
            {aba === "servicos" && <PainelServicos dados={dados} />}
            {aba === "estoque" && <PainelEstoque dados={dados} />}
            {aba === "atendimentos" && <PainelAtendimentos dados={dados} />}

            <p className="rel-criteria">
              <strong>Como é calculado:</strong> {CRITERIOS[aba]}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
