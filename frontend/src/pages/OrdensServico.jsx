import React, { useState } from "react";

import { useAuth } from "../AuthContext.jsx";
import { Badge, EmptyState, ErrorBanner, Field, Select } from "../components/FormControls.jsx";
import Icon from "../components/Icon.jsx";
import Layout from "../components/Layout.jsx";
import "./scheduling-orders.css";

const STATUS_FLOW = ["aberta", "andamento", "concluida"];
const STATUS_LABEL = {
  aberta: "Aberta",
  andamento: "Em andamento",
  concluida: "Concluída",
};

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function statusLabel(status) {
  if (!status) return "Não informado";
  const key = String(status).toLowerCase();
  return STATUS_LABEL[key] || key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status) {
  if (status === "concluida") return "green";
  if (status === "andamento") return "blue";
  return "amber";
}

function osCode(id) {
  const value = String(id ?? "");
  return /^os-/i.test(value) ? value : `OS-${value}`;
}

function dateForOrder(order, appointment) {
  return appointment?.data || order.data || order.createdAt || "";
}

export default function OrdensServico({
  crud,
  agendamentos,
  clientes,
  usuarios,
  tecnicos,
  servicos,
  onBack,
}) {
  const { user } = useAuth();
  const isTecnico = user?.perfil === "tecnico";
  const {
    items = [],
    loading,
    error,
    add,
    update,
    remove,
    action,
  } = crud;
  const podeExcluir = user?.perfil === "ceo";
  const appointmentItems = agendamentos?.items || [];
  const clientItems = clientes?.items || [];
  const userItems = usuarios?.items || [];
  const technicianItems = tecnicos?.items ?? userItems;
  const serviceItems = servicos?.items || [];

  const [agendamentoId, setAgendamentoId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function clienteNome(id) {
    return clientItems.find((cliente) => cliente.id === id)?.nome ?? `Cliente #${id}`;
  }

  function tecnicoNome(id) {
    return technicianItems.find((usuario) => usuario.id === id)?.nome ??
      userItems.find((usuario) => usuario.id === id)?.nome ??
      (user?.id === id ? user.nome : `Técnico #${id}`);
  }

  function servicoNome(id) {
    return serviceItems.find((servico) => servico.id === id)?.nome ?? "—";
  }

  function agendamentoLabel(appointment) {
    return `${clienteNome(appointment.clienteId)} · ${tecnicoNome(appointment.tecnicoId)} · ${formatDate(appointment.data)} ${appointment.hora?.slice(0, 5) || ""}`;
  }

  const agendamentosDisponiveis = appointmentItems.filter(
    (appointment) =>
      appointment.status === "agendado" &&
      (appointment.id === Number(agendamentoId) ||
        !items.some((order) => order.agendamentoId === appointment.id)),
  );

  function startNew() {
    if (agendamentosDisponiveis.length === 0) {
      setBanner("Não há agendamentos confirmados disponíveis para gerar uma nova ordem de serviço.");
      return;
    }
    setEditingId(null);
    setAgendamentoId("");
    setServicoId("");
    setFormError("");
    setShowForm(true);
    setBanner("");
  }

  function startEdit(order) {
    setEditingId(order.id);
    setAgendamentoId(String(order.agendamentoId));
    setServicoId(String(order.servicoId));
    setFormError("");
    setShowForm(true);
    setBanner("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!agendamentoId || !servicoId) {
      setFormError("Selecione um agendamento e um serviço.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        agendamentoId: Number(agendamentoId),
        servicoId: Number(servicoId),
      };
      if (editingId) {
        await update(editingId, payload);
      } else {
        await add(payload);
      }
      setShowForm(false);
      setEditingId(null);
      setBanner("");
    } catch (saveError) {
      setBanner(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function avancarStatus(order) {
    try {
      await action(order.id, "/avancar");
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  async function removerOrdem(order) {
    if (!window.confirm(`Excluir a ordem ${osCode(order.id)}? Esta ação não pode ser desfeita.`)) {
      return;
    }
    try {
      await remove(order.id);
      setBanner("");
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  const statusOptions = [...new Set(items.map((item) => item.status).filter(Boolean))];
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredItems = items
    .slice()
    .sort((a, b) => String(b.id ?? "").localeCompare(String(a.id ?? ""), undefined, { numeric: true }))
    .filter((order) => {
      const appointment = appointmentItems.find((item) => item.id === order.agendamentoId);
      const date = String(dateForOrder(order, appointment)).slice(0, 10);
      if (statusFilter && order.status !== statusFilter) return false;
      if (dateFrom && (!date || date < dateFrom)) return false;
      if (dateTo && (!date || date > dateTo)) return false;
      if (!normalizedSearch) return true;
      const searchable = [
        osCode(order.id),
        clienteNome(appointment?.clienteId),
        tecnicoNome(appointment?.tecnicoId),
        servicoNome(order.servicoId),
        date,
        appointment?.hora,
        statusLabel(order.status),
      ].join(" ").toLocaleLowerCase("pt-BR");
      return searchable.includes(normalizedSearch);
    });

  const stats = [
    {
      label: "Total de ordens",
      value: items.length,
      detail: "Registros no sistema",
      tone: "blue",
    },
    {
      label: "Abertas",
      value: items.filter((order) => order.status === "aberta").length,
      detail: "Aguardando atendimento",
      tone: "orange",
    },
    {
      label: "Em andamento",
      value: items.filter((order) => order.status === "andamento").length,
      detail: "Em execução",
      tone: "purple",
    },
    {
      label: "Concluídas",
      value: items.filter((order) => order.status === "concluida").length,
      detail: "Atendimentos finalizados",
      tone: "teal",
    },
  ];

  function limparFiltros() {
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  return (
    <Layout
      title="Ordens de serviço"
      subtitle="Acompanhe o atendimento desde a abertura até a conclusão."
      onBack={onBack}
      action={!isTecnico && (
        <button
          type="button"
          className="schedule-primary-action"
          onClick={startNew}
        >
          <Icon name="plus" size={16} />
          Abrir nova OS
        </button>
      )}
    >
      <div className="scheduling-orders-screen orders-screen">
        <ErrorBanner message={error || tecnicos?.error || banner} onClose={() => setBanner("")} />

        <section className="orders-summary-grid" aria-label="Resumo das ordens de serviço">
          {stats.map((stat) => (
            <article className={`orders-summary-card orders-summary-${stat.tone}`} key={stat.label}>
              <span className="orders-summary-label">{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </section>

        {showForm && !isTecnico && (
          <form className="form-card schedule-form" onSubmit={handleSubmit}>
            <div className="schedule-form-heading">
              <div>
                <span className="schedule-eyebrow">{editingId ? "EDITAR REGISTRO" : "NOVO REGISTRO"}</span>
                <h2>{editingId ? "Editar ordem de serviço" : "Nova ordem de serviço"}</h2>
              </div>
              <button
                type="button"
                className="schedule-close-form"
                aria-label="Fechar formulário"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <Field label="Agendamento confirmado" error={formError}>
                <Select value={agendamentoId} onChange={(event) => setAgendamentoId(event.target.value)}>
                  <option value="">Selecione o agendamento...</option>
                  {agendamentosDisponiveis.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {agendamentoLabel(appointment)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Serviço" error={formError}>
                <Select value={servicoId} onChange={(event) => setServicoId(event.target.value)}>
                  <option value="">Selecione o serviço...</option>
                  {serviceItems.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.nome} — R$ {Number(service.valor).toFixed(2)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Gerar ordem"}
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
              placeholder="Buscar OS, cliente ou técnico..."
              aria-label="Buscar ordens por número, cliente ou técnico"
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
          <EmptyState text="Carregando ordens de serviço..." />
        ) : items.length === 0 ? (
          <EmptyState text="Nenhuma ordem de serviço cadastrada ainda." />
        ) : filteredItems.length === 0 ? (
          <EmptyState text="Nenhuma ordem corresponde aos filtros aplicados." />
        ) : (
          <div className="schedule-table-card">
            <div className="schedule-table-scroll">
              <table className="schedule-data-table schedule-orders-table">
                <thead>
                  <tr>
                    <th>OS</th>
                    <th>Cliente</th>
                    <th>Serviço</th>
                    <th>Técnico</th>
                    <th>Agendamento</th>
                    <th>Status</th>
                    <th><span className="schedule-visually-hidden">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((order) => {
                    const appointment = appointmentItems.find(
                      (item) => item.id === order.agendamentoId,
                    );
                    const nextStatusIndex = STATUS_FLOW.indexOf(order.status) + 1;
                    const nextStatus = STATUS_FLOW[nextStatusIndex];
                    const date = dateForOrder(order, appointment);

                    return (
                      <tr key={order.id}>
                        <td className="schedule-code-cell">{osCode(order.id)}</td>
                        <td className="schedule-strong-cell">
                          {appointment ? clienteNome(appointment.clienteId) : "—"}
                        </td>
                        <td>{servicoNome(order.servicoId)}</td>
                        <td>{appointment ? tecnicoNome(appointment.tecnicoId) : "—"}</td>
                        <td>
                          {date
                            ? `${formatDate(date)}${appointment?.hora ? ` · ${appointment.hora.slice(0, 5)}` : ""}`
                            : "—"}
                        </td>
                        <td>
                          <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                        </td>
                        <td className="schedule-row-actions">
                          {nextStatus && (
                            <button
                              type="button"
                              className="schedule-icon-action"
                              aria-label={`Avançar para ${statusLabel(nextStatus)}`}
                              title={`Avançar para ${statusLabel(nextStatus)}`}
                              onClick={() => avancarStatus(order)}
                            >
                              <Icon name="arrow" size={16} />
                              <span className="schedule-visually-hidden">
                                Avançar para {statusLabel(nextStatus)}
                              </span>
                            </button>
                          )}
                          {!isTecnico && order.status === "aberta" && (
                            <button
                              type="button"
                              className="schedule-icon-action"
                              aria-label={`Editar ${osCode(order.id)}`}
                              title="Editar ordem de serviço"
                              onClick={() => startEdit(order)}
                            >
                              <Icon name="pencil" size={16} />
                              <span className="schedule-visually-hidden">Editar {osCode(order.id)}</span>
                            </button>
                          )}
                          {podeExcluir && order.status !== "concluida" && (
                            <button
                              type="button"
                              className="schedule-icon-action schedule-icon-action-danger"
                              aria-label={`Excluir ${osCode(order.id)}`}
                              title="Excluir ordem de serviço"
                              onClick={() => removerOrdem(order)}
                            >
                              <Icon name="trash" size={16} />
                              <span className="schedule-visually-hidden">Excluir {osCode(order.id)}</span>
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
  );
}