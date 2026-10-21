# Campos explicados: loja pública, carrinho, checkout, conta, login e cadastro

Card #70. Regra geral em `apps/web/AGENTS.md`, seção "Campos explicados".
Os textos do "i" ficam num arquivo só,
`apps/web/src/features/loja/explicacoes-para-clientes.ts`
(`EXPLICACOES_PARA_CLIENTES`). Esta tabela repete o que está lá.

Legenda da coluna **"i"**: ✅ tem "i" (texto ao lado) · "rótulo basta" quando
o rótulo e a dica visível já explicam. A coluna **Antes** só aparece preenchida
quando o rótulo, a unidade, o exemplo ou o comportamento mudou.

Nenhum campo desta área vem pré-preenchido com `0`. Nenhum enum em inglês
aparece para o cliente (as formas de pagamento, de entrega e as situações do
pedido passam por tabelas de tradução: `PIX`, `Dinheiro na entrega`,
`Cartão na entrega`, `Outra forma (combinar com a loja)`, `Receber em casa`,
`Retirar no local`).

## 1. Vitrine e cardápio (`/loja/[slug]`, `/loja/[slug]/cardapio`)

Arquivos: `features/vitrine/BarraDeCatalogo.tsx`, `BuscaProduto.tsx`,
`FiltroEspecificacao.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Busca | "Buscar" (rótulo completo "Buscar no cardápio/catálogo" para leitor de tela; a barra é estreita) | — | rótulo basta |
| Chip Atacado | Atacado (dica ao passar: "Preço de atacado a partir de N unidades") | — | rótulo basta (o "i" de atacado fica na página do produto, onde há espaço) |
| Ordenar | Ordenar por | — | rótulo basta |
| Filtros por especificação | nome da especificação + opções (verdadeiro/falso viram "Sim"/"Não") | — | rótulo basta |

**Nada de "i" na vitrine em cima de preço, botão de comprar ou sacola
flutuante.** O cartão de produto não ganhou "i": ele já diz "Atacado a partir
de 10 un.: R$ 9,50" em texto. A sacola flutuante não tem campo.

## 2. Página e janela do produto (`/loja/[slug]/produto/[id]`)

Arquivos: `features/produto/EscolhasDoProduto.tsx`, `SelecaoDeOpcoes.tsx`,
`MatrizDeVariacao.tsx`, `TabelaDoAtacado.tsx`, `BotaoAdicionar.tsx`.
A regra de cada grupo vem de `server/produto.ts` (`regraDoGrupo`).

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Variação (tamanho, cor, aplicação…) | nome do eixo + opções com preço; "Esgotado"/"Indisponível" na opção. **Produto com uma variação só (a padrão "Único") não mostra o grupo**: ela já vem escolhida. Se essa única variação estiver esgotada, o grupo aparece com "Esgotado". | grupo "APLICAÇÃO" com a opção "Único" pré-marcada (achado do gerente na loja universokar) | rótulo basta |
| Grupo de escolhas obrigatório | "{nome}" + "Escolha 1 · obrigatório", "Escolha de 1 a 3 · obrigatório", "Escolha ao menos 2 · obrigatório" | — | rótulo basta (mínimo e máximo estão escritos) |
| Grupo de escolhas opcional | "{nome}" + "Opcional" ou "Escolha até 3 · opcional" | "Escolha até 3" (não dizia que podia pular) | rótulo basta |
| Limite do grupo atingido | "Limite de N opções atingido. Remova uma opção para escolher outra." | — | — |
| Preços de atacado (tabela) | Quantidade · Preço por unidade · Você economiza; a linha que vale fica marcada | — | ✅ "Levando mais unidades do mesmo item, cada uma sai mais barata. O desconto entra sozinho no carrinho quando você chega na quantidade da faixa." Ex.: a partir de 10 un., R$ 9,50 cada em vez de R$ 10,00. |
| Observação do item | Observação para este item (opcional) · exemplo pelo tipo de negócio da loja (tabela abaixo) · dica visível "Até 280 letras. O troco se informa ao finalizar o pedido." | "Alguma observação?" com exemplo "…troco para R$ 50" (troco no lugar errado: não chegava ao pagamento); depois "sem cebola" em toda loja, até autopeças | rótulo basta |
| Quantidade | − N + ("Diminuir/Aumentar a quantidade") | — | rótulo basta |

Exemplo da observação por tipo de negócio
(`features/produto/exemplo-da-observacao.ts`; o tipo chega à janela do produto
pela prop `ramo`):

| Tipo de negócio | Exemplo |
| --- | --- |
| Lanchonete / pastelaria | Ex.: sem cebola, carne bem passada |
| Restaurante | Ex.: sem cebola, molho à parte |
| Pizzaria | Ex.: metade sem azeitona, massa bem assada |
| Marmitaria | Ex.: sem feijão, mais salada |
| Açaí | Ex.: granola à parte, sem leite condensado |
| Padaria | Ex.: pão bem moreninho, fatiado |
| Bebidas | Ex.: bem gelada |
| Mercadinho | Ex.: banana mais verde, sacola separada |
| Roupas, calçados, cosméticos, livraria, brinquedos | Ex.: embrulhar para presente |
| Autopeças | Ex.: confirmar se serve no Gol G5 2012 |
| Eletrônicos | Ex.: confirmar se vem com carregador |
| Material de construção | Ex.: cortar em 2 pedaços de 1 m |
| Farmácia | Ex.: aceito genérico |
| Pet shop | Ex.: para cachorro de porte pequeno |
| Floricultura | Ex.: cartão escrito “Feliz aniversário, mãe” |
| Papelaria | Ex.: capa na cor azul |
| Outros (varejo geral, tabacaria, tipo novo) | Ex.: uma cor ou um detalhe que você prefere |

Conferido na tela (390 px e 1400 px): `/loja/universokar`, produto "PAST FR
NOVO UNO…" mostra "Ex.: confirmar se serve no Gol G5 2012", sem o grupo
"Aplicação", e o item entra na sacola. Prova: `apps/web/tests/produto-campos-explicados.test.tsx`.

## 3. Carrinho (sacola e janela)

Arquivos: `features/carrinho/LinhaCarrinho.tsx`, `GavetaCarrinho.tsx`,
`SacolaFlutuante.tsx`, `CarrinhoFlutuante.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Quantidade do item | − N + ("Quantidade de {item}") | — | rótulo basta |
| Atacado na linha | a faixa que já vale e "Faltam 4 peças para o próximo desconto (R$ 19,00 cada a partir de 10)" | — | rótulo basta (a frase explica) |
| Remover item | Remover | — | — |

Sem campo de texto no carrinho.

## 4. Finalizar pedido (janela do checkout)

Arquivos: `features/checkout/FechamentoDaCompra.tsx`, `SeletorDeEndereco.tsx`,
`CamposDeEndereco.tsx`, `SeletorDePagamento.tsx`, `CaixaPix.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Seu WhatsApp (só se a conta não tem) | Seu WhatsApp com DDD · "(85) 91234-5678" · dica "É por aqui que a loja confirma o pedido. Fica salvo na sua conta." | "Seu WhatsApp", sem exemplo | rótulo basta |
| Como você quer receber? | Receber em casa (taxa) · Retirar no local (Sem taxa) | — | rótulo basta |
| Onde entregar | endereços salvos (Padrão) ou "Adicionar novo endereço" | — | rótulo basta |
| Rua ou avenida | Rua ou avenida * · "Ex.: Rua das Flores" | sem exemplo | rótulo basta |
| Número | Número * · "Ex.: 123" · dica "Se não tiver, escreva 'sem número'." | sem exemplo | rótulo basta |
| Complemento | Complemento (opcional) · dica "Apartamento, bloco ou casa. Ex.: apto 302, bloco B." | "Complemento" (não dizia opcional) | rótulo basta |
| Bairro | Bairro * · "Ex.: Centro" · dica "É o bairro que define a taxa de entrega." | sem exemplo | rótulo basta |
| Cidade | Cidade (opcional) | "Cidade" | rótulo basta |
| CEP | CEP (opcional) · "Ex.: 60000-000" | "CEP", sem exemplo | rótulo basta |
| Ponto de referência | Ponto de referência (opcional) · dica "Algo perto que ajude quem entrega a achar. Ex.: em frente à padaria, portão azul." | sem exemplo | rótulo basta |
| Onde retirar | endereço da loja em texto | — | — |
| Forma de pagamento | PIX · Dinheiro na entrega · Cartão na entrega · Outra forma (combinar com a loja) | `OTHER` aparecia cru se a loja oferecesse | rótulo basta |
| Troco (só em dinheiro) | Precisa de troco? Para quanto (R$) · "Ex.: 100,00" · dica "Opcional. Escreva a nota que vai usar, ex.: 100. O pedido está em R$ x; deixe em branco se tiver o valor exato." | "Precisa de troco para quanto?" e **o valor digitado não ia para o pedido** (a tela mandava sempre `trocoParaCentavos: null`) | rótulo basta |
| Chave PIX (só leitura) | tipo da chave (CPF, CNPJ, Telefone, E-mail, Aleatória), chave, recebedor, "Copiar" | — | rótulo basta |
| Observação para a loja | Observação para a loja (opcional) · dica "Vale para o pedido todo, até 500 letras. Ex.: interfone quebrado, ligar ao chegar." | "Observação para a loja" · "Opcional. Ex.: sem cebola…" (misturava com a do item) | rótulo basta |

Troco agora: aceita `100`, `100,00`, `R$ 50,5`, `1.000,50`; recusa na hora o que
não é dinheiro e o valor menor que o total ("O troco precisa ser para um valor
maior que o total (R$ x)."); a recusa da API (`TROCO_MENOR_QUE_O_TOTAL`) cai no
próprio campo. Prova: `apps/web/tests/troco-no-fechamento.test.ts`.

## 5. Acompanhamento do pedido (`/loja/[slug]/pedido/[token]`)

Arquivos: `features/pedido/AcompanhamentoDoPedido.tsx`, `LinhaDoTempo.tsx`,
`BotaoJaEnviei.tsx`. Só leitura (etapas em português) e o botão "Já enviei".
Sem campo.

## 6. Entrar, criar conta e recuperar acesso (`/entrar`, `/cadastrar`, janela de acesso)

Arquivos: `features/auth/LoginForm.tsx`, `CadastroForm.tsx`,
`JanelaDeAcesso.tsx`, `CodigoForm.tsx`, `CodigoDeRecuperacaoForm.tsx`,
`app/(conta)/recuperar-senha`, `definir-senha`, `verificar-email`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| E-mail (entrar) | E-mail | — | rótulo basta |
| Senha (entrar) | Senha (olho para mostrar) · "Esqueci minha senha" | — | rótulo basta |
| Tipo de conta (cadastro) | Quero comprar · Quero vender com minha loja | — | rótulo basta |
| Nome (cliente) | Seu nome | "Nome" | rótulo basta |
| E-mail (cliente) | E-mail | — | rótulo basta |
| WhatsApp (cliente) | WhatsApp com DDD · "(85) 91234-5678" · dica "As lojas usam para falar sobre o seu pedido." | sem exemplo | rótulo basta |
| Senha (cliente) | Senha · medidor de força · dica "Use 12 caracteres ou mais. Uma frase fácil de lembrar funciona bem." | — | rótulo basta |
| Código do segundo fator | Código de verificação (6 dígitos) · "000000" · dica "Enviamos o código para seu e-mail. Ele vale por 10 minutos." ou "Abra o aplicativo autenticador e informe o código atual." | "Código de seis dígitos" | rótulo basta |
| Código de recuperação | Código de recuperação · dica "Um dos códigos que você guardou ao ativar o aplicativo, como ABCD-EFGH." | — | ✅ "Ao ativar o aplicativo autenticador, mostramos uma lista de códigos para guardar. Cada um serve uma vez, no lugar do código do aplicativo, se você perder o celular." Ex.: ABCD-EFGH. |
| E-mail (recuperar senha) | E-mail | — | rótulo basta |
| Nova senha / Confirme a nova senha | Nova senha (dica "Use 12 caracteres ou mais.") · Confirme a nova senha | — | rótulo basta |
| Verificar e-mail | botão "Confirmar meu e-mail" / "Reenviar e-mail de verificação" | — | — |

## 7. Criar conta e loja (`/vender`, `/cadastrar?tipo=dono`)

Arquivo: `features/auth/CadastroDeDonoForm.tsx`. Etapa 1 "Seus dados", etapa 2
"Sua loja".

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Seu nome · E-mail · Senha | iguais ao cadastro de cliente | — | rótulo basta |
| Seu WhatsApp | Seu WhatsApp com DDD · "(85) 91234-5678" | sem exemplo | rótulo basta |
| Nome da loja | Nome da loja · dica "Como os clientes vão ver no topo da loja. Ex.: Pastelaria da Vila." | sem dica | rótulo basta |
| Tipo de negócio | Tipo de negócio (lista em português) | — | ✅ "O que a sua loja vende. Usamos para mostrar a loja na categoria certa do Explorar e para escolher a capa padrão." Ex.: Pastelaria, Mercadinho ou Pet shop. |
| Link da loja | Link da loja (endereço na internet) · dica "Só letras minúsculas, números e hífen. Ex.: pastelaria-da-vila." e, digitado, "Seu link: {site}/loja/{apelido}" · "Conferindo se está livre…" / "Endereço livre." / sugestão | "Endereço da loja" (parecia o endereço da rua) e dica "Esse é o link que seus clientes vão usar." | ✅ "É o endereço da sua loja na internet: o link que você manda para os clientes. Prefira curto e fácil de digitar, porque depois da aprovação só o suporte troca." Ex.: pastelaria-da-vila vira …/loja/pastelaria-da-vila. |
| WhatsApp da loja | WhatsApp da loja com DDD (opcional) · "(85) 91234-5678" · dica "É por onde os clientes falam com você e recebem o pedido. Pode deixar o mesmo número." | "WhatsApp da loja" | rótulo basta |
| Cidade | Cidade (opcional) | "Cidade" | rótulo basta |
| Estado | Estado (UF) · "Ex.: CE" | "UF" | rótulo basta |

**Documentos (CPF/CNPJ):** o cadastro de loja não pede CPF nem CNPJ hoje. Não
há campo a explicar; se um dia entrar, ele precisa de "i" dizendo para que
serve (aprovação da loja / nota fiscal).

## 8. Loja em análise (`/painel` com loja aguardando aprovação)

Arquivo: `features/aprovacao/AcoesDaAprovacao.tsx` (editar os dados enquanto
aguarda).

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Nome da loja | Nome da loja | — | rótulo basta |
| Tipo de negócio | Tipo de negócio | — | ✅ mesmo texto da seção 7 |
| WhatsApp da loja | WhatsApp da loja com DDD · "(85) 91234-5678" | "WhatsApp da loja" | rótulo basta |
| Cidade · Estado | Cidade · Estado (UF) · "Ex.: CE" | "UF" | rótulo basta |

## 9. Minha conta (`/conta/...`)

Arquivos: `features/conta/DadosDaConta.tsx`, `EnderecosSalvos.tsx`,
`SegurancaDaConta.tsx`, `FiltrosDePedidos.tsx`, `features/auth/TotpForm.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Nome completo | Nome completo | — | rótulo basta |
| WhatsApp | WhatsApp com DDD · "(85) 91234-5678" · dica "A loja usa para falar do seu pedido." | "Telefone / WhatsApp" · dica "Com DDD…" | rótulo basta |
| CPF | CPF (opcional) · "000.000.000-00" · dica "Só se você quiser o seu CPF na nota fiscal das compras. Não é usado para mais nada." | dica "Só se você quiser nota com CPF." | ✅ "Serve só para a nota fiscal sair no seu CPF. Se não precisar de nota, deixe em branco; dá para apagar quando quiser." Ex.: 123.456.789-09. |
| E-mail (só leitura) | E-mail · dica "É o seu login e não muda por aqui. Para trocar, fale com o suporte." | — | rótulo basta |
| Ofertas | Quero receber ofertas e novidades das lojas | — | rótulo basta |
| Nome do endereço | Nome do endereço (opcional) · botões Casa/Trabalho · dica "Só para você reconhecer na lista. Ex.: Casa, Trabalho, casa da mãe." | "Apelido do endereço (opcional)" | rótulo basta |
| Rua ou avenida | Rua ou avenida * · "Ex.: Rua das Flores" | "Rua" | rótulo basta |
| Número | Número · "Ex.: 123" | — | rótulo basta |
| Complemento | Complemento (opcional) · "Ex.: apto 302, bloco B" | "Complemento" | rótulo basta |
| Bairro | Bairro · dica "A loja usa o bairro para calcular a entrega." | sem dica | rótulo basta |
| Cidade | Cidade | — | rótulo basta |
| Estado | Estado (UF) · "Ex.: CE" (vira maiúscula ao digitar) | "UF" | rótulo basta |
| CEP | CEP (opcional) · "Ex.: 60000-000" | "CEP" | rótulo basta |
| Ponto de referência | Ponto de referência (opcional) · dica com exemplo | **não existia** aqui (só no checkout); o campo já era salvo pela API | rótulo basta |
| Endereço padrão | Usar como endereço padrão nos pedidos | — | rótulo basta |
| Trocar senha | Senha atual · Nova senha (medidor) | — | rótulo basta |
| Confirmar com senha | Sua senha | — | rótulo basta |
| Chave do autenticador (só leitura) | Chave para digitar · passos 1-2-3 | — | ✅ "O aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou Authy) gera um código novo a cada 30 segundos. Esta chave liga o aplicativo à sua conta; você digita uma vez só." Ex.: ABCD EFGH IJKL MNOP. |
| Código do aplicativo | Código do aplicativo (6 dígitos) · "000000" | "Código de seis dígitos" | rótulo basta |
| Códigos de recuperação (só leitura) | "Guarde seus códigos de recuperação" + "Eles aparecem só agora. Cada um serve uma vez, se você perder o celular." | — | rótulo basta |
| Filtros dos pedidos | Situação (abas) · Loja · Período | — | rótulo basta |

## 10. Explorar e comentários (`/explorar`)

Arquivos: `features/feed/BarraDoFeed.tsx`, `GavetaDeComentarios.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Busca | "Buscar produtos" ou "Buscar lojas pelo nome ou bairro" + rótulo para leitor de tela | — | rótulo basta |
| Como receber | Todas · Entrega · Retirada | — | rótulo basta |
| Atacado | Atacado (dica ao passar: "Mostrar só produtos com preço de atacado") | — | rótulo basta |
| Ordenar | Ordenar | — | rótulo basta |
| Comentário | "Escreva um comentário" (leitor de tela) · "Comente sobre {produto}…" | — | rótulo basta |

## Conferência na tela (Playwright headless, 1400×900 e 390×844)

Script: `/tmp/sc70/prints.cjs` (prints em `/tmp/sc70/*.png`), logado como a
cliente de teste e, no cadastro de dono, sem sessão (não envia o formulário).

| Tela | "i" cobre algo? | Balão aberto cobre o próprio campo, preço, botão de comprar ou sacola? |
| --- | --- | --- |
| Produto com atacado (Pastel de Queijo) | não | não (abre para cima; fica sobre a lista de adicionais enquanto aberto) |
| Cardápio com sacola flutuante | não há "i" na vitrine (0 na página) | — |
| Cadastro de loja: Link da loja | não | não cobre o próprio campo; aberto, fica sobre o campo de cima (Nome / Tipo) |
| Cadastro de loja: Tipo de negócio | não | idem |
| Meus dados: CPF | não | idem (fica sobre Nome / WhatsApp) |
| Aplicativo autenticador: chave | não | não |
| Checkout: troco | sem "i" | "5" com total R$ 17,00 → "O troco precisa ser para um valor maior que o total (R$ 17,00)." |

Observações fora deste card:

- O balão do `<Info>` (#66) abre por cima do campo **vizinho** enquanto está
  aberto (fecha com Esc, toque fora ou rolagem). Nunca cobre o próprio campo
  nem o "i". Se o pedido é "nunca cobrir nenhum campo nem aberto", a mudança é
  no componente (`packages/ui`), não nas telas.
- `POST /api/auth/aplicativo/preparar` responde 500 (`erro_interno`) no dev
  para a cliente de teste: a tela mostra "Não foi possível gerar a chave
  agora." O print da chave usou resposta simulada. A falha é da API.
- `/escolher-loja/nova` usa `features/equipe/FormularioOutraLoja.tsx` (#68):
  o #68 aplicou os mesmos rótulos e os mesmos "i" (link da loja e tipo de
  negócio, importados de `EXPLICACOES_PARA_CLIENTES`).
