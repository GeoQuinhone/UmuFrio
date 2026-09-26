import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import {
  Field,
  TextInput,
  Select,
  Badge,
  EmptyState,
  ErrorBanner,
} from "../components/FormControls.jsx";

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

export default function Usuarios({ crud, onBack }) {
  const {
    items,
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
    } else if (
      !/^\S+@\S+\.\S+$/.test(form.email)
    ) {
      novosErros.email = "E-mail inválido.";
    }

    if (!form.telefone.trim()) {
      novosErros.telefone = "Informe o telefone.";
    }

    const emailDuplicado = items.some(
      (usuario) =>
        usuario.email?.toLowerCase() ===
          form.email.trim().toLowerCase() &&
        usuario.id !== editingId,
    );

    if (!novosErros.email && emailDuplicado) {
      novosErros.email =
        "Já existe um usuário com este e-mail.";
    }

    if (!editingId || form.senha) {
      if (form.senha.length < 6) {
        novosErros.senha =
          "A senha deve possuir no mínimo 6 caracteres.";
      }
    }

    setErrors(novosErros);

    return Object.keys(novosErros).length === 0;
  }

  async function salvar(event) {
    event.preventDefault();

    if (!validar()) {
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        const dados = {
          nome: form.nome,
          telefone: form.telefone,
          perfil: form.perfil,
        };

        if (form.senha) {
          dados.senha = form.senha;
        }

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

    if (!confirmado) {
      return;
    }

    try {
      await remove(usuario.id);
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  return (
    <Layout
      title="Usuários e Técnicos"
      subtitle="Cadastrar usuários e definir perfis de acesso."
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
          + Novo usuário
        </button>
      </div>

      {showForm && (
        <form
          className="form-card"
          onSubmit={salvar}
        >
          <h3>
            {editingId ? "Editar usuário" : "Novo usuário"}
          </h3>

          <div className="form-grid">
            <Field
              label="Nome"
              error={errors.nome}
            >
              <TextInput
                value={form.nome}
                onChange={(event) =>
                  setForm({
                    ...form,
                    nome: event.target.value,
                  })
                }
                placeholder="Nome completo"
              />
            </Field>

            <Field
              label="CPF"
              error={errors.cpf}
            >
              <TextInput
                value={form.cpf}
                onChange={(event) =>
                  setForm({
                    ...form,
                    cpf: event.target.value,
                  })
                }
                placeholder="000.000.000-00"
                disabled={Boolean(editingId)}
              />
            </Field>

            <Field
              label="E-mail"
              error={errors.email}
            >
              <TextInput
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
                placeholder="nome@empresa.com"
                disabled={Boolean(editingId)}
              />
            </Field>

            <Field
              label="Telefone"
              error={errors.telefone}
            >
              <TextInput
                value={form.telefone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    telefone: event.target.value,
                  })
                }
                placeholder="(00) 00000-0000"
              />
            </Field>

            <Field label="Perfil de acesso">
              <Select
                value={form.perfil}
                onChange={(event) =>
                  setForm({
                    ...form,
                    perfil: event.target.value,
                  })
                }
              >
                <option value="ceo">CEO</option>
                <option value="atendente">Atendente</option>
                <option value="estoquista">Estoquista</option>
                <option value="tecnico">Técnico</option>
              </Select>
            </Field>

            <Field
              label={
                editingId
                  ? "Redefinir senha (opcional)"
                  : "Senha inicial"
              }
              error={errors.senha}
            >
              <TextInput
                type="password"
                value={form.senha}
                onChange={(event) =>
                  setForm({
                    ...form,
                    senha: event.target.value,
                  })
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

      {loading ? (
        <EmptyState text="Carregando usuários..." />
      ) : items.length === 0 ? (
        <EmptyState text="Nenhum usuário cadastrado ainda." />
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Perfil</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {items.map((usuario) => (
                <tr key={usuario.id}>
                  <td>{usuario.nome}</td>
                  <td>{usuario.email}</td>
                  <td>{usuario.telefone}</td>
                  <td>
                    <Badge
                      tone={
                        usuario.perfil === "tecnico"
                          ? "blue"
                          : usuario.perfil === "ceo"
                            ? "amber"
                            : "grey"
                      }
                    >
                      {PERFIL_LABEL[usuario.perfil]}
                    </Badge>
                  </td>
                  <td>
                    <Badge
                      tone={
                        usuario.ativo
                          ? "green"
                          : "grey"
                      }
                    >
                      {usuario.ativo
                        ? "Ativo"
                        : "Inativo"}
                    </Badge>
                  </td>
                  <td className="row-actions">
                    <button
                      className="btn-link"
                      onClick={() =>
                        iniciarEdicao(usuario)
                      }
                    >
                      Editar
                    </button>

                    <button
                      className="btn-link"
                      onClick={() =>
                        alternarStatus(usuario)
                      }
                    >
                      {usuario.ativo
                        ? "Inativar"
                        : "Ativar"}
                    </button>

                    <button
                      className="btn-link btn-link-danger"
                      onClick={() => remover(usuario)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}