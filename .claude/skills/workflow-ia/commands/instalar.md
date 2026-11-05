---
description: Instala o Workflow IA no projeto atual, novo ou em andamento (se o projeto já tem .workflow-ia/, use /workflow-ia:atualizar) (prepara git e scripts, detecta o stack, gera config, atalho wf, .gitignore, CLAUDE.md e, opcionalmente, CI)
argument-hint: "[--ci] [--compartilhar-plugin] [--marketplace owner/repo]"
---

Instale o Workflow IA no projeto atual. Opções pedidas pelo usuário: $ARGUMENTS

Se o projeto já tem `.workflow-ia/config.json`, não reinstale: use `/workflow-ia:atualizar` (skill `workflow-ia:atualizacao-projeto`), que preserva os ajustes do humano.

Carregue a skill `workflow-ia:instalacao-projeto` e siga os passos dela, na ordem:

1. Diagnostique o tipo de projeto (novo ou em andamento) e os pré-requisitos.
2. Prepare o que faltar (git, primeiro commit, scripts de teste sem watch), sempre com o "sim" do usuário.
3. Rode o instalador primeiro com `--simular` e depois de verdade: `node "${CLAUDE_PLUGIN_ROOT}/scripts/instalar.mjs" "$(pwd)" $ARGUMENTS`.
4. Resolva as pendências com `--set`/`--forcar` (nunca editando `.workflow-ia/config.json` à mão) e rode `.workflow-ia/wf doctor`.
5. Não faça commit. Termine com o resumo, a lista de arquivos para o usuário revisar e commitar, a recomendação de proteger o branch base e o primeiro card sugerido.
