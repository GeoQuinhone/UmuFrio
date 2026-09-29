-- =====================================================================
-- UmuFrio — script de carga de dados para TESTES / demonstração
-- =====================================================================
-- Como usar:
--   1. Rode as migrations normalmente antes deste script:
--        npm run db:migrate
--   2. Rode este arquivo contra o banco (ele roda tudo dentro de uma
--      transação, então em caso de erro nada fica pela metade):
--        psql "$DATABASE_URL" -f seed-teste.sql
--
-- Senha de todos os usuários de teste: Teste@123
-- (hash gerado com o mesmo algoritmo do security.js: scrypt, salt:hash)
--
-- ATENÇÃO: este script assume que as tabelas estão VAZIAS. Se já existem
-- clientes/usuários com os mesmos CPF/e-mail abaixo, vai dar erro de
-- unique_violation. Para limpar tudo antes (SÓ em banco de teste),
-- descomente o bloco TRUNCATE logo abaixo.
-- =====================================================================

BEGIN;

-- Descomente para zerar as tabelas antes de inserir (cuidado: apaga tudo!)
-- TRUNCATE TABLE
--   movimentacoes_estoque,
--   ordens_servico,
--   servico_pecas,
--   agendamentos,
--   servicos,
--   produtos,
--   clientes,
--   usuarios
-- RESTART IDENTITY CASCADE;

DO $$
DECLARE
  v_senha_hash varchar := '287f8bf8e8a93087a430f3cc004fde48:deef5fd294202ce16a983ffa65f2a2e5b91b113aef31428b3811d4c1a984ed9fd3771b49fe550f9e103a8e30b3a40ae64cd18c5a100a5123d9af13c25ad5a54f';

  v_ceo_id integer;
  v_atendente_id integer;
  v_estoquista_id integer;
  v_tecnico1_id integer;
  v_tecnico2_id integer;

  v_cliente_marcos_id integer;
  v_cliente_juliana_id integer;
  v_cliente_roberto_id integer;
  v_cliente_patricia_id integer;
  v_cliente_andre_id integer;

  v_produto_gas_id integer;
  v_produto_capacitor_id integer;
  v_produto_filtro_id integer;
  v_produto_placa_id integer;
  v_produto_suporte_id integer;
  v_produto_mangueira_id integer;

  v_servico_instalacao_id integer;
  v_servico_manutencao_id integer;
  v_servico_retirada_id integer;

  v_agendamento1_id integer; -- Marcos, hoje
  v_agendamento2_id integer; -- Juliana, amanhã
  v_agendamento3_id integer; -- Roberto, +2 dias
  v_agendamento4_id integer; -- Patrícia, ontem (concluído)
  v_agendamento5_id integer; -- Marcos, -3 dias (em andamento)
  v_agendamento6_id integer; -- Juliana, +5 dias (cancelado)

  v_os_concluida_id integer;
  v_os_andamento_id integer;
BEGIN

  -- ==================== USUÁRIOS ====================
  INSERT INTO usuarios (nome, email, cpf, senha_hash, telefone, perfil, ativo, primeiro_acesso)
  VALUES ('Fernanda Objetivo', 'ceo@umufrio.com.br', '11122233344', v_senha_hash, '(44) 99101-0001', 'ceo', 1, 0)
  RETURNING id INTO v_ceo_id;

  INSERT INTO usuarios (nome, email, cpf, senha_hash, telefone, perfil, ativo, primeiro_acesso)
  VALUES ('Bruno Aguiar', 'atendente@umufrio.com.br', '22233344455', v_senha_hash, '(44) 99101-0002', 'atendente', 1, 0)
  RETURNING id INTO v_atendente_id;

  INSERT INTO usuarios (nome, email, cpf, senha_hash, telefone, perfil, ativo, primeiro_acesso)
  VALUES ('Carla Nunes', 'estoque@umufrio.com.br', '33344455566', v_senha_hash, '(44) 99101-0003', 'estoquista', 1, 0)
  RETURNING id INTO v_estoquista_id;

  INSERT INTO usuarios (nome, email, cpf, senha_hash, telefone, perfil, ativo, primeiro_acesso)
  VALUES ('Diego Torres', 'tecnico1@umufrio.com.br', '44455566677', v_senha_hash, '(44) 99101-0004', 'tecnico', 1, 0)
  RETURNING id INTO v_tecnico1_id;

  INSERT INTO usuarios (nome, email, cpf, senha_hash, telefone, perfil, ativo, primeiro_acesso)
  VALUES ('Eduarda Lima', 'tecnico2@umufrio.com.br', '55566677788', v_senha_hash, '(44) 99101-0005', 'tecnico', 1, 0)
  RETURNING id INTO v_tecnico2_id;

  -- ==================== CLIENTES ====================
  INSERT INTO clientes (nome, cpf, telefone, cep, logradouro, numero, bairro, cidade, estado, tipo_residencia, complemento, status)
  VALUES ('Marcos Silveira', '66677788899', '(44) 99202-1001', '87501-130', 'Avenida Maringá', '1200', 'Zona I', 'Umuarama', 'PR', 'casa', NULL, 'ativo')
  RETURNING id INTO v_cliente_marcos_id;

  INSERT INTO clientes (nome, cpf, telefone, cep, logradouro, numero, bairro, cidade, estado, tipo_residencia, complemento, status)
  VALUES ('Juliana Prado', '77788899900', '(44) 99202-1002', '87502-210', 'Rua Santos Dumont', '455', 'Zona III', 'Umuarama', 'PR', 'apartamento', 'Bloco B, Apto 302', 'ativo')
  RETURNING id INTO v_cliente_juliana_id;

  INSERT INTO clientes (nome, cpf, telefone, cep, logradouro, numero, bairro, cidade, estado, tipo_residencia, complemento, status)
  VALUES ('Roberto Chagas', '88899900011', '(44) 99202-1003', '87503-050', 'Rua Ministro Oliveira Salazar', '78', 'Zona II', 'Umuarama', 'PR', 'barracao', 'Galpão nos fundos', 'ativo')
  RETURNING id INTO v_cliente_roberto_id;

  INSERT INTO clientes (nome, cpf, telefone, cep, logradouro, numero, bairro, cidade, estado, tipo_residencia, complemento, status)
  VALUES ('Patrícia Souza', '99900011122', '(44) 99202-1004', '87504-330', 'Rua Espírito Santo', '890', 'Zona V', 'Umuarama', 'PR', 'casa', NULL, 'ativo')
  RETURNING id INTO v_cliente_patricia_id;

  INSERT INTO clientes (nome, cpf, telefone, cep, logradouro, numero, bairro, cidade, estado, tipo_residencia, complemento, status, inativado_em)
  VALUES ('André Ferreira', '10011122233', '(44) 99202-1005', '87505-410', 'Rua Paraná', '321', 'Zona IV', 'Umuarama', 'PR', 'apartamento', NULL, 'inativo', now())
  RETURNING id INTO v_cliente_andre_id;

  -- ==================== PRODUTOS (ESTOQUE) ====================
  INSERT INTO produtos (nome, valor_unitario, saldo, quantidade_minima)
  VALUES ('Gás refrigerante R410A (kg)', 180.00, 40, 10)
  RETURNING id INTO v_produto_gas_id;

  INSERT INTO produtos (nome, valor_unitario, saldo, quantidade_minima)
  VALUES ('Capacitor de partida', 35.50, 25, 5)
  RETURNING id INTO v_produto_capacitor_id;

  INSERT INTO produtos (nome, valor_unitario, saldo, quantidade_minima)
  VALUES ('Filtro secador', 22.00, 8, 10)
  RETURNING id INTO v_produto_filtro_id;

  INSERT INTO produtos (nome, valor_unitario, saldo, quantidade_minima)
  VALUES ('Placa eletrônica universal', 210.00, 6, 3)
  RETURNING id INTO v_produto_placa_id;

  INSERT INTO produtos (nome, valor_unitario, saldo, quantidade_minima)
  VALUES ('Suporte de parede para condensadora', 45.00, 15, 5)
  RETURNING id INTO v_produto_suporte_id;

  INSERT INTO produtos (nome, valor_unitario, saldo, quantidade_minima)
  VALUES ('Mangueira de cobre (metro)', 28.00, 60, 20)
  RETURNING id INTO v_produto_mangueira_id;

  -- ==================== SERVIÇOS ====================
  INSERT INTO servicos (nome, descricao, valor)
  VALUES ('Instalação de Ar-Condicionado', 'Instalação completa de unidade split, incluindo suporte e tubulação.', 450.00)
  RETURNING id INTO v_servico_instalacao_id;

  INSERT INTO servicos (nome, descricao, valor)
  VALUES ('Manutenção de Ar-Condicionado', 'Limpeza, troca de filtro e checagem de gás.', 180.00)
  RETURNING id INTO v_servico_manutencao_id;

  INSERT INTO servicos (nome, descricao, valor)
  VALUES ('Retirada de Ar-Condicionado', 'Remoção de unidade split sem reinstalação.', 120.00)
  RETURNING id INTO v_servico_retirada_id;

  -- Peças vinculadas a cada serviço
  INSERT INTO servico_pecas (servico_id, produto_id, quantidade_necessaria) VALUES
    (v_servico_instalacao_id, v_produto_suporte_id, 1),
    (v_servico_instalacao_id, v_produto_mangueira_id, 3),
    (v_servico_instalacao_id, v_produto_gas_id, 1),
    (v_servico_manutencao_id, v_produto_filtro_id, 1),
    (v_servico_manutencao_id, v_produto_gas_id, 1);
    -- Retirada de Ar-Condicionado não exige peças do estoque

  -- ==================== AGENDAMENTOS ====================
  INSERT INTO agendamentos (cliente_id, tecnico_id, data, hora, status)
  VALUES (v_cliente_marcos_id, v_tecnico1_id, CURRENT_DATE, '09:00', 'agendado')
  RETURNING id INTO v_agendamento1_id;

  INSERT INTO agendamentos (cliente_id, tecnico_id, data, hora, status)
  VALUES (v_cliente_juliana_id, v_tecnico2_id, CURRENT_DATE + INTERVAL '1 day', '14:00', 'agendado')
  RETURNING id INTO v_agendamento2_id;

  INSERT INTO agendamentos (cliente_id, tecnico_id, data, hora, status)
  VALUES (v_cliente_roberto_id, v_tecnico1_id, CURRENT_DATE + INTERVAL '2 day', '10:30', 'agendado')
  RETURNING id INTO v_agendamento3_id;

  INSERT INTO agendamentos (cliente_id, tecnico_id, data, hora, status)
  VALUES (v_cliente_patricia_id, v_tecnico2_id, CURRENT_DATE - INTERVAL '1 day', '08:00', 'agendado')
  RETURNING id INTO v_agendamento4_id;

  INSERT INTO agendamentos (cliente_id, tecnico_id, data, hora, status)
  VALUES (v_cliente_marcos_id, v_tecnico1_id, CURRENT_DATE - INTERVAL '3 day', '11:00', 'agendado')
  RETURNING id INTO v_agendamento5_id;

  INSERT INTO agendamentos (cliente_id, tecnico_id, data, hora, status, cancelado_em)
  VALUES (v_cliente_juliana_id, v_tecnico1_id, CURRENT_DATE + INTERVAL '5 day', '16:00', 'cancelado', now())
  RETURNING id INTO v_agendamento6_id;

  -- ==================== ORDENS DE SERVIÇO ====================
  -- OS já concluída (agendamento de ontem, Patrícia): manutenção
  INSERT INTO ordens_servico (agendamento_id, servico_id, status, aberta_em, concluida_em)
  VALUES (v_agendamento4_id, v_servico_manutencao_id, 'concluida', CURRENT_DATE - INTERVAL '1 day', (CURRENT_DATE - INTERVAL '1 day') + INTERVAL '3 hour')
  RETURNING id INTO v_os_concluida_id;

  INSERT INTO movimentacoes_estoque (produto_id, usuario_id, ordem_servico_id, tipo, quantidade, data) VALUES
    (v_produto_filtro_id, v_tecnico2_id, v_os_concluida_id, 'saida', 1, CURRENT_DATE - INTERVAL '1 day'),
    (v_produto_gas_id, v_tecnico2_id, v_os_concluida_id, 'saida', 1, CURRENT_DATE - INTERVAL '1 day');

  -- OS em andamento (agendamento de -3 dias, Marcos): instalação
  INSERT INTO ordens_servico (agendamento_id, servico_id, status, aberta_em)
  VALUES (v_agendamento5_id, v_servico_instalacao_id, 'andamento', CURRENT_DATE - INTERVAL '3 day')
  RETURNING id INTO v_os_andamento_id;

  INSERT INTO movimentacoes_estoque (produto_id, usuario_id, ordem_servico_id, tipo, quantidade, data) VALUES
    (v_produto_suporte_id, v_tecnico1_id, v_os_andamento_id, 'saida', 1, CURRENT_DATE - INTERVAL '3 day'),
    (v_produto_mangueira_id, v_tecnico1_id, v_os_andamento_id, 'saida', 3, CURRENT_DATE - INTERVAL '3 day'),
    (v_produto_gas_id, v_tecnico1_id, v_os_andamento_id, 'saida', 1, CURRENT_DATE - INTERVAL '3 day');

  -- OS aberta (agendamento de hoje, Marcos): instalação, ainda não iniciada
  INSERT INTO ordens_servico (agendamento_id, servico_id, status)
  VALUES (v_agendamento1_id, v_servico_instalacao_id, 'aberta');

  -- OS aberta (agendamento de amanhã, Juliana): manutenção, ainda não iniciada
  INSERT INTO ordens_servico (agendamento_id, servico_id, status)
  VALUES (v_agendamento2_id, v_servico_manutencao_id, 'aberta');

  -- Agendamento de Roberto (+2 dias) fica sem OS, disponível para criar uma nova
  -- Agendamento cancelado de Juliana (+5 dias) fica sem OS, para validar que não é possível abrir OS nele

END $$;

COMMIT;

-- =====================================================================
-- Resumo do que foi criado:
--   5 usuários (senha "Teste@123" para todos):
--     ceo@umufrio.com.br          -> perfil ceo
--     atendente@umufrio.com.br    -> perfil atendente
--     estoque@umufrio.com.br      -> perfil estoquista
--     tecnico1@umufrio.com.br     -> perfil tecnico (Diego Torres)
--     tecnico2@umufrio.com.br     -> perfil tecnico (Eduarda Lima)
--   5 clientes (4 ativos, 1 inativo p/ testar filtro de status)
--   6 produtos (Filtro secador já abaixo do mínimo -> testa alerta de estoque)
--   3 serviços com peças vinculadas (Instalação e Manutenção; Retirada sem peças)
--   6 agendamentos (2 no passado, 1 hoje, 2 no futuro, 1 cancelado)
--   4 ordens de serviço: 1 concluída, 1 em andamento, 2 abertas
--     -> cobre os 3 status e testa Update/Delete/avançar de status
-- =====================================================================
