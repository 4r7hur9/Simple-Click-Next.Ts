# Spec: Administração de Lojas

> feature: admin-lojas
> status: rascunho

## Contexto

O administrador geral da plataforma é quem coloca uma loja no ar: cadastra o
negócio, guarda o contrato assinado e os documentos, define o tipo de negócio
(que muda o vocabulário do catálogo) e liga ou desliga o acesso. Esta feature é
a herdeira direta da tela `admsimpleclick.html` do primeiro SimpleClick, que já
pedia código do cliente, CPF/CNPJ, telefones, comprovante de endereço, foto do
documento e contrato — agora com trilha de auditoria e sem senha em texto puro.

## Histórias

### US-200 — Administrador cadastra uma loja nova

Como administrador geral, quero cadastrar uma loja com os dados do negócio e do
responsável, para que o empreendedor receba acesso e comece a vender.

#### AC-200 — Cadastro completo cria a loja e o acesso do dono

- **Dado** que sou administrador geral e estou na tela de nova loja
- **Quando** informo nome ou razão social, CPF ou CNPJ, e-mail do responsável, telefone, endereço, tipo de negócio e endereço da loja na web (apelido único)
- **Então** a loja é criada com código sequencial visível (formato de quatro dígitos, como `0002`), o responsável recebe convite por e-mail para definir a própria senha, e a loja aparece na lista já com o status inicial

#### AC-201 — Apelido de loja repetido é recusado na hora

- **Dado** que já existe uma loja com o apelido `pastel-da-joi`
- **Quando** tento cadastrar outra loja com esse mesmo apelido
- **Então** o formulário aponta o campo com a mensagem de apelido já usado, sugere uma variação livre e nenhuma loja é criada

#### AC-202 — CPF ou CNPJ inválido não passa

- **Dado** que estou cadastrando uma loja
- **Quando** informo um CPF ou CNPJ com dígito verificador incorreto
- **Então** o formulário recusa o envio explicando que o documento é inválido, antes de qualquer gravação

### US-201 — Administrador guarda o contrato e os documentos da loja

Como administrador geral, quero anexar o contrato assinado e os documentos do
responsável, para que a relação com cada loja fique documentada.

#### AC-203 — Contrato em PDF é aceito e fica vinculado à loja

- **Dado** que estou na ficha de uma loja existente
- **Quando** envio o contrato assinado em PDF dentro do limite de tamanho
- **Então** o arquivo aparece na ficha com nome, tamanho, data de envio e quem enviou, e só é aberto por link temporário gerado no momento do clique

#### AC-204 — Arquivo com tipo disfarçado é rejeitado

- **Dado** que estou enviando um contrato
- **Quando** envio um arquivo chamado `contrato.pdf` cujo conteúdo real não é PDF
- **Então** o envio é recusado com aviso de tipo de arquivo não permitido, e nada é gravado (a checagem olha o conteúdo do arquivo, não só a extensão)

#### AC-205 — Documento anexado nunca fica público

- **Dado** um contrato já anexado a uma loja
- **Quando** alguém sem sessão de administrador tenta abrir o endereço do arquivo
- **Então** o acesso é negado, e o link temporário criado para o administrador deixa de funcionar após o prazo curto de validade

### US-202 — Administrador vê e edita a lista de lojas

Como administrador geral, quero uma lista de lojas com busca e edição, para que
eu ache e ajuste qualquer cadastro rapidamente.

#### AC-206 — Lista mostra as lojas com busca por nome, documento e código

- **Dado** que existem várias lojas cadastradas
- **Quando** abro a lista e busco por parte do nome, do documento ou do código da loja
- **Então** vejo as lojas correspondentes com código, nome, tipo de negócio, status e data de cadastro, e a lista trata os estados de carregando, vazio e erro

#### AC-207 — Edição altera o cadastro e registra quem alterou

- **Dado** que abri a ficha de uma loja
- **Quando** altero os dados de cadastro e salvo
- **Então** a ficha mostra os dados novos e o histórico de auditoria registra quem alterou, quando e quais campos mudaram

#### AC-214 — Alterar o tipo de negócio adapta o sistema inteiro daquela loja

- **Dado** uma loja cadastrada como lanchonete, com produtos e categorias já criados
- **Quando** eu, como administrador geral, altero o tipo de negócio dela para loja de roupas
- **Então** todas as telas daquela loja passam a usar o vocabulário e o layout do ramo novo (o catálogo deixa de ser chamado cardápio, a grade de tamanho e cor ganha destaque, ingredientes saem de cena), nenhum produto ou categoria perde dado, o controle de estoque próprio do ramo é ativado, e a mudança fica registrada no histórico de auditoria com quem alterou

#### AC-208 — Alterar o apelido preserva o endereço antigo

- **Dado** uma loja publicada com o apelido `pastel-da-joi`
- **Quando** altero o apelido para `pastelaria-joi`
- **Então** o endereço novo funciona e o antigo redireciona para ele, para que link já compartilhado com clientes não quebre

#### AC-215 — Histórico de auditoria consultável, com filtros e sem dado pessoal

- **Dado** que existem atos registrados na trilha de várias lojas, entre eles a troca de uma chave PIX
- **Quando** eu, como administrador geral, abro o histórico de auditoria e filtro por loja, por ato ou por período
- **Então** vejo, página a página e do mais recente para o mais antigo, quem fez, quando, em qual loja, o que mudou e o valor anterior, com as alterações sensíveis destacadas e o dado pessoal mascarado; a tela trata os estados de carregando, vazio e erro; a própria consulta fica registrada como acesso da administração àquelas lojas; e nenhum registro do histórico pode ser alterado nem apagado

### US-203 — Administrador suspende ou reativa uma loja

Como administrador geral, quero suspender o acesso de uma loja sem apagar nada,
para que eu trate inadimplência ou uso indevido sem perder o histórico.

#### AC-209 — Loja suspensa sai do ar sem perder dados

- **Dado** uma loja ativa com produtos e pedidos
- **Quando** eu a suspendo informando o motivo
- **Então** a vitrine pública dela passa a exibir aviso de loja indisponível, o dono ao entrar vê o aviso de suspensão, e nenhum produto ou pedido é apagado

#### AC-210 — Reativação devolve a loja ao ar como estava

- **Dado** uma loja suspensa
- **Quando** eu a reativo
- **Então** a vitrine volta a atender normalmente com o mesmo catálogo de antes, e o período de suspensão fica registrado no histórico

#### AC-211 — Exclusão exige confirmação e é reversível por prazo

- **Dado** uma loja que preciso remover
- **Quando** peço a exclusão e confirmo digitando o nome da loja
- **Então** a loja sai das listagens e do ar, os dados ficam retidos por prazo definido antes da remoção definitiva, e a ação aparece no histórico de auditoria

### US-204 — Administrador liga funcionalidades por loja

Como administrador geral, quero ligar ou desligar funcionalidades para uma loja
específica, para que eu libere recurso novo aos poucos sem publicar para todos.

#### AC-212 — Funcionalidade desligada não aparece para a loja

- **Dado** uma loja com a funcionalidade de impressão térmica desligada
- **Quando** o dono dessa loja abre o painel
- **Então** a área de impressão não aparece no menu dele e a rota correspondente responde recurso indisponível, mesmo se acessada direto

#### AC-213 — Todas as funcionalidades da versão 1 nascem ligadas e sem custo

- **Dado** uma loja recém-cadastrada
- **Quando** o dono entra pela primeira vez
- **Então** todas as funcionalidades da versão 1 estão disponíveis, sem cobrança e sem limite de uso, e não existe tela pedindo pagamento em nenhum ponto do fluxo

## Fora de escopo

- Cobrança, faturas, planos pagos e limites por plano: a estrutura de dados
  prevê plano e assinatura, mas a versão 1 é integralmente gratuita e nenhuma
  tela de pagamento é construída.
- Assinatura eletrônica do contrato dentro da plataforma: por ora o contrato é
  assinado fora e anexado como arquivo.
- Cadastro de loja feito pelo próprio empreendedor sem passar pelo
  administrador — depende da resposta de Q-100 na feature de identidade.
- Relatórios financeiros consolidados entre lojas para o administrador.
- Comunicação em massa do administrador para as lojas (avisos, newsletter).

## Suposições

| ID      | Suposição                                                                                                                                                                                                                                                                                                                                                                                                  | Status     | Resolução                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ASM-200 | O contrato é assinado fora da plataforma e apenas anexado; não há assinatura eletrônica na versão 1                                                                                                                                                                                                                                                                                                        | aberta     | —                                                                                                                               |
| ASM-201 | Os arquivos ficam em armazenamento externo com link temporário assinado, não no disco do servidor, porque o plano gratuito da Railway não garante disco persistente. Mídia (imagem de produto, logo, capa) vai para o Cloudinary; contrato e documentos do responsável vão para armazenamento privado separado, por serem sensíveis e por o Cloudinary ter trava de conta que pode bloquear entrega de PDF | confirmada | Decidido pelo dono do produto em 17/08/2026 quanto à mídia; o armazenamento do contrato é a pendência D2b em design/decisoes.md |
| ASM-202 | Limite de 10 MB por arquivo de contrato e 5 MB por imagem de documento atende ao uso real                                                                                                                                                                                                                                                                                                                  | aberta     | —                                                                                                                               |
| ASM-203 | O código sequencial de quatro dígitos herdado do primeiro SimpleClick é identificador humano para atendimento, e o identificador técnico continua sendo o interno                                                                                                                                                                                                                                          | aberta     | —                                                                                                                               |
| ASM-204 | O prazo de retenção após exclusão é de 30 dias, compatível com o dever de guarda e com o direito de exclusão previsto na LGPD                                                                                                                                                                                                                                                                              | aberta     | —                                                                                                                               |
| ASM-205 | O administrador geral é uma pessoa só no início (o próprio autor), então não há hierarquia entre administradores                                                                                                                                                                                                                                                                                           | aberta     | —                                                                                                                               |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                                                                                               | Status     | Resposta                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-200 | A loja fica no ar em endereço por caminho (`simpleclick.app/pastel-da-joi`) ou em subdomínio próprio (`pastel-da-joi.simpleclick.app`)? A escolha muda o custo no plano gratuito da Vercel e o esforço de configuração | aberta     | —                                                                                                                                                                                  |
| Q-201 | A loja pode usar domínio próprio já na versão 1 (por exemplo `pasteldajoi.com.br`)?                                                                                                                                    | aberta     | —                                                                                                                                                                                  |
| Q-202 | Quais documentos são obrigatórios para publicar uma loja e quais são opcionais? O primeiro SimpleClick pedia comprovante de endereço, foto do documento e contrato                                                     | aberta     | —                                                                                                                                                                                  |
| Q-203 | Quando o dono da loja é suspenso, o cliente final que já tinha pedido em andamento deve continuar conseguindo acompanhar aquele pedido?                                                                                | respondida | Sim: o acompanhamento pela página pública continua para loja suspensa; a vitrine e o fechamento ficam indisponíveis, e loja excluída sai do ar por inteiro (decisão de 03/10/2026) |
