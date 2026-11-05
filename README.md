# UmuFrio

Sistema web para apoiar a gestão de uma empresa de manutenção de ar-condicionado
e refrigeração. Reúne clientes, serviços, estoque, agendamentos e ordens de
serviço em uma aplicação com frontend React, API Node.js e banco PostgreSQL.

Projeto de TCC do curso de Tecnologia em Sistemas para Internet (UniALFA).

## Funcionalidades

### Acesso e usuários

- Login com e-mail e senha, controle de acesso por perfil e troca de senha no
  primeiro acesso.
- Perfis: `ceo`, `atendente`, `estoquista` e `tecnico`.
- Bloqueio temporário do usuário após 5 tentativas de login inválidas.
- Recuperação de senha informando apenas o e-mail cadastrado.
- Gerenciamento de usuários (somente `ceo`).
- Não há cadastro público de contas na tela de login. O primeiro `ceo` é criado
  uma única vez pelo endpoint `POST /api/auth/bootstrap` (veja
  [Primeiro usuário](#primeiro-usuário-ceo)).

### Clientes

- Cadastro com CPF validado pelo dígito verificador, telefone, CEP com
  preenchimento automático do endereço (ViaCEP) e tipo de residência.
- Máscaras automáticas de CPF, telefone e CEP nos formulários.
- Ativação e inativação, preservando o histórico.
- Cadastro rápido de cliente direto na tela de Agendamentos.

### Serviços

- Cadastro com valor (máscara monetária) e peças necessárias, com a quantidade
  de cada uma.
- O valor de um serviço não é editado depois de criado. Se o preço mudar, o
  serviço antigo é inativado e um novo é cadastrado, preservando o histórico das
  ordens já abertas.

### Estoque

- Cadastro e edição de produtos com valor unitário (máscara monetária), saldo e
  quantidade mínima.
- Entradas e saídas, sem permitir saída acima do saldo.
- Alertas de estoque mínimo.

### Agendamentos e ordens de serviço (fluxo único)

Agendamento e ordem de serviço (OS) são um fluxo só, na tela **Agendamentos**:
ao agendar, escolhe-se também o serviço e o sistema já cria a OS vinculada.

- Agendamento de cliente com serviço, técnico, data e horário.
- O mesmo técnico precisa de no mínimo 1 hora de diferença entre dois
  agendamentos no mesmo dia.
- Edição (cliente, serviço, técnico, data e horário) enquanto o atendimento não
  foi iniciado.
- Cancelamento e registro de atendimento não realizado (cliente ausente, local
  fechado etc., com motivo obrigatório), também antes de iniciar. A OS ainda
  aberta é removida junto.
- Avanço do atendimento com confirmação: **Agendado** → **Em andamento** →
  **Concluído**. Ao entrar em andamento, as peças do serviço são debitadas do
  estoque em uma transação; sem saldo para todas, nada é debitado.
- Peças extras: com o atendimento em andamento, é possível descontar do estoque
  peças além das vinculadas ao serviço. O técnico escolhe a peça por uma rota
  reduzida (`/api/produtos/para-tecnico`), que expõe só nome e saldo.
- Linha do tempo (agendado, em andamento, concluído) com data e hora de cada
  etapa, na tela de detalhes.
- Abas **Ativos**, **Concluídos** e **Cancelados**, com busca e filtros, e
  cartões de resumo (agendados, em andamento, concluídos e pagamento pendente).
- Exclusão definitiva (somente `ceo`) de atendimentos não concluídos; se estava
  em andamento, as peças voltam ao estoque. Atendimentos concluídos não podem ser
  excluídos, para preservar o histórico de estoque e de pagamento.
- O técnico vê apenas os próprios atendimentos, já com nome do cliente e serviço.
- Agendamentos antigos, criados antes da unificação e sem OS, continuam
  aparecendo; ao editá-los, o serviço escolhido gera a OS.

### Pagamento

- Disponível com o atendimento em andamento ou concluído.
- Campos: **valor cobrado** (nasce igual ao valor do serviço e pode ser
  alterado), **forma de pagamento** (dinheiro, PIX, cartão de débito ou
  crédito), **pagamento confirmado** e **observação**.
- Se o valor cobrado for diferente do valor do serviço, a observação com o motivo
  é obrigatória.
- Para confirmar o pagamento é preciso informar a forma de pagamento.
- Depois de confirmado, somente o `ceo` pode alterar o pagamento.
- Por padrão o atendimento pode ser concluído com o pagamento pendente (a tela
  avisa). Para exigir o pagamento confirmado antes de concluir, defina
  `EXIGIR_PAGAMENTO_PARA_CONCLUIR=true` no `.env` do backend.
- O painel inicial do `ceo` mostra o faturamento do mês (pagamentos confirmados)
  e o valor a receber.

### PIX (Mercado Pago)

- Na tela de pagamento, ao escolher a forma **PIX**, aparece o painel de
  cobrança: **Gerar PIX** mostra o QR Code, o código copia e cola, o valor e a
  contagem regressiva da validade (padrão: 30 minutos).
- A tela consulta o servidor a cada poucos segundos. Quando o pagamento é
  identificado, o pagamento do atendimento é **confirmado automaticamente**
  (forma PIX, data e hora da confirmação).
- Dois modos, escolhidos pelo `.env` do backend:
  - **Mercado Pago** — com `MP_ACCESS_TOKEN` definido. Use primeiro o token de
    **teste** da sua conta do Mercado Pago.
  - **Demonstração** — sem token (ou com `PIX_MODO=simulado`). O código é
    fictício e o botão **Simular pagamento (demonstração)** aprova a cobrança;
    ele não funciona em cobranças reais.
- A confirmação nunca vem do navegador: o servidor consulta o status direto na
  API do Mercado Pago. O aviso automático (webhook) é opcional e também só
  serve de gatilho para essa consulta; sem ele a baixa acontece pela consulta
  da própria tela, o que funciona inclusive em `localhost`.
- Regras: só atendimentos em andamento ou concluídos; não gera PIX para
  pagamento já confirmado ou valor zero; se o valor cobrado for diferente do
  valor do serviço, a observação é obrigatória (como no pagamento comum). Há no
  máximo uma cobrança pendente por atendimento; mudar o valor gera uma nova.
- Variáveis (todas opcionais, veja `backend/.env.example`): `MP_ACCESS_TOKEN`,
  `PIX_MODO`, `MP_NOTIFICATION_URL`, `MP_WEBHOOK_SECRET`,
  `MP_PAYER_EMAIL_PADRAO`, `PIX_EXPIRACAO_MINUTOS`.
- Para receber o aviso automático, cadastre no painel do Mercado Pago a URL
  pública `https://SEU-DOMINIO/api/pix/webhook` (evento "Pagamentos") e copie o
  segredo da assinatura para `MP_WEBHOOK_SECRET`.

### Relatórios estratégicos (somente CEO)

Tela **Relatórios** (`/relatorios`), com filtro de período (mês atual, mês
anterior, últimos 30 dias, ano atual ou datas livres; máximo de 366 dias) e
quatro abas. Cada aba mostra o critério de cálculo e exporta **CSV** (separador
`;`, decimal com vírgula e acentos corretos no Excel) e **PDF**.

**PDF (Fase 6):** os botões "PDF desta aba" e "PDF completo" geram o arquivo no
próprio navegador, a partir dos mesmos números já carregados na tela (nada é
recalculado e nada é enviado a terceiros). O PDF traz cabeçalho com o período,
cartões-resumo, gráfico de faturamento, barras, tabelas, o critério de cálculo e
rodapé com data/hora e paginação. O gerador é próprio, sem dependências
(`frontend/src/utils/pdfDoc.js` e `relatorioPdf.js`).

| Aba | O que mostra | Critério |
| --- | --- | --- |
| Faturamento | total, ticket médio, a receber, gráfico por dia (ou por mês em períodos longos) e por forma de pagamento | pagamentos confirmados no período, pela data da confirmação |
| Serviços e técnicos | ranking de serviços, receita e recebido; concluídos, não realizados e tempo médio por técnico | atendimentos agendados no período |
| Estoque | unidades consumidas, peças extras, custo das peças, mais consumidos e produtos abaixo do mínimo | saídas de estoque no período; "abaixo do mínimo" é a situação de hoje |
| Atendimentos | situação (concluídos, em andamento, agendados, cancelados, não realizados), taxa de conclusão, tempo médio e motivos | atendimentos agendados no período |

O fuso usado para "dia" e "mês" é `America/Sao_Paulo` (altere com
`RELATORIOS_FUSO`). Os outros perfis não acessam a tela nem a API.

### Check-in e check-out geolocalizado (técnico)

No detalhe do atendimento (`AtendimentoDialog`) o técnico responsável registra a
chegada (**check-in**) e a saída (**check-out**) usando a localização do aparelho.

- A distância até o endereço do cliente é calculada **no servidor** (fórmula de
  Haversine); o navegador só envia latitude, longitude e precisão.
- O raio permitido é `CHECKIN_RAIO_METROS` (padrão 150 m, entre 20 e 5000).
  **Fora do raio** o servidor responde 422 (`FORA_DO_RAIO`) e o registro só é
  aceito com uma **justificativa** (mín. 5 caracteres); ele fica marcado como
  "fora do raio".
- Um check-in e um check-out por ordem. O check-in vale para atendimentos
  abertos ou em andamento; o check-out exige check-in e atendimento iniciado.
- Só o técnico do atendimento registra; CEO e atendente apenas consultam.
- As coordenadas do cliente são obtidas **no primeiro check-in** pelo
  Nominatim/OpenStreetMap (gratuito, 1 consulta/s, com cache na tabela
  `clientes`) e refeitas se o endereço mudar. Se o endereço não for encontrado, o
  registro é salvo sem distância ("sem referência").
- A aba **Atendimentos** dos relatórios mostra check-ins, check-outs, fora do
  raio e sem referência.
- O navegador só libera a localização em **HTTPS** (ou `localhost`).

### Chat de atendimento na tela de login

Botão "Fale conosco" na tela de login, aberto a visitantes (sem login). Informa
sobre serviços, horário e formas de pagamento e **encaminha para o WhatsApp**;
não coleta dados nem agenda.

- **IA de verdade:** com `ANTHROPIC_API_KEY` definida, o assistente usa a API da
  Anthropic (modelo em `CHAT_MODELO`) e responde só com base nos serviços,
  horário e formas de pagamento da empresa.
- **Sem a chave, ou se a IA falhar:** o chat não inventa resposta. Ele avisa que
  está indisponível e leva o visitante para o WhatsApp.
- **Modo demonstração** (`CHAT_MODO=demonstracao`): respostas prontas por
  palavras-chave, só para testes locais sem chave.
- Limites: 12 mensagens por IP a cada 5 min e `CHAT_LIMITE_HORA` (padrão 300)
  no total por hora; mensagens de até 600 caracteres. Nada da conversa é gravado.
- `CHAT_HORARIO`, `CHAT_CIDADE` e `CHAT_EMPRESA_NOME` personalizam as respostas
  (veja `backend/.env.example`).

**Atalho do WhatsApp (Fase 6):** a tela de login tem o botão "Falar no WhatsApp"
e o chat tem o ícone no cabeçalho, o botão quando o assistente encaminha e o
link "Prefere o WhatsApp?" no rodapé. Todos abrem a conversa com o número
oficial **(44) 99804-9224** e a mensagem pronta "Olá! Vim pelo site da UmuFrio e
gostaria de atendimento." Para trocar o número, defina `CHAT_WHATSAPP` no `.env`
(só dígitos, com DDD).

### Interface

- Confirmações de exclusão e cancelamento em modal próprio, com foco preso e
  fechamento por `Esc`.
- Navegação por URL (React Router): cada módulo tem endereço próprio, funciona
  com os botões voltar e avançar do navegador e permite abrir um link direto.

| Endereço | Tela |
| --- | --- |
| `/` | Início (painel) |
| `/clientes` | Clientes |
| `/usuarios` | Usuários (somente `ceo`) |
| `/servicos` | Serviços |
| `/estoque` | Estoque |
| `/relatorios` | Relatórios (somente `ceo`) |
| `/agendamentos` | Lista de agendamentos e ordens |
| `/agendamentos/novo` | Novo agendamento |
| `/agendamentos/12` | Detalhes do atendimento 12 |
| `/agendamentos/12/editar` | Edição do atendimento 12 |
| `/agendamentos/12/pagamento` | Pagamento do atendimento 12 |

Endereços inexistentes ou sem permissão voltam para o início. `/ordens-servico`
redireciona para `/agendamentos`.

## Perfis e permissões

| Perfil | Pode |
| --- | --- |
| `ceo` | Tudo, incluindo usuários, exclusões e relatórios |
| `atendente` | Clientes, serviços e agendamentos (com ordem de serviço e pagamento) |
| `estoquista` | Estoque |
| `tecnico` | Ver os próprios atendimentos, iniciar e concluir, fazer check-in/check-out, descontar peças extras, registrar pagamento e atendimento não realizado |

## Tecnologias

- **Frontend:** React 18, React Router e Vite
- **Backend:** Node.js e Express
- **Acesso a dados:** Drizzle ORM e `pg`
- **Banco:** PostgreSQL
- **Autenticação:** token assinado (HMAC-SHA256) e senhas com scrypt

## Estrutura

```text
UmuFrio/
├── backend/
│   ├── src/
│   │   ├── db/           # conexão, schema (Drizzle) e migrations
│   │   ├── middleware/   # tratamento de erros
│   │   ├── routes/       # rotas da API
│   │   ├── ordemHelpers.js  # exclusão de OS com devolução ao estoque
│   │   ├── security.js   # auth, perfis, senha e validação de CPF
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/   # layout, ícones, diálogos reutilizáveis
    │   ├── hooks/        # useApiCrud
    │   ├── pages/        # uma página por módulo
    │   ├── utils/        # máscaras, validação de CPF e regras do atendimento
    │   ├── routes.js     # mapa das rotas de URL e permissões do menu
    │   └── App.jsx
    ├── .env.example
    └── package.json
```

## API

| Recurso | Caminho |
| --- | --- |
| Verificação | `GET /api/health` |
| Autenticação | `/api/auth` |
| Clientes | `/api/clientes` |
| Usuários | `/api/usuarios` |
| Agendamentos (com a OS) | `/api/agendamentos` (inclui `PUT /:id`, `DELETE /:id`, `PATCH /:id/cancelar` e `PATCH /:id/nao-realizado`) |
| Serviços | `/api/servicos` (inclui `PATCH /:id/status` para inativar e reativar) |
| Ordens de serviço | `/api/ordens-servico` (inclui `PATCH /:id/avancar`, `PATCH /:id/pagamento` e `/:id/pecas-extras`) |
| Produtos e estoque | `/api/produtos` |
| PIX do atendimento | `GET/POST /api/ordens-servico/:id/pix`, `POST /:id/pix/cancelar`, `POST /:id/pix/simular` (só no modo demonstração) |
| Aviso do Mercado Pago | `POST /api/pix/webhook` (público; valida a assinatura e consulta o status na API) |
| Check-in/check-out | `GET /api/ordens-servico/:id/localizacao`, `POST /:id/checkin`, `POST /:id/checkout` (técnico do atendimento) |
| Chat (público) | `GET /api/chat/config` e `POST /api/chat` |
| Relatórios (CEO) | `GET /api/relatorios?de=&ate=` e `GET /api/relatorios/csv/:tabela?de=&ate=` |



## Dados de demonstração (seed)

Três comandos, todos na pasta `backend/` e depois de `npm run db:migrate`:

| Comando | O que faz |
| --- | --- |
| `npm run db:seed` | Poucos dados (10 clientes, 18 atendimentos). Só roda com o banco sem clientes e com o CEO já criado. |
| `npm run db:seed-teste -- --sim` | Carga curta (50 dias para trás, 5 à frente). **Apaga** clientes, atendimentos, PIX e estoque. |
| `npm run db:seed-ano -- --sim` | **Carga anual**: ~13 meses de histórico e agenda até 31/12 do ano corrente. **Apaga** clientes, atendimentos, PIX, check-ins e movimentações de estoque e cria tudo de novo. |

O `db:seed-ano` gera, com semente fixa e respeitando as regras do sistema:

- **150 clientes** (12 inativos, 20 empresas com manutenção preventiva recorrente e o
  cliente de teste do WhatsApp, Romário Rocha, com o telefone de
  `SEED_TELEFONE_WHATSAPP`);
- **~1.600 agendamentos** de segunda a sábado (sem domingos e feriados), com sazonalidade
  (mais serviços no verão), cancelados, "não realizados" com motivo, atendimentos de
  hoje em andamento e agenda futura até 31/12;
- **ordens de serviço** com valor cobrado, forma de pagamento (dinheiro, PIX, débito e
  crédito), pagamentos a receber, descontos e acréscimos com observação e peças extras;
- **cobranças PIX** (modo demonstração) com algumas expiradas e canceladas;
- **estoque** com entradas, saídas por atendimento e produtos abaixo do mínimo (alerta);
- **check-in e check-out geolocalizados**, alguns fora do raio com justificativa;
- **4 técnicos** (um deles entrou há ~5 meses, outro tirou férias em janeiro), veículos
  e serviços com valor anterior inativo (mudança de preço em março de 2026).

Se faltarem, são criados os usuários `ceo@`, `atendente@`, `estoque@` e `tecnico1@` a
`tecnico4@umufrio.com.br` (senha `Teste@123`). Usuários, serviços e produtos que já
existirem são mantidos. O comando mostra o banco de destino antes de apagar e se
recusa a rodar com `NODE_ENV=production`.
