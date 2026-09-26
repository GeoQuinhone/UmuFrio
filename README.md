# UmuFrio

Sistema web para apoiar a gestão de uma empresa de manutenção de ar-condicionado
e refrigeração. O sistema reúne cadastros, estoque, agendamentos e ordens de
serviço em uma aplicação com frontend, API e banco de dados PostgreSQL.

## Situação do projeto

- As etapas dos Dias 1 a 6 foram concluídas na branch `integracao-umufrio`.
- Os Dias 3 e 4 foram enviados ao GitHub; os Dias 5 e 6 também foram enviados.
- A migration do banco foi executada com sucesso no ambiente local configurado.
- O commit de finalização informado foi `5bab5df` (`chore: finalizar migrations e revisao do projeto`).
- A integração com `main` deve passar por revisão de Pull Request. A aprovação e
  o merge não estão confirmados neste documento.

## Funcionalidades

### Acesso e usuários

- Login e controle de acesso por perfil.
- Fluxo de primeiro acesso e troca de senha.
- Perfis do sistema: `ceo`, `atendente`, `estoquista` e `tecnico`.
- Gerenciamento de usuários.

### Clientes e serviços

- Cadastro e gerenciamento de clientes e seus dados de contato e endereço.
- Ativação e inativação de clientes, preservando o histórico.
- Cadastro e gerenciamento de serviços e seus valores.

### Produtos e estoque

- Cadastro e edição de produtos e peças.
- Registro de entradas e saídas de estoque.
- Verificação para impedir saídas acima do saldo disponível.
- Alertas de estoque mínimo.
- Associação de peças necessárias aos serviços.

### Agendamentos

- Agendamento de um cliente com um técnico em uma data e horário.
- Verificação de conflito para impedir dois agendamentos ativos do mesmo técnico
  no mesmo horário.
- Cancelamento de agendamentos em aberto.

### Ordens de serviço

- Criação de uma ordem de serviço a partir de um agendamento ativo.
- Uma ordem de serviço por agendamento.
- Avanço de status: `aberta` → `andamento` → `concluida`.
- Ao iniciar uma ordem de serviço, as peças associadas ao serviço são debitadas
  do estoque em uma operação transacional. Se não houver saldo suficiente para
  todas as peças, a operação não deve deixar um débito parcial.

## Tecnologias

- **Frontend:** React e Vite.
- **Backend:** Node.js e Express.
- **Acesso a dados:** Drizzle ORM.
- **Banco de dados:** PostgreSQL.
- **Linguagem principal:** JavaScript (ES modules).

## Organização do projeto

```text
UmuFrio/
├── backend/
│   ├── src/
│   │   ├── db/           # conexão, schema e migrations
│   │   ├── middleware/   # tratamento de erros
│   │   ├── routes/       # rotas da API
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── hooks/
    │   ├── pages/
    │   └── App.jsx
    ├── .env.example
    └── package.json
```

## Rotas principais da API

| Recurso | Caminho |
| --- | --- |
| Verificação da API | `GET /api/health` |
| Autenticação | `/api/auth` |
| Clientes | `/api/clientes` |
| Usuários | `/api/usuarios` |
| Agendamentos | `/api/agendamentos` |
| Serviços | `/api/servicos` |
| Ordens de serviço | `/api/ordens-servico` |
| Produtos e estoque | `/api/produtos` |

## Como executar localmente

### Pré-requisitos

- Node.js e npm.
- PostgreSQL instalado e em execução.
- Um banco PostgreSQL criado para o projeto.

### 1. Configurar o backend e o banco

No **Terminal 1 do VS Code**, na raiz do projeto:

```powershell
cd backend
npm install
```

Se `backend/.env` ainda não existir, crie uma cópia do exemplo:

```powershell
Copy-Item .env.example .env
```

Abra `backend/.env` e configure os valores para o seu PostgreSQL:

```env
DATABASE_URL=postgresql://USUARIO:SENHA@localhost:5432/NOME_DO_BANCO
SESSION_SECRET=uma-chave-local-secreta-com-pelo-menos-32-caracteres
PORT=3001
```

Não substitua um `.env` já existente sem antes preservar os valores necessários.
Não envie nem inclua `.env` no GitHub.

Com o PostgreSQL em execução e a `DATABASE_URL` apontando para o banco correto,
aplique as migrations:

```powershell
npm run db:migrate
```

As migrations criam e atualizam as tabelas necessárias e mantêm um registro das
migrations aplicadas. Antes de executá-las em outro ambiente, confira
cuidadosamente a `DATABASE_URL`.

### 2. Iniciar a API

No **Terminal 2 do VS Code**, que deve permanecer aberto enquanto a API estiver
em uso:

```powershell
cd C:\Users\Romario\UmuFrio\backend
npm run dev
```

A API usa a porta `3001` por padrão. O endereço de verificação é:

```text
http://localhost:3001/api/health
```

### 3. Iniciar o frontend web

Neste projeto, o frontend é uma aplicação web React/Vite. No **Terminal 3 do
VS Code**, que deve permanecer aberto enquanto o frontend estiver em uso:

```powershell
cd C:\Users\Romario\UmuFrio\frontend
npm install
```

Se `frontend/.env` ainda não existir, copie o exemplo:

```powershell
Copy-Item .env.example .env
```

O exemplo configura a API em `http://localhost:3001/api`. Inicie o frontend:

```powershell
npm run dev
```

O Vite exibirá no terminal o endereço local da aplicação, normalmente
`http://localhost:5173`.

## Verificações disponíveis

No **Terminal 1**, dentro de `backend/`, estes comandos estão definidos:

```powershell
npm run check
npm test
```

`npm run check` verifica a sintaxe de `src/app.js` e `src/server.js`.
`npm test` executa os testes Node.js encontrados pelo projeto. Execute-os antes
de aprovar ou integrar mudanças; este documento não afirma que os testes passaram.

## Banco de dados e segurança

- O banco configurado pelo `DATABASE_URL` é o banco que receberá as migrations.
- Mantenha credenciais e valores reais do `.env` fora do GitHub.
- Antes de usar dados reais ou publicar o sistema, faça uma revisão de segurança
  da autenticação, armazenamento de senhas, controle de acesso, sessão e
  configuração de segredos.
- Configure backups do PostgreSQL antes de operar com dados importantes.

## GitHub e colaboração

- Repositório: [GeoQuinhone/UmuFrio](https://github.com/GeoQuinhone/UmuFrio)
- Branch de desenvolvimento: `integracao-umufrio`
- Para incluir este README no repositório, salve-o na raiz do projeto como
  `README.md`.

Depois de copiar este conteúdo para `C:\Users\Romario\UmuFrio\README.md`, no
**Terminal 1 do VS Code**, na raiz do projeto:

```powershell
git add README.md
git commit -m "docs: documentar o projeto UmuFrio"
git push origin integracao-umufrio
```

Para integrar a branch à `main`, crie ou revise um Pull Request no GitHub e
confirme as verificações e a revisão da equipe antes do merge.
