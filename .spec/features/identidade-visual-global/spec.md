# Spec: Identidade visual global

> feature: identidade-visual-global
> status: pronta

## Contexto

O SimpleClick já possui tokens semânticos, temas claro e escuro e componentes
base, mas eles nasceram antes da identidade oficial. O Tailwind também está
instalado sem expor esses tokens como a API visual do produto. Esta feature é o
pré-requisito da continuação das telas: traduz o manual oficial para código,
conecta CSS e Tailwind à mesma fonte e impede que cada feature invente cor,
fonte, medida ou tratamento próprios.

A referência oficial é o kit entregue em 22/08/2026: manual PDF/PPTX, SVGs e
kit de marca. Arquivos duplicados por nome foram conferidos por SHA-256.

## Histórias

### US-911 — A plataforma é reconhecida como um único produto

Como pessoa que usa o SimpleClick, quero encontrar a mesma linguagem visual na
landing, no acesso e no painel, para reconhecer o produto sem reaprender cada
tela.

#### AC-941 — A paleta oficial governa as superfícies da plataforma

- **Dado** os temas claro e escuro da plataforma
- **Quando** uma tela usa fundo, superfície, texto, borda ou destaque
- **Então** ela resolve esses papéis a partir da paleta oficial — Verde Click `#B7FF00`, Verde Digital `#72D900`, Mint `#E5FFB8`, Grafite `#161C19`, Cinza UI `#A8B1AB`, Névoa `#F5F7F4`, Branco `#FFFFFF` e Preto Tecnológico `#0B0F0D` — sem cor literal no componente

#### AC-942 — A tipografia oficial tem hierarquia estável

- **Dado** uma tela com títulos, destaques, textos e controles
- **Quando** ela é renderizada
- **Então** títulos e destaques usam Space Grotesk, textos e interface usam Inter, e Asectica fica restrita aos vetores oficiais do logotipo

#### AC-943 — A identidade continua legível e navegável

- **Dado** qualquer par de texto e superfície, controle ou anel de foco dos dois temas
- **Quando** a paleta oficial é aplicada
- **Então** texto alcança contraste mínimo de 4,5:1, fronteiras e foco alcançam 3:1, e o foco permanece visível por teclado

#### AC-944 — A marca da loja não destrói a marca da plataforma

- **Dado** uma loja com logo e cor principal próprios
- **Quando** a vitrine ou a prévia da loja é exibida
- **Então** a cor da loja altera somente a intenção primária dentro do seu escopo, enquanto tipografia, estados, acessibilidade e casca continuam obedecendo ao sistema global

#### AC-945 — A marca oficial é aplicada sem deformação ou efeito indevido

- **Dado** um ponto da interface que exige símbolo ou assinatura SimpleClick
- **Quando** a marca é exibida
- **Então** é usado um SVG oficial positivo, negativo ou monocromático, com área de proteção e mínimo digital de 24px, sem giro, contorno, sombra, deformação ou troca de cores

#### AC-950 — Nenhuma camada visual compete com a leitura

- **Dado** uma tela com conteúdo, ações e elementos de fundo
- **Quando** leio qualquer título, texto, rótulo ou botão
- **Então** o texto está sobre superfície sólida e contrastante, botões são opacos, e transparência, textura, gradiente, brilho ou desfoque nunca atravessam nem reduzem a leitura

#### AC-951 — Texto não vira enfeite dentro de pílula

- **Dado** um texto auxiliar, categoria, metadado ou estado exibido na interface
- **Quando** ele não é uma ação interativa
- **Então** texto auxiliar e estados funcionais aparecem livres com hierarquia tipográfica e ícone quando necessário; um aviso pode ocupar um bloco opaco completo, mas nunca vira badge, cápsula ou pílula decorativa

### US-912 — Quem desenvolve usa a identidade sem decorar valores

Como pessoa desenvolvedora, quero nomes semânticos em CSS e Tailwind, para que
uma mudança oficial seja feita uma vez e alcance todas as telas.

#### AC-946 — Tailwind e CSS falam o mesmo vocabulário

- **Dado** um valor global de cor, fonte, espaçamento, raio, sombra ou movimento
- **Quando** ele é usado por classe do Tailwind ou CSS de componente
- **Então** as duas formas resolvem para a mesma fonte em `packages/ui/styles/theme.css`, sem paleta paralela nem configuração JavaScript

#### AC-947 — O padrão global nasce pronto para uso real

- **Dado** uma página nova sem estilos locais de base
- **Quando** ela renderiza texto, link, botão, campo, seleção e conteúdo rolável
- **Então** herda fundo, tinta, tipografia, foco, seleção, movimento reduzido e ritmo modular de 8px sem repetição por página

#### AC-948 — Valor visual solto é barrado antes de entrar

- **Dado** uma alteração em componente ou tela
- **Quando** ela escreve cor literal ou cria um segundo valor global fora da fonte autorizada
- **Então** a verificação automatizada reprova e aponta o nome semântico que deve ser usado

### US-913 — A identidade pode ser conferida sem caçar telas

Como responsável pelo produto, quero uma vitrine do sistema visual, para
comparar a implementação com o manual e aprovar mudanças rapidamente.

#### AC-949 — A vitrine visual mostra o sistema inteiro

- **Dado** a rota interna de demonstração da interface
- **Quando** abro a rota em tema claro, escuro e na largura mínima de 344px
- **Então** vejo paleta, tipografia, espaçamento, raios, sombras, marca e componentes com seus estados relevantes, sem estouro horizontal

## Fora de escopo

- Redesenhar fluxos de negócio ou textos das features.
- Remover a personalização de logo e cor de cada loja.
- Instalar biblioteca de componentes pronta.
- Usar Asectica ou Typo Round como fonte de interface; os ZIPs são demos de
  licença limitada e o manual reserva Asectica ao desenho da marca.
- Usar textura ou gradiente como tratamento padrão; o manual os classifica
  como secundário e especial.

## Suposições

| ID      | Suposição                                                                                                                                          | Status     | Resolução                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ASM-906 | Tailwind permanece CSS-first na versão 4.3.3 e usa `@theme inline` para apontar aos tokens que mudam por tema                                      | confirmada | Confirmado no pacote instalado e na documentação oficial do Tailwind 4                                                             |
| ASM-907 | A personalização da loja continua limitada ao escopo da loja e da prévia da landing                                                                | confirmada | Já é requisito provado da fundação e configuração da loja                                                                          |
| ASM-908 | Cores funcionais de erro e atenção podem existir fora da paleta da marca, mas nunca são aplicadas ao logotipo e sempre têm texto/ícone além da cor | confirmada | A proibição de cores externas está na seção de variações cromáticas da marca; estados precisam manter significado e acessibilidade |
| ASM-909 | “Texto solto” significa remover cápsulas decorativas, não remover a área sólida e reconhecível de controles interativos                            | confirmada | Confirmado pelo dono do produto: estados usam ícone + texto sem badge; botões permanecem sólidos                                   |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                                | Status     | Resposta                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| Q-904 | Estados funcionais como “pedido pronto”, “erro” e “aguardando” também devem ficar sem badge, usando ícone + texto e, quando necessário, um bloco opaco? | respondida | Sim: ícone + texto sem badge; quando o contexto exigir destaque, usa bloco opaco completo, não cápsula |
| Q-905 | Botões podem manter raio discreto de 4–8px, ou devem ter cantos totalmente retos?                                                                       | respondida | Botões opacos com raio fixo de 6px                                                                     |
