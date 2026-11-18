# Plano — card #107 · Stitch · Vitrine da loja (`/loja/[slug]`)

## Contexto

A página pública da loja (`/loja/<apelido>`, e `/sobre` com a janela aberta) passa a seguir a composição das telas "Vitrine da loja" do Stitch (celular e computador):

- capa com véu;
- selo de situação;
- logo ou iniciais, nome e descrição;
- Favoritar, WhatsApp e Compartilhar;
- botão do catálogo com contagem;
- cartões de entrega, endereço e pagamento;
- faixa de chips;
- destaques;
- publicações;
- cartão "Fale com a loja no WhatsApp".

Tudo usa os dados de cada loja. O texto, os números e as imagens da Universokar não são copiados. Não entra placa, chassi nem compatibilidade.

As funções "A decidir" ficam ocultas: nota, selos, parcelamento, mais vendidos, contador de favoritos, "NF-e"/"compra protegida" e garantia.

A cor da loja (`TemaDaMarca`) continua valendo, assim como o tema claro e o escuro. A fonte é Plus Jakarta Sans.

**Execução sequencial** (gerente): este plano só roda depois que o #104 (peças e tokens) e o #105 (moldura) terminarem. Ele parte das peças do #104 que estão em `.spec/features/stitch-base-visual/design.md` §5:

- `Chip` com `href`;
- `IconeCompartilhar`;
- `IconeEstrela`;
- `AvisoFlutuante`;
- `Botao` (variante marcável);
- `Cartao` (`superficie="vitrine"`);
- tokens `--cor-*`.

Se os nomes mudarem, o plano é revisto quando o gerente avisar.

## Respostas do usuário (12/11/2026)

- **Q-10701/02:** faixa de chips que são **links**. "Destaques" e "Publicações" apontam para âncoras e "Sobre a loja e horários" vai para `/loja/<apelido>/sobre` (abre a janela). Todas as seções ficam empilhadas no HTML. O Sobre continua sendo janela com endereço próprio.
- **Q-10704:** o botão mostra a contagem real. Ela só aparece quando é exata (ver D-4).
- **Q-10705:** compartilhar nativo. Sem suporte, copia o link e mostra o `AvisoFlutuante`. Sem JS, o botão não aparece.
- **Q-10708/09:** Favoritar e o ícone de WhatsApp ficam na identidade (Favoritar mesmo sem publicações). No fim, um cartão "Fale com a loja no WhatsApp".

Hipóteses adotadas:

- **Q-10703:** cada bloco aparece quando há dado.
- **Q-10706:** o link "Abrir no mapa" fica no cartão de endereço.
- **Q-10707:** "Garantia e trocas" é descartado.
- **Q-10711:** a descrição para buscadores fica fora (`page.tsx` não é deste card). O ajuste vai ao gerente.

## Decisões

- **D-1 — Estilo.** As classes `sc-loja__*` evoluem em `packages/ui/styles/narrativa.css`, que o layout da loja já carrega e onde elas já moram. O gerente liberou a posse (Q-10710); o `board_claim` dela só entra na execução. Restrição: não mudar o visual de `sc-secao` nem de `sc-pagina-dupla` (usadas pelos not-found da loja e do pedido) e confirmar que o /ui (dev) e a landing "/" não mudam. Os nomes de classe atuais (`sc-loja__painel`, `__fundo`, `__situacao`, `__entrar`, `__nome`, `__logo`, `__iniciais`) ficam, para os testes antigos e para a `EntradaDaLoja`.
- **D-2 — Composição síncrona.** Novo `features/loja/PerfilDaLoja.tsx`. `TelaDaLoja` só busca os dados e passa tudo pronto, o que permite testar com `renderToStaticMarkup`.
- **D-3 — Destaques.** Reuso de `Destaques` (`features/vitrine/Destaques.tsx`) e `prepararProduto` (`server/catalogo-na-tela.ts`) sem editá-los, porque são do #108. `PerfilDaLoja` importa `@simpleclick/ui/styles/vitrine.css`, como a prévia já faz, o que também iguala as folhas da prévia e da página pública. Ajustes só do perfil vão em `vitrine.css`, sob `.sc-pagina-da-loja .sc-loja__destaques` (sou o 1º da fila).
- **D-4 — Contagem honesta.** `product_categories` é N:N: somar `secoes[].total` contaria o mesmo produto mais de uma vez. A contagem é o número de IDs únicos do resumo, e só aparece quando nenhuma seção veio cortada: todo `proximoCursor === null` e `produtos.length === total`. Senão, o botão mostra só o texto. A contagem exata para loja grande depende de um campo na API (contrato do #108), fora deste card.
- **D-5 — PIX.** `CondicoesDaLoja` recebe só `RecebimentoDaLoja`. O teste usa um fechamento com chave de exemplo e prova que ela não sai no HTML.
- **D-6 — Sem edição.** Não edito `CapaDaVitrine.tsx` (é o topo do /cardapio, assumido pelo #108), `SeloDeStatus.tsx`, `layout.tsx` (#105), `TelaDoCatalogo.tsx`, os arquivos do #104 nem `.spec/`.
- **D-7 — Compartilhar.** `BotaoCompartilharLoja.tsx` é um client component pequeno: `navigator.share`; senão `navigator.clipboard.writeText`, com `AvisoFlutuante` "Link copiado". Ele só aparece depois de montar, para a página sem JS não ter botão morto.

## Subtarefas (em sequência, na pasta principal)

1. **T-10701 — PerfilDaLoja síncrono.**
   - `TelaDaLoja.tsx` passa a buscar e chamar `<PerfilDaLoja>`.
   - Sem mudança visual. A guarda do `sobre-da-loja.test.tsx` sobre o fechamento continua passando.
   - Teste: `tests/vitrine-loja-perfil.onp.test.tsx` (AC-10718 por leitura do fonte, prévia e rota usando `TelaDaLoja`).
2. **T-10702 — Identidade e situação no desenho do Stitch.**
   - `ApresentacaoDaLoja.tsx` ganha: capa (foto do celular e do computador, véu), logo ou iniciais, nome em `h1`, boas-vindas e selo (`atributosDoSelo`, com os textos atuais).
   - Linha de ações: `BotaoFavoritar` (variante "seguir", sem contador), ícone de WhatsApp (`numeroDoWhatsApp`, só com número) e Compartilhar.
   - CTA "Ver o {rótulo} completo (N itens)".
   - Também mudam `narrativa.css` e `BotaoCompartilharLoja.tsx` (novo).
   - Testes: `vitrine-loja-identidade.onp.test.tsx` (AC-10701/02/03/12) e `vitrine-loja-situacao.onp.test.tsx` (AC-10704–07).
   - Testes antigos só com a equivalência declarada.
3. **T-10703 — Condições e contato.**
   - Novo `CondicoesDaLoja.tsx`: cartões Entrega/Retirada, Endereço (com "Abrir no mapa" via `enderecoNoMapa`) e Pagamento (nome, sem chave).
   - Novo `ContatoDaLoja.tsx`: "Fale com a loja no WhatsApp", texto genérico.
   - Sempre há um link para `/sobre`, e o bloco de detalhes sai do painel.
   - `SecoesDoSobre.tsx` exporta o nome das formas de pagamento.
   - Ajuste declarado em `apresentacao-da-loja.test.tsx` ("entrega e endereço moram no painel" passa a valer para os cartões) e nos BLOCOS da `EntradaDaLoja`.
   - Teste: `vitrine-loja-condicoes.onp.test.tsx` (AC-10708/09/10/11/20).
4. **T-10704 — Faixa de chips e destaques.**
   - `PerfilDaLoja` monta a faixa com `Chip` `href` (#104): `#destaques`, `#publicacoes` e `/sobre` com `data-abre-sobre`.
   - `Destaques` aparece só com itens; `vitrine.css` recebe as regras do perfil.
   - Teste: `vitrine-loja-destaques.onp.test.tsx` (AC-10712/13 e o HTML sem JS).
5. **T-10705 — Publicações e Sobre.**
   - `PostsDaLoja` é reusado dentro de `<section id="publicacoes">`, no `PerfilDaLoja`.
   - O título fica no estilo do Stitch, em `feed.css`, sob `.sc-pagina-da-loja .sc-feed--perfil`, depois do #106.
   - O Sobre segue como janela.
   - Teste: `vitrine-loja-publicacoes.onp.test.tsx` (AC-10714/15/21).
6. **T-10706 — Guardas.**
   - `vitrine-loja-guardas.onp.test.tsx` (AC-10717/18/19) verifica no HTML e no fonte que não há nota, avaliações, verificada, mais vendidos, parcelas, contador de favoritos, NF-e, compra protegida, placa, chassi ou técnico.
   - Confirma também a mesma composição na prévia e o Favoritar sem contador.

## Verificação

- `pnpm typecheck`, `pnpm lint`, `pnpm exec vitest run --project web apps/web/tests/vitrine-loja-` e os testes antigos `apresentacao-da-loja`, `selo-de-status`, `entrada-da-loja`, `sobre-da-loja`, `previa-da-loja`, `vitrine-acessibilidade` e `css-da-loja-sem-verde-fixo`.
- `pnpm format:check` nos arquivos alterados.
- Conferência visual: `pnpm dev`, depois `/loja/<apelido>` em 390 px e 1280 px, nos temas claro e escuro, com e sem JS, e `/previa/vitrine`. As provas de axe, de 344 px e de contraste são do #114.
- Sem commit nem push. Ao fim, `card_report`.
