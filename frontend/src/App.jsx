import React, { useState } from "react";
import AppShell from "./components/AppShell.jsx";
import Welcome from "./pages/Welcome.jsx";
import Clientes from "./pages/Clientes.jsx";
import Agendamentos from "./pages/Agendamentos.jsx";
import OrdensServico from "./pages/OrdensServico.jsx";
import Estoque from "./pages/Estoque.jsx";
import Usuarios from "./pages/Usuarios.jsx";
import Servicos from "./pages/Servicos.jsx";
import Login from "./pages/Login.jsx";
import PrimeiroAcesso from "./pages/PrimeiroAcesso.jsx";
import { useApiCrud } from "./hooks/useApiCrud.js";
import {
  AuthProvider,
  useAuth,
} from "./AuthContext.jsx";

function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState("welcome");
  const [createAppointmentRequestId, setCreateAppointmentRequestId] = useState(0);

  const podeClientes =
    user?.perfil === "ceo" ||
    user?.perfil === "atendente";

  const podeUsuarios =
    user?.perfil === "ceo";

  const podeConsultarTecnicos =
    user?.perfil === "ceo" ||
    user?.perfil === "atendente";

  const podeMovimentarEstoque =
    user?.perfil === "ceo" ||
    user?.perfil === "estoquista";

  const podeConsultarProdutos =
    podeMovimentarEstoque ||
    podeClientes;

  const podeAgenda = Boolean(
    user &&
      ["ceo", "atendente", "tecnico"].includes(
        user.perfil,
      ),
  );

  const clientes = useApiCrud("/clientes", {
    enabled: podeClientes,
  });

  const usuarios = useApiCrud("/usuarios", {
    enabled: podeUsuarios,
  });

  const tecnicos = useApiCrud("/usuarios/tecnicos", {
    enabled: podeConsultarTecnicos,
  });

  const agendamentos = useApiCrud("/agendamentos", {
    enabled: podeAgenda,
  });

  const ordensServico = useApiCrud("/ordens-servico", {
    enabled: podeAgenda,
  });

  const estoque = useApiCrud("/produtos", {
    enabled: podeConsultarProdutos,
  });

  const servicos = useApiCrud("/servicos", {
    enabled: podeClientes,
  });

  if (loading) {
    return (
      <div className="layout">
        Carregando...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (user.primeiroAcesso) {
    return <PrimeiroAcesso />;
  }

  function voltarParaInicio() {
    navigateTo("welcome");
  }

  function navigateTo(nextPage) {
    setCreateAppointmentRequestId(0);
    setPage(nextPage);
  }

  function solicitarNovoAgendamento() {
    if (!["ceo", "atendente"].includes(user?.perfil)) return;
    setCreateAppointmentRequestId((requestId) => requestId + 1);
    setPage("agendamentos");
  }

  let pageContent;

  switch (page) {
    case "clientes":
      pageContent = (
        <Clientes
          crud={clientes}
          agendamentos={agendamentos}
          onBack={voltarParaInicio}
        />
      );
      break;

    case "agendamentos":
      pageContent = (
        <Agendamentos
          crud={agendamentos}
          clientes={clientes}
          usuarios={usuarios}
          tecnicos={tecnicos}
          createAppointmentRequestId={createAppointmentRequestId}
          onCreateAppointmentRequestHandled={() => setCreateAppointmentRequestId(0)}
          onBack={voltarParaInicio}
        />
      );
      break;

    case "ordens":
      pageContent = (
        <OrdensServico
          crud={ordensServico}
          agendamentos={agendamentos}
          clientes={clientes}
          usuarios={usuarios}
          tecnicos={tecnicos}
          servicos={servicos}
          onBack={voltarParaInicio}
        />
      );
      break;

    case "estoque":
      pageContent = (
        <Estoque
          crud={estoque}
          onBack={voltarParaInicio}
        />
      );
      break;

    case "usuarios":
      pageContent = (
        <Usuarios
          crud={usuarios}
          onBack={voltarParaInicio}
        />
      );
      break;

    case "servicos":
      pageContent = (
        <Servicos
          crud={servicos}
          estoque={estoque}
          onBack={voltarParaInicio}
        />
      );
      break;

    default:
      pageContent = (
        <Welcome
          onNavigate={navigateTo}
          onCreateAppointment={solicitarNovoAgendamento}
          clientes={clientes}
          agendamentos={agendamentos}
          ordensServico={ordensServico}
          estoque={estoque}
          servicos={servicos}
          usuarios={usuarios}
        />
      );
  }

  return (
    <AppShell
      activePage={page}
      onNavigate={navigateTo}
    >
      {pageContent}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}