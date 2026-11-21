import React, { useState } from "react";

import { useAuth } from "../AuthContext.jsx";
import ChatWidget from "../components/ChatWidget.jsx";
import Icon from "../components/Icon.jsx";
import TemaToggle from "../components/TemaToggle.jsx";
import { useWhatsappUrl } from "../utils/whatsapp.js";
import "./auth.css";

// Tela de login: entra com e-mail e senha, com o assistente de atendimento.
export default function Login() {
  // Estado do login (e-mail, senha, mensagens e carregamento).
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // Faz o login; se falhar, mostra a mensagem do servidor.
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

  // Link do WhatsApp para o rodapé do login.
  const whatsappUrl = useWhatsappUrl();

  // Monta a tela de login.
  return (
    <div className="auth-login">
      <TemaToggle className="tema-toggle-fixo" />
      {/* Lado esquerdo: marca, destaques e frase de apresentação. */}
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

      {/* Lado direito: formulário de entrada. */}
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
          {/* Formulário de e-mail e senha. */}
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
            <button className="auth-primary" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>
          <p className="auth-about-link">
            <a href="/">Conheça a UmuFrio: missão, visão e valores</a>
          </p>
          {/* Atalho para o WhatsApp. */}
          <div className="auth-whatsapp">
            <span>Precisa de ajuda ou quer contratar um serviço?</span>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" size={18} />
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </section>
      {/* Assistente de atendimento (chat). */}
      <ChatWidget />
    </div>
  );
}
