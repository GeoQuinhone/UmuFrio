import React, { useState } from "react";
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

  const podeClientes =
    user?.perfil === "ceo" ||
    user?.perfil === "atendente";

  const podeUsuarios =
    user?.perfil === "ceo";

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
    setPage("welcome");
  }

  switch (page) {
    case "clientes":
      return (
        <Clientes
          crud={clientes}
          onBack={voltarParaInicio}
        />
      );

    case "agendamentos":
      return (
        <Agendamentos
          crud={agendamentos}
          clientes={clientes}
          usuarios={usuarios}
          onBack={voltarParaInicio}
        />
      );

    case "ordens":
      return (
        <OrdensServico
          crud={ordensServico}
          agendamentos={agendamentos}
          clientes={clientes}
          usuarios={usuarios}
          servicos={servicos}
          onBack={voltarParaInicio}
        />
      );

    case "estoque":
      return (
        <Estoque
          crud={estoque}
          onBack={voltarParaInicio}
        />
      );

    case "usuarios":
      return (
        <Usuarios
          crud={usuarios}
          onBack={voltarParaInicio}
        />
      );

    case "servicos":
      return (
        <Servicos
          crud={servicos}
          estoque={estoque}
          onBack={voltarParaInicio}
        />
      );

    default:
      return (
        <Welcome
          onNavigate={setPage}
        />
      );
  }
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}