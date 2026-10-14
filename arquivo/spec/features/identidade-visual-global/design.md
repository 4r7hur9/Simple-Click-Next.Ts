# Design — Identidade visual global

## Papel no plano geral

Esta feature é o **PRÉ-0** da continuação visual. Ela não bloqueia banco, API ou
regra de negócio pura; bloqueia novas telas e a revisão final das existentes,
para nenhuma superfície nascer com uma segunda linguagem.

## Fonte única

```text
manual + kit oficial
        ↓
tokens brutos da marca + tokens semânticos em theme.css
        ↔ espelho TypeScript para contraste no servidor
        ↓
CSS dos componentes + @theme inline do Tailwind 4
        ↓
telas e vitrine interna de validação
```

Os valores oficiais são preservados como tokens brutos. Papéis semânticos
podem usar derivados acessíveis quando um tom oficial não alcança contraste —
por exemplo, Verde Click não serve como texto pequeno sobre branco, mas serve
como fundo com tinta tecnológica. Toda derivação é testada e continua vindo da
única folha de tema.

## Direção implementável do manual

- Verde Click é energia e ação principal; Preto Tecnológico/Grafite são a
  âncora; Névoa e Branco são superfícies; Mint é apoio.
- Space Grotesk desenha títulos/destaques; Inter desenha textos/interface.
- Asectica existe apenas nos contornos vetoriais oficiais.
- Composição usa 12 colunas e ritmo principal de 8px, com poucas peças e
  margens amplas.
- Fragmentos do símbolo podem aparecer como bloco, recorte ou fluxo, sem virar
  ruído decorativo.
- Ícones têm traço consistente, cantos controlados, leitura imediata e nenhum
  ornamento gratuito.
- Textura é secundária e gradiente é especial; nenhum dos dois substitui a
  marca sólida ou vira padrão de componente.

## Regra de legibilidade

- Conteúdo sempre repousa sobre superfície sólida; fundo decorativo fica fora
  da área de leitura ou é interrompido por uma superfície opaca.
- Botão nunca usa transparência, vidro, `backdrop-filter` ou contorno como única
  separação do fundo. Ação primária e secundária têm preenchimento opaco.
- Texto auxiliar fica livre na composição. Cápsulas, chips e badges totalmente
  arredondadas não são recurso decorativo do sistema.
- Estado não depende só de cor: combina texto claro com ícone, sem badge. Um
  aviso pode usar bloco opaco completo quando precisar de destaque, mas não
  cápsula, pílula ou transparência.
- Raio serve à ergonomia e à hierarquia, não para transformar cada texto em
  pílula. Botões usam raio fixo de 6px.
- Textura e gradiente só aparecem como apoio fora do caminho da leitura; brilho,
  sombra e desfoque nunca reduzem contraste.

## Sequência

1. Ativos e tokens oficiais.
2. Tipografia oficial.
3. Ponte semântica do Tailwind.
4. Base global.
5. Componentes e personalização por loja.
6. Vitrine visual, testes, build, `verify` e auditoria.

Ativos/tokens são a raiz. Tipografia pode avançar em paralelo com a ponte do
Tailwind depois que os nomes dos tokens forem congelados. Base global,
componentes e vitrine integram em sequência para evitar duas tarefas editando a
mesma fundação ao mesmo tempo.
