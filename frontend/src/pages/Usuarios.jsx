import React, { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import {
  Field,
  TextInput,
  Select,
  Badge,
  EmptyState,
  ErrorBanner,
} from "../components/FormControls.jsx";
import "./clients-users.css";

const FORM_VAZIO = {
  nome: "",
  cpf: "",
  email: "",
  telefone: "",
  perfil: "atendente",
  senha: "",
};

const PERFIL_LABEL = {
  ceo: "CEO",
  atendente: "Atendente",
  estoquista: "Estoquista",
  tecnico: "Técnico",
};

function somenteDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function displayValue(value) {
  return String(value ?? "").trim() || "—";
}

function usuarioAtivo(usuario) {
  if (usuario.ativo === true || usuario.ativo === 1 || usuario.ativo === "1") {
    return true;
  }
  if (usuario.ativo === false || usuario.ativo === 0 || usuario.ativo === "0") {
    return false;
  }
  const status = normalize(usuario.status);
  if (status === "ativo") return true;
  if (status === "inativo") return false;
  return false;
}

function statusOperacional(usuario) {
  const value =
    usuario.statusOperacional ??
    usuario.status_operacional ??
    usuario.statusEquipe;
  if (value) return String(value);
  return usuarioAtivo(usuario) ? "Ativo" : "Inativo";
}

function formatLastAccess(usuario) {
  const value =
    usuario.ultimoAcesso ??
    usuario.ultimo_acesso ??
    usuario.lastAccess ??
    usuario.last_access;
  if (!value) return "—";
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(value);
  }

  const text = String(value);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function initials(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function perfilTone(perfil) {
  if (perfil === "tecnico") return "blue";
  if (perfil === "ceo") return "amber";
  if (perfil === "atendente") return "green";
  return "grey";
}

function statusTone(status) {
  const value = normalize(status);
  if (value.includes("inativ")) return "red";
  if (value.includes("ferias") || value.includes("afast")) return "amber";
  if (value.includes("campo") || value.includes("rota")) return "blue";
  return "green";
}

function dialogKeyDown(event, dialog, onClose) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      document.activeElement === dialog ||
      !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last ||
      document.activeElement === dialog ||
      !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
}

function UserDetails({ usuario, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const returnFocusTo = document.activeElement;
    const initialFocus = dialogRef.current?.querySelector("[data-dialog-initial-focus]");
    initialFocus?.focus();

    return () => {
      if (returnFocusTo?.isConnected && typeof returnFocusTo.focus === "function") {
        returnFocusTo.focus();
      }
    };
  }, []);

  if (!usuario) return null;

  return (
    <div
      className="cu-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="cu-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cu-user-details-title"
        tabIndex="-1"
        onKeyDown={(event) => dialogKeyDown(event, dialogRef.current, onClose)}
      >
        <div className="cu-dialog-heading">
          <div className="cu-dialog-user">
            <span className="cu-avatar">{initials(usuario.nome) || "?"}</span>
            <div>
              <span className="cu-eyebrow">ACESSO DA EQUIPE</span>
              <h2 id="cu-user-details-title">{displayValue(usuario.nome)}</h2>
            </div>
          </div>
          <button
            type="button"
            className="cu-dialog-close"
            data-dialog-initial-focus
            aria-label="Fechar detalhes"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <dl className="cu-detail-grid">
          <div><dt>E-mail</dt><dd>{displayValue(usuario.email)}</dd></div>
          <div><dt>Telefone</dt><dd>{displayValue(usuario.telefone)}</dd></div>
          <div><dt>CPF</dt><dd>{displayValue(usuario.cpf)}</dd></div>
          <div><dt>Perfil</dt><dd>{PERFIL_LABEL[usuario.perfil] || displayValue(usuario.perfil)}</dd></div>
          <div><dt>Status operacional</dt><dd>{statusOperacional(usuario)}</dd></div>
          <div><dt>Último acesso</dt><dd>{formatLastAccess(usuario)}</dd></div>
        </dl>
      </section>
    </div>
  );
}

export default function Usuarios({ crud, onBack }) {
  const {
    items = [],
    loading,
    error,
    add,
    update,
    remove,
    action,
  } = crud;

  const [form, setForm] = useState(FORM_VAZIO);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);

  const teamSummary = {
    total: items.length,
    active: items.filter(usuarioAtivo).length,
    technicians: items.filter((usuario) => usuario.perfil === "tecnico").length,
  };

  function iniciarNovo() {
    setForm(FORM_VAZIO);
    setEditingId(null);
    setErrors({});
    setShowForm(true);
  }

  function iniciarEdicao(usuario) {
    setForm({
      nome: usuario.nome || "",
      cpf: usuario.cpf || "",
      email: usuario.email || "",
      telefone: usuario.telefone || "",
      perfil: usuario.perfil || "atendente",
      senha: "",
    });

    setEditingId(usuario.id);
    setErrors({});
    setShowForm(true);
    setSelectedUser(null);
  }

  function validar() {
    const novosErros = {};

    if (!form.nome.trim()) {
      novosErros.nome = "Informe o nome.";
    }

    if (!editingId && !form.cpf.trim()) {
      novosErros.cpf = "Informe o CPF.";
    } else if (
      !editingId &&
      somenteDigitos(form.cpf).length !== 11
    ) {
      novosErros.cpf = "CPF deve possuir 11 dígitos.";
    }

    if (!form.email.trim()) {
      novosErros.email = "Informe o e-mail.";
    } else if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      novosErros.email = "E-mail inválido.";
    }

    if (!form.telefone.trim()) {
      novosErros.telefone = "Informe o telefone.";
    }

    const emailDuplicado = items.some(
      (usuario) =>
        usuario.email?.toLowerCase() === form.email.trim().toLowerCase() &&
        usuario.id !== editingId,
    );

    if (!novosErros.email && emailDuplicado) {
      novosErros.email = "Já existe um usuário com este e-mail.";
    }

    if (!editingId || form.senha) {
      if (form.senha.length < 6) {
        novosErros.senha = "A senha deve possuir no mínimo 6 caracteres.";
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
      if (editingId) {
        const dados = {
          nome: form.nome,
          telefone: form.telefone,
          perfil: form.perfil,
        };

        if (form.senha) dados.senha = form.senha;
        await update(editingId, dados);
      } else {
        await add({
          nome: form.nome,
          cpf: form.cpf,
          email: form.email,
          telefone: form.telefone,
          perfil: form.perfil,
          senha: form.senha,
        });
      }

      setShowForm(false);
      setForm(FORM_VAZIO);
      setEditingId(null);
      setBanner("");
    } catch (saveError) {
      setBanner(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function alternarStatus(usuario) {
    try {
      await action(usuario.id, "/status");
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  async function remover(usuario) {
    const confirmado = window.confirm(
      `Remover o usuário "${usuario.nome}"?`,
    );
    if (!confirmado) return;

    try {
      await remove(usuario.id);
      setSelectedUser(null);
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  const filteredUsers = items.filter((usuario) => {
    const searchable = normalize([
      usuario.nome,
      usuario.email,
      usuario.cpf,
      usuario.telefone,
      usuario.perfil,
      statusOperacional(usuario),
    ].join(" "));
    const isActive = usuarioAtivo(usuario);
    const matchesSearch =
      !normalize(searchTerm) || searchable.includes(normalize(searchTerm));
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "inactive" && !isActive);
    const matchesProfile =
      profileFilter === "all" || usuario.perfil === profileFilter;
    return matchesSearch && matchesStatus && matchesProfile;
  });

  const hasFilters =
    Boolean(searchTerm.trim()) ||
    profileFilter !== "all" ||
    statusFilter !== "all";

  function clearFilters() {
    setSearchTerm("");
    setProfileFilter("all");
    setStatusFilter("all");
  }

  return (
    <Layout
      title="Usuários e técnicos"
      subtitle="Controle acessos, perfis e disponibilidade da equipe."
      onBack={onBack}
      action={
        <button
          type="button"
          className="cu-primary-action"
          onClick={iniciarNovo}
        >
          <Icon name="plus" size={16} />
          Convidar usuário
        </button>
      }
    >
      <div className="cu-module cu-users">
        <ErrorBanner
          message={error || banner}
          onClose={() => setBanner("")}
        />

        {!loading && !error && (
          <section className="cu-summary-grid" aria-label="Resumo da equipe">
            <article className="cu-summary-card">
              <span>Usuários cadastrados</span>
              <strong>{teamSummary.total}</strong>
              <small>Perfis de acesso</small>
            </article>
            <article className="cu-summary-card cu-summary-green">
              <span>Acessos ativos</span>
              <strong>{teamSummary.active}</strong>
              <small>Usuários habilitados</small>
            </article>
            <article className="cu-summary-card cu-summary-blue">
              <span>Técnicos</span>
              <strong>{teamSummary.technicians}</strong>
              <small>Equipe cadastrada</small>
            </article>
          </section>
        )}

        {showForm && (
          <form className="form-card cu-form-card" onSubmit={salvar}>
            <div className="cu-form-heading">
              <div>
                <span className="cu-eyebrow">USUÁRIOS E TÉCNICOS</span>
                <h2>{editingId ? "Editar usuário" : "Convidar usuário"}</h2>
              </div>
              <button
                type="button"
                className="cu-dialog-close"
                aria-label="Fechar formulário"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <Field label="Nome" error={errors.nome}>
                <TextInput
                  value={form.nome}
                  onChange={(event) =>
                    setForm({ ...form, nome: event.target.value })
                  }
                  placeholder="Nome completo"
                />
              </Field>
              <Field label="CPF" error={errors.cpf}>
                <TextInput
                  value={form.cpf}
                  onChange={(event) =>
                    setForm({ ...form, cpf: event.target.value })
                  }
                  placeholder="000.000.000-00"
                  disabled={Boolean(editingId)}
                />
              </Field>
              <Field label="E-mail" error={errors.email}>
                <TextInput
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="nome@empresa.com"
                  disabled={Boolean(editingId)}
                />
              </Field>
              <Field label="Telefone" error={errors.telefone}>
                <TextInput
                  value={form.telefone}
                  onChange={(event) =>
                    setForm({ ...form, telefone: event.target.value })
                  }
                  placeholder="(00) 00000-0000"
                />
              </Field>
              <Field label="Perfil de acesso">
                <Select
                  value={form.perfil}
                  onChange={(event) =>
                    setForm({ ...form, perfil: event.target.value })
                  }
                >
                  <option value="ceo">CEO</option>
                  <option value="atendente">Atendente</option>
                  <option value="estoquista">Estoquista</option>
                  <option value="tecnico">Técnico</option>
                </Select>
              </Field>
              <Field
                label={editingId ? "Redefinir senha (opcional)" : "Senha inicial"}
                error={errors.senha}
              >
                <TextInput
                  type="password"
                  value={form.senha}
                  onChange={(event) =>
                    setForm({ ...form, senha: event.target.value })
                  }
                  placeholder="Mínimo 6 caracteres"
                />
              </Field>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}

        <div className="cu-toolbar">
          <label className="cu-search">
            <Icon name="search" size={16} />
            <span className="cu-visually-hidden">Buscar usuários</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar usuário ou e-mail..."
            />
          </label>
          <select
            className="cu-status-select"
            value={profileFilter}
            onChange={(event) => setProfileFilter(event.target.value)}
            aria-label="Filtrar usuários por perfil"
          >
            <option value="all">Todos os perfis</option>
            {Object.entries(PERFIL_LABEL).map(([profile, label]) => (
              <option key={profile} value={profile}>{label}</option>
            ))}
          </select>
          <select
            className="cu-status-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar usuários por status"
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          <button
            type="button"
            className="cu-filter-button"
            onClick={clearFilters}
            disabled={!hasFilters}
            aria-label="Limpar busca e filtros"
            title={hasFilters ? "Limpar busca e filtros" : "Filtros"}
          >
            <Icon name="filter" size={15} />
            Filtros
          </button>
        </div>

        {loading ? (
          <div className="cu-empty-panel">
            <EmptyState text="Carregando usuários..." />
          </div>
        ) : items.length === 0 ? (
          <div className="cu-empty-panel">
            <EmptyState text="Nenhum usuário cadastrado ainda." />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="cu-empty-panel">
            <EmptyState text="Nenhum usuário corresponde à busca ou aos filtros." />
          </div>
        ) : (
          <div className="cu-table-frame">
            <table className="cu-table cu-user-table">
              <thead>
                <tr>
                  <th scope="col">Usuário</th>
                  <th scope="col">Perfil</th>
                  <th scope="col">Status operacional</th>
                  <th scope="col">Último acesso</th>
                  <th scope="col"><span className="cu-visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((usuario) => {
                  const isActive = usuarioAtivo(usuario);
                  const operationalStatus = statusOperacional(usuario);
                  const profileLabel =
                    PERFIL_LABEL[usuario.perfil] || displayValue(usuario.perfil);
                  return (
                    <tr key={usuario.id}>
                      <td>
                        <div className="cu-user-cell">
                          <span className="cu-avatar" aria-hidden="true">
                            {initials(usuario.nome) || "?"}
                          </span>
                          <span className="cu-user-copy">
                            <strong className="cu-primary-text">
                              {displayValue(usuario.nome)}
                            </strong>
                            <small className="cu-secondary-text">
                              {displayValue(usuario.email)}
                            </small>
                            <small className="cu-contact-subtext">
                              Telefone · {displayValue(usuario.telefone)}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={perfilTone(usuario.perfil)}>
                          {profileLabel}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={statusTone(operationalStatus)}>
                          {displayValue(operationalStatus)}
                        </Badge>
                      </td>
                      <td>{formatLastAccess(usuario)}</td>
                      <td className="cu-action-cell">
                        <div className="cu-row-actions">
                          <button
                            type="button"
                            className="cu-icon-button"
                            onClick={() => setSelectedUser(usuario)}
                            aria-label={`Ver detalhes de ${usuario.nome}`}
                            title="Ver detalhes"
                          >
                            <Icon name="eye" size={15} />
                          </button>
                          <button
                            type="button"
                            className="cu-icon-button"
                            onClick={() => iniciarEdicao(usuario)}
                            aria-label={`Editar ${usuario.nome}`}
                            title="Editar"
                          >
                            <Icon name="pencil" size={15} />
                          </button>
                          <button
                            type="button"
                            className="cu-inline-action"
                            onClick={() => alternarStatus(usuario)}
                            aria-label={`${isActive ? "Inativar" : "Ativar"} ${usuario.nome}`}
                          >
                            {isActive ? "Inativar" : "Ativar"}
                          </button>
                          <button
                            type="button"
                            className="cu-inline-action cu-inline-danger"
                            onClick={() => remover(usuario)}
                            aria-label={`Remover ${usuario.nome}`}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedUser && (
        <UserDetails
          usuario={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </Layout>
  );
}