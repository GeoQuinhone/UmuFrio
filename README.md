# UmuFrio

Sistema web para apoiar a gestão de uma empresa de manutenção de ar-condicionado
e refrigeração. Reúne clientes, serviços, estoque, agendamentos, ordens de
serviço, veículos, despesas e relatórios em uma aplicação com frontend React,
API Node.js e banco PostgreSQL.

Publicação (Cloudflare Pages, Render e Neon): veja [DEPLOY.md](DEPLOY.md).

Projeto de TCC do curso de Tecnologia em Sistemas para Internet (UniALFA).

## Funcionalidades

### Acesso e usuários

- Login com e-mail e senha, controle de acesso por perfil e troca de senha no
  primeiro acesso.
- Perfis: `ceo`, `atendente`, `estoquista` e `tecnico`.
- Bloqueio temporário do usuário após 5 tentativas de login inválidas.
- Troca de senha (inclusive a obrigatória do primeiro acesso): exige a **senha
  atual** correta e a nova deve ser **diferente** da atual.
- **Senha forte** (ao criar o CEO, cadastrar/redefinir usuário ou trocar a senha):
  mínimo de 8 caracteres, pelo menos 1 caractere especial (ex.: `! @ # $ %`), não
  pode ser só espaços, nem uma senha comum (`123456`, `senha`, `qwerty`,
  `aaaaaaaa`…), nem conter o nome do e-mail ou o primeiro nome do usuário. A regra
  vale no servidor e é repetida na tela; logins já existentes continuam valendo.
- Gerenciamento de usuários (somente `ceo`).
- Não há cadastro público de contas na tela de login. O primeiro `ceo` é criado
  uma única vez pelo endpoint `POST /api/auth/bootstrap` (veja
  [Primeiro usuário](#primeiro-usuário-ceo)).

### Clientes

- Cliente **pessoa física (CPF)** ou **pessoa jurídica (CNPJ)**; o documento é
  validado pelos dígitos verificadores e não pode se repetir. Telefone, CEP com
  preenchimento automático do endereço (ViaCEP) e tipo de residência.
- Validações de cadastro (front e back-end): o nome de pessoa física não aceita
  números (a razão social de pessoa jurídica aceita números e `& . - / , ( )`);
  o número do imóvel aceita só dígitos (até 6); a UF é escolhida entre os 27
  estados.
- Máscaras automáticas de CPF/CNPJ, telefone e CEP nos formulários.
- Ativação e inativação, preservando o histórico.
- Cadastro rápido de cliente direto na tela de Agendamentos.

### Serviços

- Cadastro com valor (máscara monetária) e peças necessárias, com a quantidade
  de cada uma.
- Somente o `ceo` cadastra, edita, inativa e exclui serviços; o atendente só
  consulta o catálogo para agendar.
- O saldo de hoje **não trava** o cadastro: se o estoque não cobre as peças do
  serviço, a tela só **avisa** (o catálogo é fixo e o estoque muda todo dia). O
  servidor confere apenas se cada peça existe no estoque. A falta é avisada na
  agenda e tratada ao iniciar o atendimento (veja "Agendamentos").
- O valor de um serviço não é editado depois de criado. Se o preço mudar, o
  serviço antigo é inativado e um novo é cadastrado, preservando o histórico das
  ordens já abertas.

### Estoque

- Cadastro e edição de produtos com valor unitário (máscara monetária), saldo e
  quantidade mínima. Na edição o saldo é só leitura: ele muda por movimentação.
- Botões **Novo produto** e **Registrar movimentação** no topo da tela; ao
  clicar em editar, a tela rola até o formulário.
- Entradas e saídas, sem permitir saída acima do saldo.
- **Limites de segurança**: até 99.999.999 unidades por produto (saldo inicial,
  mínimo, cada lançamento e saldo após uma entrada) e valor unitário até
  R$ 99.999.999,99 (o máximo da coluna do banco). Para ajustar, altere
  `LIMITE_QUANTIDADE` e `LIMITE_VALOR_UNITARIO` em
  `backend/src/estoqueRegras.js` e em `frontend/src/utils/estoque.js`.
- Regra única de alerta: o produto é "no mínimo" quando saldo ≤ mínimo e
  "zerado" quando o saldo é 0 (a mesma regra vale no estoque, nos relatórios e
  nas notificações).
- O produto é escolhido em um seletor com busca que mostra saldo, mínimo e valor
  unitário.

### Veículos

- Cadastro de veículos (placa, marca, modelo, ano), técnico responsável e
  situação (ativo, em manutenção ou inativo). Só o veículo ativo aparece no
  atendimento do técnico.

### Despesas e lucro real (somente CEO)

- Tela **Despesas** (`/despesas`): descrição, categoria (combustível, salários e
  encargos, aluguel e contas, manutenção de veículos, ferramentas e
  equipamentos, marketing, impostos e taxas, outros), valor, data e observação,
  com filtro por categoria/mês e total do período.
- **Combustível** e **manutenção de veículos** podem ser vinculados a um veículo;
  **salários** podem ser vinculados a um funcionário (campos opcionais).
- O relatório de faturamento mostra o **lucro real** do período (regime de
  caixa): recebido − custo das peças − despesas.

### Notificações (sino)

- O sino do topo reúne, para o `ceo`, os avisos de estoque no mínimo ou zerado,
  atendimento iniciado, concluído (com alerta de pagamento pendente), não
  realizado, cancelado e **iniciado com falta de peça** (com o motivo informado),
  além das pendências ao vivo (pagamentos pendentes e
  estoque crítico). Atualiza a cada 30 segundos e permite marcar como lidas.
- O técnico recebe, no sino e em uma faixa na tela, o aviso de atendimento a até
  60 minutos do horário (calculado no navegador).

### Agendamentos e ordens de serviço (fluxo único)

Agendamento e ordem de serviço (OS) são um fluxo só, na tela **Agendamentos**:
ao agendar, escolhe-se também o serviço e o sistema já cria a OS vinculada.

- Agendamento de cliente com serviço, técnico, data e horário.
- Só é possível agendar das **07:00 às 19:00**. Para hoje, o horário precisa ser
  de agora em diante (fuso de Brasília).
- O mesmo técnico precisa de no mínimo 1 hora de diferença entre dois
  agendamentos no mesmo dia. Um atendimento já **concluído libera o horário**
  (só o horário exato continua ocupado), para o técnico que adianta o serviço.
- Edição (cliente, serviço, técnico, data e horário) enquanto o atendimento não
  foi iniciado.
- Cancelamento e registro de atendimento não realizado (cliente ausente, local
  fechado etc., com motivo obrigatório), também antes de iniciar. A OS ainda
  aberta é removida junto.
- Avanço do atendimento com confirmação: **Agendado** → **Em andamento** →
  **Concluído**. Ao entrar em andamento, as peças do serviço são debitadas do
  estoque em uma transação.
- **Falta de peça:** se o saldo não cobre o serviço, a agenda e os detalhes já
  mostram o aviso "Falta peça" antes do dia. Ao iniciar, o sistema pede o motivo
  (mín. 5 e máx. 200 caracteres; ex.: "comprei na loja do bairro"): inicia,
  baixa **só o que existe** (o saldo nunca fica negativo) e avisa o CEO no sino.
- **Início pelo técnico:** o técnico só inicia depois do **check-in**; se ainda
  não fez, o botão Iniciar pede a localização e registra na hora. Atendente e CEO
  podem iniciar sem check-in.
- **Conclusão:** quando o técnico conclui, o **check-out** é registrado junto (se
  a localização falhar ou ele preferir não justificar, a conclusão segue sem
  check-out). Concluir sem o pagamento confirmado exige um motivo (mín. 5
  caracteres), que fica na observação como "Pagamento pendente".
- Peças extras: com o atendimento em andamento, é possível descontar do estoque
  peças além das vinculadas ao serviço. O técnico escolhe a peça por uma rota
  reduzida (`/api/produtos/para-tecnico`), que expõe só nome e saldo.
- Linha do tempo (agendado, em andamento, concluído) com data e hora de cada
  etapa, na tela de detalhes.
- No painel inicial, o cartão **Atendimentos hoje** abre a agenda já filtrada
  pelo dia (`/agendamentos?data=hoje`).
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
- Campos: **valor cobrado** (nasce igual ao valor do serviço), **forma de
  pagamento** (dinheiro, PIX, cartão de débito ou crédito), **pagamento
  confirmado** e **observação**. A janela mostra o resumo (serviço + peças +/−
  ajuste = total); para mudar o valor usa-se **Acréscimo** ou **Desconto**, com
  motivo escolhido numa lista (ou "Outro", com descrição de no mínimo 10
  caracteres). O desconto não pode passar do total.
- O valor esperado é o valor do serviço **mais as peças extras** lançadas no
  atendimento (cada uma pelo preço unitário gravado na movimentação).
- Se o valor cobrado for diferente do valor esperado, a observação com o motivo
  é obrigatória.
- Para confirmar o pagamento é preciso informar a forma de pagamento.
- Depois de confirmado, somente o `ceo` pode alterar o pagamento (o técnico deixa
  de ver o botão e a API recusa).
- Por padrão o atendimento pode ser concluído com o pagamento pendente (a tela
  avisa e pede o motivo). Para exigir o pagamento confirmado antes de concluir, defina
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
quatro abas. A aba Faturamento compara com o período anterior, mostra gastos e
lucro e lista quem já pagou e quem falta pagar; na aba Atendimentos, ao clicar
em uma situação ou motivo, a tela lista os atendimentos correspondentes. Cada
aba mostra o critério de cálculo e exporta **CSV** (separador
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
- O check-in só vale **no dia do atendimento**, das **07:00 às 23:59** (Brasília):
  o técnico pode adiantar o serviço no mesmo dia. Antes ou depois disso o
  servidor recusa (409) e informa a hora em que libera.
- O raio permitido é `CHECKIN_RAIO_METROS` (padrão 150 m, entre 20 e 5000).
  **Fora do raio** o servidor responde 422 (`FORA_DO_RAIO`) e o registro só é
  aceito com uma **justificativa** (mín. 5 caracteres e pelo menos duas palavras
  de verdade, máx. 255); ele fica marcado como "fora do raio".
- O técnico pode fazer o check-in no detalhe do atendimento ou direto pelo botão
  **Iniciar** da agenda; sem ele, o servidor recusa o início
  (`CHECKIN_PENDENTE`). O check-out é registrado ao concluir.
- Um check-in e um check-out por ordem. O check-in vale para atendimentos
  abertos ou em andamento; o check-out exige check-in e atendimento iniciado.
- Só o técnico do atendimento registra; CEO e atendente apenas consultam.
- As coordenadas do cliente são obtidas **no primeiro check-in** pelo
  Nominatim/OpenStreetMap (gratuito, 1 consulta/s, com cache na tabela
  `clientes`) e refeitas se o endereço mudar. Se o endereço não for encontrado, o
  registro é salvo sem distância ("sem referência").
- A aba **Atendimentos** dos relatórios mostra check-ins, check-outs, fora do
  raio e sem referência, e a lista de atendimentos tem a coluna **Check-in**
  (dentro do raio, fora do raio, sem referência ou sem check-in). No detalhe, o
  CEO vê "Sem check-in" quando o atendimento foi iniciado sem o técnico registrar.
- O navegador só libera a localização em **HTTPS** (ou `localhost`).

### Página institucional e chat de atendimento

Sem login, `/` abre a página **"Quem somos"** (missão, visão, valores e
serviços), com a seção "Fale conosco" (chat com IA e WhatsApp). O login fica em
`/login`, pelo botão "Área da equipe". A página também fica disponível em
`/sobre`. No celular o menu vira **hambúrguer**; clicar em "UmuFrio" volta ao
topo e os itens do menu rolam até a seção com animação.

Botão "Fale conosco" aberto a visitantes (sem login). Informa
sobre serviços, horário e formas de pagamento e **encaminha para o WhatsApp**;
não coleta dados nem agenda.

- **IA de verdade:** com `GROQ_API_KEY` (gratuito, tem prioridade) ou
  `ANTHROPIC_API_KEY` definida, o assistente usa a IA (modelo em `CHAT_MODELO`)
  e responde só com base nos serviços, horário e formas de pagamento da empresa.
- **Sem a chave, ou se a IA falhar:** o chat não inventa resposta. Ele avisa que
  está indisponível e leva o visitante para o WhatsApp.
- **Modo demonstração** (`CHAT_MODO=demonstracao`): respostas prontas por
  palavras-chave, só para testes locais sem chave.
- Atrás do Render, a API confia no proxy (`TRUST_PROXY`, padrão 1) para contar
  cada visitante pelo IP real; sem isso o limite por IP bloquearia todos juntos.
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
- O cabeçalho mostra o cargo de quem está logado (CEO, Atendente, Técnico ou
  Estoquista), o sino de notificações e "Sessão ativa".
- O técnico vê o telefone do cliente com atalhos **Ligar** e **WhatsApp**.
- Navegação por URL (React Router): cada módulo tem endereço próprio, funciona
  com os botões voltar e avançar do navegador e permite abrir um link direto.

| Endereço | Tela |
| --- | --- |
| `/` | Início (painel) |
| `/clientes` | Clientes |
| `/usuarios` | Usuários (somente `ceo`) |
| `/servicos` | Serviços (somente `ceo`) |
| `/estoque` | Estoque |
| `/veiculos` | Veículos |
| `/despesas` | Despesas e lucro (somente `ceo`) |
| `/relatorios` | Relatórios (somente `ceo`) |
| `/agendamentos` | Lista de agendamentos e ordens |
| `/agendamentos/novo` | Novo agendamento |
| `/agendamentos/12` | Detalhes do atendimento 12 |
| `/agendamentos/12/editar` | Edição do atendimento 12 |
| `/agendamentos/12/pagamento` | Pagamento do atendimento 12 |
| `/` (sem login) | Página "Quem somos" |
| `/sobre` | Página "Quem somos" (pública) |
| `/login` | Entrada no sistema |

Endereços inexistentes ou sem permissão voltam para o início. `/ordens-servico`
redireciona para `/agendamentos`.

## Perfis e permissões

| Perfil | Pode |
| --- | --- |
| `ceo` | Tudo, incluindo usuários, serviços, despesas, notificações, exclusões e relatórios |
| `atendente` | Clientes, consulta de serviços e agendamentos (com ordem de serviço e pagamento) |
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
│   │   ├── db/           # conexão, schema (Drizzle), migrações e seed anual (seedAno/)
│   │   ├── middleware/   # tratamento de erros
│   │   ├── routes/       # rotas da API
│   │   ├── pix/          # cobrança PIX (Mercado Pago)
│   │   ├── chat/         # assistente de atendimento (IA, demonstração e limite)
│   │   ├── checkin/      # check-in/check-out geolocalizado
│   │   ├── geo/          # distância (Haversine) e geocodificação
│   │   ├── relatorios/   # consultas dos relatórios
│   │   ├── ordemHelpers.js  # exclusão de OS com devolução ao estoque e peças em falta
│   │   ├── security.js   # auth, perfis, senha e token
│   │   ├── documentos.js    # CPF/CNPJ (validação e tipo de pessoa)
│   │   ├── validacoes.js    # UF, nome, telefone, senha, número do imóvel
│   │   ├── estoqueRegras.js # regra de estoque mínimo e limites
│   │   ├── despesasRegras.js # vínculo da despesa com veículo/funcionário
│   │   ├── notificacoes.js  # avisos do sino
│   │   ├── whatsapp.js      # aviso ao cliente pelo WhatsApp
│   │   ├── httpError.js, loadEnv.js
│   │   ├── app.js
│   │   └── server.js
│   ├── test/             # testes automatizados (node:test)
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/   # layout, ícones, diálogos reutilizáveis
    │   ├── hooks/        # useApiCrud, useSucesso, useTema
    │   ├── pages/        # uma página por módulo (e o CSS de cada uma)
    │   ├── utils/        # máscaras, validações, cargo, estoque, despesas, PDF e regras do atendimento
    │   ├── routes.js     # mapa das rotas de URL e permissões do menu
    │   └── App.jsx
    ├── scripts/          # gerador do tema escuro (dark.css)
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
| Veículos (CEO) | `/api/veiculos` |
| Despesas (CEO) | `/api/despesas` (aceita `veiculoId` em combustível/manutenção e `funcionarioId` em salários) |
| Notificações (CEO) | `/api/notificacoes` |
| PIX do atendimento | `GET/POST /api/ordens-servico/:id/pix`, `POST /:id/pix/cancelar`, `POST /:id/pix/simular` (só no modo demonstração) |
| Aviso do Mercado Pago | `POST /api/pix/webhook` (público; valida a assinatura e consulta o status na API) |
| Check-in/check-out | `GET /api/ordens-servico/:id/localizacao`, `POST /:id/checkin`, `POST /:id/checkout` (técnico do atendimento) |
| Chat (público) | `GET /api/chat/config` e `POST /api/chat` |
| Relatórios (CEO) | `GET /api/relatorios?de=&ate=` e `GET /api/relatorios/csv/:tabela?de=&ate=` |
Se faltarem, são criados os usuários `ceo@`, `atendente@`, `estoque@` e `tecnico1@` a
`tecnico4@umufrio.com.br` (senha `Teste@123`). Usuários, serviços e produtos que já
existirem são mantidos. O comando mostra o banco de destino antes de apagar e se
recusa a rodar com `NODE_ENV=production`.
