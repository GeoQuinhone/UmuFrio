import React, { useState } from "react";

import Welcome from "./pages/Welcome.jsx";
import Clientes from "./pages/Clientes.jsx";
import Agendamentos from "./pages/Agendamentos.jsx";
import OrdensServico from "./pages/OrdensServico.jsx";
import Estoque from "./pages/Estoque.jsx";
import Usuarios from "./pages/Usuarios.jsx";
import Login from "./pages/Login.jsx";
import PrimeiroAcesso from "./pages/PrimeiroAcesso.jsx";

import { useApiCrud } from "./hooks/useApiCrud.js";
import { AuthProvider, useAuth } from "./AuthContext.jsx";

function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState("welcome");

  const acessoLiberado = Boolean(user && !user.primeiroAcesso);

  const isAtendenteOuCeo =
    acessoLiberado &&
    (user.perfil === "ceo" || user.perfil === "atendente");

  const isEstoquistaOuCeo =
    acessoLiberado &&
    (user.perfil === "ceo" || user.perfil === "estoquista");

  const isCeo = acessoLiberado && user.perfil === "ceo";

  const podeVerAgenda =
    acessoLiberado &&
    ["ceo", "atendente", "tecnico"].includes(user.perfil);

  const clientes = useApiCrud("/clientes", {
    enabled: isAtendenteOuCeo,
  });

  const usuarios = useApiCrud("/usuarios", {
    enabled: isCeo,
  });

  const agendamentos = useApiCrud("/agendamentos", {
    enabled: podeVerAgenda,
  });

  const ordensServico = useApiCrud("/ordens-servico", {
    enabled: podeVerAgenda,
  });

  const estoque = useApiCrud("/produtos", {
    enabled: isEstoquistaOuCeo,
  });

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-box">
          <p>Carregando sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (user.primeiroAcesso) {
    return <PrimeiroAcesso />;
  }

  function goHome() {
    setPage("welcome");
  }

  switch (page) {
    case "clientes":
      return (
        <Clientes
          crud={clientes}
          agendamentos={agendamentos}
          onBack={goHome}
        />
      );

    case "agendamentos":
      return (
        <Agendamentos
          crud={agendamentos}
          clientes={clientes}
          usuarios={usuarios}
          onBack={goHome}
        />
      );

    case "ordens":
      return (
        <OrdensServico
          crud={ordensServico}
          agendamentos={agendamentos}
          clientes={clientes}
          usuarios={usuarios}
          onBack={goHome}
        />
      );

    case "estoque":
      return <Estoque crud={estoque} onBack={goHome} />;

    case "usuarios":
      return <Usuarios crud={usuarios} onBack={goHome} />;

    default:
      return <Welcome onNavigate={setPage} />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}