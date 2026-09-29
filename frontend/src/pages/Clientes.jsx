import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
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
  telefone: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  tipoResidencia: "casa",
};

const TIPO_RESIDENCIA_LABEL = {
  casa: "Casa",
  apartamento: "Apartamento",
  barracao: "Barracão",
};

function somenteDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function displayValue(value) {
  return String(value ?? "").trim() || "—";
}

function formatCpf(cpf) {
  const digits = somenteDigitos(cpf);
  if (digits.length !== 11) return displayValue(cpf);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCep(cep) {
  const digits = somenteDigitos(cep);
  if (digits.length !== 8) return displayValue(cep);
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function enderecoResumo(cliente) {
  const partes = [
    [cliente.logradouro, cliente.numero].filter(Boolean).join(", "),
    cliente.bairro,
    cliente.cidade && cliente.estado
      ? `${cliente.cidade}/${cliente.estado}`
      : cliente.cidade || cliente.estado,
  ].filter(Boolean);
  return partes.join(" · ") || "—";
}

function clienteAtivo(cliente) {
  return normalize(cliente.status) === "ativo";
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

function ClientDetails({ cliente, onClose }) {
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

  if (!cliente) return null;

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
        aria-labelledby="cu-client-details-title"
        tabIndex="-1"
        onKeyDown={(event) => dialogKeyDown(event, dialogRef.current, onClose)}
      >
        <div className="cu-dialog-heading">
          <div className="cu-dialog-user">
            <span className="cu-avatar">{initials(cliente.nome) || "?"}</span>
            <div>
              <span className="cu-eyebrow">CLIENTE CADASTRADO</span>
              <h2 id="cu-client-details-title">{displayValue(cliente.nome)}</h2>
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
          <div><dt>CPF</dt><dd>{formatCpf(cliente.cpf)}</dd></div>
          <div><dt>Telefone</dt><dd>{displayValue(cliente.telefone)}</dd></div>
          <div><dt>CEP</dt><dd>{formatCep(cliente.cep)}</dd></div>
          <div><dt>Tipo de residência</dt><dd>{TIPO_RESIDENCIA_LABEL[cliente.tipoResidencia] || displayValue(cliente.tipoResidencia)}</dd></div>
          <div className="cu-detail-wide">
            <dt>Endereço</dt>
            <dd>
              {displayValue(cliente.logradouro)}, {displayValue(cliente.numero)}
              {cliente.complemento ? ` · ${cliente.complemento}` : ""}
              <br />
              {displayValue(cliente.bairro)} · {displayValue(cliente.cidade)}/{displayValue(cliente.estado)}
            </dd>
          </div>
          <div><dt>Status</dt><dd>{clienteAtivo(cliente) ? "Ativo" : "Inativo"}</dd></div>
        </dl>
      </section>
    </div>
  );
}

export default function Clientes({ crud, onBack }) {
  const { user } = useAuth();
  const podeExcluir = user?.perfil === "ceo";
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedClient, setSelectedClient] = useState(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const summary = {
    total: items.length,
    active: items.filter(clienteAtivo).length,
    inactive: items.filter((cliente) => !clienteAtivo(cliente)).length,
  };

  function iniciarNovo() {
    setForm(FORM_VAZIO);
    setEditingId(null);
    setErrors({});
    setShowForm(true);
  }

  function iniciarEdicao(cliente) {
    setForm({
      nome: cliente.nome || "",
      cpf: cliente.cpf || "",
      telefone: cliente.telefone || "",
      cep: cliente.cep || "",
      logradouro: cliente.logradouro || "",
      numero: cliente.numero || "",
      complemento: cliente.complemento || "",
      bairro: cliente.bairro || "",
      cidade: cliente.cidade || "",
      estado: cliente.estado || "",
      tipoResidencia: cliente.tipoResidencia || "casa",
    });
    setEditingId(cliente.id);
    setErrors({});
    setShowForm(true);
    setSelectedClient(null);
  }

  async function buscarCep(valor) {
    const digits = somenteDigitos(valor);
    if (digits.length !== 8) return;

    setBuscandoCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data.erro) return;

      setForm((current) => ({
        ...current,
        logradouro: data.logradouro || current.logradouro,
        bairro: data.bairro || current.bairro,
        cidade: data.localidade || current.cidade,
        estado: data.uf || current.estado,
      }));
    } catch {
      // Sem conexão com o serviço de CEP: o preenchimento continua manual.
    } finally {
      setBuscandoCep(false);
    }
  }

  function validar() {
    const novosErros = {};

    if (!form.nome.trim()) novosErros.nome = "Informe o nome.";

    if (!editingId) {
      if (!form.cpf.trim()) novosErros.cpf = "Informe o CPF.";
      else if (somenteDigitos(form.cpf).length !== 11) {
        novosErros.cpf = "CPF deve possuir 11 dígitos.";
      }
    }

    if (!form.telefone.trim()) novosErros.telefone = "Informe o telefone.";

    if (somenteDigitos(form.cep).length !== 8) {
      novosErros.cep = "CEP deve possuir 8 dígitos.";
    }
    if (!form.logradouro.trim()) novosErros.logradouro = "Informe o logradouro.";
    if (!form.numero.trim()) novosErros.numero = "Informe o número.";
    if (!form.bairro.trim()) novosErros.bairro = "Informe o bairro.";
    if (!form.cidade.trim()) novosErros.cidade = "Informe a cidade.";
    if (!/^[A-Za-z]{2}$/.test(form.estado.trim())) {
      novosErros.estado = "UF com 2 letras.";
    }

    if (!editingId && !novosErros.cpf) {
      const cpfDuplicado = items.some(
        (cliente) => somenteDigitos(cliente.cpf) === somenteDigitos(form.cpf),
      );
      if (cpfDuplicado) {
        novosErros.cpf = "Já existe um cliente cadastrado com este CPF.";
      }
    }

    setErrors(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function salvar(event) {
    event.preventDefault();
    if (!validar()) return;
    setSaving(true);

    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      cep: somenteDigitos(form.cep),
      logradouro: form.logradouro.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      estado: form.estado.trim().toUpperCase(),
      tipoResidencia: form.tipoResidencia,
    };

    try {
      if (editingId) {
        await update(editingId, payload);
      } else {
        await add({ ...payload, cpf: somenteDigitos(form.cpf) });
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

  async function alternarStatus(cliente) {
    try {
      await action(cliente.id, "/status");
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  async function remover(cliente) {
    const confirmado = window.confirm(`Remover o cliente "${cliente.nome}"? Essa ação é definitiva.`);
    if (!confirmado) return;

    try {
      await remove(cliente.id);
      setSelectedClient(null);
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  const filteredClients = items.filter((cliente) => {
    const searchable = normalize(
      [
        cliente.nome,
        cliente.cpf,
        cliente.telefone,
        cliente.cidade,
        cliente.bairro,
        cliente.logradouro,
      ].join(" "),
    );
    const isActive = clienteAtivo(cliente);
    const matchesSearch = !normalize(searchTerm) || searchable.includes(normalize(searchTerm));
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "inactive" && !isActive);
    return matchesSearch && matchesStatus;
  });

  const hasFilters = Boolean(searchTerm.trim()) || statusFilter !== "all";

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("all");
  }

  return (
    <Layout
      title="Clientes"
      subtitle="Cadastre, edite e acompanhe o status dos clientes atendidos."
      onBack={onBack}
      action={
        <button type="button" className="cu-primary-action" onClick={iniciarNovo}>
          <Icon name="plus" size={16} />
          Novo cliente
        </button>
      }
    >
      <div className="cu-module cu-clients">
        <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

        {!loading && !error && (
          <section className="cu-summary-grid" aria-label="Resumo de clientes">
            <article className="cu-summary-card">
              <span>Clientes cadastrados</span>
              <strong>{summary.total}</strong>
              <small>Total na base</small>
            </article>
            <article className="cu-summary-card cu-summary-green">
              <span>Clientes ativos</span>
              <strong>{summary.active}</strong>
              <small>Podem ser agendados</small>
            </article>
            <article className="cu-summary-card cu-summary-blue">
              <span>Clientes inativos</span>
              <strong>{summary.inactive}</strong>
              <small>Sem novos agendamentos</small>
            </article>
          </section>
        )}

        {showForm && (
          <form className="form-card cu-form-card" onSubmit={salvar}>
            <div className="cu-form-heading">
              <div>
                <span className="cu-eyebrow">CLIENTES</span>
                <h2>{editingId ? "Editar cliente" : "Novo cliente"}</h2>
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
                  onChange={(event) => setForm({ ...form, nome: event.target.value })}
                  placeholder="Nome completo"
                />
              </Field>
              <Field label="CPF" error={errors.cpf}>
                <TextInput
                  value={form.cpf}
                  onChange={(event) => setForm({ ...form, cpf: event.target.value })}
                  placeholder="Somente números"
                  disabled={Boolean(editingId)}
                />
              </Field>
              <Field label="Telefone" error={errors.telefone}>
                <TextInput
                  value={form.telefone}
                  onChange={(event) => setForm({ ...form, telefone: event.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </Field>
              <Field label={buscandoCep ? "CEP (buscando...)" : "CEP"} error={errors.cep}>
                <TextInput
                  value={form.cep}
                  onChange={(event) => setForm({ ...form, cep: event.target.value })}
                  onBlur={(event) => buscarCep(event.target.value)}
                  placeholder="Somente números"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Logradouro" error={errors.logradouro}>
                <TextInput
                  value={form.logradouro}
                  onChange={(event) => setForm({ ...form, logradouro: event.target.value })}
                  placeholder="Rua, avenida..."
                />
              </Field>
              <Field label="Número" error={errors.numero}>
                <TextInput
                  value={form.numero}
                  onChange={(event) => setForm({ ...form, numero: event.target.value })}
                  placeholder="Nº"
                />
              </Field>
              <Field label="Complemento (opcional)">
                <TextInput
                  value={form.complemento}
                  onChange={(event) => setForm({ ...form, complemento: event.target.value })}
                  placeholder="Bloco, fundos..."
                />
              </Field>
              <Field label="Bairro" error={errors.bairro}>
                <TextInput
                  value={form.bairro}
                  onChange={(event) => setForm({ ...form, bairro: event.target.value })}
                />
              </Field>
              <Field label="Cidade" error={errors.cidade}>
                <TextInput
                  value={form.cidade}
                  onChange={(event) => setForm({ ...form, cidade: event.target.value })}
                />
              </Field>
              <Field label="UF" error={errors.estado}>
                <TextInput
                  value={form.estado}
                  onChange={(event) => setForm({ ...form, estado: event.target.value.toUpperCase() })}
                  placeholder="PR"
                  maxLength={2}
                />
              </Field>
              <Field label="Tipo de residência">
                <Select
                  value={form.tipoResidencia}
                  onChange={(event) => setForm({ ...form, tipoResidencia: event.target.value })}
                >
                  <option value="casa">Casa</option>
                  <option value="apartamento">Apartamento</option>
                  <option value="barracao">Barracão</option>
                </Select>
              </Field>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        )}

        <div className="cu-toolbar">
          <label className="cu-search">
            <Icon name="search" size={16} />
            <span className="cu-visually-hidden">Buscar clientes</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar cliente, CPF ou cidade..."
            />
          </label>
          <select
            className="cu-status-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar clientes por status"
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
            <EmptyState text="Carregando clientes..." />
          </div>
        ) : items.length === 0 ? (
          <div className="cu-empty-panel">
            <EmptyState text="Nenhum cliente cadastrado ainda." />
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="cu-empty-panel">
            <EmptyState text="Nenhum cliente corresponde à busca ou aos filtros." />
          </div>
        ) : (
          <div className="cu-table-frame">
            <table className="cu-table cu-client-table">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Telefone</th>
                  <th scope="col">Endereço</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="cu-visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((cliente) => {
                  const isActive = clienteAtivo(cliente);
                  return (
                    <tr key={cliente.id}>
                      <td>
                        <div className="cu-user-cell">
                          <span className="cu-avatar" aria-hidden="true">
                            {initials(cliente.nome) || "?"}
                          </span>
                          <span className="cu-user-copy">
                            <strong className="cu-primary-text">{displayValue(cliente.nome)}</strong>
                            <small className="cu-secondary-text">{formatCpf(cliente.cpf)}</small>
                          </span>
                        </div>
                      </td>
                      <td>{displayValue(cliente.telefone)}</td>
                      <td>{enderecoResumo(cliente)}</td>
                      <td>
                        <Badge tone="blue">
                          {TIPO_RESIDENCIA_LABEL[cliente.tipoResidencia] || displayValue(cliente.tipoResidencia)}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={isActive ? "green" : "red"}>
                          {isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="cu-action-cell">
                        <div className="cu-row-actions">
                          <button
                            type="button"
                            className="cu-icon-button"
                            onClick={() => setSelectedClient(cliente)}
                            aria-label={`Ver detalhes de ${cliente.nome}`}
                            title="Ver detalhes"
                          >
                            <Icon name="eye" size={15} />
                          </button>
                          <button
                            type="button"
                            className="cu-icon-button"
                            onClick={() => iniciarEdicao(cliente)}
                            aria-label={`Editar ${cliente.nome}`}
                            title="Editar"
                          >
                            <Icon name="pencil" size={15} />
                          </button>
                          <button
                            type="button"
                            className="cu-inline-action"
                            onClick={() => alternarStatus(cliente)}
                            aria-label={`${isActive ? "Inativar" : "Ativar"} ${cliente.nome}`}
                          >
                            {isActive ? "Inativar" : "Ativar"}
                          </button>
                          {podeExcluir && (
                            <button
                              type="button"
                              className="cu-inline-action cu-inline-danger"
                              onClick={() => remover(cliente)}
                              aria-label={`Remover ${cliente.nome}`}
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          )}
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
      {selectedClient && (
        <ClientDetails cliente={selectedClient} onClose={() => setSelectedClient(null)} />
      )}
    </Layout>
  );
}
