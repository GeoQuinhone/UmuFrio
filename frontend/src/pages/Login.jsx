import React, { useState } from "react";

import { useAuth } from "../AuthContext.jsx";
import { apiRequest } from "../api.js";
import Icon from "../components/Icon.jsx";
import "./auth.css";

const emptyForm = {
  nome: "",
  email: "",
  cpf: "",
  telefone: "",
  senha: "",
};

const emptyRecoveryForm = {
  email: "",
  cpf: "",
  novaSenha: "",
  confirmarSenha: "",
};

export default function Login() {
  const { login, setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBootstrap, setIsBootstrap] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState("identificar");
  const [recoveryForm, setRecoveryForm] = useState(emptyRecoveryForm);
  const [recoveryError, setRecoveryError] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
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
      setForm(emptyForm);
    } catch (requestError) {
      setError(
        requestError.message || "Erro ao configurar o primeiro CEO.",
      );
    } finally {
      setLoading(false);
    }
  }

  function switchScreen(bootstrap) {
    setIsBootstrap(bootstrap);
    setError("");
    setInfo("");
  }

  function abrirRecuperacao() {
    setIsRecovering(true);
    setRecoveryStep("identificar");
    setRecoveryForm(emptyRecoveryForm);
    setRecoveryError("");
    setError("");
    setInfo("");
  }

  function fecharRecuperacao() {
    setIsRecovering(false);
    setRecoveryStep("identificar");
    setRecoveryForm(emptyRecoveryForm);
    setRecoveryError("");
  }

  async function handleValidarRecuperacao(event) {
    event.preventDefault();
    setRecoveryError("");
    setLoading(true);
    try {
      await apiRequest("/auth/recuperar-senha/validar", {
        method: "POST",
        body: JSON.stringify({
          email: recoveryForm.email,
          cpf: recoveryForm.cpf,
        }),
      });
      setRecoveryStep("redefinir");
    } catch (requestError) {
      setRecoveryError(
        requestError.message || "Não foi possível validar os dados informados.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRedefinirSenha(event) {
    event.preventDefault();
    setRecoveryError("");

    if (recoveryForm.novaSenha.length < 6) {
      setRecoveryError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (recoveryForm.novaSenha !== recoveryForm.confirmarSenha) {
      setRecoveryError("As senhas informadas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/auth/recuperar-senha/redefinir", {
        method: "POST",
        body: JSON.stringify({
          email: recoveryForm.email,
          cpf: recoveryForm.cpf,
          novaSenha: recoveryForm.novaSenha,
        }),
      });
      fecharRecuperacao();
      setEmail(recoveryForm.email);
      setInfo("Senha redefinida com sucesso. Faça login com a nova senha.");
    } catch (requestError) {
      setRecoveryError(
        requestError.message || "Não foi possível redefinir a senha.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (isRecovering) {
    return (
      <div className="auth-setup">
        <main className="auth-setup-card">
          <img
            className="auth-logo"
            src="/brand/umufrio-logo.png"
            alt="UmuFrio"
          />
          <h1>Recuperar senha</h1>
          <p>
            {recoveryStep === "identificar"
              ? "Informe seu e-mail e CPF cadastrados para confirmar sua identidade."
              : "Defina uma nova senha de acesso."}
          </p>

          {recoveryError && (
            <div className="auth-feedback auth-error" role="alert">
              {recoveryError}
            </div>
          )}

          {recoveryStep === "identificar" ? (
            <form className="auth-setup-form" onSubmit={handleValidarRecuperacao}>
              <div className="auth-setup-grid">
                <label className="auth-field auth-field-full">
                  <span>E-mail corporativo</span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={recoveryForm.email}
                    onChange={(event) =>
                      setRecoveryForm({ ...recoveryForm, email: event.target.value })
                    }
                    placeholder="voce@empresa.com.br"
                    required
                    autoFocus
                  />
                </label>
                <label className="auth-field auth-field-full">
                  <span>CPF</span>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={recoveryForm.cpf}
                    onChange={(event) =>
                      setRecoveryForm({ ...recoveryForm, cpf: event.target.value })
                    }
                    placeholder="Somente números"
                    required
                  />
                </label>
              </div>
              <button className="auth-primary" type="submit" disabled={loading}>
                {loading ? "Validando..." : "Continuar"}
              </button>
            </form>
          ) : (
            <form className="auth-setup-form" onSubmit={handleRedefinirSenha}>
              <div className="auth-setup-grid">
                <label className="auth-field auth-field-full">
                  <span>Nova senha</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={recoveryForm.novaSenha}
                    onChange={(event) =>
                      setRecoveryForm({ ...recoveryForm, novaSenha: event.target.value })
                    }
                    minLength={6}
                    placeholder="Mínimo de 6 caracteres"
                    required
                    autoFocus
                  />
                </label>
                <label className="auth-field auth-field-full">
                  <span>Confirmar nova senha</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={recoveryForm.confirmarSenha}
                    onChange={(event) =>
                      setRecoveryForm({ ...recoveryForm, confirmarSenha: event.target.value })
                    }
                    minLength={6}
                    placeholder="Repita a nova senha"
                    required
                  />
                </label>
              </div>
              <button className="auth-primary" type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Redefinir senha"}
              </button>
            </form>
          )}

          <button
            type="button"
            className="auth-secondary-link"
            onClick={fecharRecuperacao}
          >
            Voltar ao login
          </button>
        </main>
      </div>
    );
  }

  if (isBootstrap) {
    return (
      <div className="auth-setup">
        <main className="auth-setup-card">
          <img
            className="auth-logo"
            src="/brand/umufrio-logo.png"
            alt="UmuFrio"
          />
          <h1>Configure sua operação</h1>
          <p>Crie o acesso do responsável pelo sistema para começar.</p>

          {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}

          <form className="auth-setup-form" onSubmit={handleBootstrap}>
            <div className="auth-setup-grid">
              <label className="auth-field">
                <span>Nome completo</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={form.nome}
                  onChange={(event) =>
                    setForm({ ...form, nome: event.target.value })
                  }
                  placeholder="Seu nome completo"
                  required
                  autoFocus
                />
              </label>
              <label className="auth-field">
                <span>E-mail corporativo</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="voce@empresa.com.br"
                  required
                />
              </label>
              <label className="auth-field">
                <span>CPF</span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.cpf}
                  onChange={(event) =>
                    setForm({ ...form, cpf: event.target.value })
                  }
                  placeholder="Somente números"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Telefone</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={form.telefone}
                  onChange={(event) =>
                    setForm({ ...form, telefone: event.target.value })
                  }
                  placeholder="(00) 00000-0000"
                  required
                />
              </label>
              <label className="auth-field auth-field-full">
                <span>Senha de acesso</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.senha}
                  onChange={(event) =>
                    setForm({ ...form, senha: event.target.value })
                  }
                  minLength={6}
                  placeholder="Mínimo de 6 caracteres"
                  required
                />
              </label>
            </div>
            <button className="auth-primary" type="submit" disabled={loading}>
              {loading ? "Configurando..." : "Criar conta e continuar"}
            </button>
          </form>
          <button
            type="button"
            className="auth-secondary-link"
            onClick={() => switchScreen(false)}
          >
            Voltar ao login
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-login">
      <section className="auth-login-art" aria-label="UmuFrio Gestão Técnica">
        <div className="auth-hero-brand">
          <span className="auth-hero-mark"><Icon name="wind" size={23} /></span>
          <span><strong>UmuFrio</strong><small>GESTÃO TÉCNICA</small></span>
        </div>
        <div className="auth-hero-features">
          <span><Icon name="wind" size={18} /> Fluxo claro</span>
          <span><Icon name="shield" size={18} /> Dados protegidos</span>
        </div>
        <div className="auth-hero-copy">
          <h1>O dia da sua operação, sob controle.</h1>
          <p>
            Agendamentos, equipes, peças e ordens de serviço em um só lugar.
            Feito para quem mantém o Brasil confortável.
          </p>
        </div>
      </section>

      <section className="auth-login-panel">
        <div className="auth-form-wrap">
          <img
            className="auth-logo"
            src="/brand/umufrio-logo.png"
            alt="UmuFrio"
          />
          <h1>Entrar no UmuFrio</h1>
          <p>Acesse o painel</p>
          {error && <div className="auth-feedback auth-error" role="alert">{error}</div>}
          {info && <div className="auth-feedback" role="status">{info}</div>}
          <form className="auth-form" onSubmit={handleLogin}>
            <label className="auth-field">
              <span>E-mail corporativo</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@empresa.com.br"
                required
                autoFocus
              />
            </label>
            <label className="auth-field">
              <span>Senha</span>
              <span className="auth-password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                  placeholder="Sua senha"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={17} />
                </button>
              </span>
            </label>
            <button
              type="button"
              className="auth-forgot"
              onClick={abrirRecuperacao}
            >
              Esqueci minha senha
            </button>
            <button className="auth-primary" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>
          <p className="auth-switch">
            Primeiro acesso?{" "}
            <button type="button" onClick={() => switchScreen(true)}>
              Cadastre sua conta
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}