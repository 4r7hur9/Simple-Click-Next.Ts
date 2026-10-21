# Campos explicados — configurações, aparência, equipe, feed, stories, comentários e métricas do painel

Card #68. Regra geral em `apps/web/AGENTS.md`, seção "Campos explicados".
Os textos do "i" moram num arquivo só, `apps/web/src/features/config/explicacoes-do-painel.ts`
(`EXPLICACOES`); esta tabela é gerada a partir dele.

Legenda da coluna **"i"**: ✅ tem "i" (texto ao lado) · — rótulo basta.
"Antes" só aparece quando o rótulo, a unidade ou o exemplo mudou.

## 1. Horário de funcionamento (`/painel/config/horarios`)

Arquivo: `features/config/FormularioHorario.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Fechar agora (caixa) | Fechar agora · Parar de receber pedidos agora (+ frase visível) | — | ✅ "Liga uma pausa: a vitrine mostra a loja fechada e ninguém consegue pedir. A grade da semana não muda. Desligue para voltar a receber pedidos." Ex.: acabou o gás ou a cozinha lotou numa sexta à noite. |
| Grade da semana | Grade da semana + frase visível "Horários no relógio da sua cidade (o fuso da loja). Até 4 faixas por dia; o dia sem faixa fica fechado." | sem a frase (fuso e limite não eram ditos) | ✅ "Os horários em que a loja recebe pedidos, no relógio da sua cidade (o fuso da loja). Cada dia pode ter até 4 faixas. Dia sem faixa fica fechado." Ex.: terça de 11:00 às 14:00 e de 18:00 às 23:00 (duas faixas). |
| Faixa: Abre / Fecha (hora) | Abre · Fecha (relógio 24 h) | — | ✅ (na primeira faixa de cada dia, no "Abre") "Uma faixa é um intervalo seguido aberto. O fechamento vem depois da abertura; se passar da meia-noite, cadastre a madrugada no dia seguinte." Ex.: sexta 18:00 às 23:59 e sábado 00:00 às 02:00. |
| Datas especiais (feriado) | Datas especiais + frase visível | — | ✅ "Um dia que foge da grade: feriado, férias ou um horário diferente. Vale só naquela data e depois a grade volta sozinha." Ex.: 25/12 fechada o dia todo, ou 24/12 das 10:00 às 14:00. |
| Data | Data | — | — |
| Fechada o dia todo | Fechada o dia todo | — | — |
| Abre / Fecha da data | Abre · Fecha | — | — |
| Motivo | Motivo (aparece na vitrine) · exemplo "Ex.: Feriado de Natal" | sem exemplo | ✅ "Uma frase curta que o cliente lê na vitrine naquele dia. Pode ficar em branco." Ex.: Feriado de Natal. |

Fuso: não é editável nesta tela. A loja usa o fuso cadastrado (lojas de
Fortaleza: `America/Fortaleza`); a tela agora diz isso em vez de calar.

## 2. Entrega e retirada (`/painel/config/entrega`)

Arquivo: `features/config/FormularioEntrega.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Modos de recebimento | Modos de recebimento: Entrega · Retirada no local | — | ✅ "Como o cliente recebe o pedido. Marque pelo menos um: sem nenhum, o cliente não consegue finalizar a compra." Ex.: pizzaria com motoboy marca Entrega e Retirada no local. |
| Taxa de entrega | Taxa de entrega (R$) · "Ex.: 8,00" + frase visível "Vazio aparece como “a combinar”; 0,00 é entrega grátis." | exemplo "8,00" (parecia valor preenchido) e sem a regra do vazio | ✅ "Quanto o cliente paga pela entrega, em reais. A taxa entra no total do pedido, na linha com o nome que você der em “Nome da taxa”." Ex.: 8,00. |
| Entrega grátis acima de | Entrega grátis acima de (R$) · "Ex.: 60,00" | exemplo "60,00" | ✅ "A partir deste valor de pedido a entrega sai de graça. Vazio: a taxa vale para qualquer valor." Ex.: 60,00 — pedido de R$ 65,00 não paga taxa. |
| Valor mínimo (entrega) | Pedido mínimo para entrega (R$) · "Ex.: 25,00" | Mínimo para entrega (R$) · "25,00" | ✅ "Menor valor de pedido aceito para entrega, sem contar a taxa. Vazio: sem mínimo." Ex.: 25,00. |
| Valor mínimo (retirada) | Pedido mínimo para retirada (R$) · "Ex.: 10,00" | Mínimo para retirada (R$) · "0,00" (parecia campo pré-preenchido com 0) | ✅ "Menor valor de pedido aceito para retirada no local. Vazio: sem mínimo." Ex.: 10,00. |
| Nome da taxa | Nome da taxa · "Ex.: Motoboy" + frase visível | sem exemplo no campo | ✅ "O nome da linha da taxa no resumo do pedido do cliente." Ex.: Motoboy, Frete ou Taxa de entrega. |
| Tempo estimado | Tempo estimado de entrega (minutos) · "Ex.: 40" | Prazo estimado (minutos), sem exemplo | ✅ "Quanto tempo, em minutos, o pedido costuma levar até chegar ao cliente. Aparece na página Sobre da loja como estimativa. Vazio: a loja não mostra prazo." Ex.: 40 aparece como “Chega em cerca de 40 min”. |

**Raio de entrega:** não existe na API (`SecaoDeEntrega` não tem raio nem
bairros). Nada foi inventado na tela; fica registrado aqui como lacuna.

## 3. Pagamento (`/painel/config/pagamento`)

Arquivo: `features/config/FormularioPagamento.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Formas aceitas | Formas aceitas: PIX · Dinheiro · Cartão na entrega | — | ✅ "As formas que o cliente pode escolher ao finalizar o pedido, na ordem desta lista. O cliente paga direto para a loja." Ex.: Pix e Dinheiro para quem só aceita na hora da entrega. |
| Quadro do Pix | Dados do Pix | Chave PIX | — |
| Tipo da chave | Tipo da chave (CPF, CNPJ, Celular, E-mail, Chave aleatória) | — | ✅ "Que tipo de chave Pix a loja cadastrou no banco. O campo da chave mostra o formato certo para o tipo escolhido." Ex.: Celular, se a chave é o número (85) 91234-5678. |
| Chave | Chave Pix · exemplo conforme o tipo | Chave | ✅ "A chave que o cliente copia para pagar. Digite igual está no app do banco." Ex.: 123.456.789-09 para chave CPF. |
| Nome de quem recebe | Nome de quem recebe + frase visível | — | ✅ "O nome que o banco mostra para quem vai pagar. O cliente confere antes de confirmar o Pix." Ex.: Maria Souza Lanches ME. |

**Troco:** a loja não configura troco; quem informa "troco para quanto" é o
cliente no fechamento do pedido (card #70). Os tipos de chave já apareciam em
português (`TELEFONE` → "Celular", `ALEATORIA` → "Chave aleatória").

## 4. Contato e mensagem (`/painel/config/contato`)

Arquivo: `features/config/EditorDeMensagem.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| WhatsApp da loja | WhatsApp da loja · "(11) 91234-5678" + conferência ao vivo ("Assim fica: …") | — | ✅ "O número que recebe a mensagem de cada pedido. Pode digitar com DDD, com ou sem máscara." Ex.: (85) 91234-5678. |
| Exibir na página Sobre | Exibir este WhatsApp na página Sobre (+ frase visível) | — | — (a frase visível já explica) |
| Saudação da mensagem | Saudação da mensagem + frase visível + prévia | — | ✅ "O texto que abre a mensagem do pedido no WhatsApp. O resto (itens, total, entrega) o sistema escreve sozinho." Ex.: Olá! Segue meu pedido: |

## 5. Impressão do cupom (`/painel/config/impressao`)

Arquivos: `features/config/FormularioImpressao.tsx`, `ParearAgente.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Largura do papel | Largura do papel: 58 mm (32 colunas) · 80 mm (48 colunas) | — | ✅ "A largura do rolo da sua impressora térmica. Olhe na caixa do papel ou na etiqueta da impressora. 58 mm cabe 32 letras por linha; 80 mm cabe 48." Ex.: a maioria das impressoras de balcão usa 80 mm. |
| Conteúdo opcional | Endereço do cliente · Total em destaque · Observações do pedido | — | ✅ "O que mais sai no cupom além do número, itens e total, que saem sempre." Ex.: desligue o endereço se a loja só faz retirada. |
| Impressão automática (chave) | Imprimir o cupom sozinho quando o pedido entrar (+ explicação visível e "Em vigor: …") | — | ✅ "Ligada, o cupom sai sozinho quando o pedido entra, pelo agente de impressão. Desligada, você imprime cada cupom pelo botão do pedido." Ex.: ligue se tem um computador da loja sempre ligado na impressora. |
| Agente de impressão | Parear o agente de impressão (passo a passo visível) | — | ✅ "Um programa instalado no computador ligado à impressora. Ele busca os pedidos novos e imprime sem ninguém clicar. Uma loja tem um agente por vez." |
| Código de pareamento | Código de pareamento (6 dígitos, "Vale até HH:MM") | — | ✅ "Seis números que ligam o agente à sua loja. Valem por poucos minutos e servem uma vez; gerar outro cancela o anterior." Ex.: 482913. |

**Vias:** não existe opção de número de vias na API (`impressao` só tem
largura, conteúdo e automático). Registrado como lacuna.

As telas de `features/impressao/` (cupom, aviso, botão "Imprimir cupom") não
têm campo de formulário: só botões com rótulo próprio.

## 6. Aparência (`/painel/aparencia`)

Arquivos: `features/config/FormularioAparencia.tsx`, `SeletorDeCor.tsx`,
`EnvioDeImagem.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Cor de destaque | Cor de destaque (+ frase visível, quadro de cor e matiz) | — | ✅ "A cor de botões, títulos e selos da sua loja. O fundo é sempre preto, então escolha uma cor que se leia bem sobre ele." Ex.: o vermelho do logo da sua pizzaria. |
| Código da cor | Código da cor (hexadecimal) · "Ex.: #B7FF00" (o verde padrão) | Código da cor, sem exemplo | ✅ "A cor em código hexadecimal: # e seis letras ou números. Cole aqui o código da sua marca." Ex.: #B7FF00, o verde SimpleClick. |
| Foto de fundo (capa) | Foto de fundo da vitrine (+ formatos e recorte 4:1 visíveis) | — | ✅ "A foto larga no alto da página da loja (capa). Sem ela, vale a capa padrão do seu tipo de negócio." Ex.: a fachada da loja ou o prato mais pedido. |
| Foto do topo | Foto do topo do cardápio | — | ✅ "A foto no alto da página de produtos. Sem ela, vale a foto de fundo da vitrine." |
| Aproximar (zoom) | Aproximar | — | — |
| Selo de status | Selo de status: Automático · Claro · Escuro (cada um com frase e amostra) | — | ✅ "A cor da pílula “Aberto/Fechado” que fica sobre a capa. Automático escolhe claro ou escuro conforme a sua foto; Claro e Escuro fixam a cor." Ex.: capa muito clara fica melhor com o selo Escuro. |
| Nome da loja | Nome da loja | — | — |
| Descrição curta | Descrição curta (contador N/280) | — | ✅ "Uma frase de boas-vindas que aparece embaixo do nome, na página da loja. Até 280 letras." Ex.: Pastel frito na hora desde 1998. |
| Sobre o negócio | Sobre o negócio | — | ✅ "O texto da página Sobre: história, diferenciais, redes sociais. Até 2.000 letras." |
| Logo | Logo (foto de perfil) · Enviar arquivo · Ou o endereço de uma imagem já hospedada | — | ✅ "A foto de perfil da loja: aparece na bolinha dos stories e no topo dos posts em Explorar. Quadrada fica melhor." |
| WhatsApp | Número do WhatsApp da loja · Mostrar o número na página da loja | — | — (explicado em Contato) |

## 7. Equipe (`/painel/equipe`)

Arquivo: `features/equipe/PainelDaEquipe.tsx` (e `FormularioOutraLoja.tsx`, `CartaoDaLoja.tsx`).

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Uso do plano | Equipe N de M (barra) | — | ✅ "Quantas pessoas da equipe o seu plano permite. O dono não conta. No limite, fale com o suporte para aumentar." |
| Papel (coluna) | Dono · Equipe | — | ✅ (no título "O que a equipe pode fazer") "Dono é quem criou a loja e mexe em tudo. Equipe atende pedidos e cuida do catálogo, sem ver configurações, aparência, feed nem a própria equipe." |
| Situação | Ativo · Desativado (com os botões Desativar/Reativar) | — | — |
| Nome / E-mail | Nome · E-mail | — | — |
| Senha inicial | Senha inicial (dica "Pelo menos 8 caracteres.") | — | ✅ "Você define a senha e passa para a pessoa. Ela entra com o e-mail e esta senha. Pelo menos 8 caracteres." |
| Nova senha | Nova senha (dica) | — | — (a janela já diz que a pessoa sai de todos os aparelhos) |
| Permissões | lista de selos com as permissões da Equipe, em português | — | — |
| Abrir outra loja (`/escolher-loja/nova`): Nome da loja | Nome da loja | — | — |
| Abrir outra loja: Tipo de negócio | Tipo de negócio | — | ✅ (texto do #70, `EXPLICACOES_PARA_CLIENTES.tipoDeNegocio`) "O que a sua loja vende. Usamos para mostrar a loja na categoria certa do Explorar e para escolher a capa padrão." Ex.: Pastelaria, Mercadinho ou Pet shop. |
| Abrir outra loja: link | Link da loja (endereço na internet) + prévia "simpleclick…/loja/…" | Endereço da loja | ✅ (texto do #70, `linkDaLoja`) "É o endereço da sua loja na internet: o link que você manda para os clientes. Prefira curto e fácil de digitar, porque depois da aprovação só o suporte troca." Ex.: pastelaria-da-vila vira …/loja/pastelaria-da-vila. |
| Abrir outra loja: WhatsApp | WhatsApp da loja com DDD · "(85) 91234-5678" | WhatsApp, sem exemplo | — |
| Abrir outra loja: Cidade / Estado | Cidade · Estado (UF) · "Ex.: CE" | UF | — |

## 8. Feed da loja (`/painel/feed`)

Arquivo: `features/feed-config/FormularioDoFeed.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Aparecer no feed | Aparecer no feed (+ frase visível) | — | ✅ "Explorar é o feed onde clientes de todo o SimpleClick descobrem lojas. Ligado, a loja e os produtos marcados aparecem lá. A vitrine funciona de qualquer jeito." |
| Publicar produtos novos | O que publicar automaticamente → Produtos novos (+ frase visível) | — | ✅ "Ligado, todo produto que você cadastrar a partir de agora já vem com “Publicar no feed” marcado. Os produtos antigos não mudam." |

## 9. Stories (`/painel/stories`)

Arquivo: `features/stories-painel/TelaDeStories.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Arquivo | Foto ou vídeo vertical (formatos, tamanho e duração visíveis) + aviso "Some sozinho em 24 horas" | — | ✅ "A foto ou o vídeo do story, de preferência em pé (9:16). Fica no ar por 24 horas e depois some, com o arquivo apagado." Ex.: a fornada que acabou de sair. |
| Legenda | Legenda (opcional) · N/limite · "Ex.: Saiu fornada nova!" | — | ✅ "Um texto curto que aparece por cima do story. É opcional." Ex.: Saiu fornada nova! |
| Botão Ver loja | Mostrar o botão “Ver loja” no story (vem ligado) | — | ✅ "Mostra no story um botão que leva o cliente direto para a página da sua loja." |
| Cartão do story no ar | Some em 23 h 12 min · N visualizações | — | — |

## 10. Comentários (`/painel/comentarios`)

Arquivo: `features/comentarios/TelaDeComentarios.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Aprovar automaticamente | Aprovar automaticamente · Ligado/Desligado (+ frase visível que muda) | — | ✅ "Ligado, todo comentário novo aparece na hora para os clientes. Desligado, ele espera na aba Pendentes até você aprovar." Ex.: deixe desligado se quiser ler tudo antes de publicar. |
| Abas | Pendentes · Aprovados · Recusados | — | — |
| Motivo da recusa | Motivo (opcional, só a loja vê) · "Ex.: ofensivo, propaganda" | — | ✅ "Anote por que recusou. Só a loja vê; o cliente não recebe aviso." Ex.: propaganda de outra loja. |
| Selos | Bloqueado · N denúncias | — | — |

## 11. Início e métricas (`/painel`, `/painel/metricas`)

Arquivos: `features/dashboard/CartoesDoPainel.tsx`, `SeletorDePeriodo.tsx`,
`ComposicaoDasVendas.tsx`.

| Campo / métrica | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Período | Hoje · 7 dias · Escolher outro período (calendário com comparar) | — | ✅ "De que dias são os números. Hoje vai da meia-noite até agora; 7 dias inclui hoje e os 6 anteriores. Comparar põe ao lado o mesmo número de dias logo antes." |
| Vendas | Vendas hoje / Vendas no período (+ concluídos · em andamento) | — | ✅ "A soma dos pedidos aceitos no período: os concluídos e os que ainda estão em andamento. Pedido cancelado ou ainda não aceito não entra." |
| Pedidos | Pedidos ("que contam como venda") | — | ✅ "Quantos pedidos contam como venda no período: aceitos, concluídos ou em andamento." |
| Ticket médio | Ticket médio ("vendido ÷ pedidos") | — | ✅ "Quanto cada pedido vale em média: vendas divididas pelo número de pedidos." Ex.: R$ 600,00 em 20 pedidos dá ticket médio de R$ 30,00. |
| Itens vendidos | Itens vendidos | — | ✅ "Quantas unidades de produto saíram nos pedidos vendidos. Dois pastéis no mesmo pedido contam 2." |
| Clientes novos | Clientes novos | — | ✅ "Clientes que fizeram a primeira compra na loja neste período." |
| Clientes recorrentes | Clientes recorrentes | — | ✅ "Clientes que compraram no período e já tinham comprado antes." |
| Cancelamentos | Cancelamentos (seta invertida: subir é ruim) | — | ✅ "Pedidos cancelados no período. O valor deles fica fora das vendas. Aqui, número menor é melhor." |
| Em aberto | Em aberto ("aguardando você aceitar — ainda não é venda") | — | ✅ "Pedidos que chegaram e esperam você aceitar. Ainda não contam como venda." |

**Conversão:** o painel não calcula taxa de conversão (a API de métricas não
conta visitas). Registrado como lacuna; nada foi inventado.

## 12. Tutorial e ajuda

- `features/tutorial/passos.ts`, passo "Feed": antes "Publique novidades e
  promoções para quem acompanha a loja." (errado: o feed é Explorar) → agora
  "Escolha se a loja aparece em Explorar, o feed onde clientes de todo o
  SimpleClick descobrem lojas, e quais produtos entram nele."
- `/painel/ajuda`: página em construção, sem campos.

## Sobreposição

O "i" fica sempre na linha do rótulo (ou do título da seção), como irmão do
texto, nunca dentro do controle. Prints em 1400 px e 390 px com balões
abertos: `docs/campos-explicados/prints/painel-config/`.

Conferência feita com uma cópia do `scripts/campos-explicados/conferir.mjs`
(card #72), conta `wellington@moto-pecas-fortal.test`, nas 13 telas acima em
1400×900 e 390×844 (todos os "i" abertos um a um). Os avisos que o script dá
nestas telas são do próprio script, não da tela:

- "ícone por cima do texto …" aponta o texto escondido do próprio "i" (o
  `sc-so-leitor` que vai para o leitor de tela), que fica no mesmo lugar dele;
- "algo cobre o ícone: span.sc-info" é o invólucro do próprio "i";
- "Esc não fechou o balão": conferido à parte, o Esc fecha (`aria-expanded`
  volta a `false` e o balão sai do documento);
- "não achei o rótulo" aparece quando o "i" está num título (`h2`) ou numa
  `legend`, e não num `label`.

Nos prints, o balão só aparece enquanto está aberto, sobre o que fica acima do
"i", e nunca cobre o campo que ele explica.
