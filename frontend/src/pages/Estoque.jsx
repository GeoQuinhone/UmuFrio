import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import {
  Field,
  TextInput,
  EmptyState,
  ErrorBanner,
  Badge,
} from "../components/FormControls.jsx";

const FORM_VAZIO = {
  nome: "",
  valorUnitario: "0.00",
  saldo: "0",
  quantidadeMinima: "0",
};

export default function Estoque({ crud, onBack }) {
  const {
    items,
    loading,
    error,
    add,
    update,
    remove,
    action,
  } = crud;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const [moveQtd, setMoveQtd] = useState({});
  const [saving, setSaving] = useState(false);

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
      valorUnitario: String(
        Number(produto.valorUnitario || 0).toFixed(2),
      ),
      saldo: String(produto.saldo || 0),
      quantidadeMinima: String(
        produto.quantidadeMinima || 0,
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

    const valorUnitario = Number(form.valorUnitario);
    const saldo = Number(form.saldo);
    const quantidadeMinima = Number(
      form.quantidadeMinima,
    );

    if (!form.nome.trim()) {
      setFormError("Informe o nome do produto.");
      return;
    }

    if (
      !Number.isFinite(valorUnitario) ||
      valorUnitario < 0
    ) {
      setFormError("Informe um valor unitário válido.");
      return;
    }

    if (
      !Number.isInteger(saldo) ||
      saldo < 0
    ) {
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

  function obterQuantidade(id) {
    return Number(moveQtd[id] ?? 1);
  }

  async function darEntrada(produto) {
    const quantidade = obterQuantidade(produto.id);

    if (
      !Number.isInteger(quantidade) ||
      quantidade <= 0
    ) {
      setBanner(
        "Informe uma quantidade inteira maior que zero.",
      );
      return;
    }

    try {
      await action(
        produto.id,
        "/entrada",
        { quantidade },
      );
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  async function darSaida(produto) {
    const quantidade = obterQuantidade(produto.id);

    if (
      !Number.isInteger(quantidade) ||
      quantidade <= 0
    ) {
      setBanner(
        "Informe uma quantidade inteira maior que zero.",
      );
      return;
    }

    try {
      await action(
        produto.id,
        "/saida",
        { quantidade },
      );
      setBanner("");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  async function removerProduto(produto) {
    const confirmado = window.confirm(
      `Remover o produto "${produto.nome}" do catálogo?`,
    );

    if (!confirmado) {
      return;
    }

    try {
      await remove(produto.id);
      setBanner("");
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  function produtoEmAlerta(produto) {
    return (
      Number(produto.saldo) <
      Number(produto.quantidadeMinima)
    );
  }

  return (
    <Layout
      title="Estoque"
      subtitle="Controlar entrada e saída de produtos."
      onBack={onBack}
    >
      <ErrorBanner
        message={error || banner}
        onClose={() => setBanner("")}
      />

      <div className="toolbar">
        <button
          className="btn-primary"
          onClick={iniciarNovo}
        >
          + Novo produto
        </button>
      </div>

      {showForm && (
        <form
          className="form-card"
          onSubmit={salvarProduto}
        >
          <h3>
            {editingId
              ? "Editar produto"
              : "Novo produto"}
          </h3>

          <div className="form-grid">
            <Field
              label="Nome"
              error={formError}
            >
              <TextInput
                value={form.nome}
                onChange={(event) =>
                  setForm({
                    ...form,
                    nome: event.target.value,
                  })
                }
                placeholder="Ex.: Gás R410"
              />
            </Field>

            <Field label="Valor unitário (R$)">
              <TextInput
                type="number"
                min="0"
                step="0.01"
                value={form.valorUnitario}
                onChange={(event) =>
                  setForm({
                    ...form,
                    valorUnitario:
                      event.target.value,
                  })
                }
              />
            </Field>

            {!editingId && (
              <Field label="Saldo inicial">
                <TextInput
                  type="number"
                  min="0"
                  step="1"
                  value={form.saldo}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      saldo: event.target.value,
                    })
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
                    quantidadeMinima:
                      event.target.value,
                  })
                }
              />
            </Field>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={cancelarFormulario}
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

      {loading ? (
        <EmptyState text="Carregando estoque..." />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhum produto cadastrado ainda." />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Valor unitário</th>
                <th>Saldo</th>
                <th>Mínimo</th>
                <th>Quantidade</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {items.map((produto) => {
                const alerta = produtoEmAlerta(produto);

                return (
                  <tr key={produto.id}>
                    <td>
                      <div>{produto.nome}</div>

                      {alerta && (
                        <Badge tone="amber">
                          Estoque baixo
                        </Badge>
                      )}
                    </td>

                    <td>
                      R${" "}
                      {Number(
                        produto.valorUnitario || 0,
                      ).toFixed(2)}
                    </td>

                    <td>
                      <span
                        className={
                          produto.saldo === 0
                            ? "saldo-zero"
                            : ""
                        }
                      >
                        {produto.saldo} un.
                      </span>
                    </td>

                    <td>
                      {produto.quantidadeMinima} un.
                    </td>

                    <td>
                      <input
                        className="input input-qtd"
                        type="number"
                        min="1"
                        step="1"
                        value={moveQtd[produto.id] ?? 1}
                        onChange={(event) =>
                          setMoveQtd({
                            ...moveQtd,
                            [produto.id]:
                              event.target.value,
                          })
                        }
                      />
                    </td>

                    <td className="row-actions">
                      <button
                        className="btn-link"
                        onClick={() =>
                          darEntrada(produto)
                        }
                      >
                        + Entrada
                      </button>

                      <button
                        className="btn-link"
                        onClick={() =>
                          darSaida(produto)
                        }
                      >
                        – Saída
                      </button>

                      <button
                        className="btn-link"
                        onClick={() =>
                          iniciarEdicao(produto)
                        }
                      >
                        Editar
                      </button>

                      <button
                        className="btn-link btn-link-danger"
                        onClick={() =>
                          removerProduto(produto)
                        }
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}