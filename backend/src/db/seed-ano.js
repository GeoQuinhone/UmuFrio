import "../loadEnv.js";
import crypto from "node:crypto";
import pg from "pg";

import { EMAIL_CEO, EMAIL_TECNICO_NOVO, PRODUTOS, SERVICOS, USUARIOS_BASE, VEICULOS } from "./seedAno/dados.js";
import { gerarDespesas, gerarNotificacoes } from "./seedAno/financeiro.js";
import { cpfDe, gerarDados, somarDias } from "./seedAno/gerador.js";
import { inserirLinhas, lit } from "./seedAno/sql.js";

/*
 * Seed anual: ~13 meses de histórico (de 1º do mês de 13 meses atrás até hoje)
 * e agenda até 31/12 do ano corrente, com clientes, técnicos, atendimentos,
 * pagamentos (dinheiro, PIX e cartão), estoque, check-ins e relatórios cheios.
 *
 *   npm run db:seed-ano            (só mostra o aviso)
 *   npm run db:seed-ano -- --sim   (executa)
 *
 * Opções:
 *   --hoje=2026-11-23   finge que hoje é essa data (também: SEED_HOJE=2026-11-23)
 *   --sem-futuro        não cria agenda depois de "hoje" (o histórico termina na data de hoje)
 *   --zerar-tudo        recomeça TUDO do zero (inclusive usuários, serviços,
 *                       produtos e veículos), preservando só o controle das
 *                       migrações. Use para o banco ficar exatamente como o seed.
 *   SEED_SENHA=...      senha de todos os usuários criados (padrão Teste@123)
 *
 * ATENÇÃO: APAGA clientes, agendamentos, ordens de serviço, cobranças PIX,
 * check-ins e movimentações de estoque do banco de DATABASE_URL e cria dados
 * novos, tudo numa única transação (se algo falhar, nada é alterado). Usuários,
 * serviços, produtos e veículos existentes são mantidos; os que faltarem são
 * criados. Pode rodar de novo quando quiser: sempre recomeça do zero.
 *
 * Os dados usam semente fixa: o resultado é estável (clientes, serviços e a
 * distribuição ao longo do ano); só o "agora" muda o que já aconteceu e o que
 * ainda está por vir.
 * SEED_TELEFONE_WHATSAPP (opcional) troca o telefone do cliente de teste do
 * aviso por WhatsApp (Romário Rocha).
 */

const SENHA_DEMO = process.env.SEED_SENHA || "Teste@123";
const TELEFONE_WHATSAPP = process.env.SEED_TELEFONE_WHATSAPP || "(44) 99804-9224";

function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString("hex");
  return `${sal}:${crypto.scryptSync(senha, sal, 64).toString("hex")}`;
}

const hojeEmBrasilia = (agora) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

const q = async (client, texto) => (await client.query(texto)).rows;

// ----------------------------------------------------------- base existente

async function garantirUsuarios(client, hoje) {
  const hash = hashSenha(SENHA_DEMO);

  for (const u of USUARIOS_BASE) {
    await client.query(
      `INSERT INTO usuarios (nome, email, cpf, senha_hash, telefone, perfil, ativo, primeiro_acesso)
       VALUES (${lit(u.nome)}, ${lit(u.email)}, ${lit(u.cpf)}, ${lit(hash)}, ${lit(u.telefone)}, ${lit(u.perfil)}, 1, 0)
       ON CONFLICT DO NOTHING`,
    );
  }

  // Sempre pelo e-mail: não depende de quem já existia no banco.
  const emails = USUARIOS_BASE.map((u) => lit(u.email)).join(", ");
  const linhas = await q(client, `SELECT id, nome, email, perfil, ativo FROM usuarios WHERE email IN (${emails})`);
  const porEmail = new Map(linhas.map((u) => [u.email, u]));
  for (const u of USUARIOS_BASE) {
    const linha = porEmail.get(u.email);
    if (!linha || Number(linha.ativo) !== 1) {
      throw new Error(`Usuário ${u.email} não foi criado (CPF já usado por outro usuário?). Rode com --zerar-tudo.`);
    }
  }

  const base = (perfil) => USUARIOS_BASE.find((u) => u.perfil === perfil);
  const ator = (perfil) => porEmail.get(base(perfil).email);

  return {
    ceoId: Number(porEmail.get(EMAIL_CEO).id),
    ceoNome: porEmail.get(EMAIL_CEO).nome,
    atendenteId: Number(ator("atendente").id),
    atendenteNome: ator("atendente").nome,
    estoquistaId: Number(ator("estoquista").id),
    estoquistaNome: ator("estoquista").nome,
    tecnicos: USUARIOS_BASE.filter((u) => u.perfil === "tecnico").map((u) => ({
      id: Number(porEmail.get(u.email).id),
      nome: porEmail.get(u.email).nome,
      email: u.email,
      // O técnico mais novo entrou há ~5 meses: aparece só nos meses recentes.
      desde: u.email === EMAIL_TECNICO_NOVO ? somarDias(hoje, -150) : null,
    })),
  };
}

async function garantirCatalogo(client) {
  for (const p of PRODUTOS) {
    await client.query(
      `INSERT INTO produtos (nome, valor_unitario, saldo, quantidade_minima)
       SELECT ${lit(p.nome)}, ${lit(p.valorUnitario)}, 0, ${lit(p.minimo)}
        WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE nome = ${lit(p.nome)})`,
    );
  }
  const produtosDb = await q(client, "SELECT id, nome, valor_unitario, quantidade_minima FROM produtos");
  const produtos = PRODUTOS.map((p) => {
    const linha = produtosDb.find((x) => x.nome === p.nome);
    return {
      id: Number(linha.id),
      chave: p.chave,
      nome: p.nome,
      valorUnitario: Number(linha.valor_unitario),
      minimo: Number(linha.quantidade_minima),
      lote: p.lote,
      repDias: p.repDias,
    };
  });
  const idProduto = Object.fromEntries(produtos.map((p) => [p.chave, p.id]));

  for (const s of SERVICOS) {
    await client.query(
      `INSERT INTO servicos (nome, descricao, valor, ativo)
       SELECT ${lit(s.nome)}, ${lit(s.descricao)}, ${lit(s.valor)}, ${lit(s.ativo ?? 1)}
        WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = ${lit(s.nome)})`,
    );
  }
  const servicosDb = await q(client, "SELECT id, nome, valor FROM servicos");

  const servicos = [];
  for (const s of SERVICOS) {
    const linha = servicosDb.find((x) => x.nome === s.nome);
    const servicoId = Number(linha.id);

    for (const [chaveProduto, quantidade] of Object.entries(s.pecas)) {
      await client.query(
        `INSERT INTO servico_pecas (servico_id, produto_id, quantidade_necessaria)
         SELECT ${servicoId}, ${idProduto[chaveProduto]}, ${quantidade}
          WHERE NOT EXISTS (
            SELECT 1 FROM servico_pecas WHERE servico_id = ${servicoId} AND produto_id = ${idProduto[chaveProduto]}
          )`,
      );
    }

    const pecas = (
      await q(client, `SELECT produto_id, quantidade_necessaria FROM servico_pecas WHERE servico_id = ${servicoId}`)
    ).map((p) => ({ produtoId: Number(p.produto_id), quantidade: Number(p.quantidade_necessaria) }));

    servicos.push({ id: servicoId, chave: s.chave, nome: s.nome, valor: Number(linha.valor), pecas });
  }

  return { produtos, servicos };
}

async function garantirVeiculos(client, usuarios) {
  let proximoTecnico = 0;
  for (const v of VEICULOS) {
    const tecnico = v.semTecnico ? null : usuarios.tecnicos[proximoTecnico++]?.id ?? null;
    const condicaoTecnico = tecnico
      ? `AND NOT EXISTS (SELECT 1 FROM veiculos WHERE tecnico_id = ${tecnico})`
      : "";
    await client.query(
      `INSERT INTO veiculos (placa, marca, modelo, ano, tecnico_id, status)
       SELECT ${lit(v.placa)}, ${lit(v.marca)}, ${lit(v.modelo)}, ${lit(v.ano)}, ${lit(tecnico)}, ${lit(v.status || "ativo")}
        WHERE NOT EXISTS (SELECT 1 FROM veiculos WHERE placa = ${lit(v.placa)}) ${condicaoTecnico}`,
    );
  }
  return (await q(client, "SELECT id, placa, modelo, tecnico_id, status FROM veiculos ORDER BY id")).map((v) => ({
    id: Number(v.id),
    placa: v.placa,
    modelo: v.modelo,
    status: v.status,
    tecnicoId: v.tecnico_id ? Number(v.tecnico_id) : null,
  }));
}

// ------------------------------------------------------------------ gravação

function montarScript(dados) {
  const colunas = {
    clientes: ["id", "nome", "cpf", "telefone", "cep", "logradouro", "numero", "bairro", "cidade", "estado", "tipo_residencia", "complemento", "status", "inativado_em", "latitude", "longitude", "geo_endereco", "geocodificado_em"],
    agendamentos: ["id", "cliente_id", "tecnico_id", "data", "hora", "status", "cancelado_em", "nao_realizado", "motivo_nao_realizado"],
    ordens_servico: ["id", "agendamento_id", "servico_id", "status", "aberta_em", "iniciada_em", "concluida_em", "valor_cobrado", "forma_pagamento", "pagamento_confirmado", "pagamento_confirmado_em", "observacao_pagamento", "pagamento_usuario_id"],
    cobrancas_pix: ["id", "ordem_id", "usuario_id", "valor", "status", "modo", "mp_payment_id", "referencia", "codigo_copia_cola", "qr_code_base64", "ticket_url", "criado_em", "expira_em", "aprovado_em"],
    movimentacoes_estoque: ["id", "produto_id", "usuario_id", "ordem_servico_id", "tipo", "quantidade", "data", "extra"],
    despesas: ["id", "descricao", "categoria", "valor", "data", "observacao", "usuario_id", "veiculo_id", "funcionario_id", "criado_em"],
    notificacoes: ["id", "tipo", "titulo", "mensagem", "agendamento_id", "ordem_id", "produto_id", "criada_em", "lida_em"],
    registros_localizacao: ["id", "ordem_id", "tipo", "usuario_id", "latitude", "longitude", "precisao_m", "distancia_m", "raio_m", "dentro_raio", "justificativa", "criado_em"],
  };

  const comandos = [
    "TRUNCATE TABLE registros_localizacao, cobrancas_pix, movimentacoes_estoque, notificacoes, despesas, ordens_servico, agendamentos, clientes RESTART IDENTITY;",
    ...inserirLinhas("clientes", colunas.clientes, dados.clientes),
    ...inserirLinhas("agendamentos", colunas.agendamentos, dados.agendamentos),
    ...inserirLinhas("ordens_servico", colunas.ordens_servico, dados.ordens),
    ...inserirLinhas("cobrancas_pix", colunas.cobrancas_pix, dados.pix),
    ...inserirLinhas("movimentacoes_estoque", colunas.movimentacoes_estoque, dados.movimentacoes),
    ...inserirLinhas("registros_localizacao", colunas.registros_localizacao, dados.registros),
    ...inserirLinhas("despesas", colunas.despesas, dados.despesas),
    ...inserirLinhas("notificacoes", colunas.notificacoes, dados.notificacoes),
  ];

  for (const [id, saldo] of Object.entries(dados.saldos)) {
    comandos.push(`UPDATE produtos SET saldo = ${lit(saldo)} WHERE id = ${lit(Number(id))};`);
  }

  // Como os ids foram gravados à mão, alinha as sequências para os próximos
  // cadastros feitos pelo sistema não baterem em ids já usados.
  for (const tabela of Object.keys(colunas)) {
    comandos.push(
      `SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${tabela};`,
    );
  }
  return comandos.join("\n");
}

// -------------------------------------------------------------------- principal

async function principal() {
  const confirmou = process.argv.includes("--sim");
  const zerarTudo = process.argv.includes("--zerar-tudo");
  const semFuturo = process.argv.includes("--sem-futuro");
  const argHoje = process.argv.find((a) => a.startsWith("--hoje="))?.slice(7) || process.env.SEED_HOJE || "";
  if (argHoje && !/^\d{4}-\d{2}-\d{2}$/.test(argHoje)) {
    console.error("Data inválida em --hoje. Use o formato AAAA-MM-DD, por exemplo --hoje=2026-11-23.");
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definida. Configure o backend/.env.");
    process.exitCode = 1;
    return;
  }

  let servidor = "(endereço não identificado)";
  try {
    const url = new URL(process.env.DATABASE_URL);
    servidor = `${url.hostname}${url.pathname}`;
  } catch {
    // mantém o texto padrão
  }

  if (!confirmou) {
    console.log(
      "Este comando APAGA clientes, agendamentos, ordens de serviço, cobranças PIX,\n" +
        "check-ins, movimentações de estoque, despesas e notificações do banco abaixo e\n" +
        "cria ~13 meses de dados de demonstração (agenda até 31/12).\n" +
        (zerarTudo
          ? "Com --zerar-tudo, APAGA TAMBÉM usuários, serviços, produtos e veículos.\n\n"
          : "Usuários, serviços e produtos são mantidos.\n\n") +
        `  Banco: ${servidor}\n\n` +
        "Para confirmar, rode:\n\n  npm run db:seed-ano -- --sim" + (zerarTudo ? " --zerar-tudo" : "") + (argHoje ? ` --hoje=${argHoje}` : "") + (semFuturo ? " --sem-futuro" : "") + "\n",
    );
    process.exitCode = 1;
    return;
  }

  if (process.env.NODE_ENV === "production") {
    console.error("Recusado: NODE_ENV=production. Use apenas em banco de teste ou demonstração.");
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const client = await pool.connect();

  try {
    const [{ ok }] = await q(
      client,
      `SELECT (to_regclass('public.veiculos') IS NOT NULL
           AND to_regclass('public.registros_localizacao') IS NOT NULL
           AND to_regclass('public.cobrancas_pix') IS NOT NULL) AS ok`,
    );
    if (!ok) {
      console.error("O banco ainda não tem todas as tabelas. Rode antes:  npm run db:migrate");
      process.exitCode = 1;
      return;
    }

    const [antes] = await q(
      client,
      `SELECT (SELECT count(*) FROM clientes)::int AS clientes,
              (SELECT count(*) FROM agendamentos)::int AS agendamentos,
              (SELECT count(*) FROM ordens_servico)::int AS ordens`,
    );
    console.log(`Banco: ${servidor}`);
    console.log(
      `Apagando ${antes.clientes} clientes, ${antes.agendamentos} agendamentos e ${antes.ordens} ordens de serviço existentes...`,
    );

    // Com --hoje, o "agora" é 10h (Brasília) desse dia: o que é anterior já
    // aconteceu e o que vem depois está agendado.
    const agora = argHoje ? new Date(`${argHoje}T10:00:00-03:00`) : new Date();
    const hoje = hojeEmBrasilia(agora);

    await client.query("BEGIN");
    if (zerarTudo) {
      await client.query(
        "TRUNCATE TABLE registros_localizacao, cobrancas_pix, movimentacoes_estoque, notificacoes, despesas, ordens_servico, agendamentos, servico_pecas, servicos, produtos, veiculos, clientes, usuarios RESTART IDENTITY CASCADE",
      );
    }

    const usuarios = await garantirUsuarios(client, hoje);
    const { produtos, servicos } = await garantirCatalogo(client);
    const veiculos = await garantirVeiculos(client, usuarios);

    const dados = gerarDados({ hoje, agora, usuarios, servicos, produtos, telefoneWhatsapp: TELEFONE_WHATSAPP, semFuturo });
    dados.despesas = gerarDespesas({
      inicio: dados.periodo.inicio,
      hoje,
      usuarios,
      veiculos,
      faturamentoPorMes: dados.resumo.faturamentoPorMes,
    });
    dados.notificacoes = gerarNotificacoes({
      agora,
      ordens: dados.ordens,
      agendamentos: dados.agendamentos,
      clientes: dados.clientes,
      produtos,
      saldos: dados.saldos,
      nomesTecnicos: new Map(usuarios.tecnicos.map((t) => [t.id, t.nome])),
    });
    const script = montarScript(dados);

    // Tudo numa única transação: ou entra tudo, ou nada.
    await client.query(script);
    await client.query("COMMIT");

    const r = dados.resumo;
    console.log("");
    console.log(`Período: ${dados.periodo.inicio} a ${dados.periodo.fim} (hoje: ${dados.periodo.hoje})`);
    console.log(`Clientes: ${r.clientes} (${r.clientesInativos} inativos)`);
    console.log(
      `Agendamentos: ${r.agendamentos} (${r.cancelados} cancelados, ${r.naoRealizados} não realizados)`,
    );
    console.log(`Ordens de serviço: ${r.ordens} ${JSON.stringify(r.ordensPorStatus)}`);
    console.log(`Cobranças PIX: ${r.cobrancasPix} | Check-ins/outs: ${r.registrosLocalizacao} | Movimentações de estoque: ${r.movimentacoes}`);
    console.log(`Despesas: ${dados.despesas.length} (R$ ${dados.despesas.reduce((s, d) => s + d.valor, 0).toFixed(2)}) | Notificações: ${dados.notificacoes.length}`);
    console.log(`A receber: R$ ${r.aReceber.toFixed(2)}`);
    console.log(`Abaixo do mínimo no estoque: ${r.abaixoDoMinimo.join("; ") || "nenhum"}`);
    console.log("");
    console.log("Faturamento por mês (pagamentos confirmados):");
    for (const [mes, valor] of Object.entries(r.faturamentoPorMes)) {
      console.log(`  ${mes}  R$ ${valor.toFixed(2)}`);
    }
    console.log("");
    console.log(`Logins (senha ${SENHA_DEMO}), se não existirem foram criados:`);
    for (const u of USUARIOS_BASE) console.log(`  ${u.perfil.padEnd(10)} ${u.email}`);
    console.log(`Cliente para testar o WhatsApp: Romário Rocha, ${TELEFONE_WHATSAPP}`);
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Falha ao carregar os dados (nada foi alterado):", erro.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await principal();
