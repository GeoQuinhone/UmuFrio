import React, { useEffect, useRef, useState } from "react";

import Layout from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import {
  Field,
  TextInput,
  EmptyState,
  ErrorBanner,
} from "../components/FormControls.jsx";
import "./catalog-stock.css";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { mascaraMoeda, moedaParaNumero } from "../utils/mascaras.js";
import ProdutoSelect from "../components/ProdutoSelect.jsx";
import { situacaoEstoque } from "../utils/estoque.js";

// Evita o "05" ao digitar em campos numéricos que começam em 0.
const semZeroAEsquerda = (valor) => String(valor).replace(/^0+(?=\d)/, "");

const FORM_VAZIO = {
  nome: "",
  valorUnitario: "",
  saldo: "0",
  quantidadeMinima: "0",
};

function valorParaMascara(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "";
  return mascaraMoeda(String(Math.round(amount * 100)));
}

const MOVIMENTACAO_VAZIA = {
  produtoId: "",
  tipo: "entrada",
  quantidade: "1",
};

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatarValor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? moeda.format(amount) : "—";
}

function codigoProduto(produto) {
  return produto.codigo || produto.sku || `#${produto.id}`;
}

function saldoMinimo(produto) {
  return Number(
    produto.quantidadeMinima ?? produto.quantidade_minima ?? 0,
  );
}

function saudeEstoque(produto) {
  // Mesma regra do backend e dos relatórios: saldo igual ao mínimo já é "baixo".
  const situacao = situacaoEstoque(produto);

  if (situacao === "zerado") {
    return { label: "Crítico", tone: "critical" };
  }

  if (situacao === "baixo") {
    return { label: "No mínimo", tone: "low" };
  }

  return { label: "Saudável", tone: "healthy" };
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

export default function Estoque({ crud, onBack }) {
  const { confirm, confirmElement } = useConfirm();
  const {
    items,
    loading,
    error,
    add,
    update,
    remove,
    action,
  } = crud;

  const produtos = Array.isArray(items) ? items : [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [movementForm, setMovementForm] = useState(MOVIMENTACAO_VAZIA);
  const [movementError, setMovementError] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [onlyZeroStock, setOnlyZeroStock] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewingProduct, setViewingProduct] = useState(null);
  const { dialogRef, returnFocusRef } = useDialogFocus(
    Boolean(viewingProduct),
    setViewingProduct,
  );

  const belowMinimumCount = produtos.filter(
    (produto) => situacaoEstoque(produto) !== "ok",
  ).length;
  const inventoryValue = produtos.reduce(
    (total, produto) =>
      total +
      Number(produto.saldo ?? 0) *
        Number(produto.valorUnitario ?? 0),
    0,
  );
  const totalUnits = produtos.reduce(
    (total, produto) => total + Number(produto.saldo ?? 0),
    0,
  );

  const movimentoProduto = produtos.find(
    (item) => String(item.id) === String(movementForm.produtoId),
  );
  const movimentoQtd = Number(movementForm.quantidade);
  const saldoApos =
    movimentoProduto && Number.isInteger(movimentoQtd) && movimentoQtd > 0
      ? Number(movimentoProduto.saldo ?? 0) +
        (movementForm.tipo === "entrada" ? movimentoQtd : -movimentoQtd)
      : null;

  const filteredProducts = produtos.filter((produto) => {
    const search = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const searchable = [
      produto.nome,
      produto.codigo,
      produto.sku,
      produto.id,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    const saldo = Number(produto.saldo ?? 0);
    const belowMinimum = situacaoEstoque(produto) !== "ok";
    const healthMatches =
      statusFilter === "todos" ||
      (statusFilter === "critico" && saldo <= 0) ||
      (statusFilter === "baixo" && saldo > 0 && belowMinimum) ||
      (statusFilter === "saudavel" && saldo > 0 && !belowMinimum);

    return (
      (!search || searchable.includes(search)) &&
      healthMatches &&
      (!onlyZeroStock || saldo <= 0)
    );
  });

  function iniciarNovo() {
    setEditingId(null);
    setForm(FORM_VAZIO);
    setFormError("");
    setShowForm(true);
  }

  function iniciarEdicao(produto) {
    setEditingId(produto.id);
    setForm({
      nome: produto.nome || "",
      valorUnitario: valorParaMascara(produto.valorUnitario),
      saldo: String(produto.saldo || 0),
      quantidadeMinima: String(
        produto.quantidadeMinima ??
          produto.quantidade_minima ??
          0,
      ),
    });
    setFormError("");
    setShowForm(true);
  }

  function cancelarFormulario() {
    setShowForm(false);
    setEditingId(null);
    setForm(FORM_VAZIO);
    setFormError("");
  }

  async function salvarProduto(event) {
    event.preventDefault();

    const valorUnitario = moedaParaNumero(form.valorUnitario);
    const saldo = Number(form.saldo);
    const quantidadeMinima = Number(form.quantidadeMinima);

    if (!form.nome.trim()) {
      setFormError("Informe o nome do produto.");
      return;
    }

    if (!form.valorUnitario || !Number.isFinite(valorUnitario) || valorUnitario < 0) {
      setFormError("Informe um valor unitário válido.");
      return;
    }

    if (!Number.isInteger(saldo) || saldo < 0) {
      setFormError(
        "O saldo deve ser um número inteiro não negativo.",
      );
      return;
    }

    if (
      !Number.isInteger(quantidadeMinima) ||
      quantidadeMinima < 0
    ) {
      setFormError(
        "A quantidade mínima deve ser um número inteiro não negativo.",
      );
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        await update(editingId, {
          nome: form.nome.trim(),
          valorUnitario,
          quantidadeMinima,
        });
      } else {
        await add({
          nome: form.nome.trim(),
          valorUnitario,
          saldo,
          quantidadeMinima,
        });
      }

      cancelarFormulario();
      setBanner("");
    } catch (saveError) {
      setBanner(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function abrirMovimentacao() {
    setMovementForm({ ...MOVIMENTACAO_VAZIA });
    setMovementError("");
    setShowMovement(true);
  }

  function cancelarMovimentacao() {
    setShowMovement(false);
    setMovementForm(MOVIMENTACAO_VAZIA);
    setMovementError("");
  }

  async function registrarMovimentacao(event) {
    event.preventDefault();
    const produto = produtos.find(
      (item) => String(item.id) === movementForm.produtoId,
    );
    const quantidade = Number(movementForm.quantidade);

    if (!produto) {
      setMovementError("Selecione um produto cadastrado.");
      return;
    }

    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      setMovementError(
        "Informe uma quantidade inteira maior que zero.",
      );
      return;
    }

    if (
      movementForm.tipo === "saida" &&
      quantidade > Number(produto.saldo ?? 0)
    ) {
      setMovementError(
        "A saída não pode ser maior que o saldo disponível.",
      );
      return;
    }

    setSavingMovement(true);

    try {
      await action(
        produto.id,
        movementForm.tipo === "entrada" ? "/entrada" : "/saida",
        { quantidade },
      );
      cancelarMovimentacao();
      setBanner("");
    } catch (actionError) {
      setMovementError(actionError.message);
    } finally {
      setSavingMovement(false);
    }
  }

  async function removerProduto(produto) {
    const confirmado = await confirm(
      `Remover o produto "${produto.nome}" do catálogo?`,
      { title: "Remover produto", confirmLabel: "Remover" },
    );

    if (!confirmado) return;

    try {
      await remove(produto.id);
      setBanner("");
      if (viewingProduct?.id === produto.id) {
        setViewingProduct(null);
      }
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  function limparFiltros() {
    setSearchTerm("");
    setStatusFilter("todos");
    setOnlyZeroStock(false);
  }

  return (
    <>
    <Layout
      title="Estoque"
      subtitle="Acompanhe peças e materiais antes que faltem no atendimento."
      onBack={onBack}
      action={
        <button
          type="button"
          className="catalog-header-action"
          onClick={abrirMovimentacao}
        >
          <Icon name="plus" size={16} />
          Registrar movimentação
        </button>
      }
    >
      <div className="catalog-page-content catalog-stock-page">
        <ErrorBanner
          message={error || banner}
          onClose={() => setBanner("")}
        />

        {showMovement && (
          <form
            className="catalog-form-card stock-movement-form"
            onSubmit={registrarMovimentacao}
          >
            <div className="catalog-form-heading">
              <div>
                <span className="catalog-eyebrow">ESTOQUE</span>
                <h2>Registrar movimentação</h2>
                <p>Informe o produto, o tipo e a quantidade.</p>
              </div>
              <button
                type="button"
                className="catalog-icon-button"
                aria-label="Fechar movimentação"
                onClick={cancelarMovimentacao}
              >
                ×
              </button>
            </div>

            {movementError && (
              <p className="catalog-form-error" role="alert">
                {movementError}
              </p>
            )}

            {produtos.length === 0 ? (
              <EmptyState text="Cadastre um produto antes de registrar uma movimentação." />
            ) : (
              <>
                <div className="catalog-form-grid">
                  <Field label="Produto">
                    <ProdutoSelect
                      produtos={produtos}
                      value={movementForm.produtoId}
                      onChange={(id) =>
                        setMovementForm({ ...movementForm, produtoId: id })
                      }
                      exigirSaldo={movementForm.tipo === "saida"}
                    />
                  </Field>
                  <Field label="Tipo de movimentação">
                    <select
                      className="input"
                      value={movementForm.tipo}
                      onChange={(event) =>
                        setMovementForm({
                          ...movementForm,
                          tipo: event.target.value,
                        })
                      }
                    >
                      <option value="entrada">Entrada</option>
                      <option value="saida">Saída</option>
                    </select>
                  </Field>
                  <Field label="Quantidade">
                    <TextInput
                      type="number"
                      min="1"
                      step="1"
                      value={movementForm.quantidade}
                      onChange={(event) =>
                        setMovementForm({
                          ...movementForm,
                          quantidade: semZeroAEsquerda(event.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
                {movimentoProduto && (
                  <div className="stock-movement-info" role="status">
                    <span>Saldo atual <strong>{movimentoProduto.saldo ?? 0} un.</strong></span>
                    <span>Mínimo <strong>{saldoMinimo(movimentoProduto)} un.</strong></span>
                    <span>Valor unitário <strong>{formatarValor(movimentoProduto.valorUnitario)}</strong></span>
                    {saldoApos !== null && (
                      <span className={saldoApos <= saldoMinimo(movimentoProduto) ? "is-alerta" : ""}>
                        Saldo após <strong>{saldoApos} un.</strong>
                        {saldoApos < 0
                          ? " (insuficiente)"
                          : saldoApos <= 0
                            ? " (zera o estoque)"
                            : saldoApos <= saldoMinimo(movimentoProduto)
                              ? " (ficará no mínimo)"
                              : ""}
                      </span>
                    )}
                  </div>
                )}
                <div className="catalog-form-actions">
                  <button
                    type="button"
                    className="catalog-secondary-button"
                    onClick={cancelarMovimentacao}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="catalog-header-action"
                    disabled={savingMovement}
                  >
                    {savingMovement
                      ? "Registrando..."
                      : "Confirmar movimentação"}
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        {showForm && (
          <form
            className="catalog-form-card stock-product-form"
            onSubmit={salvarProduto}
          >
            <div className="catalog-form-heading">
              <div>
                <span className="catalog-eyebrow">CADASTRO</span>
                <h2>{editingId ? "Editar produto" : "Novo produto"}</h2>
              </div>
              <button
                type="button"
                className="catalog-icon-button"
                aria-label="Fechar formulário"
                onClick={cancelarFormulario}
              >
                ×
              </button>
            </div>
            {formError && (
              <p className="catalog-form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="catalog-form-grid">
              <Field label="Nome">
                <TextInput
                  value={form.nome}
                  onChange={(event) =>
                    setForm({ ...form, nome: event.target.value })
                  }
                  placeholder="Ex.: Gás R410"
                />
              </Field>
              <Field label="Valor unitário (R$)">
                <TextInput
                  inputMode="numeric"
                  placeholder="0,00"
                  value={form.valorUnitario}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      valorUnitario: mascaraMoeda(event.target.value),
                    })
                  }
                />
              </Field>
              {editingId ? (
                <Field
                  label="Saldo atual"
                  hint="Para alterar o saldo, use Registrar movimentação."
                >
                  <TextInput value={`${form.saldo} un.`} readOnly disabled />
                </Field>
              ) : (
                <Field label="Saldo inicial">
                  <TextInput
                    type="number"
                    min="0"
                    step="1"
                    value={form.saldo}
                    onChange={(event) =>
                      setForm({ ...form, saldo: semZeroAEsquerda(event.target.value) })
                    }
                  />
                </Field>
              )}
              <Field label="Quantidade mínima">
                <TextInput
                  type="number"
                  min="0"
                  step="1"
                  value={form.quantidadeMinima}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      quantidadeMinima: semZeroAEsquerda(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <div className="catalog-form-actions">
              <button
                type="button"
                className="catalog-secondary-button"
                onClick={cancelarFormulario}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="catalog-header-action"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar produto"}
              </button>
            </div>
          </form>
        )}

        <section className="catalog-stats-grid" aria-label="Resumo do estoque">
          <article className="catalog-stat-card catalog-stat-teal">
            <span>Itens cadastrados</span>
            <strong>{produtos.length}</strong>
            <small>Produtos no catálogo</small>
          </article>
          <article className="catalog-stat-card catalog-stat-orange">
            <span>Estoque crítico</span>
            <strong>{belowMinimumCount}</strong>
            <small>Zerados ou no mínimo</small>
          </article>
          <article className="catalog-stat-card catalog-stat-blue">
            <span>Valor em estoque</span>
            <strong>{formatarValor(inventoryValue)}</strong>
            <small>Saldo × custo unitário</small>
          </article>
          <article className="catalog-stat-card catalog-stat-purple">
            <span>Unidades em estoque</span>
            <strong>{totalUnits}</strong>
            <small>Soma dos saldos cadastrados</small>
          </article>
        </section>

        <div className="catalog-toolbar">
          <label className="catalog-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar produto ou código..."
              aria-label="Buscar produto ou código"
            />
          </label>
          <select
            className="catalog-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar por saúde do estoque"
          >
            <option value="todos">Todos os status</option>
            <option value="critico">Crítico</option>
            <option value="baixo">No mínimo</option>
            <option value="saudavel">Saudável</option>
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
          <button
            type="button"
            className="catalog-secondary-button stock-new-product"
            onClick={iniciarNovo}
          >
            <Icon name="plus" size={15} />
            Novo produto
          </button>
        </div>

        {showFilters && (
          <div className="catalog-extra-filters">
            <label>
              <input
                type="checkbox"
                checked={onlyZeroStock}
                onChange={(event) =>
                  setOnlyZeroStock(event.target.checked)
                }
              />
              Mostrar somente produtos sem saldo
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
          <EmptyState text="Carregando estoque..." />
        ) : produtos.length === 0 ? (
          <EmptyState text="Nenhum produto cadastrado ainda." />
        ) : filteredProducts.length === 0 ? (
          <EmptyState text="Nenhum produto corresponde a esses filtros." />
        ) : (
          <div className="catalog-table-card">
            <div className="catalog-table-scroll">
              <table className="catalog-table stock-table">
                <thead>
                  <tr>
                    <th>ID / código</th>
                    <th>Produto</th>
                    <th>Saldo</th>
                    <th>Mínimo</th>
                    <th>Custo unit.</th>
                    <th>Saúde</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((produto) => {
                    const health = saudeEstoque(produto);
                    const saldo = Number(produto.saldo ?? 0);
                    const minimum = saldoMinimo(produto);
                    // A barra vai de 0 a 2x o mínimo: no mínimo ela fica pela metade.
                    const progress = minimum
                      ? Math.min((saldo / (minimum * 2)) * 100, 100)
                      : saldo > 0
                        ? 100
                        : 0;

                    return (
                      <tr key={produto.id}>
                        <td className="catalog-record-code">
                          {codigoProduto(produto)}
                        </td>
                        <td>
                          <strong className="catalog-primary-cell">
                            {produto.nome}
                          </strong>
                          <div className="catalog-stock-progress">
                            <span>
                              <i
                                className={`is-${health.tone}`}
                                style={{ width: `${progress}%` }}
                              />
                            </span>
                          </div>
                        </td>
                        <td className="catalog-number-cell">
                          <strong>{saldo}</strong> un.
                        </td>
                        <td>{minimum} un.</td>
                        <td>{formatarValor(produto.valorUnitario)}</td>
                        <td>
                          <span
                            className={`catalog-status-pill is-${health.tone}`}
                          >
                            {health.label}
                          </span>
                        </td>
                        <td className="catalog-row-actions">
                          <button
                            type="button"
                            className="catalog-icon-button"
                            aria-label={`Ver ${produto.nome}`}
                            title="Visualizar"
                            onClick={(event) => {
                              returnFocusRef.current = event.currentTarget;
                              setViewingProduct(produto);
                            }}
                          >
                            <Icon name="eye" size={16} />
                          </button>
                          <button
                            type="button"
                            className="catalog-icon-button"
                            aria-label={`Editar ${produto.nome}`}
                            title="Editar"
                            onClick={() => iniciarEdicao(produto)}
                          >
                            <Icon name="pencil" size={16} />
                          </button>
                          <button
                            type="button"
                            className="catalog-icon-button is-danger"
                            aria-label={`Remover ${produto.nome}`}
                            title="Remover"
                            onClick={() => removerProduto(produto)}
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

      {viewingProduct && (
        <div
          className="catalog-dialog-backdrop"
          onClick={() => setViewingProduct(null)}
        >
          <section
            className="catalog-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-detail-title"
            tabIndex="-1"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="catalog-form-heading">
              <div>
                <span className="catalog-eyebrow">DETALHES DO PRODUTO</span>
                <h2 id="stock-detail-title">{viewingProduct.nome}</h2>
              </div>
              <button
                type="button"
                className="catalog-icon-button"
                aria-label="Fechar detalhes"
                onClick={() => setViewingProduct(null)}
              >
                ×
              </button>
            </div>
            <dl className="catalog-detail-grid">
              <div><dt>ID / código</dt><dd>{codigoProduto(viewingProduct)}</dd></div>
              <div><dt>Saldo atual</dt><dd>{viewingProduct.saldo ?? 0} un.</dd></div>
              <div><dt>Quantidade mínima</dt><dd>{saldoMinimo(viewingProduct)} un.</dd></div>
              <div><dt>Custo unitário</dt><dd>{formatarValor(viewingProduct.valorUnitario)}</dd></div>
              <div><dt>Saúde do estoque</dt><dd>{saudeEstoque(viewingProduct).label}</dd></div>
            </dl>
            <div className="catalog-form-actions">
              <button
                type="button"
                className="catalog-secondary-button"
                onClick={() => setViewingProduct(null)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="catalog-header-action"
                onClick={() => {
                  iniciarEdicao(viewingProduct);
                  setViewingProduct(null);
                }}
              >
                <Icon name="pencil" size={15} />
                Editar produto
              </button>
            </div>
          </section>
        </div>
      )}
    </Layout>
    {confirmElement}
    </>
  );
}