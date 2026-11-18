# Constituição — SimpleClick (redesign Stitch) — v1.0.0

<!--
  Princípios inegociáveis do redesign Stitch e dos cards #103–#126.
  Numeração P-101…P-199: os P-001…P-014 pertencem à constituição antiga,
  arquivada em arquivo/spec/constituicao.md, e ainda aparecem em títulos de
  testes legados (@principle:P-0xx). Não reutilize esses números.
  Níveis: [DEVE] obrigatório · [RECOMENDADO] forte · [PODE] permitido.
  Todo [DEVE] tem verificação executável. Regex e glob ficam SEMPRE entre
  crases; um glob por linha (o motor não aceita chaves {a,b}).
  Princípio novo ou mudança aqui: só com pedido ao gerente e decisão do
  usuário (ver .spec/README.md).
-->

## P-101 [DEVE] Todo requisito tem prova executável

Nenhuma feature é declarada implementada ou auditada sem o audit em modo CI
sair limpo (exit 0). Spec em planejamento não é feature pronta.

- verificação(gate): intrínseca ao audit

## P-102 [DEVE] A cor da marca é uma só: #B7FF00

O verde oficial vem de `--marca-verde-click` / `--cor-primaria`
(packages/ui/styles/theme.css), `PALETA_OFICIAL` (packages/ui/src/tokens.ts) e
`COR_DE_DESTAQUE_PADRAO` (packages/contracts/src/tema.ts). O `#b2f800` e o
`primary: #ffffff` do front matter do Stitch não são adotados.

- verificação(proibido): `[bB]2[fF]8[0]{2}` em `apps/web/src/**`
- verificação(proibido): `[bB]2[fF]8[0]{2}` em `packages/ui/src/**`
- verificação(proibido): `[bB]2[fF]8[0]{2}` em `packages/ui/styles/**`

## P-103 [DEVE] Nenhum recurso externo do export do Stitch

O HTML exportado usa Tailwind por CDN, Material Symbols e imagens geradas em
googleusercontent. Nada disso entra no produto: fontes por next/font, ícones
do pacote de ícones do projeto, imagens das próprias lojas.

- verificação(proibido): `cdn[.]tailwindcss[.]com|lh3[.]googleusercontent[.]com|Material[+ ]Symbols` em `apps/web/src/**`
- verificação(proibido): `cdn[.]tailwindcss[.]com|lh3[.]googleusercontent[.]com|Material[+ ]Symbols` em `packages/ui/src/**`
- verificação(proibido): `cdn[.]tailwindcss[.]com|lh3[.]googleusercontent[.]com|Material[+ ]Symbols` em `packages/ui/styles/**`

## P-104 [DEVE] O SimpleClick não vira sistema automotivo

Diretriz do usuário (29/10/2026): nada de compatibilidade veicular, consulta
de placa ou chassi, "garagem ativa" ou funções de oficina. Lojas de autopeças
continuam vendendo normalmente, com o mesmo catálogo de qualquer ramo.

- verificação(proibido): `[Cc]hassi|[Cc]ompatibilidade[ _-]?[Vv]eicular|[Cc]onsultar?[ _-]?[Pp]laca|[Gg]aragem[ _-]?[Aa]tiva` em `apps/web/src/**`

## P-105 [RECOMENDADO] Dados do Stitch são ilustrativos

CNPJ, telefones, endereços, notas, contagens, prazos ("45 min"), garantias,
"10x sem juros", cupons e promessas dos mockups nunca viram conteúdo de
produção. Universokar/autopeças nos mockups são só exemplo visual.

## P-106 [RECOMENDADO] Contraste e toque

Texto sobre o verde da marca é escuro (#0B0F0D ou o token de texto sobre a
cor primária) e todo alvo de toque tem no mínimo 48×48px. A prova por teste
(`@principle:P-106`) fica com o card #114.

## P-107 [RECOMENDADO] Função "A decidir" só entra com decisão registrada

Funções dos cards #115–#120 e #123–#126 só podem ser implementadas depois que
o usuário marcar a pergunta correspondente como respondida. Nenhuma tarefa do
redesign depende delas; o bloco visual fica oculto até a decisão.

## P-108 [RECOMENDADO] Tokens visuais só pela fonte única

Cores, raios, espaçamentos e fontes novos entram por
packages/ui/styles/theme.css e packages/ui/src/tokens.ts (com o teste de
sincronia packages/ui/tests/tokens.test.ts), nunca soltos em componentes.
