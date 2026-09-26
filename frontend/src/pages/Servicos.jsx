import React, { useEffect, useRef, useState } from "react";

import Layout from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import {
  Field,
  Badge,
  EmptyState,
  ErrorBanner,
} from "../components/FormControls.jsx";
import { apiRequest } from "../api.js";
import "./catalog-stock.css";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatarValor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? moeda.format(amount) : "—";
}

function codigoServico(servico) {
  return servico.codigo || servico.code || `#${servico.id}`;
}

function statusServico(servico) {
  const status = String(servico.status || "").toLocaleLowerCase("pt-BR");

  if (
    ["ativo", "active", "disponivel", "disponível"].includes(status) ||
    servico.ativo === true ||
    Number(servico.ativo) === 1
  ) {
    return { label: "Ativo", tone: "healthy" };
  }

  if (
    ["inativo", "inactive", "indisponivel", "indisponível"].includes(status) ||
    servico.ativo === false ||
    (servico.ativo !== undefined && Number(servico.ativo) === 0)
  ) {
    return { label: "Inativo", tone: "critical" };
  }

  return { label: "Cadastrado", tone: "neutral" };
}

function useDialogFocus(isOpen, onClose) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const dialog = dialogRef.current;
    const focusableElements = () =>
      Array.from(
        dialog.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    const firstFocusable = focusableElements()[0];
    (firstFocusable || dialog).focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(null);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    function keepFocusInside(event) {
      if (!dialog.contains(event.target)) {
        (focusableElements()[0] || dialog).focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", keepFocusInside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", keepFocusInside);
      if (returnFocusRef.current?.isConnected) {
        returnFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  return { dialogRef, returnFocusRef };
}

export default function Servicos({ crud, estoque, onBack }) {
  const { items, loading, error, add, remove, reload } = crud;
  const servicos = Array.isArray(items) ? items : [];
  const produtos = Array.isArray(estoque?.items) ? estoque.items : [];
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    valor: "",
    pecas: [],
  });
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [onlyWithParts, setOnlyWithParts] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewingService, setViewingService] = useState(null);
  const { dialogRef, returnFocusRef } = useDialogFocus(
    Boolean(viewingService),
    setViewingService,
  );

  const filteredServices = servicos.filter((service) => {
    const search = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const searchable = [
      service.nome,
      service.codigo,
      service.code,
      service.descricao,
      service.id,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    const serviceStatus = statusServico(service);
    const statusMatches =
      statusFilter === "todos" ||
      (statusFilter === "ativo" && serviceStatus.label === "Ativo") ||
      (statusFilter === "inativo" && serviceStatus.label === "Inativo") ||
      (statusFilter === "cadastrado" && serviceStatus.label === "Cadastrado");

    return (
      (!search || searchable.includes(search)) &&
      statusMatches &&
      (!onlyWithParts || Boolean(service.pecas?.length))
    );
  });

  function startNew() {
    setForm({ nome: "", descricao: "", valor: "", pecas: [] });
    setEditing("new");
    setFormError("");
  }

  function startEdit(item) {
    setForm({
      nome: item.nome || "",
      descricao: item.descricao || "",
      valor: Number(item.valor || 0).toFixed(2),
      pecas: (item.pecas || []).map((piece) => ({
        produtoId: String(piece.produtoId),
        quantidadeNecessaria: String(piece.quantidadeNecessaria),
      })),
    });
    setEditing(item.id);
    setFormError("");
  }

  function cancelEdit() {
    setEditing(null);
    setFormError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const valor = Number(form.valor);

    if (!form.nome.trim()) {
      setFormError("Informe o nome do serviço.");
      return;
    }

    if (!form.valor || !Number.isFinite(valor) || valor < 0) {
      setFormError("Informe um valor válido para o serviço.");
      return;
    }

    const invalidPiece = form.pecas.some(
      (piece) =>
        piece.produtoId &&
        (!Number.isInteger(Number(piece.quantidadeNecessaria)) ||
          Number(piece.quantidadeNecessaria) <= 0),
    );

    if (invalidPiece) {
      setFormError(
        "A quantidade necessária de cada peça deve ser um inteiro maior que zero.",
      );
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...form,
        pecas: form.pecas.filter(
          (piece) =>
            piece.produtoId &&
            Number(piece.quantidadeNecessaria) > 0,
        ),
      };

      if (editing === "new") {
        await add(payload);
      } else {
        await apiRequest(`/servicos/${editing}`, {
          method: "PUT",
          body: JSON.stringify({
            nome: payload.nome.trim(),
            descricao: payload.descricao,
            valor: payload.valor,
          }),
        });
        await apiRequest(`/servicos/${editing}/pecas`, {
          method: "PUT",
          body: JSON.stringify({ pecas: payload.pecas }),
        });
        await reload();
      }

      setEditing(null);
      setBanner("");
    } catch (saveError) {
      setBanner(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(service) {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir o serviço "${service.nome}"?`,
      )
    ) {
      return;
    }

    try {
      await remove(service.id);
      setBanner("");
      if (viewingService?.id === service.id) {
        setViewingService(null);
      }
    } catch (deleteError) {
      setBanner(deleteError.message);
    }
  }

  function addPeca() {
    setForm({
      ...form,
      pecas: [
        ...form.pecas,
        { produtoId: "", quantidadeNecessaria: "1" },
      ],
    });
  }

  function updatePeca(index, field, value) {
    const novas = [...form.pecas];
    novas[index] = { ...novas[index], [field]: value };
    setForm({ ...form, pecas: novas });
  }

  function removePeca(index) {
    const novas = [...form.pecas];
    novas.splice(index, 1);
    setForm({ ...form, pecas: novas });
  }

  function limparFiltros() {
    setSearchTerm("");
    setStatusFilter("todos");
    setOnlyWithParts(false);
  }

  function nomeProduto(piece) {
    return (
      piece.produtoNome ||
      produtos.find(
        (produto) => String(produto.id) === String(piece.produtoId),
      )?.nome ||
      `Produto #${piece.produtoId}`
    );
  }

  return (
    <Layout
      title="Catálogo de serviços"
      subtitle="Preços e descrições que sua equipe usa no orçamento."
      onBack={onBack}
      action={
        <button
          type="button"
          className="catalog-header-action"
          onClick={startNew}
        >
          <Icon name="plus" size={16} />
          Novo serviço
        </button>
      }
    >
      <div className="catalog-page-content catalog-services-page">
        <ErrorBanner
          message={error || banner}
          onClose={() => setBanner("")}
        />

        {editing && (
          <form
            className="catalog-form-card service-form"
            onSubmit={handleSubmit}
          >
            <div className="catalog-form-heading">
              <div>
                <span className="catalog-eyebrow">CATÁLOGO</span>
                <h2>
                  {editing === "new" ? "Novo serviço" : "Editar serviço"}
                </h2>
              </div>
              <button
                type="button"
                className="catalog-icon-button"
                aria-label="Fechar formulário"
                onClick={cancelEdit}
              >
                ×
              </button>
            </div>

            {formError && (
              <p className="catalog-form-error" role="alert">
                {formError}
              </p>
            )}

            <div className="catalog-form-grid service-main-fields">
              <Field label="Nome do serviço">
                <input
                  className="input"
                  value={form.nome}
                  onChange={(event) =>
                    setForm({ ...form, nome: event.target.value })
                  }
                  autoFocus
                />
              </Field>
              <Field label="Valor base (R$)">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor}
                  onChange={(event) =>
                    setForm({ ...form, valor: event.target.value })
                  }
                />
              </Field>
              <Field label="Descrição">
                <input
                  className="input"
                  value={form.descricao}
                  onChange={(event) =>
                    setForm({ ...form, descricao: event.target.value })
                  }
                  placeholder="Descreva o serviço para sua equipe."
                />
              </Field>
            </div>

            <section className="service-parts-editor">
              <div className="service-parts-heading">
                <div>
                  <h3>Peças necessárias</h3>
                  <p>Vincule produtos do estoque ao serviço.</p>
                </div>
                <button
                  type="button"
                  className="catalog-secondary-button"
                  onClick={addPeca}
                >
                  <Icon name="plus" size={15} />
                  Adicionar peça
                </button>
              </div>

              {form.pecas.length === 0 ? (
                <p className="service-no-parts">
                  Nenhuma peça vinculada a este serviço.
                </p>
              ) : (
                <div className="service-parts-list">
                  {form.pecas.map((piece, index) => (
                    <div className="service-part-row" key={index}>
                      <Field label={`Peça ${index + 1}`}>
                        <select
                          className="input"
                          value={piece.produtoId}
                          onChange={(event) =>
                            updatePeca(
                              index,
                              "produtoId",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Selecione um produto...</option>
                          {produtos.map((produto) => (
                            <option key={produto.id} value={produto.id}>
                              {produto.nome}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Quantidade">
                        <input
                          className="input"
                          type="number"
                          min="1"
                          step="1"
                          value={piece.quantidadeNecessaria}
                          onChange={(event) =>
                            updatePeca(
                              index,
                              "quantidadeNecessaria",
                              event.target.value,
                            )
                          }
                        />
                      </Field>
                      <button
                        type="button"
                        className="catalog-icon-button is-danger"
                        aria-label={`Remover peça ${index + 1}`}
                        title="Remover peça"
                        onClick={() => removePeca(index)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="catalog-form-actions">
              <button
                type="button"
                className="catalog-secondary-button"
                onClick={cancelEdit}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="catalog-header-action"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar serviço"}
              </button>
            </div>
          </form>
        )}

        <div className="catalog-toolbar">
          <label className="catalog-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar serviço ou código..."
              aria-label="Buscar serviço ou código"
            />
          </label>
          <select
            className="catalog-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar por status"
          >
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
            <option value="cadastrado">Sem status informado</option>
          </select>
          <button
            type="button"
            className={`catalog-filter-button${showFilters ? " is-active" : ""}`}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((visible) => !visible)}
          >
            <Icon name="filter" size={16} />
            Filtros
          </button>
        </div>

        {showFilters && (
          <div className="catalog-extra-filters">
            <label>
              <input
                type="checkbox"
                checked={onlyWithParts}
                onChange={(event) =>
                  setOnlyWithParts(event.target.checked)
                }
              />
              Mostrar somente serviços com peças vinculadas
            </label>
            <button
              type="button"
              className="catalog-clear-filters"
              onClick={limparFiltros}
            >
              Limpar filtros
            </button>
          </div>
        )}

        {loading ? (
          <EmptyState text="Carregando serviços..." />
        ) : servicos.length === 0 ? (
          <EmptyState text="Nenhum serviço cadastrado ainda." />
        ) : filteredServices.length === 0 ? (
          <EmptyState text="Nenhum serviço corresponde a esses filtros." />
        ) : (
          <div className="catalog-table-card">
            <div className="catalog-table-scroll">
              <table className="catalog-table services-table">
                <thead>
                  <tr>
                    <th>ID / código</th>
                    <th>Serviço</th>
                    <th>Preço base</th>
                    <th>Descrição</th>
                    <th>Peças</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServices.map((service) => {
                    const status = statusServico(service);

                    return (
                      <tr key={service.id}>
                        <td className="catalog-record-code">
                          {codigoServico(service)}
                        </td>
                        <td>
                          <strong className="catalog-primary-cell">
                            {service.nome}
                          </strong>
                        </td>
                        <td className="catalog-price-cell">
                          {formatarValor(service.valor)}
                        </td>
                        <td className="catalog-description-cell">
                          {service.descricao || "—"}
                        </td>
                        <td>
                          {service.pecas?.length ? (
                            <span className="catalog-part-count">
                              {service.pecas.length}{" "}
                              {service.pecas.length === 1 ? "peça" : "peças"}
                            </span>
                          ) : (
                            <span className="catalog-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`catalog-status-pill is-${status.tone}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="catalog-row-actions">
                          <button
                            type="button"
                            className="catalog-icon-button"
                            aria-label={`Ver ${service.nome}`}
                            title="Visualizar"
                            onClick={(event) => {
                              returnFocusRef.current = event.currentTarget;
                              setViewingService(service);
                            }}
                          >
                            <Icon name="eye" size={16} />
                          </button>
                          <button
                            type="button"
                            className="catalog-icon-button"
                            aria-label={`Editar ${service.nome}`}
                            title="Editar"
                            onClick={() => startEdit(service)}
                          >
                            <Icon name="pencil" size={16} />
                          </button>
                          <button
                            type="button"
                            className="catalog-icon-button is-danger"
                            aria-label={`Excluir ${service.nome}`}
                            title="Excluir"
                            onClick={() => handleDelete(service)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
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

      {viewingService && (
        <div
          className="catalog-dialog-backdrop"
          onClick={() => setViewingService(null)}
        >
          <section
            className="catalog-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-detail-title"
            tabIndex="-1"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="catalog-form-heading">
              <div>
                <span className="catalog-eyebrow">DETALHES DO SERVIÇO</span>
                <h2 id="service-detail-title">{viewingService.nome}</h2>
              </div>
              <button
                type="button"
                className="catalog-icon-button"
                aria-label="Fechar detalhes"
                onClick={() => setViewingService(null)}
              >
                ×
              </button>
            </div>
            <dl className="catalog-detail-grid">
              <div><dt>ID / código</dt><dd>{codigoServico(viewingService)}</dd></div>
              <div><dt>Preço base</dt><dd>{formatarValor(viewingService.valor)}</dd></div>
              <div><dt>Status</dt><dd>{statusServico(viewingService).label}</dd></div>
              <div className="catalog-detail-full"><dt>Descrição</dt><dd>{viewingService.descricao || "Não informada"}</dd></div>
            </dl>
            <div className="service-detail-parts">
              <h3>Peças vinculadas</h3>
              {viewingService.pecas?.length ? (
                <ul>
                  {viewingService.pecas.map((piece) => (
                    <li key={piece.id ?? `${piece.produtoId}-${piece.quantidadeNecessaria}`}>
                      <span>{nomeProduto(piece)}</span>
                      <Badge tone="neutral">
                        {piece.quantidadeNecessaria} un.
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma peça vinculada a este serviço.</p>
              )}
            </div>
            <div className="catalog-form-actions">
              <button
                type="button"
                className="catalog-secondary-button"
                onClick={() => setViewingService(null)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="catalog-header-action"
                onClick={() => {
                  startEdit(viewingService);
                  setViewingService(null);
                }}
              >
                <Icon name="pencil" size={15} />
                Editar serviço
              </button>
            </div>
          </section>
        </div>
      )}
    </Layout>
  );
}