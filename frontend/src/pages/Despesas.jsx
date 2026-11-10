import React, { useEffect, useMemo, useRef, useState } from "react";

import Layout from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import { Field, TextInput, Select, EmptyState, ErrorBanner } from "../components/FormControls.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useApiCrud } from "../hooks/useApiCrud.js";
import { mascaraMoeda, moedaParaNumero } from "../utils/mascaras.js";
import { CATEGORIAS_DESPESA, categoriaLabel, CATEGORIAS_COM_VEICULO, CATEGORIAS_COM_FUNCIONARIO, rotuloVeiculo } from "../utils/despesas.js";
import { cargoLabel } from "../utils/cargo.js";
import { formatDate, formatMoeda } from "../utils/atendimento.js";
import "./catalog-stock.css";
import "./despesas.css";

// Fase 8 — controle de gastos. O CEO lança as despesas da empresa; elas entram
// no lucro real da aba Faturamento dos relatórios.

function hojeISO() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

const FORM_VAZIO = () => ({ descricao: "", categoria: "combustivel", valor: "", data: hojeISO(), observacao: "", veiculoId: "", funcionarioId: "" });

export default function Despesas({ onBack }) {
  const { confirm, confirmElement } = useConfirm();
  const crud = useApiCrud("/despesas");
  const { items, loading, error, add, update, remove } = crud;
  const despesas = Array.isArray(items) ? items : [];

  // Fase 9: listas para vincular a despesa a um veículo ou a um funcionário.
  const veiculosCrud = useApiCrud("/veiculos");
  const usuariosCrud = useApiCrud("/usuarios");
  const listaVeiculos = (Array.isArray(veiculosCrud.items) ? veiculosCrud.items : []).filter((v) => v.status !== "inativo");
  const listaFuncionarios = (Array.isArray(usuariosCrud.items) ? usuariosCrud.items : []).filter((u) => Number(u.ativo) === 1);
  const formRef = useRef(null);

  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erros, setErros] = useState({});
  const [banner, setBanner] = useState("");
  const [salvando, setSalvando] = useState(false);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return despesas.filter((d) => {
      if (mes && String(d.data).slice(0, 7) !== mes) return false;
      if (categoria && d.categoria !== categoria) return false;
      if (termo && !`${d.descricao} ${d.observacao || ""}`.toLocaleLowerCase("pt-BR").includes(termo)) return false;
      return true;
    });
  }, [despesas, mes, categoria, busca]);

  const total = filtradas.reduce((soma, d) => soma + Number(d.valor), 0);
  const porCategoria = useMemo(() => {
    const mapa = new Map();
    filtradas.forEach((d) => mapa.set(d.categoria, (mapa.get(d.categoria) || 0) + Number(d.valor)));
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtradas]);

  useEffect(() => {
    if (!showForm) return undefined;
    const t = setTimeout(() => {
      formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 30);
    return () => clearTimeout(t);
  }, [showForm, editingId]);

  function novo() {
    setEditingId(null);
    setForm(FORM_VAZIO());
    setErros({});
    setShowForm(true);
  }

  function editar(d) {
    setEditingId(d.id);
    setForm({
      descricao: d.descricao,
      categoria: d.categoria,
      valor: mascaraMoeda(String(Math.round(Number(d.valor) * 100))),
      data: String(d.data).slice(0, 10),
      observacao: d.observacao || "",
      veiculoId: d.veiculoId ? String(d.veiculoId) : "",
      funcionarioId: d.funcionarioId ? String(d.funcionarioId) : "",
    });
    setErros({});
    setShowForm(true);
  }

  function fechar() {
    setShowForm(false);
    setEditingId(null);
    setErros({});
  }

  async function salvar(evento) {
    evento.preventDefault();
    const novos = {};
    const valor = moedaParaNumero(form.valor);
    if (!form.descricao.trim()) novos.descricao = "Informe a descrição.";
    if (!form.valor || !(valor > 0)) novos.valor = "Informe um valor maior que zero.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) novos.data = "Informe a data.";
    setErros(novos);
    if (Object.keys(novos).length) return;

    setSalvando(true);
    const payload = {
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      valor,
      data: form.data,
      observacao: form.observacao.trim(),
      veiculoId: CATEGORIAS_COM_VEICULO.includes(form.categoria) && form.veiculoId ? Number(form.veiculoId) : null,
      funcionarioId: CATEGORIAS_COM_FUNCIONARIO.includes(form.categoria) && form.funcionarioId ? Number(form.funcionarioId) : null,
    };
    try {
      if (editingId) await update(editingId, payload);
      else await add(payload);
      setBanner("");
      fechar();
    } catch (e) {
      setBanner(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(d) {
    const ok = await confirm(`Excluir a despesa "${d.descricao}" (${formatMoeda(d.valor)})?`, {
      title: "Excluir despesa",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try {
      await remove(d.id);
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    }
  }

  return (
    <>
      <Layout
        title="Despesas"
        subtitle="Controle de gastos da empresa. Entram no cálculo do lucro dos relatórios."
        onBack={onBack}
        action={
          <button type="button" className="catalog-header-action" onClick={novo}>
            <Icon name="plus" size={16} />
            Nova despesa
          </button>
        }
      >
        <div className="catalog-page-content despesas-page">
          <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

          {showForm && (
            <form ref={formRef} className="catalog-form-card" onSubmit={salvar}>
              <div className="catalog-form-heading">
                <div>
                  <span className="catalog-eyebrow">GASTOS</span>
                  <h2>{editingId ? "Editar despesa" : "Nova despesa"}</h2>
                </div>
                <button type="button" className="catalog-icon-button" aria-label="Fechar" onClick={fechar}>×</button>
              </div>
              <div className="catalog-form-grid">
                <Field label="Descrição" error={erros.descricao}>
                  <TextInput value={form.descricao} maxLength={150} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Diesel da van" />
                </Field>
                <Field label="Categoria">
                  <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value, veiculoId: "", funcionarioId: "" })}>
                    {CATEGORIAS_DESPESA.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </Select>
                </Field>
                {CATEGORIAS_COM_VEICULO.includes(form.categoria) && (
                  <Field label="Veículo (opcional)">
                    <Select value={form.veiculoId} onChange={(e) => setForm({ ...form, veiculoId: e.target.value })}>
                      <option value="">Sem veículo (gasto geral)</option>
                      {listaVeiculos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {rotuloVeiculo(v)}{v.tecnicoNome ? ` · ${v.tecnicoNome}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {CATEGORIAS_COM_FUNCIONARIO.includes(form.categoria) && (
                  <Field label="Funcionário (opcional)">
                    <Select value={form.funcionarioId} onChange={(e) => setForm({ ...form, funcionarioId: e.target.value })}>
                      <option value="">Sem funcionário (folha geral)</option>
                      {listaFuncionarios.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome} — {cargoLabel(u.perfil)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Valor (R$)" error={erros.valor}>
                  <TextInput inputMode="numeric" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: mascaraMoeda(e.target.value) })} />
                </Field>
                <Field label="Data" error={erros.data}>
                  <TextInput type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                </Field>
                <Field label="Observação (opcional)">
                  <TextInput value={form.observacao} maxLength={255} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                </Field>
              </div>
              <div className="catalog-form-actions">
                <button type="button" className="catalog-secondary-button" onClick={fechar}>Cancelar</button>
                <button type="submit" className="catalog-header-action" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar despesa"}
                </button>
              </div>
            </form>
          )}

          <section className="catalog-stats-grid" aria-label="Resumo das despesas">
            <article className="catalog-stat-card catalog-stat-orange">
              <span>Total no filtro</span>
              <strong>{formatMoeda(total)}</strong>
              <small>{filtradas.length} lançamento(s)</small>
            </article>
            {porCategoria.slice(0, 3).map(([chave, valor]) => (
              <article key={chave} className="catalog-stat-card catalog-stat-blue">
                <span>{categoriaLabel(chave)}</span>
                <strong>{formatMoeda(valor)}</strong>
                <small>{total > 0 ? `${Math.round((valor / total) * 100)}% do total` : ""}</small>
              </article>
            ))}
          </section>

          <div className="catalog-toolbar">
            <label className="catalog-search">
              <Icon name="search" size={16} />
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição..." aria-label="Buscar despesa" />
            </label>
            <input type="month" className="catalog-select" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês" />
            <select className="catalog-select" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {CATEGORIAS_DESPESA.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {mes && (
              <button type="button" className="catalog-secondary-button" onClick={() => setMes("")}>
                Todos os meses
              </button>
            )}
          </div>

          {loading ? (
            <EmptyState text="Carregando despesas..." />
          ) : filtradas.length === 0 ? (
            <EmptyState text="Nenhuma despesa encontrada para esses filtros." />
          ) : (
            <div className="catalog-table-card">
              <div className="catalog-table-scroll">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th>Valor</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((d) => (
                      <tr key={d.id}>
                        <td>{formatDate(d.data)}</td>
                        <td>
                          <strong className="catalog-primary-cell">{d.descricao}</strong>
                          {d.observacao && <small className="despesa-obs">{d.observacao}</small>}
                        </td>
                        <td>
                          {categoriaLabel(d.categoria)}
                          {d.veiculoPlaca && <small className="despesa-obs">Veículo: {d.veiculoModelo} — {d.veiculoPlaca}</small>}
                          {d.funcionarioNome && <small className="despesa-obs">Funcionário: {d.funcionarioNome}</small>}
                        </td>
                        <td className="catalog-number-cell"><strong>{formatMoeda(d.valor)}</strong></td>
                        <td className="catalog-row-actions">
                          <button type="button" className="catalog-icon-button" aria-label={`Editar ${d.descricao}`} title="Editar" onClick={() => editar(d)}>
                            <Icon name="pencil" size={16} />
                          </button>
                          <button type="button" className="catalog-icon-button is-danger" aria-label={`Excluir ${d.descricao}`} title="Excluir" onClick={() => excluir(d)}>
                            <Icon name="trash" size={16} />
                          </button>
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
      {confirmElement}
    </>
  );
}
