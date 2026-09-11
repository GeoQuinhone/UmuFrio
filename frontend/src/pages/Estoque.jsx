import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import { Field, TextInput, EmptyState, ErrorBanner } from "../components/FormControls.jsx";

export default function Estoque({ crud, onBack }) {
  const { items, loading, error, add, remove, action } = crud;
  const [showForm, setShowForm] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoSaldo, setNovoSaldo] = useState("0");
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const [moveQtd, setMoveQtd] = useState({});
  const [saving, setSaving] = useState(false);

  async function handleNovoProduto(ev) {
    ev.preventDefault();
    if (!novoNome.trim()) {
      setFormError("Informe o nome do produto.");
      return;
    }
    const saldoInicial = Number(novoSaldo) || 0;
    if (saldoInicial < 0) {
      setFormError("O saldo inicial não pode ser negativo.");
      return;
    }
    setSaving(true);
    try {
      await add({ nome: novoNome.trim(), saldo: saldoInicial });
      setNovoNome("");
      setNovoSaldo("0");
      setFormError("");
      setShowForm(false);
    } catch (e) {
      setBanner(e.message);
    } finally {
      setSaving(false);
    }
  }

  function getQtd(id) {
    return Number(moveQtd[id] ?? 1);
  }

  async function handleEntrada(produto) {
    const qtd = getQtd(produto.id);
    if (!qtd || qtd <= 0) {
      setBanner("Informe uma quantidade maior que zero para dar entrada.");
      return;
    }
    try {
      await action(produto.id, "/entrada", { quantidade: qtd });
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    }
  }

  async function handleSaida(produto) {
    const qtd = getQtd(produto.id);
    if (!qtd || qtd <= 0) {
      setBanner("Informe uma quantidade maior que zero para dar saída.");
      return;
    }
    try {
      await action(produto.id, "/saida", { quantidade: qtd });
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    }
  }

  async function handleRemoverProduto(produto) {
    if (!window.confirm(`Remover o produto "${produto.nome}" do catálogo?`)) return;
    try {
      await remove(produto.id);
    } catch (e) {
      setBanner(e.message);
    }
  }

  return (
    <Layout title="Estoque" subtitle="Controlar entrada e saída de produtos." onBack={onBack}>
      <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

      <div className="toolbar">
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Novo produto
        </button>
      </div>

      {showForm && (
        <form className="form-card" onSubmit={handleNovoProduto}>
          <h3>Novo produto</h3>
          <div className="form-grid">
            <Field label="Nome" error={formError}>
              <TextInput value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Gás R410" />
            </Field>
            <Field label="Saldo inicial">
              <TextInput type="number" min="0" value={novoSaldo} onChange={(e) => setNovoSaldo(e.target.value)} />
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

      {loading ? (
        <EmptyState text="Carregando estoque..." />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhum produto cadastrado ainda." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Saldo</th>
              <th>Quantidade</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td>
                  <span className={p.saldo === 0 ? "saldo-zero" : ""}>{p.saldo} un.</span>
                </td>
                <td>
                  <input
                    className="input input-qtd"
                    type="number"
                    min="1"
                    value={moveQtd[p.id] ?? 1}
                    onChange={(e) => setMoveQtd({ ...moveQtd, [p.id]: e.target.value })}
                  />
                </td>
                <td className="row-actions">
                  <button className="btn-link" onClick={() => handleEntrada(p)}>
                    + Entrada
                  </button>
                  <button className="btn-link" onClick={() => handleSaida(p)}>
                    – Saída
                  </button>
                  <button className="btn-link btn-link-danger" onClick={() => handleRemoverProduto(p)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
