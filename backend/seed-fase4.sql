-- =====================================================================
-- UmuFrio — carga de dados para TESTES da Fase 4 (PIX + relatórios)
-- =====================================================================
-- ATENÇÃO: este script APAGA todos os clientes, agendamentos, ordens de
-- serviço, cobranças PIX, check-ins e movimentações de estoque, e cria dados novos.
-- Usuários, serviços e produtos já existentes são MANTIDOS (os que faltarem
-- são criados). Use somente em banco de teste.
--
-- Como rodar (a partir da pasta backend, com as migrations já aplicadas):
--   npm run db:seed -- --sim
-- ou, se tiver o psql:
--   psql "$DATABASE_URL" -f seed-fase4.sql
--
-- As datas são relativas a HOJE (de 50 dias atrás até 5 dias à frente), então
-- os relatórios "Mês atual", "Mês anterior" e "Últimos 30 dias" ficam cheios.
-- Pode rodar de novo quando quiser: ele sempre recomeça do zero.
--
-- Senha dos usuários de teste: Teste@123
-- =====================================================================

BEGIN;

TRUNCATE TABLE registros_localizacao, cobrancas_pix, movimentacoes_estoque, ordens_servico, agendamentos, clientes
  RESTART IDENTITY;

DO $$
DECLARE
  v_senha_hash varchar := '287f8bf8e8a93087a430f3cc004fde48:deef5fd294202ce16a983ffa65f2a2e5b91b113aef31428b3811d4c1a984ed9fd3771b49fe550f9e103a8e30b3a40ae64cd18c5a100a5123d9af13c25ad5a54f';

  v_ceo integer;
  v_tec integer[];
  v_cli integer[];

  v_sid_manut integer;
  v_sid_inst integer;
  v_sid_ret integer;

  v_formas text[] := ARRAY['pix','dinheiro','pix','cartao_credito','cartao_debito','pix','dinheiro','cartao_credito','pix','cartao_debito'];
  v_horas time[] := ARRAY['08:00','10:00','13:00','15:30']::time[];
  v_motivos text[] := ARRAY['Cliente ausente no local','Cliente remarcou por telefone','Peça indisponível no momento','Endereço não localizado'];

  i integer;
  k integer;
  n integer;
  b integer;          -- i deslocado para nunca ficar negativo nas contas de módulo
  d date;
  classe integer;
  v_cliente integer;
  v_tecnico integer;
  v_sid integer;
  v_valor numeric;
  v_cobrado numeric;
  v_forma text;
  v_obs text;
  v_ag integer;
  v_os integer;
  v_ini timestamptz;
  v_fim timestamptz;
  v_conf timestamptz;
  v_dur integer;
  v_estado text;      -- concluida_paga | concluida_aberta | andamento | aberta | nao_realizado | cancelado
  r record;
  v_total integer;
  m_n numeric;        -- deslocamento norte/sul do técnico em relação ao cliente (metros)
  m_e numeric;        -- deslocamento leste/oeste (metros)
  v_dist integer;
  v_lat numeric;
  v_lon numeric;
  v_just text;
BEGIN

  -- ==================== USUÁRIOS (só cria os que faltam) ====================
  INSERT INTO usuarios (nome, email, cpf, senha_hash, telefone, perfil, ativo, primeiro_acesso) VALUES
    ('Fernanda Objetivo', 'ceo@umufrio.com.br',       '11122233344', v_senha_hash, '(44) 99101-0001', 'ceo',        1, 0),
    ('Bruno Aguiar',      'atendente@umufrio.com.br', '22233344455', v_senha_hash, '(44) 99101-0002', 'atendente',  1, 0),
    ('Carla Nunes',       'estoque@umufrio.com.br',   '33344455566', v_senha_hash, '(44) 99101-0003', 'estoquista', 1, 0),
    ('Diego Torres',      'tecnico1@umufrio.com.br',  '44455566677', v_senha_hash, '(44) 99101-0004', 'tecnico',    1, 0),
    ('Eduarda Lima',      'tecnico2@umufrio.com.br',  '55566677788', v_senha_hash, '(44) 99101-0005', 'tecnico',    1, 0)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_ceo FROM usuarios WHERE perfil = 'ceo' AND ativo = 1 ORDER BY id LIMIT 1;
  SELECT array_agg(id ORDER BY id) INTO v_tec
    FROM (SELECT id FROM usuarios WHERE perfil = 'tecnico' AND ativo = 1 ORDER BY id LIMIT 2) t;

  IF v_ceo IS NULL OR v_tec IS NULL OR array_length(v_tec, 1) < 2 THEN
    RAISE EXCEPTION 'É preciso ter 1 usuário ceo ativo e 2 técnicos ativos.';
  END IF;

  -- ==================== PRODUTOS (só cria os que faltam) ====================
  INSERT INTO produtos (nome, valor_unitario, saldo, quantidade_minima)
  SELECT p.nome, p.valor, 0, p.minimo
    FROM (VALUES
      ('Gás refrigerante R410A (kg)',            180.00, 10),
      ('Capacitor de partida',                    35.50,  5),
      ('Filtro secador',                          22.00, 10),
      ('Placa eletrônica universal',             210.00,  3),
      ('Suporte de parede para condensadora',     45.00,  5),
      ('Mangueira de cobre (metro)',              28.00, 20)
    ) AS p(nome, valor, minimo)
   WHERE NOT EXISTS (SELECT 1 FROM produtos x WHERE x.nome = p.nome);

  -- ==================== SERVIÇOS (só cria os que faltam) ====================
  INSERT INTO servicos (nome, descricao, valor)
  SELECT s.nome, s.descricao, s.valor
    FROM (VALUES
      ('Instalação de Ar-Condicionado',  'Instalação completa de unidade split, incluindo suporte e tubulação.', 450.00),
      ('Manutenção de Ar-Condicionado',  'Limpeza, troca de filtro e checagem de gás.',                         180.00),
      ('Retirada de Ar-Condicionado',    'Remoção de unidade split sem reinstalação.',                          120.00)
    ) AS s(nome, descricao, valor)
   WHERE NOT EXISTS (SELECT 1 FROM servicos x WHERE x.nome = s.nome);

  SELECT id INTO v_sid_inst  FROM servicos WHERE nome = 'Instalação de Ar-Condicionado' ORDER BY id LIMIT 1;
  SELECT id INTO v_sid_manut FROM servicos WHERE nome = 'Manutenção de Ar-Condicionado' ORDER BY id LIMIT 1;
  SELECT id INTO v_sid_ret   FROM servicos WHERE nome = 'Retirada de Ar-Condicionado'   ORDER BY id LIMIT 1;

  -- Peças por serviço (as que já existirem ficam como estão)
  INSERT INTO servico_pecas (servico_id, produto_id, quantidade_necessaria)
  SELECT v_sid_inst, id, q FROM produtos
    JOIN (VALUES ('Suporte de parede para condensadora', 1),
                 ('Mangueira de cobre (metro)', 3),
                 ('Gás refrigerante R410A (kg)', 1)) AS m(nome, q) USING (nome)
  ON CONFLICT DO NOTHING;

  INSERT INTO servico_pecas (servico_id, produto_id, quantidade_necessaria)
  SELECT v_sid_manut, id, q FROM produtos
    JOIN (VALUES ('Filtro secador', 1),
                 ('Gás refrigerante R410A (kg)', 1)) AS m(nome, q) USING (nome)
  ON CONFLICT DO NOTHING;

  -- ==================== CLIENTES ====================
  INSERT INTO clientes (nome, cpf, telefone, cep, logradouro, numero, bairro, cidade, estado, tipo_residencia, complemento, status, inativado_em) VALUES
    ('Marcos Silveira',    '52601815906', '(44) 99202-1001', '87501-130', 'Avenida Maringá',               '1200', 'Zona I',   'Umuarama', 'PR', 'casa',        NULL,               'ativo',   NULL),
    ('Juliana Prado',      '08301661305', '(44) 99202-1002', '87502-210', 'Rua Santos Dumont',             '455',  'Zona III', 'Umuarama', 'PR', 'apartamento', 'Bloco B, Apto 302','ativo',   NULL),
    ('Roberto Chagas',     '18609139034', '(44) 99202-1003', '87503-050', 'Rua Ministro Oliveira Salazar', '78',   'Zona II',  'Umuarama', 'PR', 'barracao',    'Galpão nos fundos','ativo',   NULL),
    ('Patrícia Souza',     '99603082430', '(44) 99202-1004', '87504-330', 'Rua Espírito Santo',            '890',  'Zona V',   'Umuarama', 'PR', 'casa',        NULL,               'ativo',   NULL),
    ('Lucas Henrique Melo','62819482112', '(44) 99202-1005', '87505-410', 'Rua Paraná',                    '321',  'Zona IV',  'Umuarama', 'PR', 'apartamento', 'Apto 12',          'ativo',   NULL),
    ('Fernanda Oliveira',  '99351819019', '(44) 99202-1006', '87501-220', 'Avenida Parana',                '1540', 'Zona I',   'Umuarama', 'PR', 'casa',        NULL,               'ativo',   NULL),
    ('Ricardo Almeida',    '93786579741', '(44) 99202-1007', '87502-340', 'Rua Rio Grande do Sul',         '67',   'Zona III', 'Umuarama', 'PR', 'casa',        NULL,               'ativo',   NULL),
    ('Camila Ferraz',      '54323194897', '(44) 99202-1008', '87503-120', 'Rua Pernambuco',                '902',  'Zona II',  'Umuarama', 'PR', 'apartamento', 'Bloco A, Apto 41','ativo',   NULL),
    ('Eduardo Nascimento', '75749118606', '(44) 99202-1009', '87504-010', 'Rua Alagoas',                   '233',  'Zona V',   'Umuarama', 'PR', 'casa',        NULL,               'ativo',   NULL),
    ('Beatriz Moraes',     '25276018987', '(44) 99202-1010', '87501-440', 'Avenida Rio Branco',            '2100', 'Zona I',   'Umuarama', 'PR', 'apartamento', 'Apto 803',         'ativo',   NULL),
    ('Thiago Barbosa',     '55597971115', '(44) 99202-1011', '87505-200', 'Rua Mato Grosso',               '48',   'Zona IV',  'Umuarama', 'PR', 'barracao',    'Oficina',          'ativo',   NULL),
    ('Aline Carvalho',     '47104974601', '(44) 99202-1012', '87502-500', 'Rua Goiás',                     '715',  'Zona III', 'Umuarama', 'PR', 'casa',        NULL,               'ativo',   NULL),
    ('Gustavo Teixeira',   '50752917080', '(44) 99202-1013', '87503-330', 'Rua Bahia',                     '156',  'Zona II',  'Umuarama', 'PR', 'casa',        NULL,               'ativo',   NULL),
    ('André Ferreira',     '34236671255', '(44) 99202-1014', '87505-410', 'Rua Paraná',                    '321',  'Zona IV',  'Umuarama', 'PR', 'apartamento', NULL,               'inativo', now());

  -- Coordenadas aproximadas e fictícias (região de Umuarama) para testar o
  -- check-in sem internet. A chave 'geo_endereco' é a mesma que o sistema usa para
  -- saber se o endereço mudou; se você editar o endereço do cliente, o sistema
  -- geocodifica de novo (Nominatim) no próximo check-in.
  UPDATE clientes
     SET latitude  = round((-23.766 + ((id * 7) % 11 - 5) * 0.0025)::numeric, 6),
         longitude = round((-53.325 + ((id * 3) % 9 - 4) * 0.0025)::numeric, 6),
         geo_endereco = concat_ws('|', logradouro, numero, bairro, cidade, estado, cep),
         geocodificado_em = now();

  -- Só clientes ativos recebem atendimentos
  SELECT array_agg(id ORDER BY id) INTO v_cli FROM clientes WHERE status = 'ativo';

  -- ==================== AGENDAMENTOS, ORDENS, PAGAMENTOS, PIX, ESTOQUE ====================
  FOR i IN -50..5 LOOP
    d := CURRENT_DATE + i;
    b := i + 100;
    CONTINUE WHEN extract(isodow FROM d) = 7;           -- sem atendimentos aos domingos

    n := 1 + (b % 3);                                    -- 1 a 3 por dia
    IF i = 0 THEN n := 3; END IF;                        -- hoje: um de cada situação
    IF i > 0 THEN n := 1 + (b % 2); END IF;              -- futuros: 1 ou 2

    FOR k IN 0..n - 1 LOOP
      classe := (b * 7 + k * 3) % 10;
      v_cliente := v_cli[1 + (b * 3 + k * 5) % array_length(v_cli, 1)];
      v_tecnico := v_tec[1 + (b + k) % 2];
      v_sid := CASE
        WHEN (b + k * 2) % 10 < 5 THEN v_sid_manut
        WHEN (b + k * 2) % 10 < 8 THEN v_sid_inst
        ELSE v_sid_ret
      END;
      SELECT valor INTO v_valor FROM servicos WHERE id = v_sid;

      -- Situação do atendimento
      IF d < CURRENT_DATE THEN
        v_estado := CASE
          WHEN classe = 8 THEN 'nao_realizado'
          WHEN classe = 9 THEN 'cancelado'
          WHEN (classe = 7 OR (b + k) % 5 = 0) AND d >= CURRENT_DATE - 6 THEN 'concluida_aberta'   -- a receber
          ELSE 'concluida_paga'
        END;
      ELSIF d = CURRENT_DATE THEN
        v_estado := CASE k WHEN 0 THEN 'concluida_paga' WHEN 1 THEN 'andamento' ELSE 'aberta' END;
      ELSE
        v_estado := CASE WHEN classe = 9 THEN 'cancelado' ELSE 'aberta' END;
      END IF;

      -- Agendamento
      INSERT INTO agendamentos (cliente_id, tecnico_id, data, hora, status, cancelado_em, nao_realizado, motivo_nao_realizado)
      VALUES (
        v_cliente, v_tecnico, d, v_horas[k + 1],
        CASE WHEN v_estado IN ('nao_realizado','cancelado') THEN 'cancelado'::status_agendamento ELSE 'agendado'::status_agendamento END,
        CASE WHEN v_estado IN ('nao_realizado','cancelado') THEN ((d + v_horas[k + 1]) AT TIME ZONE 'America/Sao_Paulo') - interval '1 hour' END,
        CASE WHEN v_estado = 'nao_realizado' THEN 1 ELSE 0 END,
        CASE WHEN v_estado = 'nao_realizado' THEN v_motivos[1 + (b + k) % array_length(v_motivos, 1)] END
      )
      RETURNING id INTO v_ag;

      -- Cancelados e não realizados não têm ordem de serviço (como no sistema)
      CONTINUE WHEN v_estado IN ('nao_realizado','cancelado');

      v_ini := ((d + v_horas[k + 1]) AT TIME ZONE 'America/Sao_Paulo') + interval '5 minutes';
      v_dur := 60 + (b * 17 + k * 29) % 90;
      v_fim := v_ini + make_interval(mins => v_dur);

      IF v_estado = 'aberta' THEN
        INSERT INTO ordens_servico (agendamento_id, servico_id, status, aberta_em)
        VALUES (v_ag, v_sid, 'aberta', ((d + v_horas[k + 1]) AT TIME ZONE 'America/Sao_Paulo') - interval '2 days')
        RETURNING id INTO v_os;
        CONTINUE;
      END IF;

      -- Valor cobrado: o do serviço, com alguns casos de acréscimo/desconto (com observação)
      v_cobrado := v_valor;
      v_obs := NULL;
      IF (b + k) % 9 = 0 THEN
        v_cobrado := v_valor + 40; v_obs := 'Peça adicional cobrada à parte';
      ELSIF (b + k) % 11 = 0 THEN
        v_cobrado := GREATEST(v_valor - 20, 1); v_obs := 'Desconto combinado com o cliente';
      END IF;

      IF v_estado = 'andamento' THEN
        INSERT INTO ordens_servico (agendamento_id, servico_id, status, aberta_em, iniciada_em, valor_cobrado)
        VALUES (v_ag, v_sid, 'andamento', v_ini - interval '2 days', v_ini, v_valor)
        RETURNING id INTO v_os;

      ELSIF v_estado = 'concluida_aberta' THEN
        INSERT INTO ordens_servico (agendamento_id, servico_id, status, aberta_em, iniciada_em, concluida_em, valor_cobrado, observacao_pagamento)
        VALUES (v_ag, v_sid, 'concluida', v_ini - interval '2 days', v_ini, v_fim, v_cobrado, v_obs)
        RETURNING id INTO v_os;

      ELSE -- concluida_paga
        v_forma := v_formas[1 + (b * 3 + k) % 10];
        v_conf := v_fim + interval '25 minutes';
        INSERT INTO ordens_servico (
          agendamento_id, servico_id, status, aberta_em, iniciada_em, concluida_em,
          valor_cobrado, forma_pagamento, pagamento_confirmado, pagamento_confirmado_em,
          observacao_pagamento, pagamento_usuario_id
        )
        VALUES (v_ag, v_sid, 'concluida', v_ini - interval '2 days', v_ini, v_fim,
                v_cobrado, v_forma, 1, v_conf, v_obs, v_ceo)
        RETURNING id INTO v_os;

        IF v_forma = 'pix' THEN
          INSERT INTO cobrancas_pix (ordem_id, usuario_id, valor, status, modo, referencia, codigo_copia_cola, criado_em, expira_em, aprovado_em)
          VALUES (v_os, v_tecnico, v_cobrado, 'aprovado', 'simulado',
                  'UMUFRIO-OS-' || v_os, 'SIMULADO-UMUFRIO-OS-' || v_os || '-seed',
                  v_fim + interval '5 minutes', v_fim + interval '35 minutes', v_conf);
        END IF;
      END IF;

      -- Consumo de peças do serviço (descontado ao iniciar o atendimento)
      INSERT INTO movimentacoes_estoque (produto_id, usuario_id, ordem_servico_id, tipo, quantidade, data, extra)
      SELECT sp.produto_id, v_tecnico, v_os, 'saida', sp.quantidade_necessaria, v_ini, 0
        FROM servico_pecas sp
       WHERE sp.servico_id = v_sid;

      -- Peça extra em alguns atendimentos concluídos
      IF v_estado <> 'andamento' AND (b + k) % 6 = 0 THEN
        INSERT INTO movimentacoes_estoque (produto_id, usuario_id, ordem_servico_id, tipo, quantidade, data, extra)
        SELECT id, v_tecnico, v_os, 'saida', 1, v_ini + interval '30 minutes', 1
          FROM produtos WHERE nome = 'Capacitor de partida' ORDER BY id LIMIT 1;
      END IF;

      -- Check-in e check-out geolocalizados (Fase 5). Alguns atendimentos ficam
      -- sem registro e alguns têm check-in fora do raio, com justificativa.
      IF (b + k) % 7 <> 0 THEN
        SELECT latitude, longitude INTO v_lat, v_lon FROM clientes WHERE id = v_cliente;
        m_n := ((b * 13 + k * 7) % 90) - 45;
        m_e := ((b * 17 + k * 5) % 90) - 45;
        v_just := NULL;
        IF (b + k) % 9 = 1 THEN
          m_n := 320 + (b % 200);
          m_e := 150 + k * 40;
          v_just := 'Sem vaga em frente ao local, estacionei na rua de trás';
        END IF;
        v_dist := round(sqrt(m_n * m_n + m_e * m_e));

        INSERT INTO registros_localizacao
          (ordem_id, tipo, usuario_id, latitude, longitude, precisao_m, distancia_m, raio_m, dentro_raio, justificativa, criado_em)
        VALUES (v_os, 'checkin', v_tecnico,
                round((v_lat + m_n / 111320.0)::numeric, 6),
                round((v_lon + m_e / (111320.0 * cos(radians(v_lat))))::numeric, 6),
                10 + (b % 25), v_dist, 150, v_dist <= 150,
                CASE WHEN v_dist > 150 THEN v_just END,
                v_ini - interval '5 minutes');

        IF v_estado <> 'andamento' THEN
          m_n := round(m_n / 2);
          m_e := round(m_e / 2);
          v_dist := round(sqrt(m_n * m_n + m_e * m_e));
          INSERT INTO registros_localizacao
            (ordem_id, tipo, usuario_id, latitude, longitude, precisao_m, distancia_m, raio_m, dentro_raio, justificativa, criado_em)
          VALUES (v_os, 'checkout', v_tecnico,
                  round((v_lat + m_n / 111320.0)::numeric, 6),
                  round((v_lon + m_e / (111320.0 * cos(radians(v_lat))))::numeric, 6),
                  10 + (b % 25), v_dist, 150, v_dist <= 150,
                  CASE WHEN v_dist > 150 THEN 'Saí do local para ligar ao cliente' END,
                  v_fim + interval '2 minutes');
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- ==================== ENTRADAS DE ESTOQUE E SALDOS ====================
  -- Para cada produto: saldo final desejado + o que foi consumido = total que
  -- entrou. Dois produtos terminam abaixo do mínimo (alerta nos relatórios).
  FOR r IN
    SELECT p.id, p.nome, t.alvo,
           COALESCE((SELECT sum(m.quantidade) FROM movimentacoes_estoque m
                      WHERE m.produto_id = p.id AND m.tipo = 'saida'), 0) AS consumido
      FROM produtos p
      JOIN (VALUES
        ('Gás refrigerante R410A (kg)',           6),   -- abaixo do mínimo (10)
        ('Capacitor de partida',                 18),
        ('Filtro secador',                        4),   -- abaixo do mínimo (10)
        ('Placa eletrônica universal',            6),
        ('Suporte de parede para condensadora',  12),
        ('Mangueira de cobre (metro)',           45)
      ) AS t(nome, alvo) ON t.nome = p.nome
  LOOP
    v_total := r.alvo + r.consumido;
    INSERT INTO movimentacoes_estoque (produto_id, usuario_id, tipo, quantidade, data, extra)
    VALUES (r.id, v_ceo, 'entrada', GREATEST(v_total - 10, 1), (CURRENT_DATE - 52) + time '09:00', 0);
    INSERT INTO movimentacoes_estoque (produto_id, usuario_id, tipo, quantidade, data, extra)
    VALUES (r.id, v_ceo, 'entrada', LEAST(10, v_total - 1), (CURRENT_DATE - 20) + time '09:00', 0);
    UPDATE produtos SET saldo = r.alvo WHERE id = r.id;
  END LOOP;

END $$;

COMMIT;

-- =====================================================================
-- O que foi criado:
--   14 clientes (13 ativos, 1 inativo) e ~100 agendamentos entre 50 dias atrás
--   e 5 dias à frente (sem domingos):
--     - concluídos e pagos (PIX, dinheiro, débito, crédito) com alguns valores
--       diferentes do serviço (com observação);
--     - concluídos ainda a receber (últimos 6 dias);
--     - HOJE: 1 concluído e pago, 1 em andamento (teste o PIX nele!) e 1 aberto;
--     - não realizados (com motivo) e cancelados;
--     - futuros abertos.
--   Cobranças PIX aprovadas (modo demonstração) para os pagamentos em PIX.
--   Coordenadas dos clientes e check-in/check-out dos atendimentos (a maioria dentro
--   do raio, alguns fora com justificativa e alguns sem registro). O atendimento
--   de HOJE em andamento tem check-in; o aberto de hoje está livre para você testar.
--   Consumo de estoque por atendimento, peças extras e entradas; Gás R410A e
--   Filtro secador terminam abaixo do mínimo.
--
-- Logins (senha Teste@123): ceo@umufrio.com.br, atendente@umufrio.com.br,
--   estoque@umufrio.com.br, tecnico1@umufrio.com.br, tecnico2@umufrio.com.br
-- =====================================================================
