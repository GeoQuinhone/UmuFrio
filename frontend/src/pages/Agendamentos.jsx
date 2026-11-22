import React, { useEffect, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";

import { useAuth } from "../AuthContext.jsx";
import { Badge, EmptyState, ErrorBanner, SuccessBanner, Field, Select, TextInput } from "../components/FormControls.jsx";
import Icon from "../components/Icon.jsx";
import Layout from "../components/Layout.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useMotivoDialog } from "../components/MotivoDialog.jsx";
import QuickClientDialog from "../components/QuickClientDialog.jsx";
import AtendimentoDialog from "../components/AtendimentoDialog.jsx";
import PagamentoDialog from "../components/PagamentoDialog.jsx";
import {
  atendimentoNaoIniciado,
  estadoDoAtendimento,
  formatDate,
  formatMoeda,
  linkLigacao,
  linkWhatsappCliente,
  osCode,
  pagamentoConfirmado,
  podeRegistrarPagamento,
  valorDoAtendimento,
} from "../utils/atendimento.js";
import "./scheduling-orders.css";
import { useSucesso } from "../hooks/useSucesso.js";

// Endereço base da tela de agendamentos.
const LISTA = "/agendamentos";

// Formulário de agendamento vazio (cliente, serviço, técnico, data e hora).
const FORM_VAZIO = {
  clienteId: "",
  servicoId: "",
  tecnicoId: "",
  data: "",
  hora: "",
};

// Formata a data como dia e mês abreviado (ex.: 17 nov).
function formatDayMonth(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  const monthName = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(Number(year), Number(month) - 1, Number(day)))
    .replace(".", "")
    .toUpperCase();
  return `${day} ${monthName}`;
}

// Converte a hora (HH:MM) em minutos desde a meia-noite.
function minutosDoDia(hora) {
  const [h, m] = String(hora || "").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Chave de ordenação do atendimento (data e hora).
function chaveDataHora(atendimento) {
  return `${String(atendimento.data || "").slice(0, 10)} ${String(atendimento.hora || "").slice(0, 5)}`;
}

// Textos do aviso do WhatsApp para cada resultado do envio.
const TEXTO_AVISO_WHATSAPP = {
  enviado: "Cliente avisado pelo WhatsApp.",
  nao_configurado: "Avise o cliente pelo WhatsApp: a mensagem já está pronta.",
  erro: "Não foi possível avisar o cliente automaticamente. Envie pelo WhatsApp.",
  telefone_invalido: "O telefone do cliente não é válido para WhatsApp. Confira o cadastro.",
};

// Resultado do aviso ao cliente depois de iniciar, concluir ou registrar o
// atendimento como não realizado.
// Quando o envio automático não acontece, oferece o link wa.me com a mensagem.
// Faixa que mostra o resultado do aviso ao cliente e, se preciso, o link para enviar pelo WhatsApp.
function AvisoWhatsApp({ aviso, onClose }) {
  if (!aviso) return null;
  const enviado = aviso.status === "enviado";

  return (
    <div className={`whatsapp-aviso ${enviado ? "whatsapp-aviso-ok" : "whatsapp-aviso-pendente"}`} role="status">
      <span>{TEXTO_AVISO_WHATSAPP[aviso.status]}</span>
      {!enviado && aviso.link && (
        <a href={aviso.link} target="_blank" rel="noreferrer" className="whatsapp-aviso-link">
          Enviar pelo WhatsApp
        </a>
      )}
      <button type="button" onClick={onClose} aria-label="Fechar">
        ×
      </button>
    </div>
  );
}


// Define em qual aba o atendimento aparece: não realizados, cancelados, concluídos ou ativos.
function abaDoAtendimento(atendimento) {
  if (atendimento.naoRealizado) return "nao_realizados";
  if (atendimento.status === "cancelado") return "cancelados";
  if (atendimento.ordemStatus === "concluida") return "concluidos";
  return "ativos";
}

// Tela de agendamentos e ordens de serviço (fluxo único): lista com abas, formulário, detalhes, pagamento, início/conclusão do atendimento e aviso ao cliente.
export default function Agendamentos({
  crud,
  clientes,
  tecnicos,
  servicos,
  ordensServico,
  estoque,
  onEstoqueAlterado,
  onBack,
}) {
  // Usuário logado, navegação, perfil e diálogos de confirmação e de motivo.
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isTecnico = user?.perfil === "tecnico";
  const isCeo = user?.perfil === "ceo";
  const { confirm, confirmElement } = useConfirm();
  const { pedirMotivo, motivoElement } = useMotivoDialog();
  const {
    items = [],
    loading,
    error,
    add,
    update,
    remove,
    action,
  } = crud;

  // Estado da tela guiado pela URL (ponto 5):
  //   /agendamentos                 lista
  //   /agendamentos/novo            formulário de novo agendamento
  //   /agendamentos/12              detalhes do atendimento
  //   /agendamentos/12/editar       edição
  //   /agendamentos/12/pagamento    pagamento
  const matchNovo = useMatch("/agendamentos/novo");
  const matchEditar = useMatch("/agendamentos/:id/editar");
  const matchPagamento = useMatch("/agendamentos/:id/pagamento");
  const matchDetalhe = useMatch("/agendamentos/:id");

  const emNovo = Boolean(matchNovo);
  const emEditar = Boolean(matchEditar);
  const emPagamento = Boolean(matchPagamento);
  const emDetalhe = Boolean(matchDetalhe) && !emNovo;
  const rotaId =
    matchEditar?.params.id ??
    matchPagamento?.params.id ??
    (emDetalhe ? matchDetalhe.params.id : null);
  const alvo = rotaId
    ? items.find((atendimento) => String(atendimento.id) === String(rotaId))
    : null;

  const [form, setForm] = useState(FORM_VAZIO);
  const [formKey, setFormKey] = useState(null);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [sucesso, setSucesso] = useSucesso();
  // Fase 11: linha do atendimento que acabou de ser iniciado (destaque).
  const [destacadoId, setDestacadoId] = useState(null);

  useEffect(() => {
    if (!destacadoId) return undefined;
    // Leva a linha para a vista e tira o destaque depois de alguns segundos.
    const quadro = window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-atendimento-id="${destacadoId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const tempo = window.setTimeout(() => setDestacadoId(null), 6000);
    return () => {
      window.cancelAnimationFrame(quadro);
      window.clearTimeout(tempo);
    };
  }, [destacadoId]);
  const [avisoWhatsApp, setAvisoWhatsApp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Ajuste final: ?data=hoje (cartão "Atendimentos hoje" do Início) abre a
  // agenda já filtrada pelo dia de hoje.
  const filtroHoje =
    new URLSearchParams(location.search).get("data") === "hoje"
      ? new Date().toLocaleDateString("en-CA")
      : "";
  const [showFilters, setShowFilters] = useState(Boolean(filtroHoje));
  const [dateFrom, setDateFrom] = useState(filtroHoje);
  const [dateTo, setDateTo] = useState(filtroHoje);
  // Fase 8: ?aba=nao_realizados abre direto a aba (usado pelos relatórios).
  const abaInicial = new URLSearchParams(location.search).get("aba");
  const [aba, setAba] = useState(
    ["ativos", "concluidos", "cancelados", "nao_realizados"].includes(abaInicial) ? abaInicial : "ativos",
  );
  // Fase 11: ?pagamento=pendente (atalho do Início) mostra só os concluídos
  // com pagamento a receber, para a atendente ou o CEO cobrarem. Vale só
  // nessa entrada: ao trocar de aba, a lista volta ao normal.
  const [soPendentes, setSoPendentes] = useState(
    new URLSearchParams(location.search).get("pagamento") === "pendente",
  );

  // Listas auxiliares: clientes, técnicos e serviços ativos, e se os dados ainda estão carregando.
  const clientItems = clientes?.items || [];
  const technicianItems = tecnicos?.items || [];
  const serviceItems = servicos?.items || [];
  const clientesAtivos = clientItems.filter((cliente) => cliente.status === "ativo");
  const tecnicosAtivos = technicianItems.filter(
    (usuario) => usuario.perfil === "tecnico" && usuario.ativo !== 0,
  );
  const servicosAtivos = serviceItems.filter((servico) => servico.ativo !== 0);

  const dadosCarregando = Boolean(
    clientes?.loading || tecnicos?.loading || servicos?.loading,
  );
  // Indica se o formulário (novo ou edição) está aberto.
  const formularioAberto = emNovo || emEditar;

  // Acesso direto por URL a telas que o perfil não pode usar ou a registros
  // que não existem: volta para a lista com um aviso.
  // Para quem não pode usar a tela pedida (ou para registro inexistente), volta para a lista.
  useEffect(() => {
    if (loading) return;

    if (isTecnico && (emNovo || emEditar)) {
      navigate(LISTA, { replace: true });
      return;
    }

    if (rotaId && !alvo) {
      setBanner("Atendimento não encontrado.");
      navigate(LISTA, { replace: true });
      return;
    }

    if (emEditar && alvo && !atendimentoNaoIniciado(alvo)) {
      setBanner("Só é possível editar um atendimento que ainda não foi iniciado.");
      navigate(LISTA, { replace: true });
      return;
    }

    if (emPagamento && alvo && !podeRegistrarPagamento(alvo)) {
      setBanner("O pagamento só pode ser registrado com o atendimento em andamento ou concluído.");
      navigate(LISTA, { replace: true });
    }
  }, [loading, isTecnico, emNovo, emEditar, emPagamento, rotaId, alvo, navigate]);

  // Novo agendamento exige cliente, técnico e serviço ativos.
  // Novo agendamento: exige cliente, técnico e serviço ativos.
  useEffect(() => {
    if (!emNovo || isTecnico || dadosCarregando) return;

    if (clientesAtivos.length === 0) {
      setBanner("Cadastre pelo menos um cliente ativo antes de agendar.");
      navigate(LISTA, { replace: true });
    } else if (tecnicosAtivos.length === 0) {
      setBanner("Não há técnicos ativos disponíveis para agendar.");
      navigate(LISTA, { replace: true });
    } else if (servicosAtivos.length === 0) {
      setBanner("Cadastre pelo menos um serviço ativo antes de agendar.");
      navigate(LISTA, { replace: true });
    }
  }, [
    emNovo,
    isTecnico,
    dadosCarregando,
    clientesAtivos.length,
    tecnicosAtivos.length,
    servicosAtivos.length,
    navigate,
  ]);

  // Preenche o formulário uma vez ao abrir "novo" ou "editar".
  // Preenche o formulário ao abrir "novo" ou "editar".
  useEffect(() => {
    const chaveAtual = emNovo ? "novo" : emEditar && alvo ? `editar-${alvo.id}` : null;

    if (!chaveAtual) {
      if (formKey !== null) setFormKey(null);
      return;
    }
    if (formKey === chaveAtual) return;

    if (chaveAtual === "novo") {
      setForm(FORM_VAZIO);
    } else {
      setForm({
        clienteId: String(alvo.clienteId),
        servicoId: alvo.servicoId ? String(alvo.servicoId) : "",
        tecnicoId: String(alvo.tecnicoId),
        data: String(alvo.data || "").slice(0, 10),
        hora: String(alvo.hora || "").slice(0, 5),
      });
    }
    setErrors({});
    setFormKey(chaveAtual);
  }, [emNovo, emEditar, alvo, formKey]);

  // Abre o formulário de novo agendamento.
  function abrirNovo() {
    setBanner("");
    navigate(`${LISTA}/novo`);
  }

  // Fecha a tela atual e volta para a lista.
  function fecharRota() {
    navigate(LISTA);
  }

  // Fecha o pagamento e volta para o detalhe ou a lista.
  function fecharPagamento() {
    if (location.state?.from === "detalhe" && alvo) {
      navigate(`${LISTA}/${alvo.id}`);
    } else {
      navigate(LISTA);
    }
  }

  // Recarrega agendamentos e ordens de serviço (e o estoque, se mudou).
  async function recarregarTudo() {
    await Promise.all([crud.reload(), ordensServico?.reload?.()]);
    onEstoqueAlterado?.();
  }

  // Valida os campos do agendamento (cliente, serviço, técnico, data e hora).
  function validar() {
    const novosErros = {};

    if (!form.clienteId) novosErros.clienteId = "Selecione um cliente.";
    if (!form.servicoId) novosErros.servicoId = "Selecione um serviço.";
    if (!form.tecnicoId) novosErros.tecnicoId = "Selecione um técnico.";
    if (!form.data) novosErros.data = "Informe a data.";
    if (!form.hora) novosErros.hora = "Informe o horário.";
    // Trava do expediente: só aceita horários entre 07:00 e 19:00.
    else if (minutosDoDia(form.hora) < 7 * 60 || minutosDoDia(form.hora) > 19 * 60) {
      novosErros.hora = "Agende somente entre 07:00 e 19:00.";
    }

    // Ajuste final: hoje, só a partir do horário atual (ao criar ou ao mudar a data/hora).
    if (!novosErros.hora && form.data && form.hora) {
      const agora = new Date();
      const mudou =
        !emEditar ||
        String(alvo?.data || "").slice(0, 10) !== form.data ||
        String(alvo?.hora || "").slice(0, 5) !== String(form.hora).slice(0, 5);
      if (
        mudou &&
        form.data === agora.toLocaleDateString("en-CA") &&
        minutosDoDia(form.hora) < agora.getHours() * 60 + agora.getMinutes()
      ) {
        novosErros.hora = "Este horário já passou. Escolha um horário a partir de agora.";
      }
    }

    if (!novosErros.tecnicoId && !novosErros.data && !novosErros.hora) {
      const minutosReferencia = minutosDoDia(form.hora);

      const conflito = items.some(
        (outro) =>
          outro.id !== (emEditar ? alvo?.id : null) &&
          outro.tecnicoId === Number(form.tecnicoId) &&
          String(outro.data).slice(0, 10) === form.data &&
          outro.status === "agendado" &&
          // Ajuste final: concluído libera o horário (só o horário exato segue ocupado).
          (outro.ordemStatus === "concluida"
            ? minutosDoDia(outro.hora) === minutosReferencia
            : Math.abs(minutosDoDia(outro.hora) - minutosReferencia) < 60),
      );

      if (conflito) {
        novosErros.hora = "Este técnico já possui um agendamento a menos de 1h de diferença nesse horário.";
      }
    }

    setErrors(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  // Valida e salva o agendamento (cadastra ou atualiza).
  async function salvar(event) {
    event.preventDefault();
    if (!validar()) return;

    const payload = {
      clienteId: Number(form.clienteId),
      servicoId: Number(form.servicoId),
      tecnicoId: Number(form.tecnicoId),
      data: form.data,
      hora: form.hora,
    };

    setSaving(true);
    try {
      if (emEditar && alvo) {
        await update(alvo.id, payload);
      } else {
        await add(payload);
      }
      await ordensServico?.reload?.();
      setBanner("");
      setSucesso(
        emEditar && alvo
          ? "Agendamento atualizado com sucesso."
          : "Atendimento agendado com sucesso.",
      );
      navigate(LISTA);
    } catch (saveError) {
      setBanner(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  // Avança o atendimento: inicia (desconta peças do estoque) ou conclui, e avisa o cliente pelo WhatsApp.
  async function avancar(atendimento) {
    if (!atendimento.ordemId) return;
    const iniciando = atendimento.ordemStatus === "aberta";
    const cliente = atendimento.clienteNome;

    // Fase 11: sem o pagamento registrado, o técnico escolhe entre registrar
    // agora ou concluir com o pagamento pendente (informando o motivo).
    let corpo;
    if (!iniciando && !pagamentoConfirmado(atendimento)) {
      const escolha = await confirm(
        `O pagamento de ${cliente} ainda não foi registrado. Registre o pagamento agora ou conclua com o pagamento pendente (será pedido o motivo).`,
        {
          title: "Concluir atendimento",
          confirmLabel: "Registrar pagamento",
          extraLabel: "Concluir com pagamento pendente",
          cancelLabel: "Voltar",
          danger: false,
        },
      );
      if (escolha === true) {
        navigate(`${LISTA}/${atendimento.id}/pagamento`);
        return;
      }
      if (escolha !== "extra") return;

      const motivo = await pedirMotivo(
        "Por que não foi possível receber o pagamento na hora? (ex.: cliente vai pagar na empresa, só estavam funcionários no local, cliente pediu para pagar depois)",
        {
          title: "Pagamento pendente",
          confirmLabel: "Concluir",
          placeholder: "Ex.: cliente vai pagar na empresa amanhã",
          danger: false,
          minimo: 5,
        },
      );
      if (!motivo) return;
      corpo = { motivoPagamentoPendente: motivo };
    } else {
      const ok = await confirm(
        iniciando
          ? `Iniciar o atendimento de ${cliente}? As peças vinculadas ao serviço serão debitadas do estoque.`
          : `Concluir o atendimento de ${cliente}?`,
        {
          title: iniciando ? "Iniciar atendimento" : "Concluir atendimento",
          confirmLabel: iniciando ? "Iniciar" : "Concluir",
          danger: false,
        },
      );
      if (!ok) return;
    }

        try {
      let resultado;
      try {
        resultado = await ordensServico.action(atendimento.ordemId, "/avancar", corpo);
      } catch (erroAvancar) {
        // Fase 11: falta peça no estoque. O atendimento não para: quem inicia
        // (técnico, atendente ou CEO) pode seguir informando como resolveu.
        if (!iniciando || erroAvancar.dados?.codigo !== "FALTA_PECA") throw erroAvancar;
        const lista = (erroAvancar.dados.faltando || [])
          .map((peca) => `${peca.nome} (precisa ${peca.necessario}, há ${peca.saldo})`)
          .join(", ");
        const seguir = await confirm(
          `Falta peça no estoque: ${lista}. O sistema baixa só o que existe e avisa o CEO. Iniciar mesmo assim?`,
          { title: "Falta peça no estoque", confirmLabel: "Iniciar mesmo assim", cancelLabel: "Voltar", danger: false },
        );
        if (!seguir) return;
        const motivo = await pedirMotivo(
          "Como a peça foi resolvida? (ex.: comprei na loja do bairro, a peça estava no estoque e o saldo estava errado, o técnico tinha no carro)",
          {
            title: "Iniciar com falta de peça",
            confirmLabel: "Iniciar",
            placeholder: "Ex.: comprei a tubulação na loja X",
            danger: false,
            minimo: 5,
          },
        );
        if (!motivo) return;
        resultado = await ordensServico.action(atendimento.ordemId, "/avancar", { motivoFaltaPeca: motivo });
      }
      await recarregarTudo();
      // Fase 11: o atendimento iniciado sobe para o topo e fica destacado.
      // Ao concluir, vai para a aba Concluídos, onde ele aparece em 1º.
      if (!iniciando) trocarAba("concluidos");
      setDestacadoId(atendimento.id);
      setBanner("");
      setSucesso(
        iniciando
          ? "Atendimento iniciado com sucesso."
          : "Atendimento concluído com sucesso.",
      );
      setAvisoWhatsApp(resultado?.aviso || null);
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  // Cancela o agendamento (com confirmação).
  async function cancelar(atendimento) {
    const ok = await confirm(
      `Cancelar o agendamento de ${atendimento.clienteNome}?${atendimento.ordemId ? " A ordem de serviço aberta será removida junto." : ""}`,
      { title: "Cancelar agendamento", confirmLabel: "Cancelar agendamento" },
    );
    if (!ok) return;

    try {
      await action(atendimento.id, "/cancelar");
      await recarregarTudo();
      setBanner("");
      setSucesso("Agendamento cancelado com sucesso.");
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  // Marca o atendimento como não realizado, pedindo o motivo.
  async function marcarNaoRealizado(atendimento) {
    const motivo = await pedirMotivo(
      "Por que o atendimento não pôde ser realizado? (ex.: cliente ausente, local fechado)",
      { title: "Registrar atendimento não realizado", confirmLabel: "Registrar" },
    );
    if (!motivo) return;

    try {
      const resultado = await action(atendimento.id, "/nao-realizado", { motivo });
      await recarregarTudo();
      setBanner("");
      setSucesso("Atendimento registrado como não realizado.");
      setAvisoWhatsApp(resultado?.aviso || null);
    } catch (actionError) {
      setBanner(actionError.message);
    }
  }

  // Pede confirmação e exclui o agendamento.
  async function excluir(atendimento) {
    const ok = await confirm(
      `Excluir definitivamente o atendimento de ${atendimento.clienteNome}? Se ele estiver em andamento, as peças debitadas voltam ao estoque. Esta ação não pode ser desfeita.`,
      { title: "Excluir atendimento", confirmLabel: "Excluir" },
    );
    if (!ok) return;

    try {
      await remove(atendimento.id);
      await recarregarTudo();
      setBanner("");
      setSucesso("Atendimento excluído com sucesso.");
    } catch (removeError) {
      setBanner(removeError.message);
    }
  }

  // Salva o pagamento do atendimento.
  async function salvarPagamento(payload) {
    const atendimento = alvo;
    await ordensServico.action(atendimento.ordemId, "/pagamento", payload);
    // Fase 11: pagamento confirmado com o serviço em andamento já conclui.
    if (payload.pagamentoConfirmado && atendimento.ordemStatus === "andamento") {
      await concluirDepoisDoPagamento(atendimento);
      return;
    }
    await crud.reload();
    setSucesso("Pagamento registrado com sucesso.");
  }

  // Fase 11: pagou, concluiu. Usa a mesma rota do botão Concluir (avisa o
  // cliente no WhatsApp e notifica o CEO); como já está pago, não pede motivo.
  async function concluirDepoisDoPagamento(atendimento) {
    try {
      const resultado = await ordensServico.action(atendimento.ordemId, "/avancar");
      await recarregarTudo();
      trocarAba("concluidos");
      setDestacadoId(atendimento.id);
      setBanner("");
      setSucesso("Pagamento registrado e atendimento concluído.");
      setAvisoWhatsApp(resultado?.aviso || null);
    } catch (concluirError) {
      await crud.reload();
      setBanner(`Pagamento registrado, mas não foi possível concluir: ${concluirError.message}`);
    }
  }

  // Cadastra um cliente pelo diálogo rápido e já o seleciona.
  async function cadastrarClienteRapido(payload) {
    const cliente = await clientes.add(payload);
    setForm((current) => ({ ...current, clienteId: String(cliente.id) }));
    setSucesso("Cliente cadastrado com sucesso.");
    return cliente;
  }

  // Separa os atendimentos por aba (ativos, concluídos, cancelados e não realizados).
  const porAba = {
    ativos: items.filter((a) => abaDoAtendimento(a) === "ativos"),
    concluidos: items.filter((a) => abaDoAtendimento(a) === "concluidos"),
    cancelados: items.filter((a) => abaDoAtendimento(a) === "cancelados"),
    nao_realizados: items.filter((a) => abaDoAtendimento(a) === "nao_realizados"),
  };

  // Estados presentes na aba (para o filtro de status).
  const estadosDaAba = [];
  porAba[aba].forEach((atendimento) => {
    const estado = estadoDoAtendimento(atendimento);
    if (!estadosDaAba.some((existente) => existente.key === estado.key)) {
      estadosDaAba.push(estado);
    }
  });

  // Aplica busca, status e período à aba atual, em ordem de data e hora.
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredItems = porAba[aba]
    .slice()
    .sort((a, b) => {
      // Fase 11: concluídos pela hora da conclusão (o último concluído em 1º).
      if (aba === "concluidos") {
        return String(b.concluidaEm || "").localeCompare(String(a.concluidaEm || ""))
          || chaveDataHora(b).localeCompare(chaveDataHora(a));
      }
      if (aba !== "ativos") return chaveDataHora(b).localeCompare(chaveDataHora(a));
      // Fase 11: em andamento sempre no topo (o técnico acha na hora quem
      // ele acabou de iniciar); depois os agendados por data e hora.
      const andamentoA = a.ordemStatus === "andamento" ? 0 : 1;
      const andamentoB = b.ordemStatus === "andamento" ? 0 : 1;
      return andamentoA - andamentoB || chaveDataHora(a).localeCompare(chaveDataHora(b));
    })
    .filter((atendimento) => {
      const data = String(atendimento.data || "").slice(0, 10);
      const estado = estadoDoAtendimento(atendimento);
      if (statusFilter && estado.key !== statusFilter) return false;
      if (soPendentes && (atendimento.ordemStatus !== "concluida" || pagamentoConfirmado(atendimento))) return false;
      if (dateFrom && (!data || data < dateFrom)) return false;
      if (dateTo && (!data || data > dateTo)) return false;
      if (!normalizedSearch) return true;
      const searchable = [
        atendimento.clienteNome,
        atendimento.tecnicoNome,
        atendimento.servicoNome,
        atendimento.ordemId ? osCode(atendimento.ordemId) : "",
        data,
        atendimento.hora,
        estado.label,
      ].join(" ").toLocaleLowerCase("pt-BR");
      return searchable.includes(normalizedSearch);
    });

  // Indicadores do topo (agendados, em andamento e demais totais).
  const stats = [
    {
      label: "Agendados",
      value: items.filter((a) => a.status === "agendado" && (!a.ordemStatus || a.ordemStatus === "aberta")).length,
      detail: "Aguardando atendimento",
      tone: "blue",
    },
    {
      label: "Em andamento",
      value: items.filter((a) => a.ordemStatus === "andamento" && a.status === "agendado").length,
      detail: "Em execução",
      tone: "purple",
    },
    {
      label: "Concluídos",
      value: porAba.concluidos.length,
      detail: "Atendimentos finalizados",
      tone: "teal",
    },
    {
      label: "Pagamento pendente",
      value: items.filter((a) => podeRegistrarPagamento(a) && !pagamentoConfirmado(a)).length,
      detail: "Em andamento ou concluídos",
      tone: "orange",
    },
  ];

  // Listas para os campos de seleção (ativos, mantendo o item atual ao editar).
  const clientesDoSelect = [...clientesAtivos];
  if (
    emEditar &&
    alvo &&
    !clientesDoSelect.some((cliente) => cliente.id === alvo.clienteId)
  ) {
    clientesDoSelect.push({ id: alvo.clienteId, nome: alvo.clienteNome });
  }

  const tecnicosDoSelect = [...tecnicosAtivos];
  if (
    emEditar &&
    alvo &&
    !tecnicosDoSelect.some((tecnico) => tecnico.id === alvo.tecnicoId)
  ) {
    tecnicosDoSelect.push({ id: alvo.tecnicoId, nome: alvo.tecnicoNome });
  }

  const servicosDoSelect = [...servicosAtivos];
  if (
    emEditar &&
    alvo?.servicoId &&
    !servicosDoSelect.some((servico) => servico.id === alvo.servicoId)
  ) {
    servicosDoSelect.push({
      id: alvo.servicoId,
      nome: alvo.servicoNome,
      valor: alvo.servicoValor,
    });
  }

  // Limpa todos os filtros.
  function limparFiltros() {
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  // Troca de aba e limpa o filtro de status.
  function trocarAba(novaAba) {
    setAba(novaAba);
    setStatusFilter("");
    setSoPendentes(false);
  }

  // Abas da tela.
  const abas = [
    { key: "ativos", label: `Ativos (${porAba.ativos.length})` },
    { key: "concluidos", label: `Concluídos (${porAba.concluidos.length})` },
    { key: "cancelados", label: `Cancelados (${porAba.cancelados.length})` },
    { key: "nao_realizados", label: `Não realizados (${porAba.nao_realizados.length})` },
  ];

  // Monta a tela.
  return (
    <>
    <Layout
      title="Agendamentos"
      subtitle="Da visita marcada ao pagamento: agendamento e ordem de serviço em um só fluxo."
      onBack={onBack}
      action={!isTecnico && (
        <button
          type="button"
          className="schedule-primary-action"
          onClick={abrirNovo}
        >
          <Icon name="plus" size={16} />
          Novo agendamento
        </button>
      )}
    >
      {/* Conteúdo da página. */}
      <div className="scheduling-orders-screen schedule-screen">
        <ErrorBanner message={error || tecnicos?.error || banner} onClose={() => setBanner("")} />
        <SuccessBanner message={sucesso} onClose={() => setSucesso("")} />
        <AvisoWhatsApp aviso={avisoWhatsApp} onClose={() => setAvisoWhatsApp(null)} />

        {/* Cartões de resumo dos atendimentos. */}
        <section className="orders-summary-grid" aria-label="Resumo dos atendimentos">
          {stats.map((stat) => (
            <article className={`orders-summary-card orders-summary-${stat.tone}`} key={stat.label}>
              <span className="orders-summary-label">{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </section>

        {/* Formulário de novo agendamento ou edição (só CEO e atendente). */}
        {formularioAberto && !isTecnico && formKey && (
          <form className="form-card schedule-form" onSubmit={salvar}>
            <div className="schedule-form-heading">
              <div>
                <span className="schedule-eyebrow">{emEditar ? "EDITAR REGISTRO" : "NOVO REGISTRO"}</span>
                <h2>{emEditar ? "Editar agendamento" : "Novo agendamento"}</h2>
              </div>
              <button
                type="button"
                className="schedule-close-form"
                aria-label="Fechar formulário"
                onClick={fecharRota}
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <Field label="Cliente" error={errors.clienteId}>
                <div className="schedule-client-field">
                  <Select
                    value={form.clienteId}
                    onChange={(event) => setForm({ ...form, clienteId: event.target.value })}
                  >
                    <option value="">Selecione...</option>
                    {clientesDoSelect.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    className="btn-ghost schedule-client-new"
                    onClick={() => setShowQuickClient(true)}
                  >
                    <Icon name="plus" size={14} />
                    Novo cliente
                  </button>
                </div>
              </Field>

              <Field label="Serviço" error={errors.servicoId}>
                <Select
                  value={form.servicoId}
                  onChange={(event) => setForm({ ...form, servicoId: event.target.value })}
                >
                  <option value="">Selecione...</option>
                  {servicosDoSelect.map((servico) => (
                    <option key={servico.id} value={servico.id}>
                      {servico.nome} — {formatMoeda(servico.valor)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Técnico" error={errors.tecnicoId}>
                <Select
                  value={form.tecnicoId}
                  onChange={(event) => setForm({ ...form, tecnicoId: event.target.value })}
                >
                  <option value="">Selecione...</option>
                  {tecnicosDoSelect.map((tecnico) => (
                    <option key={tecnico.id} value={tecnico.id}>{tecnico.nome}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Data" error={errors.data}>
                <TextInput
                  type="date"
                  value={form.data}
                  onChange={(event) => setForm({ ...form, data: event.target.value })}
                />
              </Field>

              <Field label="Horário" error={errors.hora}>
                <TextInput
                  type="time"
                  min="07:00"
                  max="19:00"
                  value={form.hora}
                  onChange={(event) => setForm({ ...form, hora: event.target.value })}
                />
              </Field>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-ghost" onClick={fecharRota}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Salvando..." : emEditar ? "Salvar alterações" : "Agendar"}
              </button>
            </div>
          </form>
        )}

        {/* Abas: ativos, concluídos, cancelados e não realizados. */}
        <div className="schedule-tabs" role="tablist">
          {abas.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={aba === item.key}
              className={`schedule-tab${aba === item.key ? " is-active" : ""}`}
              onClick={() => trocarAba(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Barra de busca e filtros. */}
        <div className="schedule-toolbar" role="search">
          <label className="schedule-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente, técnico, serviço ou OS..."
              aria-label="Buscar atendimentos por cliente, técnico, serviço ou OS"
            />
          </label>
          <label className="schedule-status-filter">
            <span className="schedule-visually-hidden">Filtrar por status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos os status</option>
              {estadosDaAba.map((estado) => (
                <option key={estado.key} value={estado.key}>{estado.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`schedule-filter-toggle${showFilters ? " is-active" : ""}`}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((visible) => !visible)}
          >
            <Icon name="filter" size={15} />
            Filtros
          </button>
        </div>


        {/* Filtros extras (status e período). */}
        {showFilters && (
          <div className="schedule-filter-panel">
            <label>
              <span>De</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              <span>Até</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button type="button" className="schedule-clear-filters" onClick={limparFiltros}>
              Limpar filtros
            </button>
          </div>
        )}

        {loading ? (
          <EmptyState text="Carregando agendamentos..." />
        ) : items.length === 0 ? (
          <EmptyState text="Nenhum agendamento cadastrado ainda." />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            text={
              porAba[aba].length === 0
                ? "Nenhum atendimento nesta aba."
                : "Nenhum atendimento corresponde aos filtros aplicados."
            }
          />
        ) : (
          /* Tabela de atendimentos com as ações de cada linha. */
          <div className="schedule-table-card">
            <div className="schedule-table-scroll">
              <table className="schedule-data-table schedule-appointments-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Horário</th>
                    <th>Cliente</th>
                    <th>Serviço</th>
                    <th>Técnico</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th><span className="schedule-visually-hidden">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((atendimento) => {
                    const estado = estadoDoAtendimento(atendimento);
                    const naoIniciado = atendimentoNaoIniciado(atendimento);
                    const podeAvancar =
                      atendimento.ordemId &&
                      atendimento.status === "agendado" &&
                      atendimento.ordemStatus !== "concluida";
                    const mostraPagamento = podeRegistrarPagamento(atendimento);
                    // Fase 11: a carteira só aparece depois de concluído (em
                    // andamento, o pagamento passa pelo botão Concluir).
                    const podeAlterarPagamento =
                      mostraPagamento &&
                      atendimento.ordemStatus === "concluida" &&
                      (!pagamentoConfirmado(atendimento) || isCeo);
                    const podeExcluir =
                      isCeo && atendimento.ordemStatus !== "concluida";

                    return (
                      <tr
                        key={atendimento.id}
                        data-atendimento-id={atendimento.id}
                        className={destacadoId === atendimento.id ? "schedule-row-destaque" : undefined}
                      >
                        <td>
                          <span className="schedule-primary-cell">{formatDayMonth(atendimento.data)}</span>
                          <small className="schedule-secondary-cell">{formatDate(atendimento.data)}</small>
                        </td>
                        <td className="schedule-time-cell">
                          {atendimento.hora?.slice(0, 5) || "—"}
                        </td>
                        <td className="schedule-strong-cell">
                          {atendimento.clienteNome}
                          {atendimento.status === "agendado" && atendimento.clienteTelefone && (
                            <small className="schedule-secondary-cell schedule-contact">
                              {linkLigacao(atendimento.clienteTelefone) ? (
                                <a href={linkLigacao(atendimento.clienteTelefone)} title="Ligar para o cliente">
                                  {atendimento.clienteTelefone}
                                </a>
                              ) : (
                                atendimento.clienteTelefone
                              )}
                              {linkWhatsappCliente(atendimento, user?.nome) && (
                                <a
                                  className="schedule-whats-link"
                                  href={linkWhatsappCliente(atendimento, user?.nome)}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Chamar ${atendimento.clienteNome} no WhatsApp`}
                                  title="Chamar no WhatsApp"
                                >
                                  <Icon name="whatsapp" size={13} />
                                </a>
                              )}
                            </small>
                          )}
                        </td>
                        <td>
                          {atendimento.servicoNome || "—"}
                          {atendimento.ordemId && (
                            <small className="schedule-secondary-cell">{osCode(atendimento.ordemId)}</small>
                          )}
                        </td>
                        <td>{atendimento.tecnicoNome}</td>
                        <td>
                          {atendimento.status === "cancelado"
                            ? "—"
                            : formatMoeda(valorDoAtendimento(atendimento))}
                        </td>
                        <td>
                          <Badge tone={estado.tone}>{estado.label}</Badge>
                          {/* Fase 11: aviso antecipado de peça em falta no estoque. */}
                          {atendimento.ordemStatus === "aberta" && atendimento.pecasFaltando?.length > 0 && (
                            <small className="schedule-secondary-cell">
                              <span
                                className="schedule-falta-peca"
                                title={atendimento.pecasFaltando
                                  .map((peca) => `${peca.nome}: precisa ${peca.necessario}, há ${peca.saldo}`)
                                  .join(" · ")}
                              >
                                Falta peça
                              </span>
                            </small>
                          )}
                          {mostraPagamento && (
                            <small className="schedule-secondary-cell">
                              <Badge tone={pagamentoConfirmado(atendimento) ? "green" : "amber"}>
                                {pagamentoConfirmado(atendimento) ? "Pago" : "Pagamento pendente"}
                              </Badge>
                            </small>
                          )}
                          {/* Fase 11: o motivo do "não realizado" fica só nos detalhes. */}
                        </td>
                        <td className="schedule-row-actions">
                          <button
                            type="button"
                            className="schedule-icon-action"
                            aria-label={`Ver detalhes do atendimento de ${atendimento.clienteNome}`}
                            title="Ver detalhes e linha do tempo"
                            onClick={() => navigate(`${LISTA}/${atendimento.id}`)}
                          >
                            <Icon name="eye" size={16} />
                            <span className="schedule-visually-hidden">Ver detalhes</span>
                          </button>
                          {podeAvancar && (
                            <button
                              type="button"
                              className="schedule-icon-action"
                              aria-label={
                                atendimento.ordemStatus === "aberta"
                                  ? `Iniciar atendimento de ${atendimento.clienteNome}`
                                  : `Concluir atendimento de ${atendimento.clienteNome}`
                              }
                              title={atendimento.ordemStatus === "aberta" ? "Iniciar atendimento" : "Concluir atendimento"}
                              onClick={() => avancar(atendimento)}
                            >
                              <Icon name="check" size={16} />
                              <span className="schedule-visually-hidden">
                                {atendimento.ordemStatus === "aberta" ? "Iniciar" : "Concluir"}
                              </span>
                            </button>
                          )}
                          {podeAlterarPagamento && (
                            <button
                              type="button"
                              className="schedule-icon-action"
                              aria-label={`Registrar pagamento de ${atendimento.clienteNome}`}
                              title="Registrar pagamento"
                              onClick={() => navigate(`${LISTA}/${atendimento.id}/pagamento`)}
                            >
                              <Icon name="wallet" size={16} />
                              <span className="schedule-visually-hidden">Pagamento</span>
                            </button>
                          )}
                          {!isTecnico && naoIniciado && (
                            <button
                              type="button"
                              className="schedule-icon-action"
                              aria-label={`Editar agendamento de ${atendimento.clienteNome}`}
                              title="Editar agendamento"
                              onClick={() => navigate(`${LISTA}/${atendimento.id}/editar`)}
                            >
                              <Icon name="pencil" size={16} />
                              <span className="schedule-visually-hidden">Editar</span>
                            </button>
                          )}
                          {naoIniciado && (
                            <>
                              <button
                                type="button"
                                className="schedule-icon-action"
                                aria-label={`Marcar atendimento de ${atendimento.clienteNome} como não realizado`}
                                title="Registrar atendimento não realizado"
                                onClick={() => marcarNaoRealizado(atendimento)}
                              >
                                <Icon name="alertTriangle" size={15} />
                                <span className="schedule-visually-hidden">Não realizado</span>
                              </button>
                              <button
                                type="button"
                                className="schedule-icon-action schedule-icon-action-danger"
                                aria-label={`Cancelar agendamento de ${atendimento.clienteNome}`}
                                title="Cancelar agendamento"
                                onClick={() => cancelar(atendimento)}
                              >
                                <Icon name="ban" size={15} />
                                <span className="schedule-visually-hidden">Cancelar</span>
                              </button>
                            </>
                          )}
                          {podeExcluir && (
                            <button
                              type="button"
                              className="schedule-icon-action schedule-icon-action-danger"
                              aria-label={`Excluir atendimento de ${atendimento.clienteNome}`}
                              title="Excluir atendimento"
                              onClick={() => excluir(atendimento)}
                            >
                              <Icon name="trash" size={15} />
                              <span className="schedule-visually-hidden">Excluir</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
    {/* Diálogos de confirmação e de motivo. */}
    {confirmElement}
    {motivoElement}
    {/* Cadastro rápido de cliente. */}
    {showQuickClient && (
      <QuickClientDialog
        clientesExistentes={clientItems}
        onClose={() => setShowQuickClient(false)}
        onCreate={cadastrarClienteRapido}
      />
    )}
    {/* Detalhes do atendimento. */}
    {emDetalhe && alvo && (
      <AtendimentoDialog
        atendimento={alvo}
        perfil={user?.perfil}
        produtosAtivos={estoque?.items || []}
        onClose={fecharRota}
        onPagamento={() =>
          navigate(`${LISTA}/${alvo.id}/pagamento`, { state: { from: "detalhe" } })
        }
        onConsumoPecaExtra={() => {
          // Recarrega o atendimento para o valor das peças entrar no pagamento.
          onEstoqueAlterado?.();
          crud.reload();
        }}
      />
    )}
    {/* Pagamento do atendimento. */}
    {emPagamento && alvo && podeRegistrarPagamento(alvo) && (
      <PagamentoDialog
        atendimento={alvo}
        perfil={user?.perfil}
        onSave={salvarPagamento}
        onPagamentoConfirmado={() =>
          // PIX aprovado: se o serviço ainda estava em andamento, conclui.
          alvo.ordemStatus === "andamento" ? concluirDepoisDoPagamento(alvo) : crud.reload()
        }
        onClose={fecharPagamento}
      />
    )}
    </>
  );
}
