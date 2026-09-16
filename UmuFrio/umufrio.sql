-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Tempo de geração: 13/09/2026 às 17:26
-- Versão do servidor: 10.4.32-MariaDB
-- Versão do PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `umufrio`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `agendamentos`
--

CREATE TABLE `agendamentos` (
  `id` int(11) NOT NULL,
  `cliente_id` int(11) NOT NULL,
  `tecnico_id` int(11) NOT NULL,
  `data` date NOT NULL,
  `hora` time NOT NULL,
  `status` enum('agendado','cancelado') NOT NULL DEFAULT 'agendado',
  `cancelado_em` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `agendamentos`
--

INSERT INTO `agendamentos` (`id`, `cliente_id`, `tecnico_id`, `data`, `hora`, `status`, `cancelado_em`) VALUES
(4, 4, 6, '2026-09-16', '08:00:00', 'agendado', NULL),
(5, 5, 7, '2026-09-16', '09:30:00', 'agendado', NULL),
(6, 6, 8, '2026-09-17', '10:00:00', 'agendado', NULL),
(7, 7, 6, '2026-09-17', '14:00:00', 'agendado', NULL),
(8, 8, 7, '2026-09-18', '08:30:00', 'agendado', NULL),
(9, 9, 8, '2026-09-18', '13:00:00', 'agendado', NULL),
(10, 10, 6, '2026-09-19', '09:00:00', 'agendado', NULL),
(11, 11, 7, '2026-09-19', '15:30:00', 'agendado', NULL),
(12, 4, 8, '2026-09-22', '11:00:00', 'agendado', NULL),
(13, 6, 6, '2026-09-23', '08:00:00', 'agendado', NULL);

-- --------------------------------------------------------

--
-- Estrutura para tabela `clientes`
--

CREATE TABLE `clientes` (
  `id` int(11) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `cpf` varchar(14) NOT NULL,
  `telefone` varchar(20) NOT NULL,
  `endereco` varchar(200) NOT NULL,
  `status` enum('ativo','inativo') NOT NULL DEFAULT 'ativo',
  `inativado_em` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `clientes`
--

INSERT INTO `clientes` (`id`, `nome`, `cpf`, `telefone`, `endereco`, `status`, `inativado_em`) VALUES
(4, 'João Cintra', '064.055.789-28', '(44) 99658-2020', 'Rua Natalina Giroto Barbosa, 2848', 'ativo', NULL),
(5, 'Maria Souza', '045.112.330-90', '(44) 99123-4455', 'Av. Presidente Castelo Branco, 512', 'ativo', NULL),
(6, 'Mercado Amigão', '512.998.140-33', '(44) 99456-7788', 'Av. Rio Branco, 1020', 'ativo', NULL),
(7, 'Restaurante Boa Mesa', '398.221.760-04', '(44) 99567-8899', 'Rua Paraná, 350', 'ativo', NULL),
(8, 'Faculdade Alfa Umuarama', '277.664.910-55', '(44) 99678-9900', 'Av. Presidente Tancredo Neves, 2071', 'ativo', NULL),
(9, 'Colégio Bento Mossurunga', '633.845.220-77', '(44) 99789-0011', 'Rua Santos Dumont, 145', 'ativo', NULL),
(10, 'Pedro Almeida', '701.334.550-12', '(44) 99345-6677', 'Rua Ceará, 88', 'ativo', NULL),
(11, 'Juliana Ferreira', '889.221.470-66', '(44) 99234-5566', 'Rua Piauí, 210', 'ativo', NULL);

-- --------------------------------------------------------

--
-- Estrutura para tabela `movimentacoes_estoque`
--

CREATE TABLE `movimentacoes_estoque` (
  `id` int(11) NOT NULL,
  `produto_id` int(11) NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `tipo` enum('entrada','saida') NOT NULL,
  `quantidade` int(11) NOT NULL,
  `data` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `movimentacoes_estoque`
--

INSERT INTO `movimentacoes_estoque` (`id`, `produto_id`, `usuario_id`, `tipo`, `quantidade`, `data`) VALUES
(4, 5, 9, 'entrada', 15, '2026-09-01 12:00:00'),
(5, 5, 9, 'saida', 5, '2026-09-05 17:30:00'),
(6, 6, 9, 'entrada', 10, '2026-09-02 12:15:00'),
(7, 6, 9, 'saida', 4, '2026-09-08 14:00:00'),
(8, 7, 9, 'entrada', 8, '2026-09-03 13:00:00'),
(9, 7, 9, 'saida', 3, '2026-09-10 19:00:00'),
(10, 8, 9, 'entrada', 6, '2026-09-01 12:30:00'),
(11, 8, 9, 'saida', 6, '2026-09-12 16:45:00'),
(12, 9, 9, 'entrada', 10, '2026-09-04 11:45:00'),
(13, 9, 9, 'saida', 2, '2026-09-11 18:20:00'),
(14, 10, 9, 'entrada', 5, '2026-09-06 12:00:00'),
(15, 10, 9, 'saida', 2, '2026-09-13 13:30:00'),
(16, 11, 9, 'entrada', 4, '2026-09-07 12:00:00'),
(17, 11, 9, 'saida', 2, '2026-09-14 17:00:00'),
(18, 12, 9, 'entrada', 15, '2026-09-02 13:00:00'),
(19, 12, 9, 'saida', 3, '2026-09-09 14:30:00');

-- --------------------------------------------------------

--
-- Estrutura para tabela `ordens_servico`
--

CREATE TABLE `ordens_servico` (
  `id` int(11) NOT NULL,
  `agendamento_id` int(11) NOT NULL,
  `status` enum('aberta','andamento','concluida') NOT NULL DEFAULT 'aberta',
  `aberta_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `concluida_em` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `produtos`
--

CREATE TABLE `produtos` (
  `id` int(11) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `saldo` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `produtos`
--

INSERT INTO `produtos` (`id`, `nome`, `saldo`) VALUES
(5, 'Gás R410', 10),
(6, 'Gás R32', 6),
(7, 'Sensor de Temperatura', 5),
(8, 'Capacitor', 0),
(9, 'Filtro Secador', 8),
(10, 'Motor Ventilador Condensadora', 3),
(11, 'Placa Eletrônica Universal', 2),
(12, 'Controle Remoto Universal', 12);

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `email` varchar(150) NOT NULL,
  `senha_hash` varchar(255) NOT NULL,
  `telefone` varchar(20) NOT NULL,
  `perfil` enum('ceo','atendente','estoquista','tecnico') NOT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `usuarios`
--

INSERT INTO `usuarios` (`id`, `nome`, `email`, `senha_hash`, `telefone`, `perfil`, `criado_em`) VALUES
(4, 'Romário Rodrigues', 'romariorodrigues@gmail.com', '123456', '(44) 99856-1458', 'ceo', '2026-09-13 15:22:27'),
(5, 'Geovane Quinhone', 'geovanequinhone2018@hotmail.com', '123456', '(44) 99658-2020', 'atendente', '2026-09-13 15:22:27'),
(6, 'João Cintra Cruz', 'jv681339@gmail.com', '123456', '(44) 99658-1122', 'tecnico', '2026-09-13 15:22:27'),
(7, 'Carlos Andrade', 'carlos.andrade@umufrio.com', '123456', '(44) 99911-2233', 'tecnico', '2026-09-13 15:22:27'),
(8, 'Fernanda Lima', 'fernanda.lima@umufrio.com', '123456', '(44) 99822-3344', 'tecnico', '2026-09-13 15:22:27'),
(9, 'Patrícia Souza', 'patricia.souza@umufrio.com', '123456', '(44) 99733-4455', 'estoquista', '2026-09-13 15:22:27');

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `agendamentos`
--
ALTER TABLE `agendamentos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cliente_id` (`cliente_id`),
  ADD KEY `tecnico_id` (`tecnico_id`);

--
-- Índices de tabela `clientes`
--
ALTER TABLE `clientes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `cpf` (`cpf`);

--
-- Índices de tabela `movimentacoes_estoque`
--
ALTER TABLE `movimentacoes_estoque`
  ADD PRIMARY KEY (`id`),
  ADD KEY `produto_id` (`produto_id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Índices de tabela `ordens_servico`
--
ALTER TABLE `ordens_servico`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `agendamento_id` (`agendamento_id`);

--
-- Índices de tabela `produtos`
--
ALTER TABLE `produtos`
  ADD PRIMARY KEY (`id`);

--
-- Índices de tabela `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `agendamentos`
--
ALTER TABLE `agendamentos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT de tabela `clientes`
--
ALTER TABLE `clientes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT de tabela `movimentacoes_estoque`
--
ALTER TABLE `movimentacoes_estoque`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;

--
-- AUTO_INCREMENT de tabela `ordens_servico`
--
ALTER TABLE `ordens_servico`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de tabela `produtos`
--
ALTER TABLE `produtos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT de tabela `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `agendamentos`
--
ALTER TABLE `agendamentos`
  ADD CONSTRAINT `agendamentos_ibfk_1` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`),
  ADD CONSTRAINT `agendamentos_ibfk_2` FOREIGN KEY (`tecnico_id`) REFERENCES `usuarios` (`id`);

--
-- Restrições para tabelas `movimentacoes_estoque`
--
ALTER TABLE `movimentacoes_estoque`
  ADD CONSTRAINT `movimentacoes_estoque_ibfk_1` FOREIGN KEY (`produto_id`) REFERENCES `produtos` (`id`),
  ADD CONSTRAINT `movimentacoes_estoque_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Restrições para tabelas `ordens_servico`
--
ALTER TABLE `ordens_servico`
  ADD CONSTRAINT `ordens_servico_ibfk_1` FOREIGN KEY (`agendamento_id`) REFERENCES `agendamentos` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
