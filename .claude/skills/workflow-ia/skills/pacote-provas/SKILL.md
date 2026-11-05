---
name: pacote-provas
description: "Definition of Done verificável do Workflow IA: quais provas geradas por ferramenta cada critério exige (matriz critério→teste, RED antes do GREEN, testes não enfraquecidos, gate verde em checkout limpo, segurança, autorização, performance, findings, verificação independente), como a CLI wf gera e confere cada uma, o formato do verificacao-julgamento.json e onde guardar evidências extras (EXPLAIN, bundle, Lighthouse). Use na verificação final, ao montar o manifest, quando o verificador-final julgar a task ou quando alguém perguntar 'como provar que está pronto'. Não use para escrever o PR/relatório (use entrega-relatorio)."
---

# Pacote de provas

"Está feita" não é opinião do agente: é um conjunto de artefatos gerados por ferramenta, conferidos por um verificador que não participou da implementação. A CLI `wf` recusa `veredito CONCLUIDA` enquanto o manifest tiver item faltando.

## Regras inegociáveis

1. **Prova é artefato de ferramenta**: log de comando, JSON da CLI, relatório de teste. Texto escrito pelo agente não é prova.
2. **Provas apontam para commits.** O RED aponta para o commit dos testes; a verificação, para o HEAD final. Mudou o código depois da verificação? A verificação precisa ser refeita.
3. **Checkout limpo.** A verificação final roda sem alterações pendentes (`wf verificar-limpo` recusa o contrário).
4. **O verificador confere, não confia.** Ele reexecuta o gate, relê o card original e olha o código de cada correção.
5. **Evidência extra** (EXPLAIN, bundle, Lighthouse, prints) vai para `.workflow-ia/tasks/<ID>/provas-extras/`. A pasta `evidencias/` é exclusiva da CLI.

## Definition of Done → prova

| Item do manifest | Como é provado | Quem gera |
|---|---|---|
| `criterios` | Todo `CA-n` do spec tem teste com a tag `[CA-n]` e foi julgado `atendido: true` | `wf matriz` + verificador |
| `tdd` | `evidencias/red.json`: testes falharam no commit dos testes. O `wf red` é focado: roda só os arquivos de teste da task (`modo: "focado"`, com a lista em `arquivos`); `wf red --completo` roda a suíte inteira (`modo: "completo"`). O critério não muda: a falha precisa ser de asserção | `wf red` |
| `testes-integros` | `evidencias/testes-diff.json` sem remoções, skips novos ou critérios perdidos; queda de asserts justificada | `wf verificar-limpo` + verificador |
| `gate-limpo` | `evidencias/verificacao/gate.json`: `ok`, `limpo`, `commit == HEAD` e nenhuma etapa com `origem: "cache"` | `wf verificar-limpo` |
| `gate:<etapa>` | Log de cada etapa (typecheck, lint, build, unitário, integração); com sub-etapas (`teste-e2e:pdv-web`), todas verdes | `wf verificar-limpo` |
| `gate:teste-e2e` | Log do E2E; obrigatório quando `UI: sim` (configurável) | `wf verificar-limpo` |
| `seguranca:*` | Logs de SAST, dependências e segredos | `wf verificar-limpo` |
| `seguranca:autorizacao` | `testesAutorizacao: "ok"` com os testes citados, ou `"nao-aplicavel"` com motivo | verificador |
| `performance` | `performance.status` `ok` com arquivos em `provas-extras/`, ou `nao-aplicavel` | verificador |
| `findings` | Zero urgentes/altos abertos ou não confirmados; médios corrigidos ou em dívida técnica | `wf findings` |
| `verificacao` | `verificacao.json` com `resultado: aprovado` no HEAD | `wf verificacao registrar` |
| `decisoes` | `decisoes.md` existe | spec-analyst e demais agentes |

## Cache do gate no loop (0.6.0)

Dentro do loop, o `wf gate` é incremental: uma etapa que passou é reaproveitada ("ok (cache, iteração N, <commit>)") quando a impressão digital dos insumos dela não mudou. Isso economiza tempo entre rodadas, mas **não é prova final**:

- **Só vale no loop.** `wf verificar-limpo` roda o gate completo em checkout limpo, sem cache, e o manifest reprova o `gate-limpo` se alguma etapa da verificação tiver `origem: "cache"`.
- **Sem `insumos` declarados no config, a etapa sempre roda.** Etapa que falhou sempre roda de novo.
- **Integridade:** o cache (`evidencias/gate-cache.json`, que só a CLI grava) só é aceito se o commit dele é ancestral do HEAD, se nenhum arquivo dos insumos mudou entre os dois (`git diff --name-only`) e se o hash dos insumos recalculado no HEAD confere. Rebase, merge de base nova, commit de merge no intervalo, mudança do `config.json`, de lockfile, de `gate.insumosGlobais` ou de ajuste invalidam o cache inteiro. Árvore suja desliga o cache.
- **Transparência:** cada etapa do `gate.json` tem `origem` (`execucao` | `cache`), `motivo` e, no cache, a origem (`cache.iteracao`, `cache.commit`, `cache.log`). A saída do `wf gate` traz a tabela "etapa | rodou ou cache | duração | motivo" (também em `evidencias/<rótulo>/gate.md`), e o manifest soma o tempo economizado em `resumo.gateCache`.
- `wf gate --sem-cache` roda tudo; `wf gate --so-falhas` roda só as que falharam e as invalidadas pelo diff; `wf gate --etapas X` roda só as pedidas e, no loop com árvore limpa, as demais obrigatórias só vêm do cache. `--so-falhas` e `--etapas` só contam como gate da iteração quando o cache cobre todas as obrigatórias que não rodaram (senão devolvem `naoCobertas`, que ficam com `status: "nao-executada"`); `--etapas` com `--sem-cache` ou `--rotulo` nunca conta.
- `{app}` nos insumos de uma sub-etapa vira o sufixo dela (`teste-e2e:pdv-web` → `apps/pdv-web/**`), na mesma expansão usada no hash e no diff; em etapa sem sufixo, a etapa fica sem cache (sempre roda).
- O verificador não confia no cache: julga sempre pelo `verificacao/gate.json`.

## Desempenho do loop (0.6.0)

No `gate.json` do loop podem aparecer etapas que não são falha do código:

- `status: "nao-executada"` com `motivo: "falha anterior em <etapa>"`: o falhar rápido (`gate.falharRapido`) cortou as ondas seguintes depois de uma obrigatória vermelha. Essa etapa não abre nem verifica finding.
- `status: "sem-vaga"`: a etapa pesada não conseguiu vaga de recurso. É capacidade da máquina, não defeito, e não abre finding. Com etapa obrigatória `sem-vaga`, o gate não conta como o da iteração.
- `invalido` (com `ok: false`): o HEAD mudou enquanto o gate rodava. O `commit` do `gate.json` é o do início, e o resultado não vale para nenhum dos dois commits: não mexe em findings nem no cache e não fecha a iteração. Na verificação, um `gate.json` assim não serve de prova (rode `wf verificar-limpo` de novo). `limpo: false` com `arvoreMudou` indica que um arquivo versionado foi editado durante o gate.
- `status: "pulada-por-dependencia"` (`origem: "dependencia"`, 0.7.0): a etapa declara `dependeDe` e uma dependência não passou (falhou, timeout, sem vaga ou também pulada). Ela não pegou vaga nem executou, então **não está comprovada**: reprova o gate como uma falha, o manifest a deixa `faltando` (ou `alerta`, se opcional) com a causa raiz no detalhe, e ela não abre nem fecha finding (o finding é da dependência). `falhas` lista só as falhas reais; `puladas` e `resumoPuladas` ("N etapas puladas porque <etapa> falhou") listam as puladas. Vale também na verificação.
- `origem: "ci"` (modo CI, 0.7.0): a etapa não rodou na máquina; foi lida do run do GitHub Actions disparado pela etapa sintética `teste-ci` (`ci: { sha, headSha, runId, url, jobs }`; o `headSha` é o que o provedor disse que o run testou e tem de ser o HEAD junto com o `sha`, `ci.json` com URL, SHA, resultado por job e duração). Só é prova se `ci.sha == commit == HEAD` e `evidencias/verificacao/ci.json` tem o mesmo SHA: o manifest (`gate:<etapa>`, `gate-limpo` e o item `ci`) e o `wf verificacao registrar` recusam SHA diferente. `status: "ci-indisponivel"` na `teste-ci` (gh, rede, cota, workflow, timeout) não é reprovação: nada foi provado, nenhum finding abre, e a verificação precisa ser repetida (ou rodar com `WF_GATE_CI_FALLBACK=local`). Desde a 0.8.0 a prova pode vir de um run do mesmo SHA já existente (`ci.json.origemRun`: `reaproveitado`, `anexado` ou `rerun-falhas`; `runs[]` com todos os runs usados e `tentativa`): vale igual, pelo mesmo critério de SHA, e o relatório cita os runs e a tentativa. Desde a 0.9.0, com `ci.criterioReaproveitar: "conteudo"`, um app pode vir de um dispatch verde de um commit anterior da mesma branch com o mesmo conteúdo (`ci.json.criterio: "conteudo"`, `ci.json.conteudo.apps.<app>` com `sha`, `hash`, `hashHead`, `hashWorkflow`; etapa com `ci.criterio`, `ci.shas` e `ci.conteudo`): o manifest e o `wf verificacao registrar` só aceitam depois de recalcular os hashes no HEAD; o relatório cita o run, o commit e os caminhos comparados.
- `tentativas[]` e `porCarga`: a etapa falhou por carga (timeout, porta, memória, banco) e foi repetida automaticamente (`gate.repetirPorCarga`). Cada tentativa guarda o próprio log.

Na verificação (`wf verificar-limpo`, `completo: true`) não há falhar rápido nem cache: todas as etapas rodam. A repetição por carga continua valendo, e as tentativas ficam registradas no `gate.json`. `wf checar` é só um atalho de feedback durante a implementação e não é prova.

## Formato do verificacao-julgamento.json

```json
{
  "resultado": "aprovado",
  "criterios": [
    { "id": "CA-1", "atendido": true, "testes": ["tests/integration/vendas.test.ts › [CA-1] registra venda"], "observacao": "" },
    { "id": "CA-3", "atendido": true, "testes": ["tests/integration/vendas.test.ts › [CA-3] vendedor de outra loja recebe 404"], "observacao": "" }
  ],
  "findingsConfirmados": ["F-003", "F-007"],
  "findingsNaoConfirmados": [{ "id": "F-009", "motivo": "índice criado, mas a query ainda usa lower() e não aproveita o índice" }],
  "novosProblemas": [],
  "testesAutorizacao": "ok",
  "performance": { "status": "ok", "evidencias": ["provas-extras/explain-listar-vendas.txt"] },
  "testesEnfraquecidos": false,
  "justificativaTestes": "a queda de 2 asserts em produto.test.ts veio da fusão de dois casos equivalentes (commit 9e7b10)",
  "observacoes": ""
}
```

- `novosProblemas` segue o formato de finding da skill `triagem-findings`, com categoria `verificacao/<tema>` ou a área certa.
- O resultado registrado é **reprovado** automaticamente se o gate falhar, se faltar julgar algum CA, se sobrar bloqueante, se houver teste enfraquecido ou se o commit mudou.

## Como produzir evidência de performance

- **Query nova ou alterada:** rode `EXPLAIN (ANALYZE, BUFFERS)` no banco de teste com volume representativo (seed) e salve em `provas-extras/explain-<nome>.txt`. Confirme que o plano usa índice (sem `Seq Scan` em tabela grande).
- **Tela nova:** tamanho do bundle da rota (saída do `next build`) salvo em `provas-extras/bundle.txt`. Lighthouse, se disponível, em `provas-extras/lighthouse-<rota>.json`.
- **Endpoint crítico:** tempo médio do teste de integração ou um k6 curto, se configurado.
- **Nada disso se aplica** (texto, refactor sem query)? `"status": "nao-aplicavel"`, com o motivo em `observacoes`.

## Referências

- [references/verificacao-passo-a-passo.md](references/verificacao-passo-a-passo.md): roteiro do verificador-final. Leia antes de julgar.
