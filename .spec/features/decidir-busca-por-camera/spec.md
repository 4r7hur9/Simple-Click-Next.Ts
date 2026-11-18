# Spec: Buscar produto lendo o código pela câmera (a decidir)

> feature: decidir-busca-por-camera
> status: rascunho

<!--
  Card #123 do RM Board. Bloco de códigos deste card: 12301 a 12399.
  Função "A decidir": esta spec registra uma PROPOSTA para o dono do produto
  revisar. Nada aqui está aprovado; nenhuma tarefa do redesign depende dela
  (P-107). Evidências, alternativas e riscos ficam em design.md.
-->

## Contexto

O mockup do Stitch mostra um botão "Escanear código" dentro da busca do
catálogo, no celular e no tablet. No SimpleClick, a loja já pode cadastrar o
código de barras de cada variação do produto, e a busca da loja já encontra o
produto por esse código quando ele é digitado. O que falta é o cliente poder
apontar a câmera para a embalagem e buscar sem digitar.

A proposta serve a lojas de qualquer segmento (mercado, farmácia, papelaria,
materiais de construção, autopeças e outros). É só um atalho para a busca que
já existe: não abre sites, não envia imagem e não substitui a digitação.

## Histórias

### US-12301 — Buscar apontando a câmera para o código

Como cliente de uma loja, quero localizar um item apontando a câmera para o
código de barras dele, para não precisar digitar números longos.

#### AC-12301 — Código lido vira a busca da loja, uma única vez

- **Dado** o cliente no catálogo de uma loja, com a câmera autorizada
- **Quando** ele aponta para um código de barras de um formato aceito e a
  leitura conclui
- **Então** o campo de busca da loja aparece preenchido com o código lido
- **E** a busca é enviada uma única vez, para o catálogo da própria loja
- **E** a câmera para de procurar códigos depois da primeira leitura válida

#### AC-12302 — Conteúdo que não é código de produto é recusado

- **Dado** o leitor aberto
- **Quando** a câmera lê um conteúdo que não é um código de produto aceito (um
  endereço de site, um texto livre, um QR de pagamento ou um código com dígito
  verificador errado)
- **Então** aparece a mensagem "Este código não é de um produto. Tente outro ou
  digite."
- **E** nenhuma página é aberta e nenhuma busca é enviada

#### AC-12303 — A câmera desliga e nenhuma imagem sai do aparelho

- **Dado** o leitor aberto com a câmera ligada
- **Quando** a leitura conclui, o cliente fecha o leitor, troca de aba ou sai da
  tela
- **Então** a câmera é desligada (o indicador de câmera do aparelho apaga)
- **E** durante toda a leitura nenhuma imagem ou quadro é enviado pela rede nem
  guardado no aparelho

#### AC-12307 — Um leitor por vez, sem fechar a busca do celular

- **Dado** a página do catálogo, que tem uma busca na barra e outra no painel de
  busca do celular
- **Quando** o cliente abre o leitor a partir de qualquer uma delas
- **Então** só um leitor fica ativo de cada vez
- **E** no celular o painel de busca continua aberto enquanto o leitor está na
  tela

### US-12302 — Digitar o código continua sempre possível

Como cliente, quero poder digitar o código quando a câmera não funciona ou não
é permitida, para nunca ficar sem buscar.

#### AC-12304 — Câmera negada leva à digitação

- **Dado** o cliente que toca no botão do leitor
- **Quando** ele nega a permissão da câmera, ou a câmera está ocupada ou
  indisponível
- **Então** aparece uma mensagem curta explicando que dá para digitar o código
- **E** o foco vai para o campo de busca, pronto para digitar

#### AC-12305 — Navegador sem suporte mostra só a busca normal

- **Dado** um navegador sem câmera segura (página fora de HTTPS) ou sem leitor de
  códigos disponível
- **Quando** o cliente abre o catálogo
- **Então** o botão do leitor não aparece
- **E** digitar o código no campo e buscar funciona como hoje, inclusive com o
  JavaScript desligado

### US-12303 — Saber quando nada foi encontrado

Como cliente, quero saber claramente quando a loja não tem o item lido, para
tentar outro código ou procurar de outro jeito.

#### AC-12306 — Nenhum produto para o código lido

- **Dado** uma busca vinda do leitor com um código que não corresponde a nenhum
  produto da loja
- **Quando** a consulta termina
- **Então** a tela mostra "Nada encontrado para" seguido do código lido
- **E** oferece "Limpar a busca" e "Ler de novo"

#### AC-12308 — Código cadastrado numa variação encontra o produto

- **Dado** uma loja com um produto cuja variação tem o código de barras
  cadastrado no painel
- **Quando** o cliente busca exatamente esse código no catálogo da loja
- **Então** o produto aparece entre os resultados
- **E** produtos de outras lojas nunca aparecem

## Fora do escopo

- Busca global no /explorar (depende da Q-12303).
- Ler QR de pagamento, link, cupom ou cardápio de mesa.
- Enviar a imagem para um serviço externo, gravar foto ou vídeo da leitura.
- Mudar o cadastro do código de barras no painel ou criar regra de formato no
  cadastro.
- Funções de oficina, compatibilidade veicular e consulta de placa ou chassi
  (P-104).
- Implementar código, criar testes, mudar banco, API ou infraestrutura nesta
  etapa.

## Suposições

| ID        | Suposição                                                                                                                                                                                     | Status | Resolução |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-12301 | A leitura acontece só no navegador do cliente, sem serviço externo, sem custo e sem envio de imagem                                                                                           | aberta | —         |
| ASM-12302 | A busca da loja que já existe (card #75) encontra o código de barras igual ao cadastrado; códigos com 61 a 100 caracteres (o cadastro aceita 100 e a busca 60) não seriam encontrados         | aberta | —         |
| ASM-12303 | UPC-A cadastrado com 12 dígitos e o mesmo código lido como EAN-13 (com 0 na frente) não se encontram sem uma normalização; um EAN-8 lido pode trazer outros itens cujo código começa igual    | aberta | —         |
| ASM-12304 | O resultado mostra o produto, e não a variação exata do código lido; o cliente escolhe a variação no produto como hoje                                                                        | aberta | —         |
| ASM-12305 | O botão segue o Stitch e aparece no celular e no tablet; a regra exata depende da Q-12306                                                                                                     | aberta | —         |
| ASM-12306 | Os formatos da proposta são os de varejo (EAN-13, EAN-8, UPC-A e UPC-E), só com dígitos e dígito verificador conferido                                                                        | aberta | —         |
| ASM-12307 | O botão e o leitor ficam ocultos até a decisão do dono do produto (P-107), e as funções existentes da busca, do catálogo e dos stories são preservadas                                        | aberta | —         |
| ASM-12308 | O critério AC-12308 é provado por teste de integração da API, que o verify do ONP não roda (só os projetos web e unit); ele fica como critério sem prova automática até o #114 propor a prova | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                                     | Status | Resposta |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-12301 | Fazer ou não a busca pela câmera? (ligada à pergunta 10305 do card #103, que decide quais funções "A decidir" entram)                                                                        | aberta | —        |
| Q-12302 | Quais formatos ler: só os de varejo (EAN-13, EAN-8, UPC-A, UPC-E) ou também Code 128 e QR com código de produto em texto?                                                                    | aberta | —        |
| Q-12303 | A busca pela câmera fica só dentro de uma loja ou também na busca global do /explorar (que hoje não procura por código de barras nem SKU)?                                                   | aberta | —        |
| Q-12304 | A leitura usa o leitor nativo do navegador (não existe no iPhone) ou uma biblioteca servida pelo próprio SimpleClick (nova dependência)? Essa regra sobre bibliotecas entra na constituição? | aberta | —        |
| Q-12305 | Quando o código lido corresponde a um único produto, abrir esse produto direto e já escolher a variação lida, ou mostrar a lista de resultados?                                              | aberta | —        |
| Q-12306 | O botão aparece pelo tamanho da tela (só celular e tablet, como no Stitch) ou em qualquer aparelho com câmera e leitor, inclusive o computador?                                              | aberta | —        |
| Q-12307 | Normalizar o código na busca (UPC-A igual a EAN-13 com 0 na frente, expandir UPC-E) e priorizar o acerto exato? Isso mexe na API da vitrine                                                  | aberta | —        |
| Q-12308 | Ligar o cabeçalho Permissions-Policy com camera=(self) e o limite de requisições na borda para a busca pública? Quem é o dono da infraestrutura nessa mudança?                               | aberta | —        |
