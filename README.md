# UmuFrio — Protótipo (Frontend + Backend + MySQL)

Protótipo funcional para demonstração dos CRUD's do TCC.  dividido em duas pastas independentes:

```
umufrio/
  backend/    → API REST (Node.js + Express + Drizzle ORM + MySQL)
  frontend/   → Interface web (React + Vite)
```

O frontend não guarda mais nada no navegador: toda a informação fica no
MySQL, acessada através da API do backend.


## 1. Instalar o MySQL

### Windows
1. Acesse **dev.mysql.com/downloads/installer/** e baixe o **MySQL Installer**
   (a versão "web" menor é suficiente).
2. Execute o instalador. Em "Choosing a Setup Type", selecione **Server only**
   (não precisa do Workbench nem de outras ferramentas, mas pode instalar o
   **MySQL Workbench** também se quiser uma interface gráfica).
3. Siga o assistente até a tela de configuração do servidor:
   - Mantenha a porta padrão **3306**.
   - Em "Authentication Method", deixe a opção recomendada marcada.
   - Defina uma **senha para o usuário `root`** e anote em algum lugar.
4. Finalize a instalação e deixe o MySQL configurado para iniciar
   automaticamente com o Windows (opção padrão do instalador).

### Mac
1. Acesse **dev.mysql.com/downloads/mysql/** e baixe o pacote `.dmg` para
   macOS — ou, se tiver Homebrew, rode `brew install mysql`.
2. Siga o instalador (ou, com Homebrew, rode `brew services start mysql`
   depois de instalar).
3. Defina a senha do usuário `root` (o instalador `.dmg` mostra a senha
   temporária gerada na primeira instalação; com Homebrew, rode
   `mysql_secure_installation` para definir uma).

### Verificar se instalou certo
```
mysql -u root -p
```
Digite a senha. Se abrir um prompt `mysql>`, funcionou. Digite `exit` para
sair.

### Criar o banco do projeto
Ainda dentro do `mysql`:
```sql
CREATE DATABASE umufrio;
```

---

## 2. Configurar e rodar o backend

```
cd backend
npm install
```

Copie o arquivo de exemplo de variáveis de ambiente:
```
cp .env.example .env
```
(no Windows, se `cp` não funcionar no terminal, copie e renomeie o arquivo
pelo Explorador de Arquivos mesmo)

Abra o `.env` e ajuste a senha do MySQL que você definiu na instalação:
```
DATABASE_URL=mysql://root:SUA_SENHA@localhost:3306/umufrio
PORT=3001
```

### Criar as tabelas

Duas opções — escolha uma:

**Opção A — via Drizzle (gera e aplica a partir do schema.js):**
```
npm run db:push
```

**Opção B — via SQL direto (mais simples se a Opção A der algum erro de
versão):**
```
mysql -u root -p umufrio < schema.sql
```
Essa segunda opção já inclui os mesmos dados de exemplo do protótipo
anterior (2 clientes, 3 usuários, 3 produtos).

### Iniciar a API
```
npm run dev
```
Deve aparecer:
```
UmuFrio API rodando em http://localhost:3001
```
Deixe esse terminal aberto.

---

## 3. Configurar e rodar o frontend

Abra **um novo terminal** (deixe o backend rodando no outro):

```
cd frontend
npm install
npm run dev
```

O navegador abre sozinho em `http://localhost:5173`. A tela de boas-vindas
agora carrega os dados de verdade do MySQL através da API.

Se o backend estiver rodando em outra porta/endereço, copie
`frontend/.env.example` para `frontend/.env` e ajuste `VITE_API_URL`.

---

## Instalar o Node.js (caso ainda não tenha)

1. Acesse **nodejs.org**, baixe a versão **LTS** e instale com as opções
   padrão.
2. Confirme no terminal:
   ```
   node -v
   npm -v
   ```

---

## Testando o fluxo completo

Com backend e frontend rodando ao mesmo tempo (dois terminais abertos):

1. Abra `http://localhost:5173`.
2. Clique em qualquer cartão (ex.: "Clientes") — a lista deve carregar os
   dados que estão no MySQL.
3. Cadastre um cliente novo, feche e reabra o navegador: o dado continua lá,
   porque agora está no banco, não mais no navegador.
4. Teste as regras de negócio: tente cadastrar um CPF repetido, tente marcar
   dois agendamentos no mesmo horário para o mesmo técnico, tente remover
   mais estoque do que o saldo disponível — o backend deve bloquear e
   mostrar a mensagem de erro na tela.

## Se algo der errado

- **"Não foi possível conectar ao MySQL"** → confira se o MySQL está rodando
  e se a senha no `backend/.env` está correta.
- **Tela fica em "Carregando..." para sempre** → confira se o backend está
  rodando (`npm run dev` dentro de `backend/`) e se a porta bate com o
  `VITE_API_URL` do frontend.
- **Erro de CORS no navegador** → confirme que está acessando
  `http://localhost:5173` (não outro endereço) e que o backend está de fato
  no ar.

## Observação sobre segurança

Este é um protótipo para demonstração: as senhas de usuário são salvas como
texto puro (sem hash/criptografia) só para simplificar. No app real do TCC,
use bcrypt ou argon2 para gerar o hash da senha antes de gravar no banco.
