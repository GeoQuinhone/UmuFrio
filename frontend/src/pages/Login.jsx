import React, { useState } from "react";

import { useAuth } from "../AuthContext.jsx";
import { apiRequest } from "../api.js";

export default function Login() {
  const { login, setUser } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBootstrap, setIsBootstrap] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    cpf: "",
    telefone: "",
    senha: "",
  });

  async function handleLogin(event) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      await login(email, senha);
    } catch (requestError) {
      setError(requestError.message || "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrap(event) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/auth/bootstrap", {
        method: "POST",
        body: JSON.stringify(form),
      });

      localStorage.setItem("token", data.token);
      setUser(data.usuario);

      setForm({
        nome: "",
        email: "",
        cpf: "",
        telefone: "",
        senha: "",
      });
    } catch (requestError) {
      setError(
        requestError.message || "Erro ao configurar o primeiro CEO.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div
          style={{
            textAlign: "center",
            marginBottom: "2rem",
          }}
        >
          <span className="brand-dot brand-dot-lg" />

          <h2>
            {isBootstrap
              ? "Configuração Inicial"
              : "Acesso Restrito"}
          </h2>

          <p>
            {isBootstrap
              ? "Cadastre o primeiro responsável pelo sistema."
              : "Entre para acessar o sistema UmuFrio."}
          </p>
        </div>

        {error && (
          <div className="error-msg" role="alert">
            {error}
          </div>
        )}

        {isBootstrap ? (
          <form
            onSubmit={handleBootstrap}
            className="form-grid"
            style={{ gridTemplateColumns: "1fr" }}
          >
            <div className="form-group">
              <label htmlFor="nome">Nome completo</label>

              <input
                id="nome"
                className="input"
                autoComplete="name"
                value={form.nome}
                onChange={(event) =>
                  setForm({
                    ...form,
                    nome: event.target.value,
                  })
                }
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="bootstrap-email">
                E-mail
              </label>

              <input
                id="bootstrap-email"
                type="email"
                className="input"
                autoComplete="email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="cpf">CPF</label>

              <input
                id="cpf"
                className="input"
                inputMode="numeric"
                autoComplete="off"
                value={form.cpf}
                onChange={(event) =>
                  setForm({
                    ...form,
                    cpf: event.target.value,
                  })
                }
                required
                placeholder="Somente números"
              />
            </div>

            <div className="form-group">
              <label htmlFor="telefone">Telefone</label>

              <input
                id="telefone"
                className="input"
                type="tel"
                autoComplete="tel"
                value={form.telefone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    telefone: event.target.value,
                  })
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="bootstrap-senha">
                Senha
              </label>

              <input
                id="bootstrap-senha"
                type="password"
                className="input"
                autoComplete="new-password"
                value={form.senha}
                onChange={(event) =>
                  setForm({
                    ...form,
                    senha: event.target.value,
                  })
                }
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: "1rem" }}
            >
              {loading
                ? "Configurando..."
                : "Configurar CEO e entrar"}
            </button>

            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setIsBootstrap(false);
                setError("");
              }}
            >
              Voltar ao login
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleLogin}
            className="form-grid"
            style={{ gridTemplateColumns: "1fr" }}
          >
            <div className="form-group">
              <label htmlFor="email">E-mail</label>

              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                className="input"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="senha">Senha</label>

              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(event) =>
                  setSenha(event.target.value)
                }
                className="input"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: "1rem" }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <div
              style={{
                textAlign: "center",
                marginTop: "12px",
              }}
            >
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setIsBootstrap(true);
                  setError("");
                }}
                style={{
                  fontSize: "0.8rem",
                  color: "var(--grey)",
                }}
              >
                Configurar primeiro CEO
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}