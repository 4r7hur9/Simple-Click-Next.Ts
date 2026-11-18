# Tasks: Planejamento do redesign Stitch

> feature: stitch-planejamento

<!--
  Card #103 — bloco de códigos 10301 a 10399.
  As tarefas ficam [pendente] de propósito: esta feature é de planejamento e
  os critérios ainda não têm prova executável (ASM-10303). O motor só aceita
  [concluida] com prova PASS registrada por `onp-spec verify`.
  Os documentos descritos abaixo foram redigidos em 05/11/2026 e aguardam a
  revisão do dono do produto.
-->

## T-10301 — Configuração do motor e criação da pasta .spec [pendente]

- Refs: US-10304, AC-10308, AC-10309
- Arquivos: onpspec.config.json, .spec/verification/.gitkeep
- Notas: testes lidos só com nome `*.onp.test.ts(x)` e `e2e/**/*.onp.spec.ts`;
  srcGlobs vazio (projeto legado); verify roda vitest nos projetos web e unit
  com saída em .spec/raw/.

## T-10302 — Constituição P-101 a P-108 [pendente]

- Refs: US-10305, AC-10310, AC-10308
- Arquivos: .spec/constituicao.md
- Notas: cor única, sem recursos externos do Stitch, sem funções
  automotivas (verificação por busca); dados ilustrativos, contraste, funções
  "A decidir" e tokens como recomendação.

## T-10303 — Convenção do time: pastas, blocos de códigos e regras [pendente]

- Refs: US-10304, AC-10307, US-10303, AC-10306
- Arquivos: .spec/README.md
- Notas: tabela card → pasta → bloco para #103–#126; receita de criação sem a
  numeração automática do motor; fase só de especificação, sem commit, sem
  troca de branch e sem worktrees.

## T-10304 — Matriz das telas, ondas e donos de arquivo [pendente]

- Refs: US-10301, AC-10301, AC-10302, US-10302, AC-10303, AC-10304, US-10303, AC-10305, AC-10306
- Arquivos: .spec/features/stitch-planejamento/design.md
- Notas: origem e sha256 do ZIP, mapa de rotas, cor e tipografia, matriz por
  bloco, jornada do dono, ondas, donos de arquivo e critérios de prova.

## T-10305 — Especificação do planejamento [pendente]

- Refs: US-10301, US-10302, US-10303, US-10304, US-10305
- Arquivos: .spec/features/stitch-planejamento/spec.md, .spec/features/stitch-planejamento/tasks.md
- Notas: histórias, critérios Dado/Quando/Então, suposições e perguntas em
  aberto para o dono do produto decidir.
