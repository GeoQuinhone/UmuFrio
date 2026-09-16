UmuFrio — Protótipo Funcional

Este projeto apresenta um protótipo funcional do sistema UmuFrio, desenvolvido para demonstração dos CRUDs e das principais regras de negócio do TCC.

A aplicação está organizada em duas partes independentes:

umufrio/
├── backend/     API REST
└── frontend/    Interface web


O backend foi desenvolvido utilizando Node.js, Express, Drizzle ORM e MySQL. Já o frontend utiliza React com Vite.

Diferentemente da versão anterior do protótipo, os dados não são armazenados no navegador. Todas as informações utilizadas pelo sistema são persistidas no banco de dados MySQL e acessadas pelo frontend por meio da API.

1. Configuração do Backend

Entre na pasta do backend e instale as dependências:

cd backend
npm install

.env
Abra o arquivo .env e informe os dados de acesso ao MySQL:

DATABASE_URL=mysql://root:SUA_SENHA@localhost:3306/umufrio
PORT=3001


Substitua SUA_SENHA pela senha definida para o usuário root durante a instalação do MySQL.

Criação das tabelas

Existem duas formas de preparar o banco de dados.

Opção A — utilizando o Drizzle ORM

npm run db:push


Esse comando cria e atualiza as tabelas de acordo com o schema definido no projeto.

Opção B — utilizando o arquivo SQL

Caso ocorra algum problema com a versão do Drizzle, é possível criar o banco diretamente pelo arquivo schema.sql:

mysql -u root -p umufrio < schema.sql


O arquivo SQL também contém os dados iniciais utilizados na demonstração do sistema, incluindo:

2 clientes;
3 usuários;
3 produtos.
Inicialização da API

Com o banco configurado, execute:

npm run dev


Se estiver tudo certo, o terminal apresentará uma mensagem semelhante a:

UmuFrio API rodando em http://localhost:3001


O terminal deverá permanecer aberto enquanto o sistema estiver sendo utilizado.

2. Configuração do Frontend

Abra outro terminal, mantendo o backend em execução, e acesse a pasta do frontend:

cd frontend
npm install


Depois, inicie a aplicação:

npm run dev


O frontend ficará disponível em:

http://localhost:5173


Ao acessar o endereço, a aplicação realizará as requisições para a API e carregará os dados armazenados no MySQL.

Caso o backend esteja configurado para utilizar outro endereço ou porta, copie o arquivo:

frontend/.env.example


para:

frontend/.env


e ajuste a variável VITE_API_URL de acordo com a configuração utilizada.

3. Instalação do Node.js

Caso o Node.js ainda não esteja instalado no computador, faça o download da versão LTS no site oficial do Node.js e realize a instalação utilizando as opções padrão.

Após a instalação, confirme se o ambiente foi configurado corretamente:

node -v
npm -v


Os dois comandos devem retornar as respectivas versões instaladas.

4. Teste da Aplicação

Para executar o sistema completo, é necessário manter o backend e o frontend em execução simultaneamente.

Backend
cd backend
npm run dev

Frontend

Em outro terminal:

cd frontend
npm run dev


Com os dois serviços ativos:

Acesse http://localhost:5173.
Selecione uma das opções disponíveis, como Clientes.
Verifique se os registros cadastrados no MySQL são exibidos.
Cadastre um novo cliente e feche o navegador.
Abra novamente o sistema e confira se o registro continua disponível.
Realize os testes das regras de negócio implementadas no backend.

Entre os testes previstos estão:

tentativa de cadastro utilizando um CPF já existente;
tentativa de realizar dois agendamentos para o mesmo técnico no mesmo horário;
tentativa de retirar uma quantidade de produtos superior ao estoque disponível.

Nessas situações, a API deve impedir a operação e retornar a mensagem correspondente para que o frontend possa apresentá-la ao usuário.

5. Problemas Comuns
Não foi possível conectar ao MySQL

Verifique se:

o serviço do MySQL está em execução;
o banco umufrio foi criado;
o usuário e a senha estão corretos;
a variável DATABASE_URL está configurada corretamente no arquivo .env.
A aplicação permanece em "Carregando..."

Nesse caso, verifique se o backend está funcionando corretamente:

cd backend
npm run dev


Também confira se a URL configurada no VITE_API_URL corresponde ao endereço em que a API está sendo executada.

Erro relacionado ao CORS

Confirme se o frontend está sendo acessado pelo endereço:

http://localhost:5173


e se a API do backend está disponível na porta configurada, normalmente:

http://localhost:3001

6. Estrutura de Execução

De forma resumida, o funcionamento do protótipo segue a seguinte estrutura:

                    ┌───────────────