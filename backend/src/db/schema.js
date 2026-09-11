import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  timestamp,
  date,
  time,
} from "drizzle-orm/mysql-core";

export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  cpf: varchar("cpf", { length: 14 }).notNull().unique(),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  endereco: varchar("endereco", { length: 200 }).notNull(),
  status: mysqlEnum("status", ["ativo", "inativo"]).notNull().default("ativo"),
  inativadoEm: timestamp("inativado_em"),
});

export const usuarios = mysqlTable("usuarios", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  email: varchar("email", { length: 150 }).notNull().unique(),
  senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  perfil: mysqlEnum("perfil", ["ceo", "atendente", "estoquista", "tecnico"]).notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

export const agendamentos = mysqlTable("agendamentos", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("cliente_id").notNull().references(() => clientes.id),
  tecnicoId: int("tecnico_id").notNull().references(() => usuarios.id),
  data: date("data").notNull(),
  hora: time("hora").notNull(),
  status: mysqlEnum("status", ["agendado", "cancelado"]).notNull().default("agendado"),
  canceladoEm: timestamp("cancelado_em"),
});

export const ordensServico = mysqlTable("ordens_servico", {
  id: int("id").autoincrement().primaryKey(),
  agendamentoId: int("agendamento_id").notNull().unique().references(() => agendamentos.id),
  status: mysqlEnum("status", ["aberta", "andamento", "concluida"]).notNull().default("aberta"),
  abertaEm: timestamp("aberta_em").notNull().defaultNow(),
  concluidaEm: timestamp("concluida_em"),
});

export const produtos = mysqlTable("produtos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  saldo: int("saldo").notNull().default(0),
});

export const movimentacoesEstoque = mysqlTable("movimentacoes_estoque", {
  id: int("id").autoincrement().primaryKey(),
  produtoId: int("produto_id").notNull().references(() => produtos.id),
  usuarioId: int("usuario_id").references(() => usuarios.id),
  tipo: mysqlEnum("tipo", ["entrada", "saida"]).notNull(),
  quantidade: int("quantidade").notNull(),
  data: timestamp("data").notNull().defaultNow(),
});
