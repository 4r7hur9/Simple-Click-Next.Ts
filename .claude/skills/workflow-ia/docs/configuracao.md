# Configuração e CLI

## `.workflow-ia/config.json`

Gerado pelo instalador e **editado só por humanos** (os hooks impedem o agente de alterá-lo). Valores omitidos usam o padrão de `scripts/lib/core.mjs`.

`versao` é a versão do **schema** (formato) do config (hoje `10`), não a versão do plugin. A versão do plugin que gravou o config fica em `pluginVersao` (ex.: `"0.9.0"`): o instalador e o `/workflow-ia:atualizar` a regravam sempre (não é ajuste do humano nem aceita `--set`) e o `wf doctor` mostra se ela difere do plugin em uso. O instalador em modo `--atualizar` (`/workflow-ia:atualizar`) migra de uma versão para a seguinte sem perder o que foi ajustado (migrações em `scripts/lib/migracoes.mjs`, cada uma com teste):

- `1 → 2` acrescenta as seções `host` e `githooks` e `.git/hooks/**` em `protecoes.arquivosSomenteHumano`;
- `2 → 3` acrescenta a seção `interacao` (decisão humana pelo chat);
- `3 → 4` remove `orcamento` e cria `limites`. Aqui a migração **sobrescreve de propósito**: "iteração" mudou de significado (agora é uma rodada de code review), então os valores antigos de `orcamento.P/M/G` não valem mais; só `maxBloqueiosDeParada` é preservado. Também renomeia `severidades.corrigirSeHouverOrcamento` para `severidades.corrigirNoLoop`. O que foi removido aparece no relatório da atualização.
- `4 → 5` troca `comandos.sast` de `semgrep scan --config auto --error --quiet --metrics=off` (o padrão até a 0.5.1, que o semgrep recusa: `--config auto` exige métricas ligadas) para `semgrep scan --config p/default --error --quiet --metrics=off`. Só troca o valor exato antigo; um comando ajustado pelo humano fica como está.
- `5 → 6` acrescenta o bloco `revisao` (revisor de operação condicional, ver abaixo). Se o humano já tinha um bloco `revisao`, só preenche as chaves que faltam.
- `6 → 7` (0.6.0) acrescenta, **desligado**, o desempenho do loop: `gate.falharRapido: false`, `gate.repetirPorCarga: 0`, `gate.paralelismo: 1`, o bloco `recursos` (com `vagasPesadas: 0`) e `protecoes.padroesE2E`. Acrescenta também o gate incremental (`gate.cacheEntreIteracoes`, `gate.insumosGlobais`) e `provas.redFocado: false` (o `wf red` continua completo, como antes, até o humano ligar com `--set provas.redFocado=true`). Não mexe nas etapas do humano. O relatório da atualização sugere (`sugeridos`) os valores que uma instalação nova grava (`--set gate.falharRapido=true` etc.).
- `7 → 8` (0.7.0) sobe a versão e acrescenta o bloco `ci` **desligado** (`ci.ativo: false`; um `ci` escrito pelo humano fica como está). `gate.etapas[].dependeDe` é opcional e nenhuma etapa ganha dependência sozinha. Um config sem os campos roda o gate exatamente como antes, tudo na máquina.
- `8 → 9` (0.8.0) acrescenta `ci.reaproveitar: true` e `ci.repetirFalhas: 1` só quando faltam (CI econômico).
- `9 → 10` (0.9.0) acrescenta `ci.criterioReaproveitar: "commit"` quando falta: quem migra continua com o reaproveitamento da 0.8.0 (só o run do mesmo SHA). Um valor que o humano já escreveu fica como está. Instalação nova grava `"conteudo"`. Para ligar em projeto existente: `--set ci.criterioReaproveitar=conteudo` (ou edite o config), `wf ci gerar` e copie o yml novo.

### `comandos`

| Chave | Uso | Exemplo |
|---|---|---|
| `instalar` | Instalar dependências (CI) | `pnpm install --frozen-lockfile` |
| `typecheck` | Gate | `pnpm typecheck` |
| `lint` | Gate | `pnpm lint` |
| `lintArquivo` | Hook pós-edição; `{arquivo}` é substituído | `pnpm exec eslint --fix {arquivo}` |
| `formatarArquivo` | Hook pós-edição | `pnpm exec prettier --write --ignore-unknown {arquivo}` |
| `testeUnitario` | Gate e RED | `pnpm test:unit` |
| `testeIntegracao` | Gate e RED | `pnpm test:integration` |
| `testeE2E` | Gate e RED | `pnpm test:e2e` |
| `testeArquivo` | Agentes rodando um arquivo; `wf red` focado (um por arquivo) | `pnpm exec vitest run {arquivo}` |
| `testeArquivos` | `wf red` focado: os testes da task numa execução; `{arquivos}` vira a lista com aspas | `pnpm exec vitest run {arquivos}` |
| `testeE2EArquivos` | `wf red` focado: os E2E da task, quando `provas.exigirE2E` pede (sem ele, roda o `testeE2E` inteiro) | `pnpm exec playwright test {arquivos}` |
| `typecheckArquivos` | `wf checar`: typecheck só do app dos arquivos (sem ele, o `typecheck` inteiro) | `node scripts/typecheck-app.mjs {arquivos}` |
| `testesRelacionados` | `wf checar`: testes ligados aos arquivos alterados | `pnpm exec vitest related --run {arquivos}` |
| `build` | Gate | `pnpm build` |
| `sast` | Gate (opcional) | `semgrep scan --config p/default --error --quiet --metrics=off` |
| `dependencias` | Gate (opcional) | `pnpm audit --audit-level high --prod` |
| `segredos` | Gate | `gitleaks detect --no-banner --redact --log-opts="{base}..HEAD"` (só os commits do branch da task; `{base}` vira a ref do branch base) |

O gate roda com `CI=1`: Vitest e Jest executam uma vez, sem watch.

### `gate`

```json
{
  "timeoutSegundos": 900,
  "etapas": [
    { "nome": "typecheck", "comando": "@typecheck", "obrigatoria": true },
    { "nome": "teste-e2e", "comando": "@testeE2E", "obrigatoria": true, "timeoutSegundos": 1200 }
  ]
}
```

- `@nome` referencia `comandos.nome`; também é possível escrever o comando literal.
- Falha em etapa obrigatória vira finding **urgente**; em etapa opcional, **médio**.
- Etapa obrigatória sem comando faz o `wf doctor` reprovar. O instalador marca como opcional o que não conseguiu configurar e lista a pendência.

#### Gate incremental no loop (`insumos`, `cacheEntreIteracoes`, `insumosGlobais`)

Dentro do loop, o `wf gate` reaproveita o resultado de uma etapa que passou quando os arquivos de que ela depende não mudaram, e roda de novo só as que falharam ou que o diff da correção afetou. Para isso, cada etapa declara os seus **insumos** (globs, relativos à raiz):

```json
{
  "cacheEntreIteracoes": true,
  "insumosGlobais": ["tsconfig.base.json", "turbo.json"],
  "etapas": [
    { "nome": "typecheck", "comando": "@typecheck", "obrigatoria": true,
      "insumos": ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}", "**/tsconfig*.json", "**/package.json"] },
    { "nome": "teste-integracao:pdv-api", "comando": "npm -w apps/pdv-api run test:integration", "obrigatoria": true,
      "insumos": ["apps/pdv-api/**", "packages/**", "prisma/**"] },
    { "nome": "teste-e2e:pdv-web", "comando": "npm -w apps/pdv-web run e2e", "obrigatoria": true,
      "insumos": ["apps/pdv-web/**", "packages/ui/**", "e2e/pdv-web/**"] },
    { "nome": "teste-e2e:pdv-api", "comando": "npm -w apps/pdv-api run e2e", "obrigatoria": true,
      "insumos": ["apps/pdv-api/**", "prisma/**", "e2e/pdv-api/**"] },
    { "nome": "segredos", "comando": "@segredos", "obrigatoria": true }
  ]
}
```

- **Sem `insumos`, a etapa sempre roda.** É o padrão, e as etapas geradas pelo instalador não declaram insumos: um config sem mapeamento se comporta como antes. Declare só o que você tem certeza; um insumo esquecido faz o loop reaproveitar uma etapa que deveria rodar. A verificação final roda tudo de qualquer jeito.
- **Etapa que falhou sempre roda de novo**, inclusive quando a falha ficou fora do cache: com finding `gate:<etapa>` aberto, ou com falha no último gate (ex.: `--rotulo`) ou na verificação mais nova que a entrada do cache. Uma etapa que passou vem do cache só se o commit em que ela passou é ancestral do HEAD, se nenhum arquivo dos insumos dela mudou desde então (`git diff --name-only --no-renames`) e se o comando e a lista de insumos são os mesmos.
- **Globs dos insumos.** `./` no começo é ignorado, `src/` vale `src/**`, e um glob sem curinga casa o próprio caminho e tudo abaixo dele (`src` ≡ `src/**`; `package.json` continua sendo o arquivo). `libs/sub/**` também casa o submódulo `libs/sub` (o gitlink). `{a,b}` aceita curingas dentro (`{**/x.ts,src/a/**}`). Se nenhum dos globs de uma etapa casa arquivo do HEAD (erro de digitação, `{app}` errado), a etapa roda sempre, e o `wf doctor` avisa cada glob sem arquivo. Glob inválido (chave sem fechar) reprova o doctor e não casa nada.
- **Etapas que dependem do histórico nunca vêm do cache:** `"cacheavel": false` na etapa, `{base}` ou `WF_BASE` no comando (ex.: `gitleaks --log-opts="{base}..HEAD"`), ou o grupo `segredos` (salvo `"cacheavel": true` explícito). Um commit que acrescenta um segredo e o seguinte que o remove não mudam o diff líquido, mas o segredo continua no histórico.
- **Arquivos ignorados pelo git.** Um arquivo ignorado que casa os insumos (código gerado, `.env`) entra na impressão digital pelo conteúdo: se mudar, a etapa roda. **Limitação:** diretórios ignorados inteiros (`node_modules/`, `.next/`, `dist/`) não entram (seria caro demais); o doctor avisa quando um insumo os alcança. Ponha o que importa (ex.: `.env*`) em `insumosGlobais`, ou use `cacheavel: false` na etapa.
- **Invalidam o cache inteiro:** mudança no `.workflow-ia/config.json`, em lockfile (`protecoes.lockfiles`, em qualquer pasta), em arquivo de `insumosGlobais`; rebase (o commit do cache sai da história), merge de base nova (commit de merge no intervalo ou merge-base diferente) e ajuste pós-entrega diferente. Com alterações não commitadas, o cache não é usado.
- **Monorepo, por app: sub-etapas `prefixo:sufixo`.** Para que uma mudança só em `apps/pdv-api/**` não rode o e2e do `pdv-web`, divida a etapa em um comando por app (`teste-e2e:pdv-web`, `teste-e2e:pdv-api`). Cada sub-etapa tem cache, log (`teste-e2e--pdv-web.log`) e finding próprios; `wf gate --etapas teste-e2e` seleciona todas, e o manifest só aceita `teste-e2e` com todas verdes.
- **`{app}` nos insumos.** Numa sub-etapa, `{app}` vira o sufixo: em `teste-e2e:pdv-web`, `"apps/{app}/**"` vale `apps/pdv-web/**` (a mesma expansão no hash e no diff que invalida o cache). Para não repetir os globs em cada app, declare `gate.insumosPadrao` (opcional), um mapa grupo → globs herdado pelas sub-etapas do grupo que não declaram `insumos` (`insumos` declarado na etapa, mesmo `[]`, vence o padrão):

  ```json
  "insumosPadrao": { "teste-e2e": ["apps/{app}/**", "e2e/{app}/**", "packages/ui/**"] },
  "etapas": [
    { "nome": "teste-e2e:pdv-web", "comando": "npm -w apps/pdv-web run e2e", "obrigatoria": true },
    { "nome": "teste-e2e:pdv-api", "comando": "npm -w apps/pdv-api run e2e", "obrigatoria": true }
  ]
  ```

  `{app}` em etapa sem sufixo é erro no `wf doctor`, e a etapa sempre roda (conservador).
- **`wf gate --etapas X` fecha o gate da iteração quando o cache cobre o resto.** No loop, com árvore limpa, roda só as etapas pedidas; as demais obrigatórias vêm do cache, com as mesmas regras de integridade. Se todas vierem de cache válido, conta como o gate completo da iteração (`it.gate`, `commitGate`, `tentativasGate`): depois de uma falha isolada, `wf gate --etapas teste-e2e` basta. Se alguma não estiver coberta (insumo mudou, sem insumos, commit fora da história), ela não roda (`status: "nao-executada"`), sai em `naoCobertas` e o gate não conta: rode `wf gate`. Com `--sem-cache` ou `--rotulo`, o `--etapas` roda só as pedidas e nunca conta.
- **O que falta.** Com o gate da iteração não verde no HEAD, `wf proximo` e `wf status` trazem `pendencias` (`[{ etapa, situacao, motivo }]`, ex.: "teste-e2e:a — falhou (por carga) às 18:10; typecheck — insumos mudaram em abc1234 (apps/a/x.ts)") e `sugestaoGate`: `wf gate --etapas <pendentes>` quando o cache cobre o resto, senão `wf gate`.
- `cacheEntreIteracoes: false` desliga o cache (o loop volta a rodar tudo sempre). Só o humano edita o config.
- **Só vale no loop.** `wf verificar-limpo` (fase `verificacao`) roda o gate completo em checkout limpo, sem cache: é a prova definitiva.
- **Transparência.** A saída do `wf gate` traz a tabela "etapa | rodou ou cache | duração | motivo" (também em `evidencias/<rótulo>/gate.md`); o cache fica em `tasks/<ID>/evidencias/gate-cache.json` (só a CLI grava), e o `report.md` soma o tempo economizado (`resumo.gateCache` do manifest).
- O `wf doctor` confere o formato (`insumos` e `insumosGlobais` como listas de globs válidos, `insumosPadrao` como mapa de listas, `{app}` só em sub-etapa, nome de sub-etapa válido, `cacheavel` booleano), lista as etapas sem insumos e avisa (sem reprovar) os globs que não casam nenhum arquivo versionado e os insumos que alcançam diretório ignorado.
- Se o HEAD ou arquivos versionados mudarem enquanto o gate roda, nada é gravado no cache (e o gate não conta: ver `wf gate`). Um erro interno no cache nunca derruba o gate: a etapa roda.

#### Desempenho do loop (`falharRapido`, `custo`, `repetirPorCarga`, `paralelismo`, `pesada`)

```json
{
  "timeoutSegundos": 900,
  "falharRapido": true,
  "repetirPorCarga": 1,
  "paralelismo": 2,
  "etapas": [
    { "nome": "typecheck", "comando": "@typecheck", "obrigatoria": true, "custo": "baixo" },
    { "nome": "lint", "comando": "@lint", "obrigatoria": true, "custo": "baixo" },
    { "nome": "teste-unitario", "comando": "@testeUnitario", "obrigatoria": true },
    { "nome": "teste-integracao", "comando": "@testeIntegracao", "obrigatoria": true, "custo": "alto", "pesada": true, "timeoutSegundos": 2700 },
    { "nome": "teste-e2e", "comando": "@testeE2E", "obrigatoria": true, "custo": "alto", "pesada": true, "timeoutSegundos": 1200 },
    { "nome": "build", "comando": "@build", "obrigatoria": true, "paralela": false }
  ]
}
```

| Chave | Padrão | Efeito |
|---|---|---|
| `falharRapido` | `false` (instalação nova: `true`) | O gate roda em ondas por `custo` (baixo → medio → alto). Etapa **obrigatória** que falha numa onda corta as seguintes: elas entram na prova como `nao-executada` com `motivo: "falha anterior em <etapa>"`. Etapa não obrigatória nunca corta. Sem `falharRapido`, há uma onda só, na ordem do config (como antes). |
| `custo` (por etapa) | `"medio"` | Onda da etapa no falhar rápido: `baixo`, `medio` ou `alto`. |
| `timeoutSegundos` (por etapa) | o global | Teto da etapa; sobrepõe `gate.timeoutSegundos`. No teto, o grupo de processos da etapa é morto (nada fica segurando porta). |
| `repetirPorCarga` | `0` (instalação nova: `1`) | Quantas vezes repetir **só** a etapa que falhou por carga da máquina: timeout, processo morto por sinal (137/143), porta ocupada (`EADDRINUSE`), falta de memória, banco recusando conexão (`ECONNREFUSED`). Cada tentativa vai para `tentativas[]` na prova, com log próprio (`<etapa>.tentativa-N.log`); a etapa ganha `porCarga` e `motivoCarga`. Falha de asserção nunca é repetida. |
| `paralelismo` | `1` (instalação nova: `2`) | Etapas da mesma onda rodando ao mesmo tempo. Etapas `pesada` rodam uma de cada vez (dividem a vaga da task); `paralela: false` roda sozinha. A prova lista as etapas na ordem do config. |
| `pesada` (por etapa) | `false` | Só roda com uma vaga de recurso da máquina (ver `recursos`). |

- Toda etapa executada traz `origem: "execucao"` e `motivo`; as do cache, `origem: "cache"`.
- **A verificação final ignora o falhar rápido e o cache**: `wf verificar-limpo` roda todas as etapas (`completo: true` no `gate.json`). A repetição por carga continua valendo nela; as tentativas ficam registradas.
- As etapas recebem as variáveis `WF_BASE` (a ref da base da task, ex.: `origin/feat/x`), `WF_TASK` e, nas pesadas, `WF_VAGA`.

#### Dependências entre etapas (`dependeDe`)

Uma etapa pode declarar que **depende** de outras. Se uma dependência não passou, a etapa não pega vaga, não consulta o cache e não executa: fica `pulada-por-dependencia`, e o gate continua reprovado. O caso típico é uma etapa que delega a suíte a um serviço externo (ex.: `teste-ci` dispara o GitHub Actions): quando ela falha, não adianta esperar vaga e rodar typecheck, build e e2e locais (20 a 40 min sob carga) só para reprovar de novo.

```json
{ "nome": "teste-ci", "comando": "...", "obrigatoria": true },
{ "nome": "typecheck", "comando": "@typecheck", "obrigatoria": true, "pesada": true, "dependeDe": ["teste-ci"] },
{ "nome": "build:pdv-web", "comando": "...", "obrigatoria": true, "pesada": true, "dependeDe": ["teste-ci"] },
{ "nome": "teste-e2e:pdv-web", "comando": "...", "obrigatoria": true, "pesada": true, "dependeDe": ["teste-ci", "build:pdv-web"] }
```

- **`teste-ci` neste exemplo é uma etapa comum sua.** Com o modo CI ativo (`ci.ativo: true`), `teste-ci` passa a ser o nome da etapa sintética do plugin e o `wf doctor` recusa uma etapa sua com esse nome: renomeie a sua ou desligue o modo CI (ver "Modo CI" abaixo).
- **Nomes.** Cada item é o nome de uma etapa ou de uma sub-etapa (`build:pdv-web`). Um nome de grupo sem sufixo (`"teste-integracao"`) vale por todas as sub-etapas dele (`teste-integracao:api`, `teste-integracao:web`…). Sem `dependeDe`, nada muda.
- **Quando a dependente é pulada.** Uma dependência `ok` (executada agora ou vinda do cache) ou sem comando (`nao-configurado`) libera a dependente. Se ela `falhou`, deu `timeout`, ficou `sem-vaga` ou também foi pulada (transitivo), a dependente fica com `status: "pulada-por-dependencia"`, `origem: "dependencia"`, `exit: null`, `duracaoMs: 0`, `motivo` (ex.: "dependência teste-ci falhou"; na transitiva, "dependência build:pdv-web foi pulada (teste-ci falhou)") e `causaRaiz`.
- **Nunca aprova.** Etapa **obrigatória** pulada reprova o gate, como uma falha. Etapa **opcional** (`obrigatoria: false`) pulada não reprova: o gate pode sair `ok: true`, com ela listada em `puladas`, do mesmo jeito que uma opcional que falha não reprova. No `gate.json`, `falhas` lista só as falhas reais (a causa raiz), e `puladas`/`resumoPuladas` listam as puladas. A pulada não abre nem fecha finding (o finding é da dependência). O `wf gate`, o `wf verificar-limpo` e o `wf status` mostram ao fim "N etapas puladas porque teste-ci falhou"; a tabela do `gate.md` mostra "pulada (dependência: teste-ci falhou)". No manifest, a etapa pulada fica não comprovada, com a causa raiz no detalhe.
- **Ordem.** A etapa só começa depois que as dependências terminam, mesmo com `paralelismo > 1` e mesmo que a dependência venha depois dela no config (o `wf doctor` avisa; deixe as dependências antes para ler na ordem).
- **`falharRapido`.** A regra das ondas continua valendo; o `dependeDe` se soma a ela. Uma etapa nunca roda numa onda anterior à das dependências: `typecheck` (`custo: "baixo"`) que depende de `teste-ci` (`custo: "alto"`) roda na onda alta, depois dela. Se a obrigatória que corta as ondas seguintes foi pulada, o motivo do corte aponta a causa raiz ("falha anterior em teste-ci").
- **Verificação final.** `wf verificar-limpo` ignora o falhar rápido, mas respeita o `dependeDe`: com a `teste-ci` falhando, nenhuma dependente pega vaga nem executa, e a verificação termina logo depois, reprovada.
- **`pesada`/vagas.** A dependente pulada nunca pede vaga (`recursos.vagasPesadas`): a vaga fica para outros cards. Uma obrigatória pulada porque a dependência ficou sem vaga não conta como o gate da iteração (é capacidade da máquina, como o próprio `sem-vaga`).
- **Cache (loop).** Dependência vinda do cache como `ok` conta como `ok`. Se a dependência rodou agora e falhou, a dependente fica pulada e não usa o resultado de cache antigo.
- **`repetirPorCarga`.** A dependente espera o resultado final da dependência, depois das repetições: uma dependência que falha por carga e passa na repetição libera a dependente.
- **`wf gate --etapas X`.** Se X depende de uma etapa que não roda nesta execução (fora do filtro, ou não coberta pelo cache), vale o último resultado registrado da dependência **no mesmo commit**, o mais novo entre o histórico por commit (`evidencias/gate-resultados.json`, que só a CLI grava e que um `--etapas` posterior não apaga) e os `gate.json` da task. Não valem gates inválidos, com árvore suja ou com arquivos mudando durante a execução. `falhou`, `timeout`, `sem-vaga` ou pulada (com a causa raiz original) deixam X pulada; `ok` libera. Sem resultado no mesmo commit, X roda normalmente, e o aviso sai no `motivo`, em `avisosDependencia`, na mensagem do `wf gate` e no cabeçalho do log da etapa.
- **`wf doctor` (check `gate-dependencias`).** Reprova dependência com nome inexistente, ciclo (A ↔ B ou indireto) e etapa que depende de si mesma (inclusive pelo grupo), com a mensagem do problema. Avisa, sem reprovar, dependência posicionada depois da dependente e etapa obrigatória que depende de etapa `obrigatoria: false` (se esta falhar, a obrigatória é pulada e o gate reprova). Um ciclo que escape ao doctor não trava o gate: as etapas do ciclo falham sem rodar (`origem: "config"`, "erro de config: dependeDe em ciclo"), e o finding aponta o `.workflow-ia/config.json`, que só o humano edita (o próximo passo vira CONFIGURACAO_HUMANA, não o fixer). Uma etapa sem comando continua `nao-configurado`, mesmo com dependência vermelha.

### `recursos`

Vagas de recurso da máquina: um semáforo entre as tasks que rodam ao mesmo tempo (CPU, memória, bancos de teste).

```json
{ "vagasPesadas": 2, "dir": "/tmp/workflow-ia-vagas", "esperaMaxMin": 120, "reservaSegundos": 300 }
```

- `vagasPesadas` (padrão `0`, desligado): quantas etapas `pesada` rodam ao mesmo tempo **na máquina**, somando todas as tasks e projetos que usam o mesmo `dir`.
- A vaga é um diretório `vaga-N` criado com `mkdir` (atômico), com o dono (`task`, `pid`, hora, `token` e os grupos de processos das etapas que rodam com ela). A fila é justa, por ordem de chegada (`fila/`, cada pedido gravado em tmp + rename). A task segura a vaga do começo ao fim do gate (não perde a vez entre etapas) e a solta no fim, no Ctrl+C, no kill ou no fechamento do terminal (SIGHUP).
- **Dono morto (kill -9, máquina reiniciada) libera a vaga** para o próximo, sem corrida: quem a recupera ganha uma trava por identidade do dono morto (`vaga-N.rec-<hash>`), relê o `dono.json` e só apaga a vaga se ela ainda for desse morto. Antes, mata os grupos de processos que o morto deixou rodando: uma etapa órfã nunca divide o mesmo `WF_VAGA` com a próxima task.
- A etapa recebe `WF_VAGA=N`: use para mapear recursos, ex.: `DATABASE_URL=postgres://.../teste_$WF_VAGA`.
- `esperaMaxMin`: espera máxima na fila. Estourada, a etapa entra como `sem-vaga` (capacidade da máquina, não defeito do código; não abre finding). No loop, um gate com etapa obrigatória `sem-vaga` **não conta como o gate da iteração** (não libera a triagem nem gasta rodada), e o `wf proximo` devolve `aguardar-vaga`.
- `wf red` também pega uma vaga (roda testes de integração); `wf checar` só com `--pesado`.
- `wf vagas` mostra quem está em cada vaga e a fila. `wf aguardar-vaga` espera a vez sem polling e **não segura a vaga**, mas **reserva a vez** da task por `reservaSegundos` (padrão 300): o próximo gate (ou RED) da mesma task adota o pedido sem voltar para o fim da fila, e as outras tasks não passam na frente nesse tempo. Sem gate nesse prazo, a reserva vence e sai da fila.

### `ci` (modo CI opcional, 0.7.0; CI econômico, 0.8.0; reaproveitamento por conteúdo, 0.9.0)

Desligado por padrão: sem `ci.ativo`, nada muda e tudo roda na máquina. Ligado, a **verificação final** (`wf verificar-limpo`) delega as etapas pesadas ao GitHub Actions e usa o resultado do run como prova. RED, implementação e loop continuam locais.

```json
"ci": {
  "ativo": false,
  "provedor": "github-actions",
  "workflow": "CI",
  "fases": ["verificacao"],
  "etapas": ["typecheck", "teste-unitario", "teste-integracao", "build"],
  "e2e": false,
  "apps": { "pdv-web": { "dir": "apps/pdv-web", "banco": false, "shards": 4 }, "pdv-api": { "dir": "apps/pdv-api", "banco": true, "shards": 2, "entradas": ["docs/pdv-api", "tests/contratos"] } },
  "compartilhado": ["packages/**", "tooling/**", "package.json", "pnpm-workspace.yaml", "turbo.json", "tsconfig*.json"],
  "fallback": "local",
  "timeoutMin": 30,
  "pollSegundos": 15,
  "reaproveitar": true,
  "repetirFalhas": 1,
  "criterioReaproveitar": "conteudo"
}
```

| Chave | Padrão | Efeito |
|---|---|---|
| `ativo` | `false` | Liga o modo CI. Só o humano edita (`wf ci ativar --aplicar`, fora do Claude Code). |
| `provedor` | `"github-actions"` | Único provedor hoje (a interface fica em `scripts/lib/ci.mjs`; o GitHub em `ci-github.mjs`, pela CLI `gh`). |
| `workflow` | `"CI"` | O `name:` do workflow (ou o arquivo, ex.: `ci.yml`) que o `gh workflow run` dispara. Precisa existir no branch padrão. |
| `fases` | `["verificacao"]` | Fases em que o CI vale. `WF_GATE_CI=1` força em qualquer fase. |
| `etapas` | typecheck, teste-unitario, teste-integracao, build | Grupos do gate lidos do CI (sub-etapas `grupo:app` entram pelo grupo). Nunca `segredos`. |
| `e2e` | `false` | `teste-e2e` no CI (opt-in: navegador, servidor e seed são caros e instáveis lá). |
| `apps` | `{}` | Apps do monorepo: `dir` (relativo, sem `..`), `banco` (Postgres como service), `shards` e (0.9.0, opcional) `entradas`: caminhos ou globs fora de `dir` que o app lê (ex.: `docs/pdv`, `tests/contratos`, `prisma/**`). `entradas` entra no hash de conteúdo do app e, no diff, seleciona o app (mesmo um `.md`). `wf ci gerar` detecta pelos workspaces; sem workspaces, o projeto inteiro é um app (`dir: "."`). |
| `compartilhado` | packages, tooling, lockfiles… | Arquivo que casa aqui (ou lockfile) mudou → o CI testa todos os apps. Arquivo fora de qualquer app → todos (fail-closed). |
| `fallback` | `"local"` | `WF_GATE_CI_FALLBACK=local` roda a verificação inteira na máquina. Com `"nenhum"`, o fallback é recusado (`CI-ESTADO`). |
| `timeoutMin` / `pollSegundos` | `30` / `15` | Espera máxima pelo run (estourou: cancela e fica `CI-INDISPONIVEL`) e intervalo das leituras. |
| `reaproveitar` | `true` | (0.8.0) Antes de disparar, procura um run do mesmo SHA que já prove o commit (reaproveita, anexa ou dispara só os apps que faltam). `false` = sempre dispara (0.7.0). `WF_GATE_CI_NOVO=1` força um disparo novo numa execução. |
| `criterioReaproveitar` | `"conteudo"` (instalação nova); `"commit"` (config migrado) | (0.9.0) Como um run anterior prova um app. `"commit"`: só o run do mesmo SHA (comportamento e yml da 0.8.0). `"conteudo"`: **por app**, um `workflow_dispatch` verde de outro commit da mesma branch prova o app quando o hash do conteúdo do app (`dir` + `compartilhado` + `entradas` + lockfiles da raiz) e o do workflow são iguais. Vale na verificação (`teste-ci`) e no job `reaproveitar` do yml gerado. Ausente = `"commit"`. |
| `repetirFalhas` | `1` | (0.8.0) Quantas reexecuções dos jobs que falharam (`gh run rerun --failed`) cada **commit** pode ter: a soma das tentativas extras (`attempt - 1`) de todos os runs do SHA. `0` desliga. Run disparado ou anexado no próprio gate nunca é repetido ali (só numa próxima verificação). |

**O que roda onde (com o CI ativo):**

| Etapa | Onde | Motivo |
|---|---|---|
| `teste-integracao` | CI | mais pesada; Postgres como service; shards |
| `teste-unitario` | CI | pesada na soma dos apps |
| `typecheck` | CI na verificação (1º job, `needs:` dos testes); local nas outras fases | no CI corta os testes se não compila; local segue barato |
| `build` | CI | build de Next consome muita CPU |
| `teste-e2e` | local (CI só com `e2e: true`) | navegador, servidor e seed |
| `lint`, `sast`, `dependencias` | local | baratas |
| `segredos` | **sempre local e antes do push** | segredo detectado só no CI já vazou |

- **Etapa sintética `teste-ci`.** Quando o CI vale, ela entra como 1ª etapa (obrigatória, custo alto, não cacheável) e faz: pré-voo (árvore limpa, `git.pushBranch` ligado, branch da task fora de `git.branchesProtegidos` e diferente da base, **`.github/` sem mudança nesta task**, remoto sem commits à frente, `ci.apps` existentes; falha = `CI-ESTADO`, exit 5, nada roda) → `segredos` local (com falha, **não há push**) → `gh` disponível (antes do push) → `git push --set-upstream <remoto> <branch>:<branch>` (nunca `--force`, `GIT_TERMINAL_PROMPT=0`) → `gh workflow run <workflow> --ref <branch> -f apps=<alterados|todos>` → acha o run **disparado agora** (os runs que já existiam antes do disparo ficam de fora, mesmo do mesmo SHA) → espera, reconferindo o `headSha` do run a cada leitura → lê os jobs → `gh run view --log-failed` dos reprovados → grava `evidencias/<rótulo>/ci.json`. Todo comando `gh` leva `--repo <owner/repo>` derivado da URL do `git.remoto` (sem repo derivável, o `gh` resolve pelo diretório). As etapas de `ci.etapas` dependem dela (`dependeDe`) e ficam `origem: "ci"`: sem vaga, sem executar. **Com o modo CI ativo, `teste-ci` é nome reservado:** o humano não pode declarar uma etapa com esse nome em `gate.etapas` (o `wf doctor` reprova). Com o CI desligado, `teste-ci` é uma etapa comum (o exemplo do `dependeDe` continua válido).
- **Mapeamento job → etapa** pelo nome do job: `"<app> (<etapa>)"` ou `"<app> (<etapa> i/N)"` com shards (um job de matriz pulado chega com o placeholder `${{ matrix.shard }}` e ainda é lido). Fail-closed: job pulado ou cancelado de app alterado reprova (se foi pulado porque o `typecheck` do app falhou — `needs:` —, a causa é o `typecheck`, falha de código, não erro de config); os shards de `1..N` precisam estar todos no run, com `N` igual a `ci.apps.<app>.shards`; job faltando para etapa de app alterado é erro de config (finding `gate/config`, decisão do humano); sub-etapa `grupo:app` de um app que não está em `ci.apps` é erro de config (e o `wf doctor` recusa com o CI ativo); job reprovado que nenhuma etapa lê (inclusive de app fora de `ci.apps`) reprova a `teste-ci`, e `ci-ok` reprovado sem nenhuma falha mapeada também. Falha de teste vira finding `gate:<etapa>` com run, URL, SHA e o recorte do log.
- **`CI-INDISPONIVEL`** (gh ausente ou sem auth, rede, cota, workflow ausente, run cancelado de fora, timeout, push rejeitado por estar atrás do remoto, exceção ou JSON inesperado do `gh`): não é defeito do código. Um run `cancelled` em que um job de app considerado terminou `failure` ou `timed_out` (estouro de `timeout-minutes`) **não** é indisponível: é falha de código naquela etapa. **Erro de config, não indisponibilidade:** `Permission denied`, `HTTP 422 Unexpected inputs` (workflow sem o input `apps`) e push recusado por hook ou proteção de branch (`[remote rejected]`) viram `CI-ESTADO` na etapa (finding `gate/config`, com a instrução), sem sugerir `git pull`. A `teste-ci` fica `ci-indisponivel` (com `classe`), as etapas do CI ficam `pulada-por-dependencia`, nenhum finding abre, o gate não conta como o da iteração, e `wf proximo` manda repetir (ou usar o fallback). `wf gate`/`wf verificar-limpo` saem com exit 5 e `codigo`.
- **Provas.** `gate.json` ganha `ci` (modo, provedor, run, apps, `etapasDoCI`) e `ciIndisponivel`; `gate.md` mostra `ok (CI, run #N, <sha>)`. O verificador e o manifest só aceitam etapa do CI com `ci.sha == commit == HEAD` **e** `ci.headSha == HEAD` (o `headSha` é o que o provedor disse que o run testou, gravado separado do SHA local) e `verificacao/ci.json` com os dois no mesmo SHA. Um run de outro commit nunca é aceito, mesmo com o `gate.json` editado; a única exceção é o critério `"conteudo"` (0.9.0), com a prova por conteúdo recalculada no registrar e no manifest (ver abaixo). O `ci.json` registra também o caminho e o blob dos workflows do HEAD (`workflows`). Etapa do CI não entra no cache local. **O run executa o workflow do próprio branch:** por isso a mudança em `.github/` na task barra o CI (`CI-ESTADO`: revise e integre o workflow antes). Ctrl+C ou `kill` durante a espera cancela o run (`gh run cancel`).
- **Ativação guiada.** `wf ci gerar` grava a proposta em `.workflow-ia/ci/` (`ci.yml.proposta`, `config.patch.json`, `LEIA-ME.md`) a partir da stack e dos workspaces: `pull_request` para a base + `workflow_dispatch` com `apps`; job `mudancas`; por app typecheck → testes com shards, Postgres + Prisma quando há banco, cache por lockfile, segredos de teste descartáveis, artefato em falha; agregador `ci-ok` (o check a exigir no branch protegido). **O plugin nunca escreve em `.github/workflows/`**: o humano copia o yml, aplica o patch (`wf ci ativar --aplicar`, fora do Claude Code), exige `ci-ok` na proteção do branch e confere `gh auth status`. `wf ci status` mostra o plano por etapa, o pré-voo e o último run; `wf doctor` tem o check `ci`.
- **CI econômico (0.8.0).** Antes do push, a `teste-ci` procura os runs do workflow no branch da task com `headSha == HEAD`. Vale o `workflow_dispatch` do próprio commit. Vale o `pull_request` só quando o head está numa única PR e o merge dela (`refs/pull/<n>/merge`, buscado no remoto) tem a mesma árvore do HEAD e o 1º pai igual ao `base.sha` do run; sem como conferir, ele é recusado. Os recusados vão para `ci.json.reaproveitamento.rejeitados` com o motivo.
  - **Barreira:** o run concluído mais novo que não terminou `success`, ou que não deu para ler, invalida tudo o que é mais antigo que ele.
  - **Última palavra:** sobre cada app, é do run concluído mais novo que o testou, pela hora do resultado.
  - **Tudo provado** pelos concluídos → **reaproveita**, sem push e sem disparo, mesmo com outro run em andamento.
  - **Em andamento** → **anexa**, sem cancelar o run, que não é nosso. Estourou o prazo: fica em `ci.json.anexadosTravados`, não é anexado de novo e a verificação seguinte dispara os apps que faltam.
  - **App reprovado** num único run, com repetições do commit sobrando → **`gh run rerun <id> --failed`**, esperando a tentativa nova. Se o GitHub recusa (403 sem `actions:write`, run com mais de 30 dias), a falha fica e o motivo diz por quê.
  - **App sem prova** (pulado, cancelado, shards incompletos) → dispara **só os apps que faltam**. Com a PR aberta, o push já cria o run da PR: a `teste-ci` anexa a ele (até 90 s; não espera se o pré-voo avisou que a base andou).
  - **Repetições esgotadas** → usa a falha, sem gastar.
  - Run disparado ou anexado no próprio gate que falha **não** é repetido ali: o rerun fica para a próxima verificação do mesmo SHA.
  - Anexar, rerun, a espera da PR e o disparo dividem um **prazo único** (`timeoutMin`).
  - A prova continua exigindo `ci.sha == ci.headSha == commit == HEAD`.
  - O `ci.json` registra `origemRun` (`disparado` | `reaproveitado` | `anexado` | `rerun-falhas`), `tentativa`, `runs[]`, `rerun`, `rerunRecusado`, `anexadosTravados` e `reaproveitamento`. O `gate.json.ci` registra `origemRun`, `runs` e `run.tentativa`.
- **Base desatualizada (0.8.0).** O pré-voo confere se `<remoto>/<base>` está contida no HEAD (check `base-contida`). Se não estiver, só **avisa** (no `ci.json.avisos` e no `wf ci status`): a verificação prova o commit, mas o run da PR vai rodar de novo sobre o código integrado. Atualize o branch com a base para a PR reaproveitar a verificação. No critério `"conteudo"` (0.9.0), só rodam de novo os apps cujo conteúdo a base mudou.
- **Job `reaproveitar` no yml (0.8.0; é o do critério `"commit"`).** No `pull_request`, o job `reaproveitar` (`permissions: actions: read`, checkout com `fetch-depth: 2`) faz quatro coisas:
  - exige que o merge testado pelo run tenha a **mesma árvore do head**: mais forte que o `base.sha` do evento, que pode estar desatualizado;
  - lista os `workflow_dispatch` **concluídos** do mesmo head SHA e só usa os verdes mais novos que o último que não terminou `success`;
  - exige que a **união** dos jobs `success` deles cubra todos os jobs esperados (`ESPERADOS`, shards expandidos) dos apps alterados, lidos com `--paginate`;
  - se achou, os jobs de app pulam (`needs.reaproveitar.outputs.reaproveitado == 'true'`) e o `ci-ok` passa citando o run. Se não achou, ou a API falhou, tudo roda como antes: o job nunca reprova.
  
  Os jobs de app usam `!cancelled()` (no `workflow_dispatch` o `reaproveitar` fica pulado) com as condições de antes explícitas (`mudancas` ok, typecheck do app ok). Em projeto que já tem `ci.yml`, copie da proposta o job `reaproveitar`, o `needs`/`if` dos jobs de app e o `REAPROVEITADO`/`RUN_URL` do `ci-ok`.
- **Reaproveitamento por conteúdo (0.9.0, `criterioReaproveitar: "conteudo"`).** Com vários cards entrando na base em paralelo, a base anda a cada merge e o merge da PR deixa de ser o commit verificado: no critério `"commit"`, tudo roda de novo mesmo quando o que entrou na base não toca o app. No critério `"conteudo"` a decisão é **por app** e pelo conteúdo que o app lê:
  - **Conteúdo do app** = `git ls-tree -r <commit>` (modo, tipo, id do blob e caminho; nunca mtime) dos caminhos do app: `ci.apps.<app>.dir`, `ci.compartilhado`, `ci.apps.<app>.entradas` e os lockfiles da raiz (`protecoes.lockfiles`). O hash é o `sha256` dessas linhas. Cada caminho casa ele mesmo e tudo debaixo dele. App com `dir: "."` é o repositório inteiro (só reaproveita com tudo igual); app sem `dir` nunca reaproveita.
  - **Workflow** tem hash à parte: o arquivo do run (`.github/workflows/<arquivo>.yml`, lido da API do run ou do `gh workflow view`) mais `.github/actions/`. Mudou, **nada** é reaproveitado. Sem saber qual é o arquivo, vale a pasta `.github/workflows/` inteira.
  - **Qual run vale:** para cada app, o `workflow_dispatch` **concluído** mais novo da **mesma branch** (do mesmo workflow) que testou o app (algum job dele não pulado) decide. Ele tem de ter terminado `success` (run inteiro), com todos os jobs esperados do app (shards expandidos) em `success`, o commit dele buscável (`git fetch` pelo SHA) e os dois hashes iguais aos do commit testado. Dispatch mais novo vermelho, cancelado ou com o app pulado/incompleto barra os mais antigos **para aquele app**. Run em andamento não é prova nem barreira. `inputs.apps` sem o app = jobs do app pulados = o dispatch não testou o app.
  - **No run da PR** (job `reaproveitar` do yml gerado, `permissions: actions: read`, checkout raso com `fetch-depth: 1`): o commit testado é o merge da PR; o commit do dispatch é buscado com `git fetch --depth=1 origin <sha>`. Saídas: um booleano por app (`needs.reaproveitar.outputs.<app>`; nome de app que não é id de output vira `app_<nome>`) e `run_url`. Cada job de app pula com o booleano dele; o `ci-ok` aceita o pulo só do app com `"true"` e com o `reaproveitar` em `success`, e reprova app alterado pulado sem essa prova, como antes. PR de fork, API falhando, commit que não dá para buscar, hash que não dá para calcular: o app roda (o job `reaproveitar` nunca reprova).
  - **Na verificação** (`teste-ci`): depois dos runs do mesmo SHA, os dispatches concluídos da branch (`gh run list --branch <branch> --event workflow_dispatch`) entram pelo mesmo critério; os apps provados por eles não são disparados de novo, e só os outros são disparados (`-f apps=<faltantes>`). Um commit posterior só de docs ou `pr.md` não obriga uma verificação nova. `WF_GATE_CI_NOVO=1` e `ci.reaproveitar: false` desligam também este caminho.
  - **Provas:** o `ci.json` ganha `criterio: "conteudo"` e `conteudo` (`workflow`, `consultados`, `apps.<app>`: `run`, `sha`, `hash`, `hashHead`, `hashWorkflow`, `workflow`, `caminhos`; `recusados.<app>`: motivo). `runs[]` marca `porConteudo`. Cada etapa lida do CI ganha `ci.criterio`, `ci.shas` (os commits dos runs de onde vieram os jobs) e `ci.conteudo`. O `wf verificacao registrar` e o manifest aceitam run de outro commit **só** com a prova por conteúdo, **recalculada** do config e do git no momento (`provaCIValeParaHead`): hash adulterado, commit sumido ou conteúdo diferente no HEAD reprovam como "CI de outro SHA".
  - **`entradas` e o `wf doctor`:** app que lê arquivo fora da pasta dele (docs, fixtures, `tests/` na raiz) precisa declará-lo em `ci.apps.<app>.entradas`; senão, uma mudança lá não invalidaria a prova do app. O check `ci` do `wf doctor` avisa (melhor esforço) quando os arquivos de config do app (`package.json`, `tsconfig*.json`, `*.config.*`) citam `../` fora da pasta, do `compartilhado` e das `entradas`, e avisa app com `dir: "."`. `entradas` com `..` ou caminho absoluto reprova.
- **Custo.** Cada run gasta a soma das durações dos jobs em minutos do Actions; shards dividem a suíte, não o total. Com o reaproveitamento, repetir a verificação no mesmo commit não gasta nada, um shard instável repete só o job que falhou e a PR aberta sobre uma verificação aprovada leva só `mudancas`/`reaproveitar`/`ci-ok`.

| Código | Significa | O que fazer |
|---|---|---|
| `CI-ESTADO` | O repositório ou o config não permitem o CI (árvore suja, branch errado, protegido ou a base, `git.pushBranch: false`, workflow alterado na task, remoto à frente, `ci.apps` vazio, config inválido, fallback recusado, permissão de push, input do workflow, hook ou proteção que recusou o push). | Siga a instrução (commit, `git pull --ff-only`, `wf doctor`, corrigir a permissão ou o workflow). |
| `CI-INDISPONIVEL` | O run não veio (gh, rede, cota, workflow, cancelado, timeout). Nada foi provado nem reprovado. | Repita; se persistir, `WF_GATE_CI_FALLBACK=local` (com `ci.fallback: "local"`). |

### `revisao`

```json
{
  "operacao": "condicional",
  "gatilhosOperacao": ["**/dockerfile*", "**/docker-compose*", "**/k8s/**", "**/*.tf", "**/.github/workflows/**", "**/db/migrate/**", "**/logger*", "**/workers/**", "**/webhooks/**", "**/env.{ts,mjs,js,cjs}", "**/health{,check,z}.{ts,js,mjs,cjs}"]
}
```

- Na 1ª rodada de revisão, os quatro revisores fixos (segurança, performance, qualidade, testes) sempre rodam. O `ops-reviewer` (categoria `operacao/`: LGPD, dado pessoal em log, migration segura para o deploy, env, observabilidade, resiliência, CI e containers) entra quando:
  - `operacao` é `"sempre"`; ou
  - o spec marca `Dados pessoais: sim`; ou
  - algum arquivo do diff é migration (`protecoes.diretoriosMigrations`), arquivo `.env*` ou casa com um glob de `gatilhosOperacao` (lista acima resumida; o padrão completo está em `scripts/lib/core.mjs`).
- Nas rodadas seguintes, ele volta se houver finding `operacao/` corrigido para re-revisar, ou se as correções da rodada tocarem um gatilho de arquivo.
- Se o `git diff` falhar (base inexistente, clone raso), ele entra: sem a lista de arquivos não dá para dispensá-lo.
- A comparação ignora maiúsculas e minúsculas. Nunca disparam: arquivos do Workflow IA, `public/`, documentação, CSS e imagens, e telas do App Router (`page`, `layout`, `loading`, `error`...).
- O `wf doctor` reprova `operacao` fora de `"condicional"`/`"sempre"` e gatilhos que não sejam lista de textos.
- "Dados pessoais" no spec: na dúvida, `sim`. Só um `nao` explícito desliga, e `wf meta dadosPessoais=nao` é recusado quando o spec diz `sim`.
- Os globs aceitam `**`, `*`, `?` e `{a,b}`, relativos à raiz do repositório. Acrescente os caminhos próprios do projeto (ex.: `src/server/telemetria/**`).
- Findings em arquivo de `protecoes.arquivosSomenteHumano` (ex.: CI) não vão para o fixer: se só eles sobrarem, a task para com `CONFIGURACAO_HUMANA`; com "Já resolvi", o orquestrador os marca como corrigidos e a re-revisão confirma.

### `limites`

```json
{
  "maxIteracoes": 5,
  "maxRodadasPlano": 3,
  "maxReaberturasMesmoFinding": 3,
  "maxFalhasGateSeguidas": 5,
  "semProgressoPor": 2,
  "maxBloqueiosDeParada": 4,
  "esperaSubagenteMin": 180
}
```

| Chave | Padrão | Significado |
|---|---|---|
| `maxIteracoes` | `5` | Rodadas de code review no loop, iguais para P, M e G. Uma iteração só conta quando a revisão é triada. Gate e revisores começam juntos e a triagem junta os dois, mesmo com o gate vermelho (aí a rodada conta); repetir só o gate antes da triagem não gasta iteração. Esgotadas com bloqueantes ou médios abertos: `LIMITE_ITERACOES` |
| `maxRodadasPlano` | `3` | Rodadas do plan-reviewer antes de `PLANO_REPROVADO`. "Refazer o plano" numa decisão humana abre um ciclo novo com o mesmo número de rodadas |
| `maxReaberturasMesmoFinding` | `3` | Vezes que o mesmo finding de revisão pode ser corrigido e reaberto antes de `OSCILACAO`. Falha repetida no gate não conta aqui |
| `maxFalhasGateSeguidas` | `5` | Falhas seguidas da mesma etapa do gate antes de `GATE_TRAVADO` |
| `semProgressoPor` | `2` | Rodadas de revisão seguidas sem queda de bloqueantes abertos antes de `SEM_PROGRESSO` (só contam rodadas com gate verde e revisão triada) |
| `maxBloqueiosDeParada` | `4` | Vezes que o hook de parada devolve o agente ao trabalho antes de deixá-lo parar |
| `esperaSubagenteMin` | `180` | Minutos que um subagente disparado em segundo plano (sem `SubagentStop` ainda) deixa o orquestrador parar para esperar a notificação, sem contar como parada sem progresso. Passado esse tempo, o disparo é ignorado (fim perdido ou chamada que nem rodou); disparos de um processo anterior (antes do último `startup`/`resume`) também. Não vale no CI. Opcional: sem a chave, vale o padrão |

Não há orçamento de tokens: o consumo é medido (`wf status`, `wf tokens`) e aparece no manifest e no relatório, só como informação. Ele nunca interrompe a task. No CI, o teto de custo é do host (`--max-budget-usd`, veja [ci-headless.md](ci-headless.md)).

Extensões concedidas pelo humano numa decisão (+1/+2 rodadas, mais tentativas do gate) valem só para aquela task.

A complexidade vem do spec (`wf meta --do-spec`) e não pode mudar depois que o loop começou.

### `severidades`

```json
{ "bloqueiam": ["urgente", "alto"], "corrigirNoLoop": ["medio"], "apenasRegistrar": ["baixo"] }
```

Urgentes, altos e médios são corrigidos no loop; a task só vai para a verificação quando sobram apenas os de `apenasRegistrar`, que ficam no relatório.

Nos comandos, `{base}` é substituído pela ref do branch base (`origin/<base>` quando existe) na hora do gate.

### `git`

| Chave | Padrão | Significado |
|---|---|---|
| `branchBase` | detectado (`main`) | De onde os branches saem; referência das migrations "aplicadas". Uma task numa cadeia de branches usa a própria base (`wf init-task <ID> --base feat/x`, trocável com `wf base`): diff, gate (`{base}`/`WF_BASE`), RED e revisores comparam com `origin/feat/x`, e uma migration que já existe nela ou no `branchBase` conta como aplicada. A base nunca pode esconder os commits da task: `wf base` recusa uma base que contém algum commit da task (first-parent desde o merge-base com a base atual) ou aponta para o HEAD; `init-task --base` aceita o `branchBase`, uma ref ancestral dele, uma ref com `origin/` e o ramo atual, e recusa um ramo só local criado no HEAD. O sha da base validada fica em `baseValidada`; no loop e na verificação (ou se a ref da base própria mudou depois de validada), gate, RED e verificação recusam rodar com `{base}..HEAD` vazio. A base só aceita nome de ref ou sha (letras, números, `.`, `_`, `/`, `-`; sem `..`, `:/`, `^`, `;`): ela entra no `{base}` dos comandos sem aspas, porque o padrão de segredos já a usa entre aspas duplas (`"{base}..HEAD"`) |
| `remoto` | `origin` | Remoto do push |
| `branchesProtegidos` | main, master, develop, production, release | Nunca recebem push/commit do agente |
| `padraoBranch` | `{tipo}/{id}-{slug}` | Nome sugerido por `wf branch-sugerido` |
| `pushBranch` | `true` | Se o agente faz push do branch da task (necessário para provas no CI e para o modo headless). `false`: nenhum push |

### `board`

`tipo` (`manual`, `notion`, `linear`, `github`, `jira`, `trello`), os nomes de status (`statusEntrada`, `statusEmAndamento`, `statusConcluida`, `statusBloqueada`, `statusInterrompida`, `statusDividaTecnica`), `idPrefixo` e `observacoes` (IDs de projeto, nome do banco no Notion, etc.).

### `provas`

- `exigirE2E`: `sempre` | `quando-houver-ui` | `nunca`.
- `redFocado`: `true` (instalação nova) deixa o `wf red` focado nos testes da task; `false` (gravado pela migração 6 → 7) mantém o RED completo, como antes. O focado só vale com `versao` 7; sem a chave, vale quando `comandos.testeArquivos` está configurado.
- `exigirCI`: reservado.
- `urlPreview`: modelo da URL de preview, para o relatório.

### `protecoes`

Globs de arquivos bloqueados (`.env*`), exceções (`.env.example`), diretórios de migrations, arquivos que só o humano altera, lockfiles e padrões de arquivos de teste. `padroesE2E` (padrão `e2e/**`, `**/e2e/**`, `**/*.e2e.*`) separa os testes E2E: o `wf red` focado só os roda quando `provas.exigirE2E` pede.

### `hooks`

- `lintAoEditar` (padrão `true`)
- `typecheckAoEditar` (padrão `false`; ative em projetos pequenos)
- `timeoutPosEdicaoSegundos`

### `host`

Prazos da checagem de capacidades do host (veja [portabilidade-hosts.md](portabilidade-hosts.md)):

- `janelaBatimentoSegundos` (padrão `120`): idade máxima do carimbo do hook `PreToolUse(Bash)` que prova que os hooks do plugin estão vivos. Enquanto `gate`, `red`, `verificar-limpo`, `checar` ou `aguardar-vaga` rodam, a própria CLI renova esse carimbo a cada metade da janela (`origem: "wf"`), mas só se ele estava válido quando o comando começou. Esse carimbo renovado só vale para o mesmo shell (o `wf` encadeado na mesma chamada do Bash) ou para a mesma sessão (`CLAUDE_CODE_SESSION_ID`): outra sessão no mesmo repositório não herda os hooks. Carimbo vencido há pouco (até 30 janelas, 1 h no padrão, e da mesma sessão) recusa com `codigo: "BATIMENTO_VENCIDO"` (exit 1): rode qualquer comando numa chamada própria do Bash e repita; não é motivo para BLOQUEADA. Carimbo mais antigo que isso, de outra sessão ou renovado pelo `wf` de outro shell é hooks mortos de fato: `AMBIENTE` (exit 5);
- `validadeAmbienteSegundos` (padrão `600`): quanto tempo um `wf ambiente` aprovado vale para o `wf init-task`.

Não há chave para desligar a exigência de hooks: sem eles ninguém atesta quem grava cada prova.

### `githooks`

- `instalar` (padrão `true`): o instalador grava os shims `pre-commit` e `pre-push` em `.git/hooks` (respeita `core.hooksPath`; `--sem-githooks` pula).

### `interacao`

Decisão humana pelo chat (veja "Decisão humana e retomada" em [arquitetura.md](arquitetura.md)):

- `perguntarAoHumano` (padrão `true`): numa parada (BLOQUEADA/INTERROMPIDA), o agente da sessão pergunta ao humano e a mesma task continua com a resposta. Com `false` (ou `WORKFLOW_IA_CI=1`), a task fecha com o relatório e o humano retoma depois com `/workflow-ia:retomar`, que pergunta mesmo com `false` (`wf decisao pedir --retomada`; no CI, nunca);
- `maxDecisoes` (padrão `5`): decisões humanas por task em paradas (BLOQUEADA/INTERROMPIDA), para não virar um ciclo sem fim. As decisões de ajuste pós-entrega (`AJUSTE_MUDA_SPEC`) não contam: vêm de um pedido explícito do humano (`/workflow-ia:ajustar`);
- `exigirTranscript` (padrão `true`): além do registro dos hooks, a resposta precisa estar no transcript da sessão. Desligue só num host que não grava transcript (e saiba que perde a segunda âncora contra forja).

## Plugin no repositório (`.claude/skills/workflow-ia/`)

O instalador e o `/workflow-ia:atualizar` copiam o plugin para `.claude/skills/workflow-ia/` do projeto, para ele ir no commit. Quem clona o repositório tem o Workflow IA sem instalar nada: o Claude Code carrega a pasta como plugin (`workflow-ia@skills-dir`), com skills, comandos `/workflow-ia:*`, subagentes e hooks, depois que a pessoa **confia na pasta** (diálogo de confiança) e desde que a sessão seja aberta **na raiz do repositório**.

- **Onde vai a cópia:** na raiz do projeto, se ela estiver num repositório git, e em **cada sub-repositório** abaixo dela (pasta com `.git` própria, até 2 níveis, ignorando `node_modules`, pastas ocultas e de build). Assim uma raiz que agrupa vários repositórios lado a lado (ex.: `api/` e `web/`, cada um com seu git) funciona: cada um leva a sua cópia e a sugestão de commit vem por repositório. Uma raiz sem git com sub-repositórios é aceita sem `--forcar`; o `.workflow-ia/` dela fica só na máquina.
- **O que vai:** `.claude-plugin/plugin.json`, `agents/`, `commands/`, `hooks/`, `scripts/`, `skills/`, `templates/`, `docs/` e `README.md` (sem `testes/`).
- **Atualização:** a cópia só muda quando alguém roda `/workflow-ia:atualizar` (compara o conteúdo; igual não mexe) e commita a pasta. O diff dela é o código do plugin.
- **`.gitignore`:** se ele ignora a pasta (ex.: `.claude/`), o instalador acrescenta regras que reabrem só `.claude/skills/workflow-ia/`; o resto de `.claude/` continua ignorado.
- **`.semgrepignore`:** recebe `.claude/skills/workflow-ia/`, para o SAST do gate não analisar o código do plugin. Se o arquivo não existia, é criado com a lista padrão do semgrep e `:include .gitignore`.
- **Máquina com o plugin instalado pelo marketplace** (`workflow-ia@fabriki`): o do marketplace tem precedência; a cópia aparece como "Not loaded" na aba Errors do `/plugin`, sem hooks em dobro.
- **Não usar a cópia na sua máquina:** `"enabledPlugins": {"workflow-ia@skills-dir": false}` no `.claude/settings.local.json`.
- O atalho `.workflow-ia/wf` procura o plugin em `WORKFLOW_IA_ROOT`, no caminho registrado pela última sessão, na cópia do repositório e no caminho da instalação. O `wf doctor` mostra o estado de cada cópia no check `plugin-embutido` (só informa).

## CLI `wf`

Rode `.workflow-ia/wf ajuda`. Todas as saídas são JSON, e `ok: false` sempre vem com uma `mensagem`.

| Comando | Para quê |
|---|---|
| `init-task <ID> --titulo "..." [--base <branch>] [--modo revisao [--base <ref>]] [--substituir-ativa] [--nova-execucao]` | Cria e ativa a task. `--base`: na task, a branch base dela (cadeia de branches; grava `base` no `state.json`); no modo revisão, a base do diff da revisão. Recusa recriar uma task BLOQUEADA/INTERROMPIDA (aponta o `/workflow-ia:retomar`); `--nova-execucao` recomeça do zero |
| `ativar <ID>`, `pausar`, `retomar` | Controle da task ativa |
| `status`, `proximo` | Situação e próximo passo da máquina de estados |
| `fase <fase>` | Avança a fase checando os pré-requisitos |
| `meta k=v`, `meta --do-spec` | Complexidade, risco, UI, dados pessoais (`dadosPessoais`), branch, tipo |
| `branch-sugerido` | Nome do branch |
| `base [<branch> --motivo "..."]` | Mostra ou troca a base da task (ex.: a branch-mãe foi mergeada). A troca vai para `decisoes.md` e o histórico; recusada a partir da fase `verificacao` |
| `red [--aceitar-verde "motivo"] [--aceitar-erro-carga "motivo"] [--sem-e2e] [--completo]` | Prova de TDD + baseline de testes (uma vez, na fase testes). Se o HEAD mudar enquanto os testes rodam, a prova é recusada. Focado por padrão na instalação nova (`provas.redFocado`; config migrado continua completo): só os arquivos de teste criados ou alterados pela task (diff contra a base, `protecoes.padroesTeste`), com `testeArquivos` ou `testeArquivo`; E2E da task só quando `provas.exigirE2E` pede. Sem comando por arquivo, cai nos comandos inteiros (com `aviso`). `--completo` roda as suítes inteiras. `red.json` registra `modo` e `arquivos` |
| `spec status` | Critérios congelados e se o spec mudou |
| `gate [--etapas a,b] [--rotulo x] [--sem-cache] [--so-falhas]` | Gate determinístico → findings. No loop, roda quantas vezes for preciso na mesma iteração até ficar verde (não gasta iteração) e é incremental: etapas que passaram e cujos insumos não mudaram vêm do cache. `--sem-cache` roda tudo; `--so-falhas` roda só as que falharam e as invalidadas pelo diff; `--etapas` roda só as pedidas e, no loop, as demais vêm do cache. `--so-falhas` e `--etapas` contam como gate da iteração só quando o cache cobre o resto. O commit testado é o do início: se o HEAD muda enquanto o gate roda, o resultado é inválido (`ok: false`, `invalido`), sem findings, cache nem `commitGate`; arquivo versionado editado durante o gate (`arvoreMudou`) ou etapa obrigatória `sem-vaga` também não contam como o gate da iteração. `--etapas` com nome desconhecido é recusado |
| `testes-diff`, `matriz` | Enfraquecimento de testes; critério → testes |
| `iteracao nova\|fechar`, `limites`, `tokens`, `revisores` | Loop. Uma iteração = uma rodada de code review; `iteracao fechar` só é aceito depois da triagem. `revisores` mostra quem revisa nesta rodada, o diff e, em `motivoOps`, por que o `ops-reviewer` entra ou não. `tokens` (alias `orcamento`) mostra o consumo medido, sem teto |
| `findings merge\|status\|listar\|resumo` | Registro de findings. Na task, a triagem entra depois que o gate da iteração terminou (verde ou vermelho), no mesmo commit, e com o relatório de cada revisor devido (dentro de uma sessão, o hook precisa ter registrado o disparo de cada um nesse commit) |
| `checar [arquivos...] [--pesado]` | Checagem estreita antes do gate (fixer): `lintArquivo` em cada arquivo, `typecheckArquivos` (ou `typecheck`) e `testesRelacionados` (ou `testeArquivo` nos testes da lista). Sem arquivos, usa as alterações não commitadas. Grava `evidencias/checar/`; não é gate nem prova |
| `vagas`, `aguardar-vaga [--max-min N]` | Vagas de recurso (`recursos`): quem está em cada vaga e a fila; esperar a vez sem polling (não segura a vaga; reserva a vez da task por `recursos.reservaSegundos`) |
| `verificar-limpo`, `verificacao registrar <arq>` | Verificação independente. Com o modo CI ativo, a etapa sintética `teste-ci` entra primeiro e as etapas de `ci.etapas` são lidas do run do mesmo SHA; `CI-ESTADO` e `CI-INDISPONIVEL` saem com `5` (não é reprovação do código) |
| `ci status [--fase f]`, `ci plano [--fase f]`, `ci gerar`, `ci ativar [--aplicar]` | Modo CI (0.7.0, desligado por padrão). `status`: ativo?, plano por etapa (local ou CI), apps alterados, pré-voo (git, `gh auth status`, `gh workflow view`) e último run; `gerar`: proposta em `.workflow-ia/ci/` (nunca em `.github/`); `ativar`: diff do config e passos do humano (`--aplicar` grava só o bloco `ci` e é só humano, no terminal). `WF_GATE_CI=1` força o CI em qualquer fase; `WF_GATE_CI_FALLBACK=local` roda tudo na máquina |
| `manifest`, `veredito <V> [--motivo]`, `encerrar` | Entrega. BLOQUEADA/INTERROMPIDA grava onde a task parou (`bloqueio.fase`), para onde ela volta |
| `decisao pedir [--contexto arq.json] [--recomendar <opção>]` | Depois do veredito: registra a decisão humana `H-n` e devolve as perguntas exatas para o AskUserQuestion. A pergunta "Como seguir?" e os efeitos vêm da CLI, pelo código do motivo |
| `decisao aplicar` | Aplica a resposta do humano atestada (hooks + transcript): `continuar` reabre a task na fase do bloqueio, com limites estendidos se for o caso; `encerrar` mantém o veredito |
| `decisao status` | Decisão pendente, perguntas, se já foram feitas e respondidas, decisões tomadas |
| `spec aceitar-ajuste` | Recongela o spec uma vez, quando o humano escolheu "ajustar o spec" numa decisão |
| `doctor` | Diagnóstico (config, git, gate, `gate-cache`, `gate-dependencias`, `ci` e a seção `host`: hooks, agentes, modo) |
| `ambiente [--agentes-visiveis a,b,c \| --sdk-init arq.json]` | F0: o host sustenta o pipeline? Grava `runtime/ambiente.json`; sai com `5` e `AMBIENTE: ...` se não |
| `ambiente --bloquear <ID> --titulo "..."` | Ambiente reprovado: cria a task já BLOQUEADA (`AMBIENTE:`), sem F1 |
| `exportar-agentes --formato sdk\|mjs [--saida arq] [--prefixo workflow-ia:]` | Os 13 papéis no formato `agents` do Claude Agent SDK (funciona fora de um projeto) |
| `githook pre-commit\|pre-push` | Chamado pelos git hooks gerenciados; não rode à mão |
| `spec recongelar`, `red --refazer` | **Só o humano, no terminal** (a CLI recusa dentro do Claude Code e os hooks negam ao agente) |

Códigos de saída: `0` ok · `1` falha · `3` limite do loop atingido · `4` RED não observado · `5` ambiente não sustenta o pipeline (`AMBIENTE:`) ou o CI não respondeu/não pôde rodar (`CI-INDISPONIVEL`, `CI-ESTADO`).

## Instalador (`scripts/instalar.mjs`)

| Opção | Efeito |
|---|---|
| `--simular` | Mostra o que faria, sem gravar |
| `--set chave=valor` | Ajusta a config (repetível) |
| `--ci`, `--compartilhar-plugin`, `--marketplace` | CI e compartilhamento do plugin (veja ci-headless.md) |
| `--atualizar` | Projeto que já tem `.workflow-ia/`: preserva os ajustes, preenche chaves novas, migra o schema, renova `wf`, README, `CLAUDE.md`, `.gitignore` e git hooks. Recusa com task ativa e, fora de `--simular`, com working tree sujo. Saída traz `atualizacao` (`versao`, `migracoes`, `adicionado`, `preservado`, `sugeridos`, `ci`) |
| `--confirmar-ci` | Com `--atualizar`: sobrescreve workflows de CI existentes (sem isso, só mostra o diff) |
| `--sem-githooks` | Não instala os git hooks |
| `--manter-security-guidance` | Não grava `ENABLE_CODE_SECURITY_REVIEW=0` no `.claude/settings.json`. Por padrão, com o plugin `security-guidance` ativo, o instalador desliga as revisões por LLM dele (cada uma abre uma sessão por subagente e por commit; veja hosts/rmcode.md) |
| `--forcar` | Recalcula a config a partir da detecção: **perde ajustes do humano** (incompatível com `--atualizar`) |
