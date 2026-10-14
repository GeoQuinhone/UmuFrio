import React from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import Welcome from "./pages/Welcome.jsx";
import Clientes from "./pages/Clientes.jsx";
import Agendamentos from "./pages/Agendamentos.jsx";
import Estoque from "./pages/Estoque.jsx";
import Usuarios from "./pages/Usuarios.jsx";
import Servicos from "./pages/Servicos.jsx";
import Login from "./pages/Login.jsx";
import PrimeiroAcesso from "./pages/PrimeiroAcesso.jsx";
import { useApiCrud } from "./hooks/useApiCrud.js";
import { caminhoDaChave } from "./routes.js";
import {
  AuthProvider,
  useAuth,
} from "./AuthContext.jsx";

function AppContent() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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

  // Versão reduzida do estoque (sem preço de custo/estoque mínimo), usada
  // pelo técnico na tela de Agendamentos para descontar peças extras
  // (ponto 12) sem precisar do acesso completo à tela de Estoque.
  const produtosParaOS = useApiCrud("/produtos/para-tecnico", {
    enabled: podeAgenda,
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

  // O painel inicial pede navegação pela chave do módulo; aqui ela vira URL.
  function navigateTo(key) {
    navigate(caminhoDaChave(key));
  }

  function voltarParaInicio() {
    navigate("/");
  }

  function solicitarNovoAgendamento() {
    if (!["ceo", "atendente"].includes(user?.perfil)) return;
    navigate("/agendamentos/novo");
  }

  // Estoque mudou (peças debitadas ao iniciar o atendimento ou peça extra):
  // atualiza a lista completa e a reduzida usada pelo técnico.
  function recarregarEstoque() {
    estoque.reload?.();
    produtosParaOS.reload?.();
  }

  // Acesso por URL só para quem tem o perfil do módulo; os demais voltam ao
  // início (o backend continua validando as permissões).
  function protegida(perfis, elemento) {
    return perfis.includes(user?.perfil) ? elemento : <Navigate to="/" replace />;
  }

  return (
    <AppShell>
      <Routes>
        <Route
          path="/"
          element={
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
          }
        />

        <Route
          path="/clientes"
          element={protegida(
            ["ceo", "atendente"],
            <Clientes
              crud={clientes}
              agendamentos={agendamentos}
              onBack={voltarParaInicio}
            />,
          )}
        />

        <Route
          path="/agendamentos/*"
          element={protegida(
            ["ceo", "atendente", "tecnico"],
            <Agendamentos
              crud={agendamentos}
              clientes={clientes}
              tecnicos={tecnicos}
              servicos={servicos}
              ordensServico={ordensServico}
              estoque={produtosParaOS}
              onEstoqueAlterado={recarregarEstoque}
              onBack={voltarParaInicio}
            />,
          )}
        />

        {/* Ponto 10: a ordem de serviço agora faz parte do agendamento. */}
        <Route
          path="/ordens-servico/*"
          element={<Navigate to="/agendamentos" replace />}
        />

        <Route
          path="/estoque"
          element={protegida(
            ["ceo", "estoquista"],
            <Estoque
              crud={estoque}
              onBack={voltarParaInicio}
            />,
          )}
        />

        <Route
          path="/usuarios"
          element={protegida(
            ["ceo"],
            <Usuarios
              crud={usuarios}
              onBack={voltarParaInicio}
            />,
          )}
        />

        <Route
          path="/servicos"
          element={protegida(
            ["ceo", "atendente"],
            <Servicos
              crud={servicos}
              estoque={estoque}
              onBack={voltarParaInicio}
            />,
          )}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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