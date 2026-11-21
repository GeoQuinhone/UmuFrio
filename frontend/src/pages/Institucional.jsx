import React from "react";
import { Link } from "react-router-dom";
import TemaToggle from "../components/TemaToggle.jsx";
import ChatWidget from "../components/ChatWidget.jsx";
import Icon from "../components/Icon.jsx";
import { useWhatsappUrl } from "../utils/whatsapp.js";
import "./institucional.css";

// Fase 8 — página pública da empresa para o cliente (sem login): quem somos,
// visão, missão, valores e o "Fale conosco" (assistente de IA + WhatsApp).
// Acessível em /sobre.

const VALORES = [
  { icone: "shield", titulo: "Transparência", texto: "Orçamento claro, valor combinado antes do serviço e aviso quando algo muda." },
  { icone: "clock", titulo: "Pontualidade", texto: "Horário marcado é compromisso: avisamos você quando o técnico está a caminho." },
  { icone: "wrench", titulo: "Qualidade técnica", texto: "Equipe treinada, peças de procedência e manutenção preventiva que evita problemas." },
  { icone: "users", titulo: "Respeito ao cliente", texto: "Atendimento cordial, limpeza no local e explicação simples do que foi feito." },
  { icone: "snowflake", titulo: "Compromisso com o conforto", texto: "Climatização que funciona de verdade, com garantia e acompanhamento depois do serviço." },
];

const SERVICOS = [
  "Instalação de ar-condicionado",
  "Manutenção preventiva e corretiva",
  "Limpeza e higienização",
  "Recarga de gás refrigerante",
  "Reparo em placa eletrônica",
  "Retirada e remoção de equipamentos",
];

function abrirChat() {
  window.dispatchEvent(new Event("umufrio:abrir-chat"));
}

export default function Institucional() {
  const whatsappUrl = useWhatsappUrl();

  return (
    <div className="inst-page">
      <header className="inst-topbar">
        <Link to="/" className="inst-brand" aria-label="UmuFrio, início">
          <span className="inst-brand-mark"><Icon name="wind" size={20} /></span>
          <strong>UmuFrio</strong>
        </Link>
        <nav className="inst-nav" aria-label="Seções">
          <a href="#quem-somos">Quem somos</a>
          <a href="#missao">Missão, visão e valores</a>
          <a href="#servicos">Serviços</a>
          <a href="#contato">Fale conosco</a>
          <TemaToggle/>
          <Link to="/login" className="inst-login">Área da equipe</Link>
        </nav>
      </header>

      <main>
        <section className="inst-hero">
          <div>
            <span className="inst-eyebrow">REFRIGERAÇÃO E CLIMATIZAÇÃO</span>
            <h1>Conforto que você sente, serviço que você acompanha.</h1>
            <p>
              A UmuFrio cuida da instalação, manutenção e reparo do seu ar-condicionado com
              hora marcada, técnico identificado e aviso a cada etapa do atendimento.
            </p>
            <div className="inst-hero-actions">
              <a className="inst-btn inst-btn-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={17} /> Pedir um orçamento
              </a>
              <button type="button" className="inst-btn" onClick={abrirChat}>Falar com o assistente</button>
            </div>
          </div>
          <ul className="inst-hero-facts" aria-label="Diferenciais">
            <li><strong>Hora marcada</strong><span>agenda confirmada com você</span></li>
            <li><strong>Aviso por WhatsApp</strong><span>quando o serviço começa e termina</span></li>
            <li><strong>Pagamento facilitado</strong><span>PIX, dinheiro e cartões</span></li>
          </ul>
        </section>

        <section id="quem-somos" className="inst-section">
          <h2>Quem somos</h2>
          <p className="inst-lead">
            Somos uma empresa de refrigeração e climatização que une experiência de campo e
            tecnologia. Cada atendimento é registrado de ponta a ponta: do agendamento ao
            pagamento, para que você saiba exatamente o que foi feito e quanto custou.
          </p>
        </section>

        <section id="missao" className="inst-section inst-section-alt">
          <div className="inst-mvv">
            <article>
              <span className="inst-mvv-icon"><Icon name="check" size={18} /></span>
              <h3>Missão</h3>
              <p>
                Garantir o conforto térmico de casas e empresas com serviços de climatização
                seguros, pontuais e transparentes.
              </p>
            </article>
            <article>
              <span className="inst-mvv-icon"><Icon name="eye" size={18} /></span>
              <h3>Visão</h3>
              <p>
                Ser a empresa de climatização mais confiável da região, reconhecida pelo
                cuidado com o cliente e pela qualidade do trabalho técnico.
              </p>
            </article>
          </div>

          <h3 className="inst-values-title">Nossos valores</h3>
          <ul className="inst-values">
            {VALORES.map((v) => (
              <li key={v.titulo}>
                <span className="inst-mvv-icon"><Icon name={v.icone} size={18} /></span>
                <strong>{v.titulo}</strong>
                <p>{v.texto}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="servicos" className="inst-section">
          <h2>O que fazemos</h2>
          <ul className="inst-services">
            {SERVICOS.map((s) => (
              <li key={s}><Icon name="check" size={15} /> {s}</li>
            ))}
          </ul>
          <p className="inst-note">Os valores variam conforme o equipamento e o local. Pergunte ao nosso assistente ou peça um orçamento.</p>
        </section>

        <section id="contato" className="inst-section inst-section-alt inst-contact">
          <div>
            <h2>Fale conosco</h2>
            <p className="inst-lead">
              Tem dúvidas sobre serviços, valores, horários ou formas de pagamento? Nosso
              assistente virtual responde na hora. Para agendar, é só chamar um atendente.
            </p>
            <div className="inst-hero-actions">
              <a className="inst-btn inst-btn-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={17} /> Falar no WhatsApp
              </a>
            </div>
            <p className="inst-note">
              Clique em “Fale conosco” (ou no botão de conversa no canto da tela) para falar com o assistente de IA.
            </p>
          </div>
          <div className="inst-contact-card">
            <Icon name="chat" size={28} />
            <strong>Assistente UmuFrio</strong>
            <span>Respostas rápidas sobre serviços, horários e pagamento — 24 horas.</span>
          </div>
        </section>
      </main>

      <footer className="inst-footer">
        <span>© {new Date().getFullYear()} UmuFrio · Gestão Técnica</span>
        <Link to="/login">Área da equipe</Link>
      </footer>

      <ChatWidget />
    </div>
  );
}
