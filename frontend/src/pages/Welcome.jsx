import React from "react";

import { useAuth } from "../AuthContext.jsx";
import Icon from "../components/Icon.jsx";

function items(resource) {
  return Array.isArray(resource?.items) ? resource.items : [];
}

function dateKey(value) {
  if (!value) return "";
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatToday() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function statusLabel(value) {
  if (!value) return "Agendado";
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(value) {
  const status = String(value || "").toLowerCase();
  if (status.includes("cancel") || status.includes("atras")) return "red";
  if (status.includes("aguard")) return "warn";
  if (status.includes("andamento") || status.includes("rota")) return "info";
  return "success";
}

function count(resource, value) {
  return resource?.loading || resource?.error ? "—" : value;
}

function StatCard({ label, value, detail, tone = "default" }) {
  return (
    <article className={`dashboard-stat dashboard-stat-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span className={tone === "warning" ? "dashboard-stat-warning" : ""}>
        {detail}
      </span>
    </article>
  );
}

export default function Welcome({
  onNavigate,
  onCreateAppointment,
  clientes,
  agendamentos,
  ordensServico,
  estoque,
  servicos,
  usuarios,
}) {
  const { user } = useAuth();
  const profile = user?.perfil;
  const canAgenda = ["ceo", "atendente", "tecnico"].includes(profile);
  const canCreateAppointment = ["ceo", "atendente"].includes(profile);
  const canClients = ["ceo", "atendente"].includes(profile);
  const canStock = ["ceo", "estoquista"].includes(profile);

  const clientItems = items(clientes);
  const appointmentItems = items(agendamentos);
  const orderItems = items(ordensServico);
  const stockItems = items(estoque);
  const serviceItems = items(servicos);
  const userItems = items(usuarios);
  const today = dateKey(new Date());
  const appointmentsToday = appointmentItems
    .filter((appointment) => dateKey(appointment.data) === today)
    .sort((a, b) =>
      String(a.hora || "").localeCompare(String(b.hora || "")),
    );
  const openOrders = orderItems.filter((order) =>
    ["aberta", "andamento"].includes(order.status),
  ).length;
  const inProgressOrders = orderItems.filter(
    (order) => order.status === "andamento",
  ).length;
  const criticalStock = stockItems.filter(
    (product) =>
      Number(product.saldo) <
      Number(product.quantidadeMinima ?? product.quantidade_minima ?? 0),
  ).length;
  const activeClients = clientItems.filter(
    (client) => client.status === "ativo",
  ).length;

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const appointmentsThisWeek = appointmentItems.filter((appointment) => {
    const date = dateKey(appointment.data);
    return date >= dateKey(weekStart) && date <= dateKey(weekEnd);
  }).length;

  const stats = [
    ...(canAgenda
      ? [
          {
            label: "Atendimentos hoje",
            value: count(agendamentos, appointmentsToday.length),
            detail: agendamentos.error
              ? "Não foi possível carregar"
              : "Agendados para hoje",
          },
          {
            label: "Ordens em andamento",
            value: count(ordensServico, inProgressOrders),
            detail: ordensServico.error
              ? "Não foi possível carregar"
              : `${openOrders} abertas ou em andamento`,
          },
        ]
      : []),
    ...(profile === "ceo"
      ? [
          {
            label: "Faturamento no mês",
            value: "—",
            detail: "Ainda não disponível na API",
          },
        ]
      : []),
    ...(canStock
      ? [
          {
            label: "Estoque crítico",
            value: count(estoque, criticalStock),
            detail: estoque.error
              ? "Não foi possível carregar"
              : criticalStock
                ? "Repor itens"
                : "Nenhum item crítico",
            tone: criticalStock ? "warning" : "default",
          },
        ]
      : []),
    ...(canClients && profile !== "ceo"
      ? [
          {
            label: "Clientes ativos",
            value: count(clientes, activeClients),
            detail: "Cadastrados no sistema",
          },
        ]
      : []),
    ...(profile === "estoquista"
      ? [
          {
            label: "Produtos cadastrados",
            value: count(estoque, stockItems.length),
            detail: "Itens no estoque",
          },
        ]
      : []),
  ];

  const quickLinks = [
    {
      key: "clientes",
      title: "Clientes",
      icon: "users",
      detail: count(clientes, `${activeClients} ativos`),
      roles: ["ceo", "atendente"],
    },
    {
      key: "agendamentos",
      title: "Agendamentos",
      icon: "calendar",
      detail: count(agendamentos, `${appointmentsThisWeek} esta semana`),
      roles: ["ceo", "atendente", "tecnico"],
    },
    {
      key: "ordens",
      title: "Ordens de serviço",
      icon: "clipboard",
      detail: count(ordensServico, `${openOrders} abertas`),
      roles: ["ceo", "atendente", "tecnico"],
    },
    {
      key: "estoque",
      title: "Estoque",
      icon: "package",
      detail: count(estoque, `${criticalStock} itens críticos`),
      roles: ["ceo", "estoquista"],
    },
    {
      key: "servicos",
      title: "Catálogo de serviços",
      icon: "wrench",
      detail: count(servicos, `${serviceItems.length} serviços`),
      roles: ["ceo", "atendente"],
    },
    {
      key: "usuarios",
      title: "Usuários",
      icon: "userSettings",
      detail: count(usuarios, `${userItems.length} cadastrados`),
      roles: ["ceo"],
    },
  ].filter((link) => link.roles.includes(profile));

  function clientName(appointment) {
    return (
      clientItems.find((client) => client.id === appointment.clienteId)?.nome ||
      appointment.cliente?.nome ||
      appointment.clienteNome ||
      (appointment.clienteId
        ? `Cliente #${appointment.clienteId}`
        : "Cliente não informado")
    );
  }

  function technicianName(appointment) {
    return (
      userItems.find((item) => item.id === appointment.tecnicoId)?.nome ||
      appointment.tecnico?.nome ||
      appointment.tecnicoNome ||
      (appointment.tecnicoId
        ? `Técnico #${appointment.tecnicoId}`
        : "Técnico não informado")
    );
  }

  return (
    <div className="dashboard-view">
      <header className="dashboard-heading">
        <div>
          <h1>
            Bom dia, {user?.nome?.trim().split(/\s+/)[0] || "equipe"}
            <span className="dashboard-period">.</span>
          </h1>
          <p>{formatToday()} · sua operação em um relance</p>
        </div>
        {canCreateAppointment && (
          <button
            type="button"
            className="dashboard-primary-action"
            onClick={onCreateAppointment}
          >
            <Icon name="plus" size={16} />
            Novo atendimento
          </button>
        )}
      </header>

      <section className="dashboard-stats" aria-label="Indicadores">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <div className="dashboard-panels">
        {canAgenda && (
          <section className="dashboard-panel dashboard-agenda">
            <div className="dashboard-panel-heading">
              <h2>Agenda de hoje</h2>
              <button
                type="button"
                className="dashboard-text-action"
                onClick={() => onNavigate("agendamentos")}
              >
                Ver agenda <Icon name="arrow" size={14} />
              </button>
            </div>
            {agendamentos.loading ? (
              <p className="dashboard-panel-state">Carregando agenda...</p>
            ) : agendamentos.error ? (
              <p className="dashboard-panel-state" role="alert">
                Não foi possível carregar a agenda.
              </p>
            ) : appointmentsToday.length ? (
              <div className="dashboard-appointment-list">
                {appointmentsToday.slice(0, 5).map((appointment) => (
                  <div
                    className="dashboard-appointment"
                    key={appointment.id ?? `${appointment.data}-${appointment.hora}`}
                  >
                    <div className="dashboard-appointment-copy">
                      <strong>
                        {String(appointment.hora || "").slice(0, 5) || "—"}
                        {" · "}
                        {appointment.titulo ||
                          appointment.descricao ||
                          "Atendimento agendado"}
                      </strong>
                      <small>
                        {clientName(appointment)} · {technicianName(appointment)}
                      </small>
                    </div>
                    <span
                      className={`dashboard-status dashboard-status-${statusTone(appointment.status)}`}
                    >
                      {statusLabel(appointment.status)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">
                <Icon name="calendar" size={22} />
                <strong>Nenhum atendimento para hoje</strong>
                <span>Os agendamentos do dia aparecerão aqui.</span>
              </div>
            )}
          </section>
        )}

        <section className="dashboard-panel dashboard-quick-panel">
          <div className="dashboard-panel-heading">
            <h2>Acesso rápido</h2>
          </div>
          <div className="dashboard-quick-links">
            {quickLinks.map((link) => (
              <button
                type="button"
                className="dashboard-quick-link"
                key={link.key}
                onClick={() => onNavigate(link.key)}
              >
                <span className="dashboard-quick-icon">
                  <Icon name={link.icon} size={17} />
                </span>
                <span className="dashboard-quick-copy">
                  <strong>{link.title}</strong>
                  <small>{link.detail}</small>
                </span>
                <Icon name="arrow" size={15} className="dashboard-quick-arrow" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}