import React, { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../AuthContext.jsx";
import { Badge, EmptyState, ErrorBanner, Field, Select, TextInput } from "../components/FormControls.jsx";
import Icon from "../components/Icon.jsx";
import Layout from "../components/Layout.jsx";
import "./scheduling-orders.css";

const FORM_VAZIO = {
  clienteId: "",
  tecnicoId: "",
  data: "",
  hora: "",
};

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

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

function statusLabel(status) {
  if (!status) return "Não informado";
  const labels = {
    agendado: "Agendado",
    cancelado: "Cancelado",
    confirmado: "Confirmado",
    concluido: "Concluído",
    em_rota: "Em rota",
    pendente: "Pendente",
  };
  const key = String(status).toLowerCase();
  return labels[key] || key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status) {
  const key = String(status || "").toLowerCase();
  if (key.includes("cancel")) return "red";
  if (key.includes("pend") || key.includes("aguard")) return "amber";
  if (key.includes("andamento") || key.includes("rota")) return "blue";
  if (key.includes("agend") || key.includes("confirm") || key.includes("conclu")) return "green";
  return "grey";
}

function serviceName(appointment) {
  const service = appointment.servicoNome ||
    appointment.servico?.nome ||
    appointment.servico ||
    appointment.descricaoServico;
  return typeof service === "string" ? service : "—";
}

export default function Agendamentos({
  crud,
  clientes,
  usuarios,
  tecnicos,
  createAppointmentRequestId = 0,
  onCreateAppointmentRequestHandled,
  onBack,
}) {
  const { user } = useAuth();
  const isTecnico = user?.perfil === "tecnico";
  const {
    items = [],
    loading,
    error,
    add,
    action,
  } = crud;

  const [form, setForm] = useState(FORM_VAZIO);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const lastHandledCreateRequest = useRef(0);

  const clientItems = clientes?.items || [];
  const userItems = usuarios?.items || [];
  const technicianItems = tecnicos?.items ?? userItems;
  const clientesAtivos = clientItems.filter((cliente) => cliente.status === "ativo");
  const tecnicosAtivos = technicianItems.filter(
    (usuario) => usuario.perfil === "tecnico" && usuario.ativo !== 0,
  );

  function clienteNome(id) {
    return clientItems.find((cliente) => cliente.id === id)?.nome || `Cliente #${id}`;
  }

  function tecnicoNome(id) {
    return technicianItems.find((usuario) => usuario.id === id)?.nome ||
      userItems.find((usuario) => usuario.id === id)?.nome ||
      (user?.id === id ? user.nome : `Técnico #${id}`);
  }

  const iniciarNovo = useCallback(() => {
    if (clientesAtivos.length === 0) {
      setBanner("Cadastre pelo menos um cliente ativo antes de agendar.");
      return;
    }

    if (tecnicos?.loading) {
      setBanner("Aguarde enquanto carregamos os técnicos ativos.");
      return;
    }

    if (tecnicosAtivos.length === 0) {
      setBanner("Não há técnicos ativos disponíveis para agendar.");
      return;
    }

    setForm(FORM_VAZIO);
    setErrors({});
    setShowForm(true);
    setBanner("");
  }, [clientesAtivos.length, tecnicos?.loading, tecnicosAtivos.length]);

  useEffect(() => {
    if (
      !createAppointmentRequestId ||
      lastHandledCreateRequest.current === createAppointmentRequestId
    ) return;
    if (clientes?.loading || tecnicos?.loading) return;

    lastHandledCreateRequest.current = createAppointmentRequestId;
    if (!isTecnico) iniciarNovo();
    onCreateAppointmentRequestHandled?.();
  }, [
    createAppointmentRequestId,
    clientes?.loading,
    tecnicos?.loading,
    isTecnico,
    iniciarNovo,
    onCreateAppointmentRequestHandled,
  ]);

  function validar() {
    const novosErros = {};

    if (!form.clienteId) novosErros.clienteId = "Selecione um cliente.";
    if (!form.tecnicoId) novosErros.tecnicoId = "Selecione um técnico.";
    if (!form.data) novosErros.data = "Informe a data.";
    if (!form.hora) novosErros.hora = "Informe o horário.";

    if (!novosErros.tecnicoId && !novosErros.data && !novosErros.hora) {
      const conflito = items.some(
        (agendamento) =>
          agendamento.tecnicoId === Number(form.tecnicoId) &&
          agendamento.data === form.data &&
          agendamento.hora?.slice(0, 5) === form.hora &&
          agendamento.status === "agendado",
      );

      if (conflito) {
        novosErros.hora = "Este técnico já possui um serviço nesse horário.";
      }
    }

    setErrors(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function salvar(event) {
    event.preventDefault();
    if (!validar()) return;

    setSaving(true);
    try {
      await add({
        clienteId: Number(form.clienteId),
        tecnicoId: Number(form.tecnicoId),
        data: form.data,
        hora: form.hora,
      });
      setShowForm(false);
      setForm(FORM_VAZIO);
      setBanner("");
    } catch (saveError) {
      setBanner(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelar(agendamento) {
    if (agendamento.status !== "agendado") return;
    if (!window.confirm("Cancelar este agendamento?")) return;

    try {
      await action(agendamento.id, "/cancelar");
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  const statusOptions = [...new Set(items.map((item) => item.status).filter(Boolean))];
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredItems = items
    .slice()
    .sort((a, b) =>
      `${a.data || ""} ${a.hora || ""}`.localeCompare(`${b.data || ""} ${b.hora || ""}`),
    )
    .filter((agendamento) => {
      const data = String(agendamento.data || "").slice(0, 10);
      if (statusFilter && agendamento.status !== statusFilter) return false;
      if (dateFrom && (!data || data < dateFrom)) return false;
      if (dateTo && (!data || data > dateTo)) return false;
      if (!normalizedSearch) return true;
      const searchable = [
        clienteNome(agendamento.clienteId),
        tecnicoNome(agendamento.tecnicoId),
        serviceName(agendamento),
        agendamento.data,
        agendamento.hora,
        statusLabel(agendamento.status),
      ].join(" ").toLocaleLowerCase("pt-BR");
      return searchable.includes(normalizedSearch);
    });

  function limparFiltros() {
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  return (
    <Layout
      title="Agendamentos"
      subtitle="Planeje a rota da equipe e mantenha cada visita no horário."
      onBack={onBack}
      action={!isTecnico && (
        <button
          type="button"
          className="schedule-primary-action"
          onClick={iniciarNovo}
        >
          <Icon name="plus" size={16} />
          Novo agendamento
        </button>
      )}
    >
      <div className="scheduling-orders-screen schedule-screen">
        <ErrorBanner message={error || tecnicos?.error || banner} onClose={() => setBanner("")} />

        {showForm && !isTecnico && (
          <form className="form-card schedule-form" onSubmit={salvar}>
            <div className="schedule-form-heading">
              <div>
                <span className="schedule-eyebrow">NOVO REGISTRO</span>
                <h2>Novo agendamento</h2>
              </div>
              <button
                type="button"
                className="schedule-close-form"
                aria-label="Fechar formulário"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <Field label="Cliente" error={errors.clienteId}>
                <Select
                  value={form.clienteId}
                  onChange={(event) => setForm({ ...form, clienteId: event.target.value })}
                >
                  <option value="">Selecione...</option>
                  {clientesAtivos.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Técnico" error={errors.tecnicoId}>
                <Select
                  value={form.tecnicoId}
                  onChange={(event) => setForm({ ...form, tecnicoId: event.target.value })}
                >
                  <option value="">Selecione...</option>
                  {tecnicosAtivos.map((tecnico) => (
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
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Agendando..." : "Agendar"}
              </button>
            </div>
          </form>
        )}

        <div className="schedule-toolbar" role="search">
          <label className="schedule-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente ou técnico..."
              aria-label="Buscar agendamentos por cliente ou técnico"
            />
          </label>
          <label className="schedule-status-filter">
            <span className="schedule-visually-hidden">Filtrar por status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos os status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
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
          <EmptyState text="Nenhum agendamento corresponde aos filtros aplicados." />
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
                    <th>Status</th>
                    <th><span className="schedule-visually-hidden">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((agendamento) => (
                    <tr key={agendamento.id}>
                      <td>
                        <span className="schedule-primary-cell">{formatDayMonth(agendamento.data)}</span>
                        <small className="schedule-secondary-cell">{formatDate(agendamento.data)}</small>
                      </td>
                      <td className="schedule-time-cell">
                        {agendamento.hora?.slice(0, 5) || "—"}
                      </td>
                      <td className="schedule-strong-cell">{clienteNome(agendamento.clienteId)}</td>
                      <td>{serviceName(agendamento)}</td>
                      <td>{tecnicoNome(agendamento.tecnicoId)}</td>
                      <td>
                        <Badge tone={statusTone(agendamento.status)}>
                          {statusLabel(agendamento.status)}
                        </Badge>
                      </td>
                      <td className="schedule-row-actions">
                        {agendamento.status === "agendado" && (
                          <button
                            type="button"
                            className="schedule-icon-action schedule-icon-action-danger"
                            aria-label={`Cancelar agendamento de ${clienteNome(agendamento.clienteId)}`}
                            title="Cancelar agendamento"
                            onClick={() => cancelar(agendamento)}
                          >
                            <Icon name="trash" size={15} />
                            <span className="schedule-visually-hidden">Cancelar</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}