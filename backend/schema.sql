
CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  cpf VARCHAR(14) NOT NULL UNIQUE,
  telefone VARCHAR(20) NOT NULL,
  endereco VARCHAR(200) NOT NULL,
  status ENUM('ativo', 'inativo') NOT NULL DEFAULT 'ativo',
  inativado_em TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  telefone VARCHAR(20) NOT NULL,
  perfil ENUM('ceo', 'atendente', 'estoquista', 'tecnico') NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  tecnico_id INT NOT NULL,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  status ENUM('agendado', 'cancelado') NOT NULL DEFAULT 'agendado',
  cancelado_em TIMESTAMP NULL,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (tecnico_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS ordens_servico (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agendamento_id INT NOT NULL UNIQUE,
  status ENUM('aberta', 'andamento', 'concluida') NOT NULL DEFAULT 'aberta',
  aberta_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluida_em TIMESTAMP NULL,
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id)
);

CREATE TABLE IF NOT EXISTS produtos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  saldo INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id INT AUTO_INCREMENT PRIMARY KEY,
  produto_id INT NOT NULL,
  usuario_id INT NULL,
  tipo ENUM('entrada', 'saida') NOT NULL,
  quantidade INT NOT NULL,
  data TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (produto_id) REFERENCES produtos(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Dados de exemplo (opcional, mesmos do protótipo local)
INSERT INTO usuarios (nome, email, senha_hash, telefone, perfil) VALUES
  ('Romário Rodrigues', 'romariorodrigues@gmail.com', '123456', '(44) 99856-1458', 'ceo'),
  ('Geovane Quinhone', 'geovanequinhone2018@hotmail.com', '123456', '(44) 99658-2020', 'atendente'),
  ('João Cintra Cruz', 'jv681339@gmail.com', '123456', '(44) 99658-1122', 'tecnico');

INSERT INTO clientes (nome, cpf, telefone, endereco, status) VALUES
  ('João Cintra', '064.055.789-28', '(44) 99658-2020', 'Rua Natalina Giroto Barbosa, 2848', 'ativo'),
  ('Maria Souza', '045.112.330-90', '(44) 99123-4455', 'Av. Presidente Castelo Branco, 512', 'ativo');

INSERT INTO produtos (nome, saldo) VALUES
  ('Gás R410', 10),
  ('Sensor de Temperatura', 5),
  ('Capacitor', 0);
