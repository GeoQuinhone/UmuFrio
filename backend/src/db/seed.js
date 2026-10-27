import "../loadEnv.js";
import { eq, or } from "drizzle-orm";
import { db, pool } from "./client.js";
import {
  agendamentos,
  clientes,
  movimentacoesEstoque,
  ordensServico,
  produtos,
  servicoPecas,
  servicos,
  usuarios,
} from "./schema.js";
import { cpfValido, hashPassword } from "../security.js";

/*
 * Dados de demonstração: usuários, clientes, estoque, serviços e atendimentos
 * em todos os estados, para o sistema já abrir "em uso".
 *
 *   npm run db:seed
 *
 * Só roda com o banco sem clientes, para nunca misturar dados de exemplo com
 * dados reais. Não faz parte do build: é executado à mão, uma vez.
 *
 * SEED_TELEFONE_WHATSAPP (opcional) troca o telefone do cliente usado para
 * demonstrar o aviso pelo WhatsApp.
 */

const SENHA_DEMO = "Demo@2026";
const TELEFONE_WHATSAPP = process.env.SEED_TELEFONE_WHATSAPP || "(44) 99804-9224";

// Gera um CPF válido a partir dos 9 primeiros dígitos.
function cpfDe(base) {
  const digito = (numeros) => {
    let soma = 0;
    for (let i = 0; i < numeros.length; i += 1) {
      soma += Number(numeros[i]) * (numeros.length + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  const cpf = `${base}${d1}${digito(`${base}${d1}`)}`;
  if (!cpfValido(cpf)) throw new Error(`CPF gerado inválido: ${cpf}`);
  return cpf;
}

// Datas no fuso de Brasília (o servidor do Render roda em UTC).
function hojeEmBrasilia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function somarDias(data, dias) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function momento(data, hora, minutosDepois = 0) {
  const d = new Date(`${data}T${hora}:00-03:00`);
  return new Date(d.getTime() + minutosDepois * 60 * 1000);
}

const USUARIOS = [
  { chave: "atendente", nome: "Ana Paula Souza", email: "ana.atendente@exemplo.com", cpf: "529982247", telefone: "(44) 99811-2034", perfil: "atendente" },
  { chave: "estoquista", nome: "Marcos Vinícius Lima", email: "marcos.estoque@exemplo.com", cpf: "153509460", telefone: "(44) 99822-4471", perfil: "estoquista" },
  { chave: "carlos", nome: "Carlos Eduardo Pereira", email: "carlos.tecnico@exemplo.com", cpf: "861204370", telefone: "(44) 99833-5512", perfil: "tecnico" },
  { chave: "rafael", nome: "Rafael Henrique Martins", email: "rafael.tecnico@exemplo.com", cpf: "374619280", telefone: "(44) 99844-7203", perfil: "tecnico" },
];

const CLIENTES = [
  { chave: "romario", nome: "Romário Rocha", cpf: "418230965", telefone: TELEFONE_WHATSAPP, cep: "87501-000", logradouro: "Avenida Paraná", numero: "3210", bairro: "Zona I", tipoResidencia: "casa" },
  { chave: "maria", nome: "Maria Aparecida Santos", cpf: "245781036", telefone: "(44) 99901-3345", cep: "87502-070", logradouro: "Rua Desembargador Munhoz de Mello", numero: "1580", bairro: "Zona II", tipoResidencia: "apartamento", complemento: "Apto 302" },
  { chave: "joao", nome: "João Batista Oliveira", cpf: "637104582", telefone: "(44) 99912-8876", cep: "87503-120", logradouro: "Avenida Presidente Castelo Branco", numero: "4420", bairro: "Zona III", tipoResidencia: "casa" },
  { chave: "fernanda", nome: "Fernanda Costa Ribeiro", cpf: "902316475", telefone: "(44) 99923-1190", cep: "87504-210", logradouro: "Rua Ministro Oliveira Salazar", numero: "2275", bairro: "Zona IV", tipoResidencia: "apartamento", complemento: "Bloco B, apto 14" },
  { chave: "padaria", nome: "Padaria Pão Dourado", cpf: "186452930", telefone: "(44) 3623-4512", cep: "87501-200", logradouro: "Avenida Rio Branco", numero: "3685", bairro: "Centro", tipoResidencia: "barracao" },
  { chave: "lucas", nome: "Lucas Gabriel Ferreira", cpf: "731908264", telefone: "(44) 99934-6620", cep: "87505-030", logradouro: "Rua Peru", numero: "915", bairro: "Jardim Panorama", tipoResidencia: "casa" },
  { chave: "patricia", nome: "Patrícia Almeida Gomes", cpf: "564120893", telefone: "(44) 99945-2287", cep: "87506-150", logradouro: "Avenida Brasil", numero: "5120", bairro: "Jardim Ipanema", tipoResidencia: "casa" },
  { chave: "clinica", nome: "Clínica Sorriso Odontologia", cpf: "849327015", telefone: "(44) 3622-9087", cep: "87501-310", logradouro: "Rua Doutor Camargo", numero: "4012", bairro: "Centro", tipoResidencia: "barracao", complemento: "Sala 2" },
  { chave: "roberto", nome: "Roberto Carlos Nunes", cpf: "395867124", telefone: "(44) 99956-7713", cep: "87507-040", logradouro: "Rua das Américas", numero: "377", bairro: "Parque Danielle", tipoResidencia: "casa" },
  { chave: "juliana", nome: "Juliana Mendes Barbosa", cpf: "278543601", telefone: "(44) 99967-3358", cep: "87508-220", logradouro: "Avenida Ângelo Moreira da Fonseca", numero: "6230", bairro: "Jardim Tropical", tipoResidencia: "apartamento", complemento: "Apto 51" },
];

// saldoInicial é a entrada registrada no estoque; o saldo final desconta as
// peças usadas nos atendimentos iniciados. Alguns ficam abaixo do mínimo de
// propósito, para aparecer o alerta.
const PRODUTOS = [
  { chave: "r410", nome: "Gás refrigerante R-410A (kg)", valorUnitario: "95.00", saldoInicial: 5, quantidadeMinima: 4 },
  { chave: "r22", nome: "Gás refrigerante R-22 (kg)", valorUnitario: "120.00", saldoInicial: 6, quantidadeMinima: 2 },
  { chave: "cap355", nome: "Capacitor 35+5 µF", valorUnitario: "45.00", saldoInicial: 4, quantidadeMinima: 3 },
  { chave: "cap25", nome: "Capacitor 25 µF", valorUnitario: "38.00", saldoInicial: 8, quantidadeMinima: 3 },
  { chave: "filtro", nome: "Filtro secador 1/4\"", valorUnitario: "28.00", saldoInicial: 10, quantidadeMinima: 4 },
  { chave: "cobre14", nome: "Tubulação de cobre 1/4\" (metro)", valorUnitario: "32.00", saldoInicial: 30, quantidadeMinima: 10 },
  { chave: "cobre38", nome: "Tubulação de cobre 3/8\" (metro)", valorUnitario: "45.00", saldoInicial: 12, quantidadeMinima: 10 },
  { chave: "suporte", nome: "Suporte para condensadora", valorUnitario: "85.00", saldoInicial: 6, quantidadeMinima: 2 },
  { chave: "espuma", nome: "Espuma isolante (metro)", valorUnitario: "6.50", saldoInicial: 40, quantidadeMinima: 15 },
  { chave: "limpeza", nome: "Produto de limpeza para serpentina (litro)", valorUnitario: "35.00", saldoInicial: 12, quantidadeMinima: 5 },
  { chave: "fita", nome: "Fita PVC para acabamento", valorUnitario: "12.00", saldoInicial: 20, quantidadeMinima: 5 },
  { chave: "controle", nome: "Controle remoto universal", valorUnitario: "55.00", saldoInicial: 5, quantidadeMinima: 2 },
];

const SERVICOS = [
  { chave: "limpeza12", nome: "Limpeza de split até 12.000 BTUs", descricao: "Limpeza completa das unidades interna e externa.", valor: "180.00", pecas: { limpeza: 1 } },
  { chave: "limpeza18", nome: "Limpeza de split acima de 12.000 BTUs", descricao: "Limpeza completa das unidades interna e externa.", valor: "240.00", pecas: { limpeza: 1 } },
  { chave: "instalacao", nome: "Instalação de split 9.000 a 12.000 BTUs", descricao: "Instalação com até 3 metros de tubulação.", valor: "650.00", pecas: { cobre14: 3, cobre38: 3, suporte: 1, espuma: 6, fita: 2 } },
  { chave: "recarga", nome: "Recarga de gás R-410A", descricao: "Teste de vazamento e recarga de até 1 kg.", valor: "320.00", pecas: { r410: 1 } },
  { chave: "capacitor", nome: "Troca de capacitor", descricao: "Substituição do capacitor da condensadora.", valor: "210.00", pecas: { cap355: 1 } },
  { chave: "preventiva", nome: "Manutenção preventiva (PMOC)", descricao: "Limpeza, troca de filtro e relatório técnico.", valor: "280.00", pecas: { limpeza: 1, filtro: 1 } },
  { chave: "visita", nome: "Visita técnica / diagnóstico", descricao: "Avaliação do equipamento e orçamento.", valor: "120.00", pecas: {} },
];

// dia: dias a partir de hoje (negativo = passado). estado: agendado,
// andamento, concluido, cancelado, nao_realizado. pagamento só para
// concluídos ou em andamento. pagoHoje: confirmação com data de hoje, para o
// faturamento do mês nunca ficar vazio.
const ATENDIMENTOS = [
  { cliente: "maria", servico: "limpeza12", tecnico: "carlos", dia: -12, hora: "09:00", estado: "concluido", pagamento: { forma: "pix" } },
  { cliente: "padaria", servico: "preventiva", tecnico: "rafael", dia: -11, hora: "14:00", estado: "concluido", pagamento: { forma: "cartao_credito" } },
  { cliente: "joao", servico: "instalacao", tecnico: "carlos", dia: -9, hora: "08:00", estado: "concluido", duracao: 180, pagamento: { forma: "cartao_credito", valor: "620.00", observacao: "Desconto de R$ 30,00 por indicação de cliente." } },
  { cliente: "fernanda", servico: "recarga", tecnico: "rafael", dia: -7, hora: "10:00", estado: "concluido", pagamento: { forma: "dinheiro" } },
  { cliente: "clinica", servico: "limpeza18", tecnico: "carlos", dia: -5, hora: "15:00", estado: "concluido", pagamento: { forma: "pix", pagoHoje: true } },
  { cliente: "lucas", servico: "capacitor", tecnico: "rafael", dia: -4, hora: "09:00", estado: "concluido", pagamento: { forma: "cartao_debito", pagoHoje: true } },
  { cliente: "patricia", servico: "limpeza12", tecnico: "carlos", dia: -3, hora: "13:00", estado: "concluido", pagamento: { forma: "pix", pagoHoje: true } },
  { cliente: "roberto", servico: "visita", tecnico: "rafael", dia: -2, hora: "16:00", estado: "concluido" },
  { cliente: "juliana", servico: "recarga", tecnico: "carlos", dia: -1, hora: "10:00", estado: "concluido" },
  { cliente: "maria", servico: "visita", tecnico: "rafael", dia: -6, hora: "11:00", estado: "nao_realizado", motivo: "Cliente ausente no horário combinado." },
  { cliente: "lucas", servico: "limpeza12", tecnico: "carlos", dia: -2, hora: "08:00", estado: "cancelado" },
  { cliente: "padaria", servico: "limpeza18", tecnico: "rafael", dia: 0, hora: "08:00", estado: "andamento" },
  { cliente: "romario", servico: "limpeza12", tecnico: "carlos", dia: 0, hora: "14:00", estado: "agendado" },
  { cliente: "fernanda", servico: "preventiva", tecnico: "rafael", dia: 0, hora: "16:00", estado: "agendado" },
  { cliente: "joao", servico: "capacitor", tecnico: "carlos", dia: 1, hora: "09:00", estado: "agendado" },
  { cliente: "clinica", servico: "preventiva", tecnico: "rafael", dia: 1, hora: "14:00", estado: "agendado" },
  { cliente: "roberto", servico: "instalacao", tecnico: "carlos", dia: 2, hora: "08:00", estado: "agendado" },
  { cliente: "juliana", servico: "limpeza18", tecnico: "rafael", dia: 2, hora: "10:00", estado: "agendado" },
];

async function seed() {
  // O CEO vem antes: a rota /api/auth/bootstrap só funciona com o banco sem
  // usuários, e o seed cria usuários.
  const [ceo] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.perfil, "ceo")).limit(1);
  if (!ceo) {
    console.log("Crie o CEO primeiro (POST /api/auth/bootstrap) e depois rode o seed.");
    return;
  }

  const [clienteExistente] = await db.select({ id: clientes.id }).from(clientes).limit(1);
  if (clienteExistente) {
    console.log("O banco já tem clientes cadastrados. Seed cancelado para não misturar dados de exemplo com dados reais.");
    return;
  }

  const hoje = hojeEmBrasilia();
  const agora = new Date();

  await db.transaction(async (tx) => {
    const idUsuario = {};
    for (const u of USUARIOS) {
      const cpf = cpfDe(u.cpf);
      const [existente] = await tx
        .select({ id: usuarios.id, perfil: usuarios.perfil })
        .from(usuarios)
        .where(or(eq(usuarios.email, u.email), eq(usuarios.cpf, cpf)));
      if (existente) {
        if (existente.perfil !== u.perfil) {
          throw new Error(`Já existe um usuário com o e-mail ou CPF de ${u.nome}. Ajuste o seed.`);
        }
        idUsuario[u.chave] = existente.id;
        continue;
      }
      const [criado] = await tx
        .insert(usuarios)
        .values({
          nome: u.nome,
          email: u.email,
          cpf,
          telefone: u.telefone,
          perfil: u.perfil,
          senhaHash: hashPassword(SENHA_DEMO),
          primeiroAcesso: 0,
        })
        .returning({ id: usuarios.id });
      idUsuario[u.chave] = criado.id;
    }

    const idCliente = {};
    for (const c of CLIENTES) {
      const [criado] = await tx
        .insert(clientes)
        .values({
          nome: c.nome,
          cpf: cpfDe(c.cpf),
          telefone: c.telefone,
          cep: c.cep.replace(/\D/g, ""),
          logradouro: c.logradouro,
          numero: c.numero,
          complemento: c.complemento || null,
          bairro: c.bairro,
          cidade: "Umuarama",
          estado: "PR",
          tipoResidencia: c.tipoResidencia,
        })
        .returning({ id: clientes.id });
      idCliente[c.chave] = criado.id;
    }

    // Estoque: entrada inicial registrada 30 dias atrás pelo estoquista.
    const produto = {};
    const dataEntrada = momento(somarDias(hoje, -30), "08:00");
    for (const p of PRODUTOS) {
      const [criado] = await tx
        .insert(produtos)
        .values({
          nome: p.nome,
          valorUnitario: p.valorUnitario,
          saldo: p.saldoInicial,
          quantidadeMinima: p.quantidadeMinima,
        })
        .returning({ id: produtos.id });
      produto[p.chave] = { id: criado.id, saldo: p.saldoInicial };
      await tx.insert(movimentacoesEstoque).values({
        produtoId: criado.id,
        usuarioId: idUsuario.estoquista,
        tipo: "entrada",
        quantidade: p.saldoInicial,
        data: dataEntrada,
      });
    }

    const servico = {};
    for (const s of SERVICOS) {
      const [criado] = await tx
        .insert(servicos)
        .values({ nome: s.nome, descricao: s.descricao, valor: s.valor })
        .returning({ id: servicos.id });
      servico[s.chave] = { id: criado.id, valor: s.valor, pecas: s.pecas };
      for (const [chaveProduto, quantidade] of Object.entries(s.pecas)) {
        await tx.insert(servicoPecas).values({
          servicoId: criado.id,
          produtoId: produto[chaveProduto].id,
          quantidadeNecessaria: quantidade,
        });
      }
    }

    for (const a of ATENDIMENTOS) {
      const data = somarDias(hoje, a.dia);
      const cancelado = a.estado === "cancelado" || a.estado === "nao_realizado";
      const s = servico[a.servico];

      const [agendamento] = await tx
        .insert(agendamentos)
        .values({
          clienteId: idCliente[a.cliente],
          tecnicoId: idUsuario[a.tecnico],
          data,
          hora: a.hora,
          status: cancelado ? "cancelado" : "agendado",
          canceladoEm: cancelado ? momento(data, a.hora, -120) : null,
          naoRealizado: a.estado === "nao_realizado" ? 1 : 0,
          motivoNaoRealizado: a.estado === "nao_realizado" ? a.motivo : null,
        })
        .returning({ id: agendamentos.id });

      // Cancelados e não realizados ficam sem OS, como faz o sistema.
      if (cancelado) continue;

      const iniciado = a.estado === "andamento" || a.estado === "concluido";
      const iniciadaEm =
        a.estado === "andamento"
          ? new Date(Math.min(momento(data, a.hora).getTime(), agora.getTime() - 30 * 60 * 1000))
          : momento(data, a.hora, 10);
      const concluidaEm = momento(data, a.hora, 10 + (a.duracao || 60));
      const pago = Boolean(a.pagamento) && a.estado === "concluido";

      const [ordem] = await tx
        .insert(ordensServico)
        .values({
          agendamentoId: agendamento.id,
          servicoId: s.id,
          status: a.estado === "agendado" ? "aberta" : a.estado === "andamento" ? "andamento" : "concluida",
          abertaEm: momento(somarDias(data, -3), "10:00"),
          iniciadaEm: iniciado ? iniciadaEm : null,
          concluidaEm: a.estado === "concluido" ? concluidaEm : null,
          valorCobrado: iniciado ? a.pagamento?.valor || s.valor : null,
          formaPagamento: a.pagamento?.forma || null,
          pagamentoConfirmado: pago ? 1 : 0,
          pagamentoConfirmadoEm: pago
            ? a.pagamento.pagoHoje
              ? new Date(agora.getTime() - 60 * 60 * 1000)
              : concluidaEm
            : null,
          observacaoPagamento: a.pagamento?.observacao || null,
          pagamentoUsuarioId: pago ? idUsuario[a.tecnico] : null,
        })
        .returning({ id: ordensServico.id });

      // Peças do serviço saem do estoque quando o atendimento é iniciado.
      if (iniciado) {
        for (const [chaveProduto, quantidade] of Object.entries(s.pecas)) {
          const p = produto[chaveProduto];
          if (p.saldo < quantidade) {
            throw new Error(`Saldo insuficiente de ${chaveProduto} no seed.`);
          }
          p.saldo -= quantidade;
          await tx.insert(movimentacoesEstoque).values({
            produtoId: p.id,
            usuarioId: idUsuario[a.tecnico],
            ordemServicoId: ordem.id,
            tipo: "saida",
            quantidade,
            data: iniciadaEm,
          });
        }
      }
    }

    for (const p of Object.values(produto)) {
      await tx.update(produtos).set({ saldo: p.saldo }).where(eq(produtos.id, p.id));
    }
  });

  console.log("Dados de demonstração criados.");
  console.log(`Usuários de exemplo (senha ${SENHA_DEMO}):`);
  for (const u of USUARIOS) console.log(`  ${u.perfil.padEnd(10)} ${u.email}`);
  console.log(`Cliente para testar o WhatsApp: Romário Rocha, ${TELEFONE_WHATSAPP}`);
}


try {
  await seed();
} finally {
  await pool.end();
}
