import "../loadEnv.js";
import { pool } from "./client.js";

/*
 * The uploaded project has three historical SQL representations. These migrations
 * use only PostgreSQL and are additive: existing Portuguese tables are altered
 * and backfilled, while unrelated tables are never inspected or changed.
 */
export const migrations = [
  `CREATE TABLE IF NOT EXISTS umufrio_schema_migrations (
     id integer PRIMARY KEY,
     applied_at timestamptz NOT NULL DEFAULT now()
   )`,
  `DO $$ BEGIN
     CREATE TYPE status_cliente AS ENUM ('ativo','inativo');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
   DO $$ BEGIN
     CREATE TYPE tipo_residencia AS ENUM ('casa','apartamento','barracao');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
   DO $$ BEGIN
     CREATE TYPE perfil AS ENUM ('ceo','atendente','estoquista','tecnico');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
   DO $$ BEGIN
     CREATE TYPE status_agendamento AS ENUM ('agendado','cancelado');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
   DO $$ BEGIN
     CREATE TYPE status_os AS ENUM ('aberta','andamento','concluida');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
   DO $$ BEGIN
     CREATE TYPE tipo_movimentacao AS ENUM ('entrada','saida');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS clientes (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     nome varchar(120) NOT NULL, cpf varchar(14) NOT NULL UNIQUE,
     telefone varchar(20) NOT NULL, cep varchar(9) NOT NULL,
     logradouro varchar(150) NOT NULL, numero varchar(10) NOT NULL,
     bairro varchar(100) NOT NULL, cidade varchar(100) NOT NULL,
     estado varchar(2) NOT NULL, tipo_residencia tipo_residencia NOT NULL,
     complemento varchar(150), status status_cliente NOT NULL DEFAULT 'ativo',
     inativado_em timestamptz
   );
   CREATE TABLE IF NOT EXISTS usuarios (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     nome varchar(120) NOT NULL, email varchar(150) NOT NULL UNIQUE,
     cpf varchar(14) NOT NULL UNIQUE, senha_hash varchar(255) NOT NULL,
     telefone varchar(20) NOT NULL, perfil perfil NOT NULL,
     criado_em timestamptz NOT NULL DEFAULT now(),
     ativo integer NOT NULL DEFAULT 1, primeiro_acesso integer NOT NULL DEFAULT 0,
     falhas_login integer NOT NULL DEFAULT 0, bloqueado_ate timestamptz
   );
   CREATE TABLE IF NOT EXISTS servicos (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     nome varchar(100) NOT NULL, descricao varchar(255),
     valor numeric(10,2) NOT NULL
   );
   CREATE TABLE IF NOT EXISTS produtos (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     nome varchar(120) NOT NULL, valor_unitario numeric(10,2) NOT NULL,
     saldo integer NOT NULL DEFAULT 0, quantidade_minima integer NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS agendamentos (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     cliente_id integer NOT NULL REFERENCES clientes(id),
     tecnico_id integer NOT NULL REFERENCES usuarios(id),
     data date NOT NULL, hora time NOT NULL,
     status status_agendamento NOT NULL DEFAULT 'agendado',
     cancelado_em timestamptz
   );
   CREATE TABLE IF NOT EXISTS servico_pecas (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     servico_id integer NOT NULL REFERENCES servicos(id),
     produto_id integer NOT NULL REFERENCES produtos(id),
     quantidade_necessaria integer NOT NULL DEFAULT 1,
     UNIQUE(servico_id, produto_id)
   );
   CREATE TABLE IF NOT EXISTS ordens_servico (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     agendamento_id integer NOT NULL UNIQUE REFERENCES agendamentos(id),
     servico_id integer NOT NULL REFERENCES servicos(id),
     status status_os NOT NULL DEFAULT 'aberta',
     aberta_em timestamptz NOT NULL DEFAULT now(), concluida_em timestamptz
   );
   CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
     id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     produto_id integer NOT NULL REFERENCES produtos(id),
     usuario_id integer REFERENCES usuarios(id),
     ordem_servico_id integer REFERENCES ordens_servico(id),
     tipo tipo_movimentacao NOT NULL, quantidade integer NOT NULL,
     data timestamptz NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf varchar(14);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone varchar(20);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep varchar(9);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS logradouro varchar(150);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS numero varchar(10);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bairro varchar(100);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cidade varchar(100);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS estado varchar(2);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_residencia varchar(20);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS complemento varchar(150);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS status varchar(20);
   ALTER TABLE clientes ADD COLUMN IF NOT EXISTS inativado_em timestamptz;
   UPDATE clientes SET cpf = COALESCE(NULLIF(regexp_replace(cpf, '\\D', '', 'g'), ''), lpad((10000000000 + id)::text, 11, '0')),
     telefone = COALESCE(NULLIF(telefone, ''), 'não informado'),
     cep = COALESCE(NULLIF(regexp_replace(cep, '\\D', '', 'g'), ''), '00000000'),
     logradouro = COALESCE(NULLIF(logradouro, ''), 'não informado'),
     numero = COALESCE(NULLIF(numero, ''), 's/n'),
     bairro = COALESCE(NULLIF(bairro, ''), 'não informado'),
     cidade = COALESCE(NULLIF(cidade, ''), 'não informado'),
     estado = COALESCE(NULLIF(upper(estado), ''), 'PR'),
      tipo_residencia = COALESCE(tipo_residencia, 'casa'),
      status = COALESCE(status, 'ativo');
   ALTER TABLE clientes ALTER COLUMN cpf SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN telefone SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN cep SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN logradouro SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN numero SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN bairro SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN cidade SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN estado SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN tipo_residencia SET NOT NULL;
   ALTER TABLE clientes ALTER COLUMN status SET NOT NULL`,
  `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf varchar(14);
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone varchar(20);
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_hash varchar(255);
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil varchar(20);
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo integer DEFAULT 1;
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS primeiro_acesso integer DEFAULT 0;
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS falhas_login integer DEFAULT 0;
   ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_ate timestamptz;
   UPDATE usuarios SET cpf = COALESCE(NULLIF(regexp_replace(cpf, '\\D', '', 'g'), ''), lpad((20000000000 + id)::text, 11, '0')),
     telefone = COALESCE(NULLIF(telefone, ''), 'não informado'),
     senha_hash = CASE WHEN senha_hash IS NULL OR senha_hash = '' THEN 'LEGACY_PASSWORD_RESET_REQUIRED' ELSE senha_hash END,
      perfil = COALESCE(perfil, 'atendente'), criado_em = COALESCE(criado_em, now()),
     ativo = COALESCE(ativo, 1), primeiro_acesso = COALESCE(primeiro_acesso, 1),
     falhas_login = COALESCE(falhas_login, 0);
   ALTER TABLE usuarios ALTER COLUMN cpf SET NOT NULL;
   ALTER TABLE usuarios ALTER COLUMN telefone SET NOT NULL;
   ALTER TABLE usuarios ALTER COLUMN senha_hash SET NOT NULL;
   ALTER TABLE usuarios ALTER COLUMN perfil SET NOT NULL;
   ALTER TABLE usuarios ALTER COLUMN criado_em SET DEFAULT now();
   ALTER TABLE usuarios ALTER COLUMN ativo SET DEFAULT 1;
   ALTER TABLE usuarios ALTER COLUMN primeiro_acesso SET DEFAULT 0;
   ALTER TABLE usuarios ALTER COLUMN falhas_login SET DEFAULT 0`,
  `ALTER TABLE produtos ADD COLUMN IF NOT EXISTS valor_unitario numeric(10,2) DEFAULT 0;
   ALTER TABLE produtos ADD COLUMN IF NOT EXISTS saldo integer DEFAULT 0;
   ALTER TABLE produtos ADD COLUMN IF NOT EXISTS quantidade_minima integer DEFAULT 0;
   UPDATE produtos SET valor_unitario = COALESCE(valor_unitario, 0), saldo = COALESCE(saldo, 0), quantidade_minima = COALESCE(quantidade_minima, 0);
   ALTER TABLE produtos ALTER COLUMN valor_unitario SET NOT NULL;
   ALTER TABLE produtos ALTER COLUMN saldo SET NOT NULL;
   ALTER TABLE produtos ALTER COLUMN quantidade_minima SET NOT NULL;
   ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS servico_id integer;
   INSERT INTO servicos(nome, valor) SELECT 'Serviço legado', 0 WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = 'Serviço legado');
   UPDATE ordens_servico SET servico_id = (SELECT id FROM servicos WHERE nome = 'Serviço legado' ORDER BY id LIMIT 1) WHERE servico_id IS NULL;
   ALTER TABLE ordens_servico ALTER COLUMN servico_id SET NOT NULL;
   ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS ordem_servico_id integer`,
  `WITH duplicados AS (
     SELECT id, row_number() OVER (PARTITION BY tecnico_id, data, hora ORDER BY id) AS ordem
     FROM agendamentos WHERE status = 'agendado'
   )
   UPDATE agendamentos SET status = 'cancelado', cancelado_em = now()
   WHERE id IN (SELECT id FROM duplicados WHERE ordem > 1);
   CREATE UNIQUE INDEX IF NOT EXISTS ux_agendamento_tecnico_horario_ativo
     ON agendamentos (tecnico_id, data, hora) WHERE status = 'agendado'`,
];

export async function runMigrations(client) {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('umufrio:migrations'))");
  await client.query(migrations[0]);
  await client.query("INSERT INTO umufrio_schema_migrations(id) VALUES(1) ON CONFLICT (id) DO NOTHING");
  const applied = await client.query("SELECT id FROM umufrio_schema_migrations ORDER BY id");
  const done = new Set(applied.rows.map((row) => row.id));
  for (let i = 1; i < migrations.length; i += 1) {
    if (!done.has(i + 1)) {
      await client.query(migrations[i]);
      await client.query("INSERT INTO umufrio_schema_migrations(id) VALUES($1)", [i + 1]);
    }
  }
  await client.query("COMMIT");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const client = await pool.connect();
  try {
    await runMigrations(client);
    console.log("Migrations aplicadas.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}