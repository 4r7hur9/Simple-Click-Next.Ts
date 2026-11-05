// Gerador da proposta de workflow do modo CI (wf ci gerar / wf ci ativar): a partir do config e da stack detectada,
// escreve .workflow-ia/ci/ci.yml.proposta, config.patch.json e LEIA-ME.md. O plugin NUNCA escreve em
// .github/workflows/ (arquivo só do humano, protecoes.arquivosSomenteHumano): o humano copia o yml e aplica o patch.
//
// Convenção do yml (a mesma que lib/ci.mjs lê): job "mudancas" decide os apps (input `apps` do workflow_dispatch ou
// o diff com a base; arquivo compartilhado = todos), um job por app e etapa com name "<app> (<etapa>)" ou
// "<app> (<etapa> i/N)" com shards, e o agregador "ci-ok" (o check a exigir na proteção do branch), que falha em
// failure/cancelled e em skipped de app alterado. Sem lib de YAML: template em JS com JSON.stringify nos valores.
// 0.8.0: no pull_request, o job "reaproveitar" procura runs verdes de workflow_dispatch do mesmo head SHA (a verificação
// do Workflow IA), exige que o merge testado tenha a mesma árvore do head e todos os jobs dos apps alterados em success; achou, os jobs de app
// pulam e o ci-ok passa citando aquele run. O que roda no Actions não muda quando não há o que reaproveitar.
// 0.9.0 (ci.criterioReaproveitar = "conteudo"): o "reaproveitar" decide POR APP e por conteúdo: o dispatch verde mais
// novo da mesma branch que testou o app prova o app no merge da PR quando o hash do conteúdo do app (ls-tree dos
// caminhos dele, ver lib/ci-conteudo.mjs) e o do workflow são iguais nos dois commits. Saída: um booleano por app (o
// job do app e o ci-ok leem o do seu app) e run_url. Com "commit" (padrão dos configs migrados), o yml é o da 0.8.0.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolverComando, existe, gravarJSON } from './core.mjs';
import { RX_NOME_JOB, NOME_TESTE_CI } from './ci.mjs';
import { detectarStack, detectarApps, which } from './stack.mjs';
import { criterioDe, caminhosDoApp } from './ci-conteudo.mjs';

export const PASTA_PROPOSTA = '.workflow-ia/ci';
export const ARQUIVOS_PROPOSTA = { yml: 'ci.yml.proposta', patch: 'config.patch.json', leiame: 'LEIA-ME.md' };
const NODE = '22';
const POSTGRES = 'postgres:16';
const DATABASE_URL_TESTE = 'postgresql://postgres:postgres@localhost:5432/test';
const ORDEM_ETAPAS = ['typecheck', 'lint', 'teste-unitario', 'teste-integracao', 'build', 'teste-e2e'];
const j = (v) => JSON.stringify(v);

/** pnpm/action-setup exige "version" sem "packageManager": pelo lockfile (9 → 9, 6 → 8, 5 → 7), senão o pnpm local. */
export function versaoPnpm(raiz) {
  const arq = path.join(raiz, 'pnpm-lock.yaml');
  const lock = existe(arq) ? fs.readFileSync(arq, 'utf8').slice(0, 200) : '';
  const m = lock.match(/lockfileVersion:\s*'?(\d+)/);
  if (m) return { 9: '9', 6: '8', 5: '7' }[m[1]] || m[1];
  const r = spawnSync('pnpm', ['--version'], { encoding: 'utf8', cwd: raiz });
  return r.status === 0 && /^\d+/.test(r.stdout.trim()) ? r.stdout.trim().split('.')[0] : '9';
}
const idJob = (app, etapa) => `${app}-${etapa}`.replace(/[^A-Za-z0-9_-]/g, '-');
/** Id do output do job "reaproveitar" para o app (critério "conteudo"): o nome do app quando ele já é um id válido. */
export const saidaDoApp = (app) => (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(app) && app !== 'run_url' ? app : `app_${String(app).replace(/[^A-Za-z0-9_-]/g, '_')}`);

/** Apps efetivos: os do config (quando declarados) completados pela detecção; sem nenhum, o projeto inteiro é um app. */
export function appsEfetivos(raiz, config, detectados) {
  const doConfig = config.ci?.apps && typeof config.ci.apps === 'object' ? config.ci.apps : {};
  const det = detectados?.apps || {};
  const nomes = Object.keys(doConfig).length ? Object.keys(doConfig) : Object.keys(det);
  const apps = {};
  for (const n of nomes) {
    const c = doConfig[n] || {};
    const d = det[n] || Object.values(det).find((x) => x.dir === c.dir) || {};
    apps[n] = { dir: String(c.dir || d.dir || '.').replace(/\/+$/, '') || '.', banco: typeof c.banco === 'boolean' ? c.banco : !!d.banco, shards: Number.isInteger(c.shards) && c.shards >= 1 ? c.shards : 1, prisma: !!d.prisma, runner: d.runner || null, e2e: !!d.e2e, ...(Array.isArray(c.entradas) && c.entradas.length ? { entradas: c.entradas } : {}) };
  }
  return apps;
}

/** Comando de uma etapa para um app: a sub-etapa "<etapa>:<app>" se existir (roda na raiz), senão o do grupo (na pasta do app). */
function comandoDe(config, etapa, app, dir) {
  const sub = (config.gate?.etapas || []).find((e) => e.nome === `${etapa}:${app}`);
  if (sub) return { comando: resolverComando(config, sub.comando), dir: '.', origem: `sub-etapa ${sub.nome}` };
  const grupo = (config.gate?.etapas || []).find((e) => e.nome === etapa);
  return { comando: grupo ? resolverComando(config, grupo.comando) : '', dir, origem: grupo ? `etapa ${etapa}` : 'sem etapa' };
}

function comShard(comando, runner, n) {
  if (n <= 1) return comando;
  if (/vitest|jest|playwright/.test(comando) || ['vitest', 'jest'].includes(runner)) return `${comando} --shard=\${{ matrix.shard }}/${n}`;
  return null;
}

/**
 * gerarProposta(raiz, config, { stack?, apps? }) → { yml, patch, avisos, validacao, apps, etapas, base }.
 * `patch` é o bloco `ci` sugerido (nunca toca gate.etapas); `validacao` vem de validarYmlMinimo (+ actionlint se houver).
 */
export function gerarProposta(raiz, config, { stack = detectarStack(raiz, { which }), apps: detectados = detectarApps(raiz, { pkg: stack.pkg }) } = {}) {
  const avisos = [];
  const ci = config.ci || {};
  const base = config.git?.branchBase || 'main';
  const apps = appsEfetivos(raiz, config, detectados);
  const nomesApps = Object.keys(apps);
  const gruposDoGate = new Set((config.gate?.etapas || []).map((e) => String(e.nome).split(':')[0]));
  const etapasCI = ORDEM_ETAPAS.filter((e) => (ci.etapas || []).includes(e) || (e === 'teste-e2e' && ci.e2e === true));
  const compartilhado = [...new Set([...(Array.isArray(ci.compartilhado) ? ci.compartilhado : []), ...(detectados?.compartilhado || [])])];
  const pm = stack.pm || 'npm';
  const raizWorkspace = nomesApps.some((a) => apps[a].dir !== '.');
  const lockfile = { npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', bun: 'bun.lock' }[pm] || 'package-lock.json';
  const lockRaiz = existe(path.join(raiz, lockfile));
  const temTypecheck = etapasCI.includes('typecheck');
  const criterio = criterioDe(config);
  // Conteúdo de cada app com os dirs efetivos (os do patch) e o compartilhado do patch (config + detectado).
  const cfgConteudo = { ...config, ci: { ...ci, compartilhado, apps: Object.fromEntries(nomesApps.map((n) => [n, { ...(ci.apps?.[n] || {}), dir: apps[n].dir }])) } };
  const conteudo = Object.fromEntries(nomesApps.map((n) => [n, caminhosDoApp(cfgConteudo, n)?.rx || null]));
  const saidas = Object.fromEntries(nomesApps.map((n) => [n, saidaDoApp(n)]));
  if (criterio === 'conteudo' && new Set(Object.values(saidas)).size !== nomesApps.length) avisos.push('dois apps viram o mesmo output do job reaproveitar: renomeie um deles em ci.apps');
  if (!nomesApps.length) avisos.push('nenhum app detectado: declare ci.apps no config');
  if (!etapasCI.length) avisos.push('ci.etapas vazio: nenhum job de app seria gerado');

  const L = [];
  const push = (...xs) => L.push(...xs);
  push(`# Proposta gerada pelo Workflow IA (wf ci gerar) em ${new Date().toISOString()}.`);
  push('# Copie para .github/workflows/ci.yml (só o humano edita essa pasta), revise e exija o check "ci-ok" na proteção do branch.');
  push(`# Convenção lida pelo wf: jobs "<app> (<etapa>)" ou "<app> (<etapa> i/N)"; "mudancas" decide os apps; "ci-ok" agrega.`);
  push(`name: ${j(ci.workflow || 'CI')}`, '', 'on:', '  pull_request:', `    branches: [${j(base)}]`, '    types: [opened, synchronize, reopened, ready_for_review]', '  workflow_dispatch:', '    inputs:', '      apps:', '        description: "Apps a testar (csv) ou todos"', '        required: false', '        default: "todos"', '        type: string', '', 'permissions:', '  contents: read', '', 'concurrency:', '  group: ci-${{ github.workflow }}-${{ github.ref }}', '  cancel-in-progress: true', '', 'env:', "  CI: '1'", '  NODE_ENV: test', '  FORCE_COLOR: "0"', '', 'jobs:');

  // mudancas: quais apps este run testa.
  push('  mudancas:', '    name: mudancas', '    runs-on: ubuntu-latest', '    outputs:', '      apps: ${{ steps.decidir.outputs.apps }}', '    steps:', '      - uses: actions/checkout@v4', '        with:', '          fetch-depth: 0', '      - id: decidir', '        shell: bash', '        env:', '          INPUT_APPS: ${{ github.event.inputs.apps }}', `          BASE: \${{ github.base_ref || ${j(base)} }}`, `          TODOS: ${j(JSON.stringify(nomesApps))}`, '        run: |');
  // ci.apps.X.entradas (0.9.0): arquivo que o app lê fora da pasta dele seleciona o app (antes do filtro de .md: um
  // app pode ler docs). Sem entradas declaradas, nenhuma linha nova (o yml da 0.8.0 fica igual).
  const linhasEntradas = nomesApps.filter((a) => apps[a].entradas).map((a) => `    case "$f" in ${apps[a].entradas.flatMap((g) => [globParaCase(String(g).replace(/\/+$/, '')), globParaCase(`${String(g).replace(/\/+$/, '')}/*`)]).join('|')}) sel="$sel ${a}"; ent=1 ;; esac`);
  const script = [
    'set -euo pipefail',
    'decidir() {',
    '  if [ -n "${INPUT_APPS:-}" ] && [ "$INPUT_APPS" != "todos" ]; then',
    '    echo "$INPUT_APPS" | tr "," "\\n" | sed "s/^ *//;s/ *$//" | grep -v "^$" | jq -R . | jq -cs .',
    '    return',
    '  fi',
    '  if [ "${INPUT_APPS:-}" = "todos" ] || ! git rev-parse --verify -q "origin/$BASE" > /dev/null; then echo "$TODOS"; return; fi',
    '  arquivos=$(git diff --name-only --no-renames "origin/$BASE...HEAD" || true)',
    '  [ -z "$arquivos" ] && { echo "$TODOS"; return; }',
    '  sel=""',
    '  while IFS= read -r f; do',
    ...(linhasEntradas.length ? ['    ent=0', ...linhasEntradas, '    [ "$ent" = 1 ] && continue'] : []),
    '    case "$f" in .workflow-ia/*|*.md) continue ;; esac',
    ...compartilhado.map((g) => `    case "$f" in ${globParaCase(g)}) echo "$TODOS"; return ;; esac`),
    ...nomesApps.map((a) => (apps[a].dir === '.' ? `    sel="$sel ${a}"; continue` : `    case "$f" in ${padraoCase(`${apps[a].dir}/*`)}) sel="$sel ${a}"; continue ;; esac`)),
    '    echo "$TODOS"; return',
    '  done <<< "$arquivos"',
    '  [ -z "$sel" ] && { echo "$TODOS"; return; }',
    '  echo "$sel" | tr " " "\\n" | grep -v "^$" | sort -u | jq -R . | jq -cs .',
    '}',
    'apps=$(decidir)',
    'echo "apps=$apps" >> "$GITHUB_OUTPUT"',
    'echo "Apps deste run: $apps"',
  ];
  push(...script.map((l) => `          ${l}`), '');

  // Nomes de job esperados por app (shards expandidos): a cobertura que o "reaproveitar" exige do run anterior.
  const esperados = {};
  for (const app of nomesApps) {
    for (const etapa of etapasCI) {
      if (!comandoDe(config, etapa, app, apps[app].dir).comando) continue;
      const sh = ['teste-unitario', 'teste-integracao', 'teste-e2e'].includes(etapa) ? apps[app].shards : 1;
      const n = sh > 1 && comShard(comandoDe(config, etapa, app, apps[app].dir).comando, apps[app].runner, sh) !== null ? sh : 1;
      (esperados[app] = esperados[app] || []).push(...(n > 1 ? Array.from({ length: n }, (_, i) => `${app} (${etapa} ${i + 1}/${n})`) : [`${app} (${etapa})`]));
    }
  }
  if (criterio === 'conteudo') {
    // Por app e por conteúdo: checkout só do merge (fetch-depth 1); o commit do dispatch é buscado pelo SHA.
    push('  reaproveitar:', '    name: reaproveitar', '    needs: [mudancas]', "    if: github.event_name == 'pull_request'", '    runs-on: ubuntu-latest', '    permissions:', '      actions: read', '      contents: read', '    outputs:', ...nomesApps.map((n) => `      ${saidas[n]}: \${{ steps.buscar.outputs.${saidas[n]} }}`), '      run_url: ${{ steps.buscar.outputs.run_url }}', '    steps:', '      - uses: actions/checkout@v4', '        with:', '          fetch-depth: 1', '      - id: buscar', '        shell: bash', '        env:', '          GH_TOKEN: ${{ github.token }}', '          HEAD_REF: ${{ github.head_ref }}', '          HEAD_REPO: ${{ github.event.pull_request.head.repo.full_name }}', '          APPS: ${{ needs.mudancas.outputs.apps }}', `          ESPERADOS: ${j(JSON.stringify(esperados))}`, `          CONTEUDO: ${j(JSON.stringify(conteudo))}`, `          SAIDAS: ${j(JSON.stringify(saidas))}`, '        run: |');
    push(...SCRIPT_REAPROVEITAR_CONTEUDO.map((l) => `          ${l}`), '');
  } else {
    push('  reaproveitar:', '    name: reaproveitar', '    needs: [mudancas]', "    if: github.event_name == 'pull_request'", '    runs-on: ubuntu-latest', '    permissions:', '      actions: read', '      contents: read', '    outputs:', '      reaproveitado: ${{ steps.buscar.outputs.reaproveitado }}', '      run_url: ${{ steps.buscar.outputs.run_url }}', '    steps:', '      - uses: actions/checkout@v4', '        with:', '          fetch-depth: 2', '      - id: buscar', '        shell: bash', '        env:', '          GH_TOKEN: ${{ github.token }}', '          HEAD_SHA: ${{ github.event.pull_request.head.sha }}', '          APPS: ${{ needs.mudancas.outputs.apps }}', `          ESPERADOS: ${j(JSON.stringify(esperados))}`, '        run: |');
    push(...SCRIPT_REAPROVEITAR.map((l) => `          ${l}`), '');
  }

  const jobsApp = [];
  const gerados = new Set();
  for (const app of nomesApps) {
    const a = apps[app];
    for (const etapa of etapasCI) {
      const { comando, dir, origem } = comandoDe(config, etapa, app, a.dir);
      if (!comando) {
        avisos.push(`${app} (${etapa}): sem comando (${origem}); job omitido. Declare ${etapa} ou ${etapa}:${app} em gate.etapas com comando.`);
        continue;
      }
      const shards = ['teste-unitario', 'teste-integracao', 'teste-e2e'].includes(etapa) ? a.shards : 1;
      const cmd = comShard(comando, a.runner, shards);
      if (cmd === null) {
        avisos.push(`${app} (${etapa}): shards só valem para vitest/jest/playwright; "${comando}" roda sem shard`);
      }
      const n = cmd === null ? 1 : shards;
      const comandoFinal = cmd === null ? comando : cmd;
      const usaBase = /\{base\}|\bWF_BASE\b/.test(comandoFinal);
      const run = usaBase ? comandoFinal.replaceAll('{base}', `origin/\${{ github.base_ref || ${j(base).replace(/"/g, "'")} }}`) : comandoFinal;
      const id = idJob(app, etapa);
      const banco = a.banco && (etapa === 'teste-integracao' || etapa === 'teste-e2e');
      // needs só para um job que existe: o typecheck omitido (sem comando) não pode ser dependência (B1).
      const tcId = temTypecheck && etapa !== 'typecheck' && gerados.has(idJob(app, 'typecheck')) ? idJob(app, 'typecheck') : null;
      const needs = ['mudancas', 'reaproveitar', ...(tcId ? [tcId] : [])];
      // !cancelled(): no workflow_dispatch o "reaproveitar" fica pulado e, sem uma função de status, o pulo derrubaria
      // este job. Por isso as condições de antes ficam explícitas (mudancas ok e, com needs, o typecheck do app ok: M5).
      const condicao = ['!cancelled()', "needs.mudancas.result == 'success'", criterio === 'conteudo' ? `needs.reaproveitar.outputs.${saidas[app]} != 'true'` : "needs.reaproveitar.outputs.reaproveitado != 'true'", `contains(fromJSON(needs.mudancas.outputs.apps), ${j(app).replace(/"/g, "'")})`, ...(tcId ? [`needs.${tcId}.result == 'success'`] : [])].join(' && ');
      jobsApp.push({ id, app, etapa });
      gerados.add(id);
      push(`  ${id}:`, `    name: ${n > 1 ? j(`${app} (${etapa} \${{ matrix.shard }}/${n})`) : j(`${app} (${etapa})`)}`, `    needs: [${needs.join(', ')}]`, `    if: \${{ ${condicao} }}`, '    runs-on: ubuntu-latest', `    timeout-minutes: ${Math.max(10, Number(ci.timeoutMin) || 30)}`);
      if (n > 1) push('    strategy:', '      fail-fast: false', '      matrix:', `        shard: [${Array.from({ length: n }, (_, i) => i + 1).join(', ')}]`);
      if (banco) {
        push('    services:', '      postgres:', `        image: ${POSTGRES}`, '        env:', '          POSTGRES_USER: postgres', '          POSTGRES_PASSWORD: postgres', '          POSTGRES_DB: test', '        ports: ["5432:5432"]', '        options: >-', '          --health-cmd "pg_isready -U postgres"', '          --health-interval 5s', '          --health-timeout 5s', '          --health-retries 10');
      }
      push('    env:');
      if (banco) push(`      DATABASE_URL: ${j(DATABASE_URL_TESTE)}`, '      # Segredos de teste descartáveis: nunca os secrets do repositório.', '      JWT_SECRET: "ci-teste-descartavel"');
      push('      WF_CI: "1"', '    steps:', '      - uses: actions/checkout@v4');
      if (usaBase) push('        with:', '          fetch-depth: 0');
      if (pm === 'pnpm') push('      - uses: pnpm/action-setup@v4', ...(stack.pkg?.packageManager ? [] : ['        with:', `          version: ${j(versaoPnpm(raiz))}`]));
      if (pm === 'bun') push('      - uses: oven-sh/setup-bun@v2');
      // setup-node falha com "cache" quando o lockfile não existe (e não conhece o do bun).
      const cacheNode = pm !== 'bun' && (lockRaiz || existe(path.join(raiz, a.dir, lockfile)));
      push('      - uses: actions/setup-node@v4', '        with:', `          node-version: ${j(NODE)}`, ...(cacheNode ? [`          cache: ${j(pm)}`, `          cache-dependency-path: ${j(raizWorkspace || lockRaiz || a.dir === '.' ? lockfile : path.posix.join(a.dir, lockfile))}`] : []));
      push(`      - run: ${j(stack.install || 'npm ci')}`, ...(raizWorkspace || lockRaiz || a.dir === '.' ? [] : [`        working-directory: ${j(a.dir)}`]));
      if (banco && a.prisma) push(`      - run: ${j(`${stack.exec || 'npx'} prisma generate`)}`, `        working-directory: ${j(a.dir)}`, `      - run: ${j(`${stack.exec || 'npx'} prisma migrate deploy`)}`, `        working-directory: ${j(a.dir)}`);
      push(`      - name: ${j(etapa)}`, `        run: ${j(run)}`, ...(dir && dir !== '.' ? [`        working-directory: ${j(dir)}`] : []));
      push('      - if: failure()', '        uses: actions/upload-artifact@v4', '        with:', `          name: ${j(`relatorio-${id}${n > 1 ? '-${{ matrix.shard }}' : ''}`)}`, '          if-no-files-found: ignore', '          retention-days: 7', '          path: |', `            ${path.posix.join(a.dir === '.' ? '' : a.dir, 'test-results/**')}`, `            ${path.posix.join(a.dir === '.' ? '' : a.dir, 'coverage/**')}`, `            ${path.posix.join(a.dir === '.' ? '' : a.dir, 'playwright-report/**')}`, '');
    }
  }

  // ci-ok: depende de todos os jobs de app; falha em failure/cancelled e em skipped de app alterado.
  // reaproveitado = 'true' (só no pull_request): os jobs de app pulados de propósito não reprovam; failure/cancelled sim.
  if (criterio === 'conteudo') {
    // Pulado só vale para app fora do run ou com reaproveitar.outputs.<app> = 'true' (e o reaproveitar em success).
    push('  ci-ok:', '    name: ci-ok', `    needs: [mudancas, reaproveitar${jobsApp.length ? `, ${jobsApp.map((x) => x.id).join(', ')}` : ''}]`, '    if: always()', '    runs-on: ubuntu-latest', '    steps:', '      - shell: bash', '        env:', '          NEEDS: ${{ toJSON(needs) }}', '          APPS: ${{ needs.mudancas.outputs.apps }}', '          REAP: ${{ toJSON(needs.reaproveitar.outputs) }}', '          RUN_URL: ${{ needs.reaproveitar.outputs.run_url }}', `          SAIDAS: ${j(JSON.stringify(saidas))}`, `          JOBS: ${j(JSON.stringify(jobsApp.map((x) => ({ id: x.id, app: x.app }))))}`, '        run: |', ...SCRIPT_CI_OK_CONTEUDO.map((l) => `          ${l}`));
  } else push('  ci-ok:', '    name: ci-ok', `    needs: [mudancas, reaproveitar${jobsApp.length ? `, ${jobsApp.map((x) => x.id).join(', ')}` : ''}]`, '    if: always()', '    runs-on: ubuntu-latest', '    steps:', '      - shell: bash', '        env:', '          NEEDS: ${{ toJSON(needs) }}', '          APPS: ${{ needs.mudancas.outputs.apps }}', '          REAPROVEITADO: ${{ needs.reaproveitar.outputs.reaproveitado }}', '          RUN_URL: ${{ needs.reaproveitar.outputs.run_url }}', `          JOBS: ${j(JSON.stringify(jobsApp.map((x) => ({ id: x.id, app: x.app }))))}`, '        run: |', ...[
    'set -euo pipefail',
    'if [ "$(echo "$NEEDS" | jq -r \'.mudancas.result\')" != "success" ]; then echo "mudancas falhou"; exit 1; fi',
    'reap=false; [ "${REAPROVEITADO:-}" = "true" ] && reap=true',
    'ruim=$(echo "$NEEDS" | jq -r --argjson jobs "$JOBS" --argjson apps "${APPS:-[]}" --argjson reap "$reap" \'',
    '  to_entries | map(select(.key != "mudancas" and .key != "reaproveitar")) | map(',
    '    . as $e | ($jobs[] | select(.id == $e.key) | .app) as $app |',
    '    if ($e.value.result == "failure" or $e.value.result == "cancelled") then "\\($e.key): \\($e.value.result)"',
    '    elif ($e.value.result == "skipped" and ($reap | not) and ($apps | index($app)) != null) then "\\($e.key): pulado para app alterado"',
    '    else empty end) | .[]\')',
    'if [ -n "$ruim" ]; then echo "$ruim"; exit 1; fi',
    'if [ "$reap" = true ]; then echo "ci-ok: reaproveitado do run $RUN_URL (workflow_dispatch do mesmo head SHA, mesmo código, apps $APPS em success)"; exit 0; fi',
    'echo "ci-ok: todos os jobs dos apps $APPS passaram"',
  ].map((l) => `          ${l}`));
  const yml = `${L.join('\n')}\n`;

  const patch = {
    ci: {
      ...(config.ci || {}),
      ativo: true,
      provedor: 'github-actions',
      workflow: ci.workflow || 'CI',
      // Só etapas (grupos) que o gate tem: uma etapa inexistente no patch viraria erro do doctor com o CI ligado (B1).
      etapas: ((ci.etapas || []).length ? ci.etapas : ['typecheck', 'teste-unitario', 'teste-integracao', 'build']).filter((e) => gruposDoGate.has(e)),
      apps: Object.fromEntries(nomesApps.map((n) => [n, { dir: apps[n].dir, banco: apps[n].banco, shards: apps[n].shards, ...(apps[n].entradas ? { entradas: apps[n].entradas } : {}) }])),
      compartilhado,
    },
  };
  const validacao = validarYml(yml, { jobsApp, temActionlint: which('actionlint') });
  for (const e of validacao.erros) avisos.push(`validação do yml: ${e}`);
  for (const a of validacao.avisos) avisos.push(a);
  return { yml, patch, avisos, validacao, apps, etapas: etapasCI, base, pm, compartilhado, jobs: jobsApp.map((x) => x.id), criterio, ...(criterio === 'conteudo' ? { conteudo: Object.fromEntries(nomesApps.map((n) => [n, caminhosDoApp(cfgConteudo, n)?.caminhos || null])) } : {}) };
}

// Script do job "reaproveitar" (bash + gh api + jq; o runner do GitHub tem os três). Nunca reprova o job: na dúvida,
// reaproveitado=false e os jobs de app rodam como sempre.
const SCRIPT_REAPROVEITAR = [
  'set -uo pipefail',
  'R=false; U=""',
  'trap \'echo "reaproveitado=$R" >> "$GITHUB_OUTPUT"; [ -n "$U" ] && echo "run_url=$U" >> "$GITHUB_OUTPUT"; true\' EXIT',
  'nao() { echo "Sem reaproveitamento: $1 (os jobs dos apps rodam)"; exit 0; }',
  '[ -n "${HEAD_SHA:-}" ] || nao "fora de um pull_request"',
  '[ "$(echo "${APPS:-[]}" | jq \'length\' 2>/dev/null || echo 0)" -gt 0 ] || nao "nenhum app neste run"',
  // O checkout é o merge commit que este run testa: ele só é o código do head quando as árvores são iguais (a base
  // está contida no head). Mais forte que conferir o base.sha do evento, que pode estar desatualizado.
  'git cat-file -e "$HEAD_SHA^{commit}" 2>/dev/null || git fetch -q --depth=1 origin "$HEAD_SHA" 2>/dev/null || true',
  '[ "$(git rev-parse \'HEAD^{tree}\' 2>/dev/null)" = "$(git rev-parse "$HEAD_SHA^{tree}" 2>/dev/null)" ] || nao "o merge testado por este run não é o código do head $HEAD_SHA (a base andou): roda tudo"',
  'wf=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" --jq \'.workflow_id // empty\' 2>/dev/null) || true',
  '[ -n "${wf:-}" ] || nao "não consegui ler o workflow deste run"',
  // Todos os dispatches CONCLUÍDOS do mesmo head SHA, do resultado mais novo ao mais antigo; só valem os verdes mais
  // novos que o primeiro que não terminou success (uma verificação vermelha mais nova nunca é encoberta por verde antigo).
  'runs=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$wf/runs?head_sha=$HEAD_SHA&event=workflow_dispatch&status=completed&per_page=50" --jq \'[.workflow_runs[] | select(.head_sha == env.HEAD_SHA and .event == "workflow_dispatch" and .status == "completed")] | sort_by(.updated_at) | reverse | . as $r | ([range(0; length) | select($r[.].conclusion != "success")] | first // ($r | length)) as $i | $r[0:$i][] | "\\(.id)|\\(.html_url)"\' 2>/dev/null) || nao "não consegui listar os runs do mesmo head SHA"',
  // União dos jobs success de todos os dispatches verdes do mesmo head SHA (a verificação pode ter disparado só os
  // apps que faltavam); --paginate e a lista por stdin: matriz grande não estoura o argumento do jq.
  'ok=""; urls=""',
  'for linha in $runs; do',
  '  id=${linha%%|*}; url=${linha#*|}',
  '  nomes=$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs/$id/jobs?filter=latest&per_page=100" --jq \'.jobs[] | select(.conclusion == "success") | .name\' 2>/dev/null) || continue',
  '  ok="$ok$nomes"$\'\\n\'; urls="$urls $url"',
  'done',
  '[ -n "$urls" ] || nao "nenhum run verde de workflow_dispatch do mesmo head SHA mais novo que a última falha"',
  'falta=$(printf \'%s\\n\' "$ok" | jq -rRn --argjson esperados "$ESPERADOS" --argjson apps "$APPS" \'[inputs] as $ok | [$apps[] as $a | ($esperados[$a] // ["\\($a) (?)"])[] as $n | select(($ok | index($n)) == null) | $n] | join(", ")\' 2>/dev/null) || nao "não consegui conferir a cobertura"',
  '[ -z "$falta" ] || nao "os runs verdes do mesmo head SHA não cobrem: $falta"',
  'R=true; U="${urls# }"',
  'echo "Reaproveitado: $U (workflow_dispatch, mesmo head SHA $HEAD_SHA, mesmo código) já provou os apps $APPS"',
];

// 0.9.0 (critério "conteudo"): os scripts do "reaproveitar" e do "ci-ok" vivem em lib/ci-yml/*.sh (bash puro,
// conferidos pelo shellcheck) e entram no yml como o bloco run. Nenhum deles usa "${{ }}" (expressão do Actions).
const lerScriptYml = (nome) => fs.readFileSync(new URL(`./ci-yml/${nome}`, import.meta.url), 'utf8').replace(/\n+$/, '').split('\n');
const SCRIPT_REAPROVEITAR_CONTEUDO = lerScriptYml('reaproveitar-conteudo.sh');
const SCRIPT_CI_OK_CONTEUDO = lerScriptYml('ci-ok-conteudo.sh');

/** Glob simples → padrão de `case` do bash (** e * viram *; {a,b} não é expandido: cai em *), com os trechos literais entre aspas. */
function globParaCase(g) {
  return padraoCase(String(g).replace(/\{[^}]*\}/g, '*').replace(/\*\*\/?/g, '*').replace(/\*\*/g, '*'));
}

/** Padrão de `case`: só * e ? ficam soltos; o resto vai entre aspas duplas (espaço, $, parênteses não quebram o script) (B6). */
function padraoCase(p) {
  return String(p)
    .split(/([*?])/)
    .map((parte) => (parte === '*' || parte === '?' ? parte : parte ? JSON.stringify(parte).replace(/\$/g, '\\$').replace(/`/g, '\\`') : ''))
    .join('');
}

/**
 * Validação mínima do yml (sem parser de YAML): sem tabs, indentação par, jobs com runs-on e steps, needs apontando
 * para jobs existentes, ci-ok dependendo de todos os jobs de app e nomes na convenção. Devolve { ok, erros, avisos }.
 */
const INFRA_YML = ['mudancas', 'reaproveitar', 'ci-ok'];

export function validarYmlMinimo(texto) {
  const erros = [];
  const linhas = String(texto || '').split('\n');
  if (linhas.some((l) => /\t/.test(l))) erros.push('há tabs (YAML exige espaços)');
  for (const l of linhas) {
    const m = /^( +)\S/.exec(l);
    if (m && m[1].length % 2 !== 0) erros.push(`indentação ímpar: "${l.trim().slice(0, 40)}"`);
  }
  const iJobs = linhas.findIndex((l) => /^jobs:\s*$/.test(l));
  if (iJobs < 0) return { ok: false, erros: [...erros, 'sem "jobs:"'], avisos: [] };
  const jobs = {};
  let atual = null;
  for (const l of linhas.slice(iJobs + 1)) {
    const mj = /^  ([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (mj) {
      atual = mj[1];
      jobs[atual] = { runsOn: false, steps: false, needs: [], name: null };
      continue;
    }
    if (!atual) continue;
    if (/^    runs-on:/.test(l)) jobs[atual].runsOn = true;
    if (/^    steps:/.test(l)) jobs[atual].steps = true;
    const mn = /^    needs:\s*\[(.*)\]\s*$/.exec(l);
    if (mn) jobs[atual].needs = mn[1].split(',').map((x) => x.trim()).filter(Boolean);
    const nm = /^    name:\s*(.+)$/.exec(l);
    if (nm) {
      try {
        jobs[atual].name = JSON.parse(nm[1]);
      } catch {
        jobs[atual].name = nm[1].replace(/^["']|["']$/g, '');
      }
    }
  }
  const ids = Object.keys(jobs);
  for (const [id, jb] of Object.entries(jobs)) {
    if (!jb.runsOn) erros.push(`job ${id} sem runs-on`);
    if (!jb.steps) erros.push(`job ${id} sem steps`);
    for (const n of jb.needs) if (!ids.includes(n)) erros.push(`job ${id} depende de "${n}", que não existe`);
    if (!INFRA_YML.includes(id)) {
      const nome = String(jb.name || '').replace(/\$\{\{\s*matrix\.shard\s*\}\}/, '1');
      if (!RX_NOME_JOB.test(nome)) erros.push(`job ${id}: name "${jb.name}" fora da convenção "<app> (<etapa>)"`);
    }
  }
  if (!jobs['ci-ok']) erros.push('sem o job agregador ci-ok');
  else {
    const deApp = ids.filter((i) => !INFRA_YML.includes(i));
    const faltam = [...deApp, ...(jobs.reaproveitar ? ['reaproveitar'] : [])].filter((i) => !jobs['ci-ok'].needs.includes(i));
    if (faltam.length) erros.push(`ci-ok não depende de: ${faltam.join(', ')}`);
  }
  if (!jobs.mudancas) erros.push('sem o job mudancas');
  return { ok: erros.length === 0, erros, avisos: [], jobs: ids };
}

function validarYml(yml, { temActionlint }) {
  const v = validarYmlMinimo(yml);
  const avisos = [];
  if (temActionlint) {
    const r = spawnSync('actionlint', ['-no-color', '-'], { input: yml, encoding: 'utf8' });
    v.actionlint = { rodou: true, ok: r.status === 0, saida: `${r.stdout || ''}${r.stderr || ''}`.trim() };
    if (r.status !== 0) avisos.push(`actionlint: ${v.actionlint.saida.split('\n').slice(0, 5).join(' | ')}`);
  } else v.actionlint = { rodou: false, ok: null, saida: 'actionlint não está no PATH (brew install actionlint): a proposta foi validada só pelo validador mínimo' };
  return { ...v, avisos, ok: v.ok && (v.actionlint.ok !== false) };
}

/** LEIA-ME.md da proposta: os passos do humano. */
export function textoLeiaMe(config, proposta) {
  const ci = proposta.patch.ci;
  return [
    '# Modo CI do Workflow IA: proposta',
    '',
    `Gerada por \`wf ci gerar\` em ${new Date().toISOString()}. Nada aqui é aplicado sozinho: o plugin não escreve em \`.github/workflows/\` nem liga o CI.`,
    '',
    '## O que o humano faz',
    '',
    `1. Copie \`ci.yml.proposta\` para \`.github/workflows/ci.yml\`, revise (versões do Node e do Postgres, comandos, segredos de teste) e faça commit na branch base (\`${proposta.base}\`): o \`gh workflow run\` só acha o workflow pelo nome quando ele existe no branch padrão.`,
    `2. Aplique \`config.patch.json\` no \`.workflow-ia/config.json\` (só o bloco \`ci\`; \`wf ci ativar --aplicar\` faz isso quando rodado por um humano). Confira com \`wf doctor\` (check \`ci\`).`,
    `3. Na proteção do branch \`${proposta.base}\`, exija o check \`ci-ok\`.`,
    '4. Confira `gh auth status` na máquina que roda o Workflow IA (o modo CI usa a CLI `gh`).',
    '5. Rode `wf ci status` para ver o plano por etapa e o pré-voo.',
    '',
    '## O que roda onde (com o CI ativo)',
    '',
    '| etapa | onde |',
    '| --- | --- |',
    ...(config.gate?.etapas || []).map((e) => `| ${e.nome} | ${proposta.etapas.includes(e.nome.split(':')[0]) ? 'CI' : 'local'} |`),
    `| ${NOME_TESTE_CI} (sintética) | CI: segredos local → push → dispara o workflow → espera o run do mesmo SHA |`,
    '',
    `Só na fase \`${(ci.fases || ['verificacao']).join(', ')}\`; RED, implementação e loop continuam locais. \`WF_GATE_CI=1\` força em qualquer fase; \`WF_GATE_CI_FALLBACK=local\` roda tudo na máquina.`,
    '',
    '## CI econômico',
    '',
    'A `teste-ci` reaproveita o run do mesmo SHA (sem push nem disparo), anexa ao run em andamento, repete só os jobs que falharam numa verificação anterior (`gh run rerun --failed`, `ci.repetirFalhas`) e dispara só os apps que faltam. `WF_GATE_CI_NOVO=1` força um run novo.',
    '',
    `Critério do reaproveitamento (\`ci.criterioReaproveitar\`): **${proposta.criterio || 'commit'}**.`,
    '',
    ...(proposta.criterio === 'conteudo'
      ? [
          '- No `pull_request`, o job `reaproveitar` decide **por app**: o `workflow_dispatch` concluído mais novo da branch da PR que testou o app (com todos os jobs esperados dele em `success` e o run inteiro em `success`) prova o app quando o **hash do conteúdo** do app (`git ls-tree -r` dos caminhos abaixo) e o do workflow são iguais no commit do dispatch e no merge que o run testa. O job do app pula e o `ci-ok` aceita o pulo só para o app com `reaproveitar.outputs.<app> == "true"`. Dispatch mais novo vermelho, cancelado ou sem cobrir o app: o app roda. Qualquer dúvida (API, fetch, PR de fork): roda.',
          '- A verificação (`teste-ci`) usa o mesmo critério: um dispatch verde de um commit anterior da mesma branch prova o app no HEAD com o mesmo conteúdo (`ci.json`: `criterio: "conteudo"` e os hashes).',
          '- Caminhos de cada app (`ci.apps.<app>.dir` + `ci.compartilhado` + `ci.apps.<app>.entradas` + lockfiles da raiz; o workflow tem hash à parte):',
          ...Object.entries(proposta.conteudo || {}).map(([n, cs]) => `  - **${n}**: ${cs ? cs.map((x) => `\`${x}\``).join(', ') : 'sem dir: nunca reaproveitado'}`),
          '- App que lê arquivo fora da pasta dele (ex.: `docs/`, `tests/` na raiz) precisa declará-lo em `ci.apps.<app>.entradas`; o `wf doctor` avisa o que achar nos arquivos de config do app.',
        ]
      : ['- No `pull_request`, o job `reaproveitar` pula os jobs de app quando os `workflow_dispatch` verdes do mesmo head SHA (mais novos que a última falha) já cobriram os apps alterados e o merge testado tem a árvore do head; o `ci-ok` passa citando esse run. Para reaproveitar quando a base anda sem tocar o app, use `ci.criterioReaproveitar: "conteudo"` e gere de novo.']),
    '',
    '## Apps e shards',
    '',
    ...Object.entries(proposta.apps).map(([n, a]) => `- **${n}** (\`${a.dir}\`): banco ${a.banco ? 'sim (Postgres como service)' : 'não'}, shards ${a.shards}${a.runner ? `, runner ${a.runner}` : ''}`),
    '',
    '## Custo estimado',
    '',
    `Cada run gasta, em minutos do Actions, a soma das durações dos jobs (ubuntu-latest, 1 minuto = 1 minuto do plano). Com ${Object.keys(proposta.apps).length} app(s) e ${proposta.etapas.length} etapa(s), um run típico tem ${proposta.jobs.length} job(s) de app; shards dividem a suíte, não o total.`,
    '',
    '## Avisos do gerador',
    '',
    ...(proposta.avisos.length ? proposta.avisos.map((a) => `- ${a}`) : ['- nenhum']),
    '',
  ].join('\n');
}

/**
 * Grava a proposta em .workflow-ia/ci/ (recusa qualquer destino dentro de .github/). Devolve os caminhos relativos.
 */
export function gravarProposta(raiz, config, proposta, { pasta = PASTA_PROPOSTA } = {}) {
  const rel = String(pasta).replace(/\\/g, '/').replace(/^\.\//, '');
  if (/^\.github(?:\/|$)/.test(rel) || rel.split('/').includes('.github')) throw new Error('o plugin não escreve em .github/ (arquivo só do humano): a proposta vai para .workflow-ia/ci/');
  const dir = path.join(raiz, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ARQUIVOS_PROPOSTA.yml), proposta.yml);
  gravarJSON(path.join(dir, ARQUIVOS_PROPOSTA.patch), proposta.patch);
  fs.writeFileSync(path.join(dir, ARQUIVOS_PROPOSTA.leiame), textoLeiaMe(config, proposta));
  return { pasta: rel, yml: path.posix.join(rel, ARQUIVOS_PROPOSTA.yml), patch: path.posix.join(rel, ARQUIVOS_PROPOSTA.patch), leiame: path.posix.join(rel, ARQUIVOS_PROPOSTA.leiame) };
}

/** Diferença entre o bloco ci atual e o do patch: [{ chave, de, para }] (folhas). */
export function diffCI(atual, patch) {
  const folhas = (obj, prefixo = '', saida = {}) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const chave = prefixo ? `${prefixo}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) folhas(v, chave, saida);
      else saida[chave] = v;
    }
    return saida;
  };
  const a = folhas(atual || {});
  const b = folhas(patch || {});
  const chaves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return chaves.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => ({ chave: `ci.${k}`, de: a[k], para: b[k] }));
}
