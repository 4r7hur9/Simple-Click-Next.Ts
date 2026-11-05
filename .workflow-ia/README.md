# Workflow IA neste projeto

- `config.json`: comandos do gate, limites do pipeline, board, proteções. **Editado só por humanos.**
- `wf`: atalho da CLI (`.workflow-ia/wf ajuda`).
- `tasks/<ID>/`: estado, spec, plano, findings, provas e relatório de cada task (fora do git).
- `runtime/`: dados da sessão atual (fora do git).

Executar um card: `/workflow-ia:task <ID | URL | texto>` no Claude Code.
Abrir PR e fazer merge são sempre do humano.
