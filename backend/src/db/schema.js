import {
  pgTable,
  integer,
  varchar,
  numeric,
  pgEnum,
  boolean,
  timestamp,
  date,
  time,
  text,
} from "drizzle-orm/pg-core";

export const statusClienteEnum = pgEnum("status_cliente", ["ativo", "inativo"]);
export const tipoResidenciaEnum = pgEnum("tipo_residencia", ["casa", "apartamento", "barracao"]);
export const perfilEnum = pgEnum("perfil", ["ceo", "atendente", "estoquista", "tecnico"]);
export const statusAgendamentoEnum = pgEnum("status_agendamento", ["agendado", "cancelado"]);
export const statusOsEnum = pgEnum("status_os", ["aberta", "andamento", "concluida"]);
export const tipoMovimentacaoEnum = pgEnum("tipo_movimentacao", ["entrada", "saida"]);

export const clientes = pgTable("clientes", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  // Fase 8: a coluna guarda CPF (PF) ou CNPJ (PJ), conforme tipo_pessoa.
  cpf: varchar("cpf", { length: 18 }).notNull().unique(),
  tipoPessoa: varchar("tipo_pessoa", { length: 2 }).notNull().default("PF"),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  cep: varchar("cep", { length: 9 }).notNull(),
  logradouro: varchar("logradouro", { length: 150 }).notNull(),
  numero: varchar("numero", { length: 10 }).notNull(),
  bairro: varchar("bairro", { length: 100 }).notNull(),
  cidade: varchar("cidade", { length: 100 }).notNull(),
  estado: varchar("estado", { length: 2 }).notNull(),
  tipoResidencia: tipoResidenciaEnum("tipo_residencia").notNull(),
  complemento: varchar("complemento", { length: 150 }),
  status: statusClienteEnum("status").notNull().default("ativo"),
  inativadoEm: timestamp("inativado_em", { withTimezone: true }),
  // Fase 5: coordenadas usadas para validar o check-in do técnico.
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  geoEndereco: varchar("geo_endereco", { length: 400 }),
  geocodificadoEm: timestamp("geocodificado_em", { withTimezone: true }),
});

export const usuarios = pgTable("usuarios", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  email: varchar("email", { length: 150 }).notNull().unique(),
  cpf: varchar("cpf", { length: 14 }).notNull().unique(),
  senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  perfil: perfilEnum("perfil").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  ativo: integer("ativo").notNull().default(1),
  primeiroAcesso: integer("primeiro_acesso").notNull().default(0),
  falhasLogin: integer("falhas_login").notNull().default(0),
  bloqueadoAte: timestamp("bloqueado_ate", { withTimezone: true }),
});

export const agendamentos = pgTable("agendamentos", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id),
  tecnicoId: integer("tecnico_id").notNull().references(() => usuarios.id),
  data: date("data").notNull(),
  hora: time("hora").notNull(),
  status: statusAgendamentoEnum("status").notNull().default("agendado"),
  canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
  naoRealizado: integer("nao_realizado").notNull().default(0),
  motivoNaoRealizado: varchar("motivo_nao_realizado", { length: 255 }),
});

export const servicos = pgTable("servicos", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: varchar("descricao", { length: 255 }),
  valor: numeric("valor", { precision: 10, scale: 2 }).notNull(),
  ativo: integer("ativo").notNull().default(1),
});

export const produtos = pgTable("produtos", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  valorUnitario: numeric("valor_unitario", { precision: 10, scale: 2 }).notNull(),
  saldo: integer("saldo").notNull().default(0),
  quantidadeMinima: integer("quantidade_minima").notNull().default(0),
});

export const servicoPecas = pgTable("servico_pecas", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  servicoId: integer("servico_id").notNull().references(() => servicos.id),
  produtoId: integer("produto_id").notNull().references(() => produtos.id),
  quantidadeNecessaria: integer("quantidade_necessaria").notNull().default(1),
});

export const ordensServico = pgTable("ordens_servico", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  agendamentoId: integer("agendamento_id").notNull().unique().references(() => agendamentos.id),
  servicoId: integer("servico_id").notNull().references(() => servicos.id),
  status: statusOsEnum("status").notNull().default("aberta"),
  abertaEm: timestamp("aberta_em", { withTimezone: true }).notNull().defaultNow(),
  iniciadaEm: timestamp("iniciada_em", { withTimezone: true }),
  concluidaEm: timestamp("concluida_em", { withTimezone: true }),
  // Pagamento (pontos 11 e 17): valor realmente cobrado (pode diferir do valor
  // de tabela do serviço), forma, confirmação e observação do motivo.
  valorCobrado: numeric("valor_cobrado", { precision: 10, scale: 2 }),
  formaPagamento: varchar("forma_pagamento", { length: 20 }),
  pagamentoConfirmado: integer("pagamento_confirmado").notNull().default(0),
  pagamentoConfirmadoEm: timestamp("pagamento_confirmado_em", { withTimezone: true }),
  observacaoPagamento: varchar("observacao_pagamento", { length: 255 }),
  pagamentoUsuarioId: integer("pagamento_usuario_id").references(() => usuarios.id),
});

// Fase 4: cobranças PIX. Cada ordem pode ter várias (uma expira ou é cancelada
// e outra é gerada), mas só uma pendente por vez (índice parcial no banco).
export const cobrancasPix = pgTable("cobrancas_pix", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ordemId: integer("ordem_id").notNull().references(() => ordensServico.id, { onDelete: "cascade" }),
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  valor: numeric("valor", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 12 }).notNull().default("pendente"),
  modo: varchar("modo", { length: 12 }).notNull(),
  mpPaymentId: varchar("mp_payment_id", { length: 40 }),
  referencia: varchar("referencia", { length: 60 }).notNull(),
  codigoCopiaCola: text("codigo_copia_cola"),
  qrCodeBase64: text("qr_code_base64"),
  ticketUrl: text("ticket_url"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  expiraEm: timestamp("expira_em", { withTimezone: true }),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
});

export const movimentacoesEstoque = pgTable("movimentacoes_estoque", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  produtoId: integer("produto_id").notNull().references(() => produtos.id),
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  ordemServicoId: integer("ordem_servico_id").references(() => ordensServico.id),
  tipo: tipoMovimentacaoEnum("tipo").notNull(),
  quantidade: integer("quantidade").notNull(),
  data: timestamp("data", { withTimezone: true }).notNull().defaultNow(),
  extra: integer("extra").notNull().default(0),
  // Fase 8: valor unitário no momento da movimentação (base do custo de peças
  // no lucro e do preço das peças extras cobradas do cliente).
  valorUnitario: numeric("valor_unitario", { precision: 10, scale: 2 }),
});

// Fase 8: despesas da empresa (combustível, aluguel, salários...). Junto com o
// custo das peças consumidas formam os gastos usados no lucro dos relatórios.
export const despesas = pgTable("despesas", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  descricao: varchar("descricao", { length: 150 }).notNull(),
  categoria: varchar("categoria", { length: 30 }).notNull(),
  valor: numeric("valor", { precision: 10, scale: 2 }).notNull(),
  data: date("data").notNull(),
  observacao: varchar("observacao", { length: 255 }),
  usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  // Fase 9: vínculo opcional com veículo (combustível, manutenção) ou funcionário (salários).
  veiculoId: integer("veiculo_id"),
  funcionarioId: integer("funcionario_id"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// Fase 8: notificações do CEO (sino do topo).
export const notificacoes = pgTable("notificacoes", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  tipo: varchar("tipo", { length: 24 }).notNull(),
  titulo: varchar("titulo", { length: 120 }).notNull(),
  mensagem: varchar("mensagem", { length: 300 }).notNull(),
  agendamentoId: integer("agendamento_id"),
  ordemId: integer("ordem_id"),
  produtoId: integer("produto_id"),
  criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  lidaEm: timestamp("lida_em", { withTimezone: true }),
});

// Frota da empresa. Cada veículo pode ter um técnico responsável (no máximo
// um veículo por técnico); o atendimento mostra o veículo do técnico.
export const veiculos = pgTable("veiculos", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  placa: varchar("placa", { length: 7 }).notNull().unique(),
  marca: varchar("marca", { length: 60 }).notNull(),
  modelo: varchar("modelo", { length: 80 }).notNull(),
  ano: integer("ano").notNull(),
  tecnicoId: integer("tecnico_id").references(() => usuarios.id, { onDelete: "set null" }),
  status: varchar("status", { length: 12 }).notNull().default("ativo"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// Fase 5: check-in/check-out geolocalizado (um de cada por ordem de serviço).
export const registrosLocalizacao = pgTable("registros_localizacao", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ordemId: integer("ordem_id").notNull().references(() => ordensServico.id, { onDelete: "cascade" }),
  tipo: varchar("tipo", { length: 8 }).notNull(),
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  precisaoM: numeric("precisao_m", { precision: 9, scale: 1 }),
  distanciaM: integer("distancia_m"),
  raioM: integer("raio_m").notNull(),
  dentroRaio: boolean("dentro_raio"),
  justificativa: varchar("justificativa", { length: 255 }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});