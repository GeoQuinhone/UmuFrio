import React, { useState } from "react";
import Welcome from "./pages/Welcome.jsx";
import Clientes from "./pages/Clientes.jsx";
import Agendamentos from "./pages/Agendamentos.jsx";
import OrdensServico from "./pages/OrdensServico.jsx";
import Estoque from "./pages/Estoque.jsx";
import Usuarios from "./pages/Usuarios.jsx";
import { useApiCrud } from "./hooks/useApiCrud.js";

export default function App() {
  const [page, setPage] = useState("welcome");

  const clientes = useApiCrud("/clientes");
  const usuarios = useApiCrud("/usuarios");
  const agendamentos = useApiCrud("/agendamentos");
  const ordensServico = useApiCrud("/ordens-servico");
  const estoque = useApiCrud("/produtos");

  function goHome() {
    setPage("welcome");
  }

  switch (page) {
    case "clientes":
      return <Clientes crud={clientes} agendamentos={agendamentos} onBack={goHome} />;
    case "agendamentos":
      return <Agendamentos crud={agendamentos} clientes={clientes} usuarios={usuarios} onBack={goHome} />;
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
