import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import { Field, Select, Badge, EmptyState, ErrorBanner } from "../components/FormControls.jsx";
import { useAuth } from "../AuthContext.jsx";

const STATUS_FLOW = ["aberta", "andamento", "concluida"];
const STATUS_LABEL = { aberta: "Aberta", andamento: "Em andamento", concluida: "Concluída" };

export default function OrdensServico({ crud, agendamentos, clientes, usuarios, servicos, onBack }) {
  const { user } = useAuth();
  const isTecnico = user.perfil === "tecnico";
  const { items, loading, error, add, action } = crud;
  const [agendamentoId, setAgendamentoId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);

  function clienteNome(id) {
    return clientes.items?.find((c) => c.id === id)?.nome ?? `Cliente #${id}`;
  }
  function tecnicoNome(id) {
    return usuarios.items?.find((u) => u.id === id)?.nome ?? `Técnico #${id}`;
  }
  function servicoNome(id) {
    return servicos?.items?.find((s) => s.id === id)?.nome ?? "—";
  }
  function agendamentoLabel(a) {
    return `${clienteNome(a.clienteId)} · ${tecnicoNome(a.tecnicoId)} · ${a.data} ${a.hora?.slice(0, 5)}`;
  }

  const agendamentosDisponiveis = agendamentos.items.filter(
    (a) => a.status === "agendado" && !items.some((os) => os.agendamentoId === a.id)
  );

  function startNew() {
    if (agendamentosDisponiveis.length === 0) {
      setBanner("Não há agendamentos confirmados disponíveis para gerar uma nova ordem de serviço.");
      return;
    }
    setAgendamentoId("");
    setServicoId("");
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!agendamentoId || !servicoId) {
      setFormError("Selecione um agendamento e um serviço.");
      return;
    }
    setSaving(true);
    try {
      await add({ agendamentoId: Number(agendamentoId), servicoId: Number(servicoId) });
      setShowForm(false);
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function avancarStatus(os) {
    try {
      await action(os.id, "/avancar");
      setBanner("");
    } catch (e) {
      setBanner(e.message);
    }
  }

  return (
    <Layout title="Ordens de Serviço" subtitle="Acompanhar a execução dos atendimentos." onBack={onBack}>
      <ErrorBanner message={error || banner} onClose={() => setBanner("")} />

      {!isTecnico && (
        <div className="toolbar">
          <button className="btn-primary" onClick={startNew}>
            + Gerar ordem de serviço
          </button>
        </div>
      )}

      {showForm && !isTecnico && (
        <form className="form-card" onSubmit={handleSubmit}>
          <h3>Nova ordem de serviço</h3>
          <div className="form-grid">
            <Field label="Agendamento confirmado" error={formError}>
              <Select value={agendamentoId} onChange={(e) => setAgendamentoId(e.target.value)}>
                <option value="">Selecione o agendamento...</option>
                {agendamentosDisponiveis.map((a) => (
                  <option key={a.id} value={a.id}>
                    {agendamentoLabel(a)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Serviço" error={formError}>
              <Select value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
                <option value="">Selecione o serviço...</option>
                {servicos?.items?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome} — R$ {Number(s.valor).toFixed(2)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Gerando..." : "Gerar"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <EmptyState text="Carregando ordens de serviço..." />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhuma ordem de serviço gerada ainda." />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Técnico</th>
                <th>Serviço</th>
                <th>Data / Hora</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((os) => {
                const ag = agendamentos.items.find((a) => a.id === os.agendamentoId);
                const tone = os.status === "concluida" ? "green" : os.status === "andamento" ? "amber" : "blue";
                return (
                  <tr key={os.id}>
                    <td>{ag ? clienteNome(ag.clienteId) : "—"}</td>
                    <td>{ag ? tecnicoNome(ag.tecnicoId) : "—"}</td>
                    <td>{servicoNome(os.servicoId)}</td>
                    <td>{ag ? `${ag.data} ${ag.hora?.slice(0, 5)}` : "—"}</td>
                    <td>
                      <Badge tone={tone}>{STATUS_LABEL[os.status]}</Badge>
                    </td>
                    <td className="row-actions">
                      {os.status !== "concluida" && (
                        <button className="btn-link" onClick={() => avancarStatus(os)}>
                          Avançar para "{STATUS_LABEL[STATUS_FLOW[STATUS_FLOW.indexOf(os.status) + 1]]}"
                        </button>
                      )}
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
