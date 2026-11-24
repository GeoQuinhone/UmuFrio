import "../loadEnv.js";
import crypto from "node:crypto";
import pg from "pg";

import { PRODUTOS, SERVICOS, USUARIOS_APRESENTACAO, USUARIOS_BASE, VEICULOS } from "./seedAno/dados.js";
import { cpfDe, diaUtil, gerarDados, somarDias } from "./seedAno/gerador.js";
import { inserirLinhas, lit } from "./seedAno/sql.js";

/*
 * Seed anual: ~13 meses de histórico (de 1º do mês de 13 meses atrás até hoje)
 * e agenda até 31/12 do ano corrente, com clientes, técnicos, atendimentos,
 * pagamentos (dinheiro, PIX e cartão), estoque, check-ins e relatórios cheios.
 *
 *   npm run db:seed-ano            (só mostra o aviso)
 *   npm run db:seed-ano -- --sim   (executa)
 *
 * Apresentação: "npm run db:seed-apresentacao -- --sim" faz o mesmo, mas como se
 * hoje fosse 23/11/2026 às 19h (muda com --agora=...) e com os logins da banca
 * (CEO, atendente, estoquista e 4 técnicos, cada um com a sua senha).
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

// Senha padrão dos usuários de demonstração e telefone do cliente de teste do aviso por WhatsApp.
const SENHA_DEMO = "Teste@123";
const TELEFONE_WHATSAPP = process.env.SEED_TELEFONE_WHATSAPP || "(44) 99804-9224";

// Modo apresentação (npm run db:seed-apresentacao): usa os logins da banca e um "agora" fixo
// (padrão: 23/11/2026 às 19h, horário de Brasília). Dá para trocar com --agora=2026-11-23T19:00:00-03:00.
const APRESENTACAO = process.argv.includes("--apresentacao");
const AGORA_ARG = process.argv.find((a) => a.startsWith("--agora="))?.slice(8);
const AGORA_APRESENTACAO = "2026-11-23T19:00:00-03:00";
const USUARIOS = APRESENTACAO ? USUARIOS_APRESENTACAO : USUARIOS_BASE;

// Gera o hash scrypt (sal + hash) de uma senha, no mesmo formato usado pelo login.
function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString("hex");
  return `${sal}:${crypto.scryptSync(senha, sal, 64).toString("hex")}`;
}

// Devolve a data de hoje no fuso de Brasília.
const hojeEmBrasilia = (agora) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

// Executa uma consulta e devolve só as linhas do resultado.
const q = async (client, texto) => (await client.query(texto)).rows;

// ----------------------------------------------------------- base existente

// Garante que existam os usuários (CEO, atendente, estoquista e técnicos) e devolve os ids por perfil.
// No modo apresentação, cada usuário tem a própria senha e, se o e-mail já existir, os dados e a senha são atualizados.
async function garantirUsuarios(client, hoje) {
  let sequencia = 0;

  for (const u of USUARIOS) {
    sequencia += 1;
    const hash = hashSenha(u.senha || SENHA_DEMO);
    const cpf = u.cpf || cpfDe(String(900000000 + sequencia * 7919).slice(0, 9));
    const conflito = APRESENTACAO
      ? `ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, senha_hash = EXCLUDED.senha_hash,
           telefone = EXCLUDED.telefone, perfil = EXCLUDED.perfil, ativo = 1, primeiro_acesso = 0`
      : "ON CONFLICT DO NOTHING";
    await client.query(
      `INSERT INTO usuarios (nome, email, cpf, senha_hash, telefone, perfil, ativo, primeiro_acesso)
       VALUES (${lit(u.nome)}, ${lit(u.email)}, ${lit(cpf)}, ${lit(hash)}, ${lit(u.telefone)}, ${lit(u.perfil)}, 1, 0)
       ${conflito}`,
    );
  }

  // Na apresentação, os logins de demonstração antigos (Teste@123) são desativados para não confundir a banca.
  if (APRESENTACAO) {
    await client.query(
      `UPDATE usuarios SET ativo = 0 WHERE email IN (${USUARIOS_BASE.map((u) => lit(u.email)).join(", ")})`,
    );
  }

  // Na apresentação, só valem os usuários da lista; no modo normal, qualquer usuário ativo.
  const filtro = APRESENTACAO ? `AND email IN (${USUARIOS.map((u) => lit(u.email)).join(", ")})` : "";
  const ativos = await q(client, `SELECT id, email, perfil FROM usuarios WHERE ativo = 1 ${filtro} ORDER BY id`);
  const ordem = (email) => USUARIOS.findIndex((u) => u.email === email);
  const primeiro = (perfil) => ativos.find((u) => u.perfil === perfil)?.id;

  const usuarios = {
    ceoId: primeiro("ceo"),
    atendenteId: primeiro("atendente"),
    estoquistaId: primeiro("estoquista"),
    tecnicos: ativos
      .filter((u) => u.perfil === "tecnico")
      .sort((x, y) => ordem(x.email) - ordem(y.email))
      .slice(0, 6)
      .map((u) => {
        const dias = USUARIOS.find((x) => x.email === u.email)?.desdeDias;
        return {
          id: Number(u.id),
          email: u.email,
          // O técnico mais novo entrou há ~5 meses: aparece só nos meses recentes.
          desde: dias ? somarDias(hoje, -dias) : null,
        };
      }),
  };

  if (!usuarios.ceoId || !usuarios.atendenteId || !usuarios.estoquistaId || usuarios.tecnicos.length < 2) {
    throw new Error("Faltam usuários (CEO, atendente, estoquista e 2 técnicos ativos).");
  }
  usuarios.ceoId = Number(usuarios.ceoId);
  usuarios.atendenteId = Number(usuarios.atendenteId);
  usuarios.estoquistaId = Number(usuarios.estoquistaId);
  return usuarios;
}

// Garante que produtos e serviços do catálogo existam e liga cada serviço às peças que ele consome.
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

// Garante os veículos da frota e os associa aos técnicos.
async function garantirVeiculos(client, usuarios) {
  let proximoTecnico = 0;
  for (const v of VEICULOS) {
    const tecnico = v.semTecnico ? null : usuarios.tecnicos[proximoTecnico++]?.id ?? null;
    // Na apresentação, os veículos passam para os técnicos da lista (um por técnico).
    if (APRESENTACAO && !v.semTecnico && tecnico) {
      await client.query(`UPDATE veiculos SET tecnico_id = NULL WHERE tecnico_id = ${lit(tecnico)} AND placa <> ${lit(v.placa)}`);
      await client.query(`UPDATE veiculos SET tecnico_id = ${lit(tecnico)}, status = 'ativo' WHERE placa = ${lit(v.placa)}`);
    }
    const condicaoTecnico = tecnico
      ? `AND NOT EXISTS (SELECT 1 FROM veiculos WHERE tecnico_id = ${tecnico})`
      : "";
    await client.query(
      `INSERT INTO veiculos (placa, marca, modelo, ano, tecnico_id, status)
       SELECT ${lit(v.placa)}, ${lit(v.marca)}, ${lit(v.modelo)}, ${lit(v.ano)}, ${lit(tecnico)}, ${lit(v.status || "ativo")}
        WHERE NOT EXISTS (SELECT 1 FROM veiculos WHERE placa = ${lit(v.placa)}) ${condicaoTecnico}`,
    );
  }
}

// Apresentação: dia da banca bem movimentado e os próximos dias com a agenda cheia
// (dias úteis seguintes: 7, 7 e 6 atendimentos), para a demonstração ter o que mostrar.
function demandaApresentacao(hoje) {
  const fixa = { [hoje]: 11 };
  let d = hoje;
  for (const n of [7, 7, 6]) {
    do d = somarDias(d, 1); while (!diaUtil(d));
    fixa[d] = n;
  }
  return fixa;
}

// ------------------------------------------------------------------ gravação

// Monta o script SQL com todos os dados gerados para gravar de uma vez.
function montarScript(dados) {
  const colunas = {
    clientes: ["id", "nome", "cpf", "telefone", "cep", "logradouro", "numero", "bairro", "cidade", "estado", "tipo_residencia", "complemento", "status", "inativado_em", "latitude", "longitude", "geo_endereco", "geocodificado_em"],
    agendamentos: ["id", "cliente_id", "tecnico_id", "data", "hora", "status", "cancelado_em", "nao_realizado", "motivo_nao_realizado"],
    ordens_servico: ["id", "agendamento_id", "servico_id", "status", "aberta_em", "iniciada_em", "concluida_em", "valor_cobrado", "forma_pagamento", "pagamento_confirmado", "pagamento_confirmado_em", "observacao_pagamento", "pagamento_usuario_id"],
    cobrancas_pix: ["id", "ordem_id", "usuario_id", "valor", "status", "modo", "mp_payment_id", "referencia", "codigo_copia_cola", "qr_code_base64", "ticket_url", "criado_em", "expira_em", "aprovado_em"],
    movimentacoes_estoque: ["id", "produto_id", "usuario_id", "ordem_servico_id", "tipo", "quantidade", "data", "extra"],
    registros_localizacao: ["id", "ordem_id", "tipo", "usuario_id", "latitude", "longitude", "precisao_m", "distancia_m", "raio_m", "dentro_raio", "justificativa", "criado_em"],
  };

  const comandos = [
    "TRUNCATE TABLE registros_localizacao, cobrancas_pix, movimentacoes_estoque, ordens_servico, agendamentos, clientes RESTART IDENTITY;",
    ...inserirLinhas("clientes", colunas.clientes, dados.clientes),
    ...inserirLinhas("agendamentos", colunas.agendamentos, dados.agendamentos),
    ...inserirLinhas("ordens_servico", colunas.ordens_servico, dados.ordens),
    ...inserirLinhas("cobrancas_pix", colunas.cobrancas_pix, dados.pix),
    ...inserirLinhas("movimentacoes_estoque", colunas.movimentacoes_estoque, dados.movimentacoes),
    ...inserirLinhas("registros_localizacao", colunas.registros_localizacao, dados.registros),
  ];

  // Atualiza o saldo de cada produto conforme as movimentações geradas.
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
  // Função principal: confere o ambiente, pede confirmação (--sim), apaga os dados antigos e grava os novos numa única transação.
  const confirmou = process.argv.includes("--sim");

  if (!process.env.DATABASE_URL) {
    // Sem DATABASE_URL não há banco para alterar: encerra com aviso.
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
    // Sem --sim, só mostra o aviso do que seria apagado e não altera nada.
    console.log(
      "Este comando APAGA clientes, agendamentos, ordens de serviço, cobranças PIX,\n" +
        "check-ins e movimentações de estoque do banco abaixo e cria ~13 meses de dados\n" +
        "de demonstração (agenda até 31/12). Usuários, serviços e produtos são mantidos.\n\n" +
        `  Banco: ${servidor}\n\n` +
        "Para confirmar, rode:\n\n  npm run db:seed-ano -- --sim\n",
    );
    process.exitCode = 1;
    return;
  }

  if (process.env.NODE_ENV === "production") {
    // Em produção o seed é bloqueado por segurança.
    console.error("Recusado: NODE_ENV=production. Use apenas em banco de teste ou demonstração.");
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  // Abre a conexão com o banco.
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

    const agora = new Date(APRESENTACAO ? AGORA_ARG || AGORA_APRESENTACAO : AGORA_ARG || Date.now());
    if (Number.isNaN(agora.getTime())) throw new Error("Valor inválido em --agora (use, por exemplo, 2026-11-23T19:00:00-03:00).");
    // Gera os dados (usuários, catálogo, atendimentos, pagamentos, estoque, check-ins) e monta o script SQL.
    const hoje = hojeEmBrasilia(agora);

    const usuarios = await garantirUsuarios(client, hoje);
    const { produtos, servicos } = await garantirCatalogo(client);
    await garantirVeiculos(client, usuarios);

    const dados = gerarDados({ hoje, agora, usuarios, servicos, produtos, telefoneWhatsapp: TELEFONE_WHATSAPP, demandaFixa: APRESENTACAO ? demandaApresentacao(hoje) : {} });
    const script = montarScript(dados);

    // Um único envio, uma única transação: ou entra tudo, ou nada.
    // Executa o script e mostra o resumo do que foi criado.
    await client.query(script);

    const r = dados.resumo;
    console.log("");
    console.log(`Período: ${dados.periodo.inicio} a ${dados.periodo.fim} (hoje: ${dados.periodo.hoje})`);
    console.log(`Clientes: ${r.clientes} (${r.clientesInativos} inativos)`);
    console.log(
      `Agendamentos: ${r.agendamentos} (${r.cancelados} cancelados, ${r.naoRealizados} não realizados)`,
    );
    console.log(`Ordens de serviço: ${r.ordens} ${JSON.stringify(r.ordensPorStatus)}`);
    console.log(`Cobranças PIX: ${r.cobrancasPix} | Check-ins/outs: ${r.registrosLocalizacao} | Movimentações de estoque: ${r.movimentacoes}`);
    console.log(`A receber: R$ ${r.aReceber.toFixed(2)}`);
    console.log(`Abaixo do mínimo no estoque: ${r.abaixoDoMinimo.join("; ") || "nenhum"}`);
    console.log("");
    console.log("Faturamento por mês (pagamentos confirmados):");
    for (const [mes, valor] of Object.entries(r.faturamentoPorMes)) {
      console.log(`  ${mes}  R$ ${valor.toFixed(2)}`);
    }
    console.log("");
    console.log(APRESENTACAO ? "Logins (e-mail / senha):" : `Logins (senha ${SENHA_DEMO}), se não existirem foram criados:`);
    for (const u of USUARIOS) console.log(`  ${u.perfil.padEnd(10)} ${u.email}${u.senha ? ` / ${u.senha}` : ""}`);
    console.log(`Cliente para testar o WhatsApp: Romário Rocha, ${TELEFONE_WHATSAPP}`);
  } catch (erro) {
    console.error("Falha ao carregar os dados (nada foi alterado):", erro.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await principal();
