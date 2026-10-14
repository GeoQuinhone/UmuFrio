import React, { useEffect, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";

import { useAuth } from "../AuthContext.jsx";
import { Badge, EmptyState, ErrorBanner, Field, Select, TextInput } from "../components/FormControls.jsx";
import Icon from "../components/Icon.jsx";
import Layout from "../components/Layout.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useMotivoDialog } from "../components/MotivoDialog.jsx";
import QuickClientDialog from "../components/QuickClientDialog.jsx";
import AtendimentoDialog from "../components/AtendimentoDialog.jsx";
import PagamentoDialog from "../components/PagamentoDialog.jsx";
import {
  atendimentoNaoIniciado,
  estadoDoAtendimento,
  formatDate,
  formatMoeda,
  osCode,
  pagamentoConfirmado,
  podeRegistrarPagamento,
  valorDoAtendimento,
} from "../utils/atendimento.js";
import "./scheduling-orders.css";

const LISTA = "/agendamentos";

const FORM_VAZIO = {
  clienteId: "",
  servicoId: "",
  tecnicoId: "",
  data: "",
  hora: "",
};

function formatDayMonth(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(Number(year), Number(month) - 1, Number(day)))
    .replace(".", "")
    .toUpperCase();
  return `${day} ${monthName}`;
}

function minutosDoDia(hora) {
  const [h, m] = String(hora || "").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function chaveDataHora(atendimento) {
  return `${String(atendimento.data || "").slice(0, 10)} ${String(atendimento.hora || "").slice(0, 5)}`;
}

function abaDoAtendimento(atendimento) {
  if (atendimento.status === "cancelado") return "cancelados";
  if (atendimento.ordemStatus === "concluida") return "concluidos";
  return "ativos";
}

export default function Agendamentos({
  crud,
  clientes,
  tecnicos,
  servicos,
  ordensServico,
  estoque,
  onEstoqueAlterado,
  onBack,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isTecnico = user?.perfil === "tecnico";
  const isCeo = user?.perfil === "ceo";
  const { confirm, confirmElement } = useConfirm();
  const { pedirMotivo, motivoElement } = useMotivoDialog();
  const {
    items = [],
    loading,
    error,
    add,
    update,
    remove,
    action,
  } = crud;

  // Estado da tela guiado pela URL (ponto 5):
  //   /agendamentos                 lista
  //   /agendamentos/novo            formulário de novo agendamento
  //   /agendamentos/12              detalhes do atendimento
  //   /agendamentos/12/editar       edição
  //   /agendamentos/12/pagamento    pagamento
  const matchNovo = useMatch("/agendamentos/novo");
  const matchEditar = useMatch("/agendamentos/:id/editar");
  const matchPagamento = useMatch("/agendamentos/:id/pagamento");
  const matchDetalhe = useMatch("/agendamentos/:id");

  const emNovo = Boolean(matchNovo);
  const emEditar = Boolean(matchEditar);
  const emPagamento = Boolean(matchPagamento);
  const emDetalhe = Boolean(matchDetalhe) && !emNovo;
  const rotaId =
    matchEditar?.params.id ??
    matchPagamento?.params.id ??
    (emDetalhe ? matchDetalhe.params.id : null);
  const alvo = rotaId
    ? items.find((atendimento) => String(atendimento.id) === String(rotaId))
    : null;

  const [form, setForm] = useState(FORM_VAZIO);
  const [formKey, setFormKey] = useState(null);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [aba, setAba] = useState("ativos");

  const clientItems = clientes?.items || [];
  const technicianItems = tecnicos?.items || [];
  const serviceItems = servicos?.items || [];
  const clientesAtivos = clientItems.filter((cliente) => cliente.status === "ativo");
  const tecnicosAtivos = technicianItems.filter(
    (usuario) => usuario.perfil === "tecnico" && usuario.ativo !== 0,
  );
  const servicosAtivos = serviceItems.filter((servico) => servico.ativo !== 0);

  const dadosCarregando = Boolean(
    clientes?.loading || tecnicos?.loading || servicos?.loading,
  );
  const formularioAberto = emNovo || emEditar;

  // Acesso direto por URL a telas que o perfil não pode usar ou a registros
  // que não existem: volta para a lista com um aviso.
  useEffect(() => {
    if (loading) return;

    if (isTecnico && (emNovo || emEditar)) {
      navigate(LISTA, { replace: true });
      return;
    }

    if (rotaId && !alvo) {
      setBanner("Atendimento não encontrado.");
      navigate(LISTA, { replace: true });
      return;
    }

    if (emEditar && alvo && !atendimentoNaoIniciado(alvo)) {
      setBanner("Só é possível editar um atendimento que ainda não foi iniciado.");
      navigate(LISTA, { replace: true });
      return;
    }

    if (emPagamento && alvo && !podeRegistrarPagamento(alvo)) {
      setBanner("O pagamento só pode ser registrado com o atendimento em andamento ou concluído.");
      navigate(LISTA, { replace: true });
    }
  }, [loading, isTecnico, emNovo, emEditar, emPagamento, rotaId, alvo, navigate]);

  // Novo agendamento exige cliente, técnico e serviço ativos.
  useEffect(() => {
    if (!emNovo || isTecnico || dadosCarregando) return;

    if (clientesAtivos.length === 0) {
      setBanner("Cadastre pelo menos um cliente ativo antes de agendar.");
      navigate(LISTA, { replace: true });
    } else if (tecnicosAtivos.length === 0) {
      setBanner("Não há técnicos ativos disponíveis para agendar.");
      navigate(LISTA, { replace: true });
    } else if (servicosAtivos.length === 0) {
      setBanner("Cadastre pelo menos um serviço ativo antes de agendar.");
      navigate(LISTA, { replace: true });
    }
  }, [
    emNovo,
    isTecnico,
    dadosCarregando,
    clientesAtivos.length,
    tecnicosAtivos.length,
    servicosAtivos.length,
    navigate,
  ]);

  // Preenche o formulário uma vez ao abrir "novo" ou "editar".
  useEffect(() => {
    const chaveAtual = emNovo ? "novo" : emEditar && alvo ? `editar-${alvo.id}` : null;

    if (!chaveAtual) {
      if (formKey !== null) setFormKey(null);
      return;
    }
    if (formKey === chaveAtual) return;

    if (chaveAtual === "novo") {
      setForm(FORM_VAZIO);
    } else {
      setForm({
        clienteId: String(alvo.clienteId),
        servicoId: alvo.servicoId ? String(alvo.servicoId) : "",
        tecnicoId: String(alvo.tecnicoId),
        data: String(alvo.data || "").slice(0, 10),
        hora: String(alvo.hora || "").slice(0, 5),
      });
    }
    setErrors({});
    setFormKey(chaveAtual);
  }, [emNovo, emEditar, alvo, formKey]);

  function abrirNovo() {
    setBanner("");
    navigate(`${LISTA}/novo`);
  }

  function fecharRota() {
    navigate(LISTA);
  }

  function fecharPagamento() {
    if (location.state?.from === "detalhe" && alvo) {
      navigate(`${LISTA}/${alvo.id}`);
    } else {
      navigate(LISTA);
    }
  }

  async function recarregarTudo() {
    await Promise.all([crud.reload(), ordensServico?.reload?.()]);
    onEstoqueAlterado?.();
  }

  function validar() {
    const novosErros = {};

    if (!form.clienteId) novosErros.clienteId = "Selecione um cliente.";
    if (!form.servicoId) novosErros.servicoId = "Selecione um serviço.";
    if (!form.tecnicoId) novosErros.tecnicoId = "Selecione um técnico.";
    if (!form.data) novosErros.data = "Informe a data.";
    if (!form.hora) novosErros.hora = "Informe o horário.";

    if (!novosErros.tecnicoId && !novosErros.data && !novosErros.hora) {
      const minutosReferencia = minutosDoDia(form.hora);

      const conflito = items.some(
        (outro) =>
          outro.id !== (emEditar ? alvo?.id : null) &&
          outro.tecnicoId === Number(form.tecnicoId) &&
          String(outro.data).slice(0, 10) === form.data &&
          outro.status === "agendado" &&
          Math.abs(minutosDoDia(outro.hora) - minutosReferencia) < 60,
      );

      if (conflito) {
        novosErros.hora = "Este técnico já possui um agendamento a menos de 1h de diferença nesse horário.";
      }
    }

    setErrors(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function salvar(event) {
    event.preventDefault();
    if (!validar()) return;

    const payload = {
      clienteId: Number(form.clienteId),
      servicoId: Number(form.servicoId),
      tecnicoId: Number(form.tecnicoId),
      data: form.data,
      hora: form.hora,
    };

    setSaving(true);
    try {
      if (emEditar && alvo) {
        await update(alvo.id, payload);
      } else {
        await add(payload);
      }
      await ordensServico?.reload?.();
      setBanner("");
      navigate(LISTA);
    } catch (saveError) {
      setBanner(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function avancar(atendimento) {
    if (!atendimento.ordemId) return;
    const iniciando = atendimento.ordemStatus === "aberta";
    const cliente = atendimento.clienteNome;

    let mensagem;
    if (iniciando) {
      mensagem = `Iniciar o atendimento de ${cliente}? As peças vinculadas ao serviço serão debitadas do estoque.`;
    } else if (!pagamentoConfirmado(atendimento)) {
      mensagem = `Concluir o atendimento de ${cliente}? O pagamento ainda não foi confirmado.`;
    } else {
      mensagem = `Concluir o atendimento de ${cliente}?`;
    }

    const ok = await confirm(mensagem, {
      title: iniciando ? "Iniciar atendimento" : "Concluir atendimento",
      confirmLabel: iniciando ? "Iniciar" : "Concluir",
      danger: false,
    });
    if (!ok) return;

    try {
      await ordensServico.action(atendimento.ordemId, "/avancar");
      await recarregarTudo();
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  async function cancelar(atendimento) {
    const ok = await confirm(
      `Cancelar o agendamento de ${atendimento.clienteNome}?${atendimento.ordemId ? " A ordem de serviço aberta será removida junto." : ""}`,
      { title: "Cancelar agendamento", confirmLabel: "Cancelar agendamento" },
    );
    if (!ok) return;

    try {
      await action(atendimento.id, "/cancelar");
      await recarregarTudo();
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  async function marcarNaoRealizado(atendimento) {
    const motivo = await pedirMotivo(
      "Por que o atendimento não pôde ser realizado? (ex.: cliente ausente, local fechado)",
      { title: "Registrar atendimento não realizado", confirmLabel: "Registrar" },
    );
    if (!motivo) return;

    try {
      await action(atendimento.id, "/nao-realizado", { motivo });
      await recarregarTudo();
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  async function excluir(atendimento) {
    const ok = await confirm(
      `Excluir definitivamente o atendimento de ${atendimento.clienteNome}? Se ele estiver em andamento, as peças debitadas voltam ao estoque. Esta ação não pode ser desfeita.`,
      { title: "Excluir atendimento", confirmLabel: "Excluir" },
    );
    if (!ok) return;

    try {
      await remove(atendimento.id);
      await recarregarTudo();
      setBanner("");
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  async function salvarPagamento(payload) {
    await ordensServico.action(alvo.ordemId, "/pagamento", payload);
    await crud.reload();
  }

  async function cadastrarClienteRapido(payload) {
    const cliente = await clientes.add(payload);
    setForm((current) => ({ ...current, clienteId: String(cliente.id) }));
    return cliente;
  }

  const porAba = {
    ativos: items.filter((a) => abaDoAtendimento(a) === "ativos"),
    concluidos: items.filter((a) => abaDoAtendimento(a) === "concluidos"),
    cancelados: items.filter((a) => abaDoAtendimento(a) === "cancelados"),
  };

  const estadosDaAba = [];
  porAba[aba].forEach((atendimento) => {
    const estado = estadoDoAtendimento(atendimento);
    if (!estadosDaAba.some((existente) => existente.key === estado.key)) {
      estadosDaAba.push(estado);
    }
  });

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredItems = porAba[aba]
    .slice()
    .sort((a, b) =>
      aba === "ativos"
        ? chaveDataHora(a).localeCompare(chaveDataHora(b))
        : chaveDataHora(b).localeCompare(chaveDataHora(a)),
    )
    .filter((atendimento) => {
      const data = String(atendimento.data || "").slice(0, 10);
      const estado = estadoDoAtendimento(atendimento);
      if (statusFilter && estado.key !== statusFilter) return false;
      if (dateFrom && (!data || data < dateFrom)) return false;
      if (dateTo && (!data || data > dateTo)) return false;
      if (!normalizedSearch) return true;
      const searchable = [
        atendimento.clienteNome,
        atendimento.tecnicoNome,
        atendimento.servicoNome,
        atendimento.ordemId ? osCode(atendimento.ordemId) : "",
        data,
        atendimento.hora,
        estado.label,
      ].join(" ").toLocaleLowerCase("pt-BR");
      return searchable.includes(normalizedSearch);
    });

  const stats = [
    {
      label: "Agendados",
      value: items.filter((a) => a.status === "agendado" && (!a.ordemStatus || a.ordemStatus === "aberta")).length,
      detail: "Aguardando atendimento",
      tone: "blue",
    },
    {
      label: "Em andamento",
      value: items.filter((a) => a.ordemStatus === "andamento" && a.status === "agendado").length,
      detail: "Em execução",
      tone: "purple",
    },
    {
      label: "Concluídos",
      value: porAba.concluidos.length,
      detail: "Atendimentos finalizados",
      tone: "teal",
    },
    {
      label: "Pagamento pendente",
      value: items.filter((a) => podeRegistrarPagamento(a) && !pagamentoConfirmado(a)).length,
      detail: "Em andamento ou concluídos",
      tone: "orange",
    },
  ];

  const clientesDoSelect = [...clientesAtivos];
  if (
    emEditar &&
    alvo &&
    !clientesDoSelect.some((cliente) => cliente.id === alvo.clienteId)
  ) {
    clientesDoSelect.push({ id: alvo.clienteId, nome: alvo.clienteNome });
  }

  const tecnicosDoSelect = [...tecnicosAtivos];
  if (
    emEditar &&
    alvo &&
    !tecnicosDoSelect.some((tecnico) => tecnico.id === alvo.tecnicoId)
  ) {
    tecnicosDoSelect.push({ id: alvo.tecnicoId, nome: alvo.tecnicoNome });
  }

  const servicosDoSelect = [...servicosAtivos];
  if (
    emEditar &&
    alvo?.servicoId &&
    !servicosDoSelect.some((servico) => servico.id === alvo.servicoId)
  ) {
    servicosDoSelect.push({
      id: alvo.servicoId,
      nome: alvo.servicoNome,
      valor: alvo.servicoValor,
    });
  }

  function limparFiltros() {
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  function trocarAba(novaAba) {
    setAba(novaAba);
    setStatusFilter("");
  }

  const abas = [
    { key: "ativos", label: `Ativos (${porAba.ativos.length})` },
    { key: "concluidos", label: `Concluídos (${porAba.concluidos.length})` },
    { key: "cancelados", label: `Cancelados (${porAba.cancelados.length})` },
  ];

  return (
    <>
    <Layout
      title="Agendamentos"
      subtitle="Da visita marcada ao pagamento: agendamento e ordem de serviço em um só fluxo."
      onBack={onBack}
      action={!isTecnico && (
        <button
          type="button"
          className="schedule-primary-action"
          onClick={abrirNovo}
        >
          <Icon name="plus" size={16} />
          Novo agendamento
        </button>
      )}
    >
      <div className="scheduling-orders-screen schedule-screen">
        <ErrorBanner message={error || tecnicos?.error || banner} onClose={() => setBanner("")} />

        <section className="orders-summary-grid" aria-label="Resumo dos atendimentos">
          {stats.map((stat) => (
            <article className={`orders-summary-card orders-summary-${stat.tone}`} key={stat.label}>
              <span className="orders-summary-label">{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </section>

        {formularioAberto && !isTecnico && formKey && (
          <form className="form-card schedule-form" onSubmit={salvar}>
            <div className="schedule-form-heading">
              <div>
                <span className="schedule-eyebrow">{emEditar ? "EDITAR REGISTRO" : "NOVO REGISTRO"}</span>
                <h2>{emEditar ? "Editar agendamento" : "Novo agendamento"}</h2>
              </div>
              <button
                type="button"
                className="schedule-close-form"
                aria-label="Fechar formulário"
                onClick={fecharRota}
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <Field label="Cliente" error={errors.clienteId}>
                <div className="schedule-client-field">
                  <Select
                    value={form.clienteId}
                    onChange={(event) => setForm({ ...form, clienteId: event.target.value })}
                  >
                    <option value="">Selecione...</option>
                    {clientesDoSelect.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    className="btn-ghost schedule-client-new"
                    onClick={() => setShowQuickClient(true)}
                  >
                    <Icon name="plus" size={14} />
                    Novo cliente
                  </button>
                </div>
              </Field>

              <Field label="Serviço" error={errors.servicoId}>
                <Select
                  value={form.servicoId}
                  onChange={(event) => setForm({ ...form, servicoId: event.target.value })}
                >
                  <option value="">Selecione...</option>
                  {servicosDoSelect.map((servico) => (
                    <option key={servico.id} value={servico.id}>
                      {servico.nome} — {formatMoeda(servico.valor)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Técnico" error={errors.tecnicoId}>
                <Select
                  value={form.tecnicoId}
                  onChange={(event) => setForm({ ...form, tecnicoId: event.target.value })}
                >
                  <option value="">Selecione...</option>
                  {tecnicosDoSelect.map((tecnico) => (
                    <option key={tecnico.id} value={tecnico.id}>{tecnico.nome}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Data" error={errors.data}>
                <TextInput
                  type="date"
                  value={form.data}
                  onChange={(event) => setForm({ ...form, data: event.target.value })}
                />
              </Field>

              <Field label="Horário" error={errors.hora}>
                <TextInput
                  type="time"
                  value={form.hora}
                  onChange={(event) => setForm({ ...form, hora: event.target.value })}
                />
              </Field>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-ghost" onClick={fecharRota}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Salvando..." : emEditar ? "Salvar alterações" : "Agendar"}
              </button>
            </div>
          </form>
        )}

        <div className="schedule-tabs" role="tablist">
          {abas.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={aba === item.key}
              className={`schedule-tab${aba === item.key ? " is-active" : ""}`}
              onClick={() => trocarAba(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="schedule-toolbar" role="search">
          <label className="schedule-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente, técnico, serviço ou OS..."
              aria-label="Buscar atendimentos por cliente, técnico, serviço ou OS"
            />
          </label>
          <label className="schedule-status-filter">
            <span className="schedule-visually-hidden">Filtrar por status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos os status</option>
              {estadosDaAba.map((estado) => (
                <option key={estado.key} value={estado.key}>{estado.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`schedule-filter-toggle${showFilters ? " is-active" : ""}`}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((visible) => !visible)}
          >
            <Icon name="filter" size={15} />
            Filtros
          </button>
        </div>

        {showFilters && (
          <div className="schedule-filter-panel">
            <label>
              <span>De</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              <span>Até</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button type="button" className="schedule-clear-filters" onClick={limparFiltros}>
              Limpar filtros
            </button>
          </div>
        )}

        {loading ? (
          <EmptyState text="Carregando agendamentos..." />
        ) : items.length === 0 ? (
          <EmptyState text="Nenhum agendamento cadastrado ainda." />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            text={
              porAba[aba].length === 0
                ? "Nenhum atendimento nesta aba."
                : "Nenhum atendimento corresponde aos filtros aplicados."
            }
          />
        ) : (
          <div className="schedule-table-card">
            <div className="schedule-table-scroll">
              <table className="schedule-data-table schedule-appointments-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Horário</th>
                    <th>Cliente</th>
                    <th>Serviço</th>
                    <th>Técnico</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th><span className="schedule-visually-hidden">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((atendimento) => {
                    const estado = estadoDoAtendimento(atendimento);
                    const naoIniciado = atendimentoNaoIniciado(atendimento);
                    const podeAvancar =
                      atendimento.ordemId &&
                      atendimento.status === "agendado" &&
                      atendimento.ordemStatus !== "concluida";
                    const mostraPagamento = podeRegistrarPagamento(atendimento);
                    const podeAlterarPagamento =
                      mostraPagamento && (!pagamentoConfirmado(atendimento) || isCeo);
                    const podeExcluir =
                      isCeo && atendimento.ordemStatus !== "concluida";

                    return (
                      <tr key={atendimento.id}>
                        <td>
                          <span className="schedule-primary-cell">{formatDayMonth(atendimento.data)}</span>
                          <small className="schedule-secondary-cell">{formatDate(atendimento.data)}</small>
                        </td>
                        <td className="schedule-time-cell">
                          {atendimento.hora?.slice(0, 5) || "—"}
                        </td>
                        <td className="schedule-strong-cell">{atendimento.clienteNome}</td>
                        <td>
                          {atendimento.servicoNome || "—"}
                          {atendimento.ordemId && (
                            <small className="schedule-secondary-cell">{osCode(atendimento.ordemId)}</small>
                          )}
                        </td>
                        <td>{atendimento.tecnicoNome}</td>
                        <td>
                          {atendimento.status === "cancelado"
                            ? "—"
                            : formatMoeda(valorDoAtendimento(atendimento))}
                        </td>
                        <td>
                          <Badge tone={estado.tone}>{estado.label}</Badge>
                          {mostraPagamento && (
                            <small className="schedule-secondary-cell">
                              <Badge tone={pagamentoConfirmado(atendimento) ? "green" : "amber"}>
                                {pagamentoConfirmado(atendimento) ? "Pago" : "Pagamento pendente"}
                              </Badge>
                            </small>
                          )}
                          {Boolean(atendimento.naoRealizado && atendimento.motivoNaoRealizado) && (
                            <small className="schedule-secondary-cell" title={atendimento.motivoNaoRealizado}>
                              {atendimento.motivoNaoRealizado}
                            </small>
                          )}
                        </td>
                        <td className="schedule-row-actions">
                          <button
                            type="button"
                            className="schedule-icon-action"
                            aria-label={`Ver detalhes do atendimento de ${atendimento.clienteNome}`}
                            title="Ver detalhes e linha do tempo"
                            onClick={() => navigate(`${LISTA}/${atendimento.id}`)}
                          >
                            <Icon name="eye" size={16} />
                            <span className="schedule-visually-hidden">Ver detalhes</span>
                          </button>
                          {podeAvancar && (
                            <button
                              type="button"
                              className="schedule-icon-action"
                              aria-label={
                                atendimento.ordemStatus === "aberta"
                                  ? `Iniciar atendimento de ${atendimento.clienteNome}`
                                  : `Concluir atendimento de ${atendimento.clienteNome}`
                              }
                              title={atendimento.ordemStatus === "aberta" ? "Iniciar atendimento" : "Concluir atendimento"}
                              onClick={() => avancar(atendimento)}
                            >
                              <Icon name="check" size={16} />
                              <span className="schedule-visually-hidden">
                                {atendimento.ordemStatus === "aberta" ? "Iniciar" : "Concluir"}
                              </span>
                            </button>
                          )}
                          {podeAlterarPagamento && (
                            <button
                              type="button"
                              className="schedule-icon-action"
                              aria-label={`Registrar pagamento de ${atendimento.clienteNome}`}
                              title="Registrar pagamento"
                              onClick={() => navigate(`${LISTA}/${atendimento.id}/pagamento`)}
                            >
                              <Icon name="wallet" size={16} />
                              <span className="schedule-visually-hidden">Pagamento</span>
                            </button>
                          )}
                          {!isTecnico && naoIniciado && (
                            <button
                              type="button"
                              className="schedule-icon-action"
                              aria-label={`Editar agendamento de ${atendimento.clienteNome}`}
                              title="Editar agendamento"
                              onClick={() => navigate(`${LISTA}/${atendimento.id}/editar`)}
                            >
                              <Icon name="pencil" size={16} />
                              <span className="schedule-visually-hidden">Editar</span>
                            </button>
                          )}
                          {naoIniciado && (
                            <>
                              <button
                                type="button"
                                className="schedule-icon-action"
                                aria-label={`Marcar atendimento de ${atendimento.clienteNome} como não realizado`}
                                title="Registrar atendimento não realizado"
                                onClick={() => marcarNaoRealizado(atendimento)}
                              >
                                <Icon name="alertTriangle" size={15} />
                                <span className="schedule-visually-hidden">Não realizado</span>
                              </button>
                              <button
                                type="button"
                                className="schedule-icon-action schedule-icon-action-danger"
                                aria-label={`Cancelar agendamento de ${atendimento.clienteNome}`}
                                title="Cancelar agendamento"
                                onClick={() => cancelar(atendimento)}
                              >
                                <Icon name="ban" size={15} />
                                <span className="schedule-visually-hidden">Cancelar</span>
                              </button>
                            </>
                          )}
                          {podeExcluir && (
                            <button
                              type="button"
                              className="schedule-icon-action schedule-icon-action-danger"
                              aria-label={`Excluir atendimento de ${atendimento.clienteNome}`}
                              title="Excluir atendimento"
                              onClick={() => excluir(atendimento)}
                            >
                              <Icon name="trash" size={15} />
                              <span className="schedule-visually-hidden">Excluir</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
    {confirmElement}
    {motivoElement}
    {showQuickClient && (
      <QuickClientDialog
        clientesExistentes={clientItems}
        onClose={() => setShowQuickClient(false)}
        onCreate={cadastrarClienteRapido}
      />
    )}
    {emDetalhe && alvo && (
      <AtendimentoDialog
        atendimento={alvo}
        perfil={user?.perfil}
        produtosAtivos={estoque?.items || []}
        onClose={fecharRota}
        onPagamento={() =>
          navigate(`${LISTA}/${alvo.id}/pagamento`, { state: { from: "detalhe" } })
        }
        onConsumoPecaExtra={() => onEstoqueAlterado?.()}
      />
    )}
    {emPagamento && alvo && podeRegistrarPagamento(alvo) && (
      <PagamentoDialog
        atendimento={alvo}
        perfil={user?.perfil}
        onSave={salvarPagamento}
        onClose={fecharPagamento}
      />
    )}
    </>
  );
}
