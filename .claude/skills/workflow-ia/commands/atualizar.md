---
description: Atualiza o Workflow IA num projeto que já o usa (plugin na máquina, migração do config preservando os ajustes do humano, atalho wf, CLAUDE.md, .gitignore e git hooks) — nunca faz commit
argument-hint: "[--confirmar-ci] [--set chave=valor]"
---

Atualize o Workflow IA do projeto atual. Opções pedidas pelo usuário: $ARGUMENTS

Carregue a skill `workflow-ia:atualizacao-projeto` e siga os passos dela, na ordem:

1. Diagnostique: versão do plugin instalado × a da fonte, `versao` do `.workflow-ia/config.json` × a atual, working tree limpo e nenhuma task ativa (`.workflow-ia/wf status`). Com task ativa, pare e explique.
2. Se o plugin instalado for mais antigo que a fonte: `claude plugin marketplace update fabriki` e `claude plugin update workflow-ia@fabriki` (ou passe os comandos ao usuário, se o `claude` não estiver disponível).
3. Rode `node "${CLAUDE_PLUGIN_ROOT}/scripts/instalar.mjs" "$(pwd)" --atualizar --simular $ARGUMENTS`, mostre o diff do config (o que muda e o que é **preservado**) e, só com o "sim" do usuário, rode sem `--simular`. Workflows de CI existentes só são sobrescritos com `--confirmar-ci`, depois de o usuário ver o diff.
4. Confira com `.workflow-ia/wf doctor` (inclui a seção `host`) e rode uma vez cada comando do gate.
5. **Nunca faça commit.** Termine com o resumo, a lista de arquivos alterados e o comando de commit sugerido.

Para instalar pela primeira vez (projeto sem `.workflow-ia/`), use `/workflow-ia:instalar`.
