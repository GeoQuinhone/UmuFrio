import {
  pgTable,
  integer,
  varchar,
  numeric,
  pgEnum,
  timestamp,
  date,
  time,
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
  cpf: varchar("cpf", { length: 14 }).notNull().unique(),
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
  inativadoEm: timestamp("inativado_em"),
});

export const usuarios = pgTable("usuarios", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  email: varchar("email", { length: 150 }).notNull().unique(),
  cpf: varchar("cpf", { length: 14 }).notNull().unique(),
  senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  perfil: perfilEnum("perfil").notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
  ativo: integer("ativo").notNull().default(1),
  primeiroAcesso: integer("primeiro_acesso").notNull().default(0),
  falhasLogin: integer("falhas_login").notNull().default(0),
  bloqueadoAte: timestamp("bloqueado_ate"),
});

export const agendamentos = pgTable("agendamentos", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id),
  tecnicoId: integer("tecnico_id").notNull().references(() => usuarios.id),
  data: date("data").notNull(),
  hora: time("hora").notNull(),
  status: statusAgendamentoEnum("status").notNull().default("agendado"),
  canceladoEm: timestamp("cancelado_em"),
});

export const servicos = pgTable("servicos", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: varchar("descricao", { length: 255 }),
  valor: numeric("valor", { precision: 10, scale: 2 }).notNull(),
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
  abertaEm: timestamp("aberta_em").notNull().defaultNow(),
  concluidaEm: timestamp("concluida_em"),
});

export const movimentacoesEstoque = pgTable("movimentacoes_estoque", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  produtoId: integer("produto_id").notNull().references(() => produtos.id),
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  ordemServicoId: integer("ordem_servico_id").references(() => ordensServico.id),
  tipo: tipoMovimentacaoEnum("tipo").notNull(),
  quantidade: integer("quantidade").notNull(),
  data: timestamp("data").notNull().defaultNow(),
});