import React, { useState } from "react";
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
import { useConfirm } from "../components/ConfirmDialog.jsx";

const FORM_VAZIO = {
  placa: "",
  marca: "",
  modelo: "",
  ano: "",
  tecnicoId: "",
  status: "ativo",
};

const STATUS_LABEL = {
  ativo: "Ativo",
  manutencao: "Em manutenção",
  inativo: "Inativo",
};

const STATUS_TOM = {
  ativo: "green",
  manutencao: "amber",
  inativo: "red",
};

const ANO_MAXIMO = new Date().getFullYear() + 1;

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Placa só com letras e números, em maiúsculas (ABC1234 ou ABC1D23).
function limparPlaca(valor) {
  return String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function placaValida(placa) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa);
}

// Exibe a placa antiga com traço (ABC-1234); a Mercosul fica sem (ABC1D23).
function formatarPlaca(placa) {
  const valor = limparPlaca(placa);
  return /^[A-Z]{3}[0-9]{4}$/.test(valor)
    ? `${valor.slice(0, 3)}-${valor.slice(3)}`
    : valor;
}

export default function Veiculos({ crud, tecnicos, onBack }) {
  const { confirm, confirmElement } = useConfirm();
  const {
    items = [],
    loading,
    error,
    add,
    update,
    remove,
  } = crud;
  const listaTecnicos = tecnicos?.items || [];

  const [form, setForm] = useState(FORM_VAZIO);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const summary = {
    total: items.length,
    ativos: items.filter((veiculo) => veiculo.status === "ativo").length,
    manutencao: items.filter((veiculo) => veiculo.status === "manutencao").length,
  };

  function iniciarNovo() {
    setForm(FORM_VAZIO);
    setEditingId(null);
    setErrors({});
    setShowForm(true);
  }

  function iniciarEdicao(veiculo) {
    setForm({
      placa: veiculo.placa || "",
      marca: veiculo.marca || "",
      modelo: veiculo.modelo || "",
      ano: String(veiculo.ano || ""),
      tecnicoId: veiculo.tecnicoId ? String(veiculo.tecnicoId) : "",
      status: veiculo.status || "ativo",
    });
    setEditingId(veiculo.id);
    setErrors({});
    setShowForm(true);
  }

  function validar() {
    const novosErros = {};
    const placa = limparPlaca(form.placa);
    const ano = Number(form.ano);

    if (!placaValida(placa)) {
      novosErros.placa = "Placa inválida (ex.: ABC1234 ou ABC1D23).";
    } else if (
      items.some((veiculo) => veiculo.placa === placa && veiculo.id !== editingId)
    ) {
      novosErros.placa = "Já existe um veículo com esta placa.";
    }

    if (!form.marca.trim()) novosErros.marca = "Informe a marca.";
    if (!form.modelo.trim()) novosErros.modelo = "Informe o modelo.";

    if (!Number.isInteger(ano) || ano < 1980 || ano > ANO_MAXIMO) {
      novosErros.ano = `Ano entre 1980 e ${ANO_MAXIMO}.`;
    }

    if (form.tecnicoId) {
      const ocupado = items.find(
        (veiculo) =>
          String(veiculo.tecnicoId) === form.tecnicoId && veiculo.id !== editingId,
      );
      if (ocupado) {
        novosErros.tecnicoId = `Este técnico já usa o veículo ${formatarPlaca(ocupado.placa)}.`;
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
      placa: limparPlaca(form.placa),
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      ano: Number(form.ano),
      tecnicoId: form.tecnicoId ? Number(form.tecnicoId) : null,
      status: form.status,
    };

    try {
      if (editingId) {
        await update(editingId, payload);
      } else {
        await add(payload);
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

  async function remover(veiculo) {
    const confirmado = await confirm(
      `Remover o veículo ${formatarPlaca(veiculo.placa)}? Essa ação é definitiva.`,
      { title: "Remover veículo", confirmLabel: "Remover" },
    );
    if (!confirmado) return;

    try {
      await remove(veiculo.id);
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  const filtrados = items.filter((veiculo) => {
    const searchable = normalize(
      [
        veiculo.placa,
        formatarPlaca(veiculo.placa),
        veiculo.marca,
        veiculo.modelo,
        veiculo.tecnicoNome,
      ].join(" "),
    );
    const matchesSearch = !normalize(searchTerm) || searchable.includes(normalize(searchTerm));
    const matchesStatus = statusFilter === "all" || veiculo.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const hasFilters = Boolean(searchTerm.trim()) || statusFilter !== "all";

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("all");
  }

  return (
    <>
    <Layout
      title="Veículos"
      subtitle="Cadastre a frota da empresa e defina o técnico responsável por cada veículo."
      onBack={onBack}
      action={
        <button type="button" className="cu-primary-action" onClick={iniciarNovo}>
          <Icon name="plus" size={16} />
          Novo veículo
        </button>
      }
    >
      <div className="cu-module cu-vehicles">
        <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

        {!loading && !error && (
          <section className="cu-summary-grid" aria-label="Resumo de veículos">
            <article className="cu-summary-card">
              <span>Veículos cadastrados</span>
              <strong>{summary.total}</strong>
              <small>Total da frota</small>
            </article>
            <article className="cu-summary-card cu-summary-green">
              <span>Veículos ativos</span>
              <strong>{summary.ativos}</strong>
              <small>Disponíveis para os atendimentos</small>
            </article>
            <article className="cu-summary-card cu-summary-blue">
              <span>Em manutenção</span>
              <strong>{summary.manutencao}</strong>
              <small>Fora de uso no momento</small>
            </article>
          </section>
        )}

        {showForm && (
          <form className="form-card cu-form-card" onSubmit={salvar}>
            <div className="cu-form-heading">
              <div>
                <span className="cu-eyebrow">VEÍCULOS</span>
                <h2>{editingId ? "Editar veículo" : "Novo veículo"}</h2>
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
              <Field label="Placa" error={errors.placa}>
                <TextInput
                  value={form.placa}
                  onChange={(event) => setForm({ ...form, placa: limparPlaca(event.target.value) })}
                  placeholder="ABC1D23"
                  autoCapitalize="characters"
                />
              </Field>
              <Field label="Marca" error={errors.marca}>
                <TextInput
                  value={form.marca}
                  onChange={(event) => setForm({ ...form, marca: event.target.value })}
                  placeholder="Fiat, Volkswagen..."
                />
              </Field>
              <Field label="Modelo" error={errors.modelo}>
                <TextInput
                  value={form.modelo}
                  onChange={(event) => setForm({ ...form, modelo: event.target.value })}
                  placeholder="Strada, Saveiro..."
                />
              </Field>
              <Field label="Ano" error={errors.ano}>
                <TextInput
                  value={form.ano}
                  onChange={(event) => setForm({ ...form, ano: event.target.value.replace(/\D/g, "").slice(0, 4) })}
                  placeholder={String(ANO_MAXIMO - 1)}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Técnico responsável (opcional)" error={errors.tecnicoId}>
                <Select
                  value={form.tecnicoId}
                  onChange={(event) => setForm({ ...form, tecnicoId: event.target.value })}
                >
                  <option value="">Sem técnico</option>
                  {listaTecnicos.map((tecnico) => (
                    <option key={tecnico.id} value={String(tecnico.id)}>
                      {tecnico.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Situação" hint="Só o veículo ativo aparece no atendimento.">
                <Select
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value })}
                >
                  <option value="ativo">Ativo</option>
                  <option value="manutencao">Em manutenção</option>
                  <option value="inativo">Inativo</option>
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
            <span className="cu-visually-hidden">Buscar veículos</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar placa, modelo ou técnico..."
            />
          </label>
          <select
            className="cu-status-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar veículos por situação"
          >
            <option value="all">Todas as situações</option>
            <option value="ativo">Ativos</option>
            <option value="manutencao">Em manutenção</option>
            <option value="inativo">Inativos</option>
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
            <EmptyState text="Carregando veículos..." />
          </div>
        ) : items.length === 0 ? (
          <div className="cu-empty-panel">
            <EmptyState text="Nenhum veículo cadastrado ainda." />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="cu-empty-panel">
            <EmptyState text="Nenhum veículo corresponde à busca ou aos filtros." />
          </div>
        ) : (
          <div className="cu-table-frame">
            <table className="cu-table cu-vehicle-table">
              <thead>
                <tr>
                  <th scope="col">Veículo</th>
                  <th scope="col">Ano</th>
                  <th scope="col">Técnico</th>
                  <th scope="col">Situação</th>
                  <th scope="col"><span className="cu-visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((veiculo) => (
                  <tr key={veiculo.id}>
                    <td>
                      <div className="cu-user-cell">
                        <span className="cu-avatar" aria-hidden="true">
                          <Icon name="truck" size={18} />
                        </span>
                        <span className="cu-user-copy">
                          <strong className="cu-primary-text">
                            {veiculo.marca} {veiculo.modelo}
                          </strong>
                          <small className="cu-secondary-text">{formatarPlaca(veiculo.placa)}</small>
                        </span>
                      </div>
                    </td>
                    <td>{veiculo.ano}</td>
                    <td>{veiculo.tecnicoNome || "Sem técnico"}</td>
                    <td>
                      <Badge tone={STATUS_TOM[veiculo.status] || "neutral"}>
                        {STATUS_LABEL[veiculo.status] || veiculo.status}
                      </Badge>
                    </td>
                    <td className="cu-action-cell">
                      <div className="cu-row-actions">
                        <button
                          type="button"
                          className="cu-icon-button"
                          onClick={() => iniciarEdicao(veiculo)}
                          aria-label={`Editar ${formatarPlaca(veiculo.placa)}`}
                          title="Editar"
                        >
                          <Icon name="pencil" size={15} />
                        </button>
                        <button
                          type="button"
                          className="cu-inline-action cu-inline-danger"
                          onClick={() => remover(veiculo)}
                          aria-label={`Remover ${formatarPlaca(veiculo.placa)}`}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
    {confirmElement}
    </>
  );
}