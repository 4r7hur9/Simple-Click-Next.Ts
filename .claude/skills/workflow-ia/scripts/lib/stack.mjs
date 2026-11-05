// Detecção da stack de um projeto Node (package.json, lockfile, scripts, dependências): gerenciador de pacotes,
// comandos do gate e, para o modo CI, os apps de um monorepo. Era o topo do instalador (até a 0.6.0); vive aqui
// para o `wf ci gerar` reaproveitar a mesma leitura. A lógica da detecção é a mesma do instalador, sem mudanças.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONFIG_PADRAO, SAST_PADRAO, lerJSON, existe } from './core.mjs';

/** O binário existe no PATH? (which/where). */
export function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}

// "vitest" sem "run" roda uma vez só quando CI=1 (o wf define CI=1 ao rodar o gate).
// Scripts em modo watch nunca terminam: o gate travaria até o timeout.
export function ehWatch(cmd) {
  return /(?:^|\s)--watch(?:All)?(?!=false)(?:[=\s]|$)|(?:^|\s)watch(?:\s|$)|(?:^|\s)-w(?:\s|$)/.test(String(cmd || ''));
}

/**
 * Detecta a stack do projeto em `projeto`: { pkg, scripts, deps, tem, pm, run, exec, install, stack, comandos,
 * temVitest, temJest, sUnit, sInt, sE2E }. `which` é injetável (os testes rodam com PATH enxuto).
 */
export function detectarStack(projeto, { which: temBin = which } = {}) {
  const pkg = lerJSON(path.join(projeto, 'package.json'), null);
  const scripts = pkg?.scripts || {};
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const tem = (d) => Object.prototype.hasOwnProperty.call(deps, d);

  let pm = 'npm';
  if (existe(path.join(projeto, 'pnpm-lock.yaml'))) pm = 'pnpm';
  else if (existe(path.join(projeto, 'yarn.lock'))) pm = 'yarn';
  else if (existe(path.join(projeto, 'bun.lockb')) || existe(path.join(projeto, 'bun.lock'))) pm = 'bun';
  else if (pkg?.packageManager) pm = String(pkg.packageManager).split('@')[0];

  const run = { npm: 'npm run', pnpm: 'pnpm', yarn: 'yarn', bun: 'bun run' }[pm] || 'npm run';
  const exec = { npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn', bun: 'bunx' }[pm] || 'npx';
  const install = { npm: existe(path.join(projeto, 'package-lock.json')) ? 'npm ci' : 'npm install', pnpm: 'pnpm install --frozen-lockfile', yarn: 'yarn install --frozen-lockfile', bun: 'bun install --frozen-lockfile' }[pm];

  // "vitest" sem "run" roda uma vez só quando CI=1 (o wf define CI=1 ao rodar o gate).
  // Scripts em modo watch nunca terminam: o gate travaria até o timeout.
  const scriptSemWatch = (nome) => (scripts[nome] && !ehWatch(scripts[nome]) ? nome : null);
  const primeiroScript = (...nomes) => nomes.find((n) => scripts[n] && !ehWatch(scripts[n]));

  const stack = [];
  if (tem('next')) stack.push('nextjs');
  if (tem('react')) stack.push('react');
  if (tem('express')) stack.push('express');
  if (tem('@nestjs/core')) stack.push('nestjs');
  if (tem('prisma') || tem('@prisma/client')) stack.push('prisma');
  if (tem('drizzle-orm')) stack.push('drizzle');
  if (tem('pg') || existe(path.join(projeto, 'prisma/schema.prisma'))) stack.push('postgresql');
  if (existe(path.join(projeto, 'tsconfig.json'))) stack.push('typescript');

  const comandos = { ...CONFIG_PADRAO.comandos };
  comandos.instalar = pkg ? install : '';

  const sTypecheck = primeiroScript('typecheck', 'type-check', 'tsc', 'check-types', 'types');
  comandos.typecheck = sTypecheck ? `${run} ${sTypecheck}` : existe(path.join(projeto, 'tsconfig.json')) ? `${exec} tsc --noEmit` : '';

  comandos.lint = scripts.lint ? `${run} lint` : tem('eslint') ? `${exec} eslint .` : '';
  comandos.lintArquivo = tem('eslint') ? `${exec} eslint --fix {arquivo}` : tem('@biomejs/biome') ? `${exec} biome check --write {arquivo}` : '';
  comandos.formatarArquivo = tem('prettier') ? `${exec} prettier --write --ignore-unknown {arquivo}` : '';

  const temVitest = tem('vitest');
  const temJest = tem('jest');
  const sUnit = primeiroScript('test:unit', 'test:unitario', 'test:unitarios');
  const sInt = primeiroScript('test:integration', 'test:int', 'test:integracao');
  const sE2E = primeiroScript('test:e2e', 'e2e', 'test:playwright');
  if (sUnit) comandos.testeUnitario = `${run} ${sUnit}`;
  else if (scriptSemWatch('test')) comandos.testeUnitario = `${run} test`;
  else if (temVitest) comandos.testeUnitario = `${exec} vitest run`;
  else if (temJest) comandos.testeUnitario = `${exec} jest`;
  if (sInt) comandos.testeIntegracao = `${run} ${sInt}`;
  if (sE2E) comandos.testeE2E = `${run} ${sE2E}`;
  else if (tem('@playwright/test')) comandos.testeE2E = `${exec} playwright test`;
  comandos.testeArquivo = temVitest ? `${exec} vitest run {arquivo}` : temJest ? `${exec} jest {arquivo}` : '';
  // Execução focada (0.6.0): "wf red" só com os testes da task e "wf checar" só com o que mudou.
  comandos.testeArquivos = temVitest ? `${exec} vitest run {arquivos}` : temJest ? `${exec} jest {arquivos}` : '';
  comandos.testesRelacionados = temVitest ? `${exec} vitest related --run {arquivos}` : temJest ? `${exec} jest --findRelatedTests {arquivos}` : '';
  comandos.testeE2EArquivos = tem('@playwright/test') ? `${exec} playwright test {arquivos}` : '';
  comandos.build = scripts.build ? `${run} build` : '';

  if (temBin('semgrep')) comandos.sast = SAST_PADRAO;
  if (pm === 'npm') comandos.dependencias = 'npm audit --audit-level=high --omit=dev';
  else if (pm === 'pnpm') comandos.dependencias = 'pnpm audit --audit-level high --prod';
  // Só os commits do branch da task ({base} vira a ref do branch base no gate): um
  // segredo antigo, já removido do histórico da base, não pode bloquear toda task.
  if (temBin('gitleaks')) comandos.segredos = 'gitleaks detect --no-banner --redact --log-opts="{base}..HEAD"';
  return { pkg, scripts, deps, tem, pm, run, exec, install, stack, comandos, temVitest, temJest, sUnit, sInt, sE2E };
}

// --------------------------------------------------------------------------- apps (monorepo), para o modo CI

/** Dependências de um package.json (dependencies + devDependencies). */
function depsDe(pkg) {
  return { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
}

/** Globs de workspaces: package.json ("workspaces" como lista ou {packages}) ou pnpm-workspace.yaml (parser mínimo). */
export function lerWorkspaces(projeto, pkg) {
  const ws = pkg?.workspaces;
  if (Array.isArray(ws) && ws.length) return { globs: ws.map(String), origem: 'workspaces' };
  if (ws && Array.isArray(ws.packages) && ws.packages.length) return { globs: ws.packages.map(String), origem: 'workspaces' };
  const yml = path.join(projeto, 'pnpm-workspace.yaml');
  if (existe(yml)) {
    const globs = [];
    let dentro = false;
    for (const linha of fs.readFileSync(yml, 'utf8').split('\n')) {
      if (/^packages\s*:/.test(linha)) {
        dentro = true;
        continue;
      }
      if (dentro && /^\s*-\s*/.test(linha)) globs.push(linha.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, ''));
      else if (dentro && /^\S/.test(linha)) dentro = false;
    }
    if (globs.length) return { globs, origem: 'pnpm-workspace' };
  }
  if (existe(path.join(projeto, 'apps'))) return { globs: ['apps/*'], origem: 'apps/*' };
  return { globs: [], origem: 'raiz' };
}

/** Expande globs simples de workspace ("apps/*", "packages/*", "apps/web") em diretórios com package.json. */
function expandirWorkspace(projeto, glob) {
  const g = String(glob).replace(/^\.\//, '').replace(/\/+$/, '');
  if (!g || g.startsWith('!')) return [];
  if (g.endsWith('/*')) {
    const base = g.slice(0, -2);
    const abs = path.join(projeto, base);
    if (!existe(abs)) return [];
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existe(path.join(abs, d.name, 'package.json')))
      .map((d) => path.posix.join(base, d.name));
  }
  if (/[*?{]/.test(g)) return []; // "apps/**" e afins: fora do parser mínimo (o humano completa ci.apps)
  return existe(path.join(projeto, g, 'package.json')) ? [g] : [];
}

/** O app usa banco (Postgres via Prisma, pg ou Drizzle)? */
function usaBanco(dirAbs, pkg) {
  const d = depsDe(pkg);
  return existe(path.join(dirAbs, 'prisma', 'schema.prisma')) || ['pg', '@prisma/client', 'prisma', 'drizzle-orm', 'postgres'].some((x) => Object.prototype.hasOwnProperty.call(d, x));
}

/**
 * Apps do projeto para o modo CI: { apps: { nome: { dir, banco, shards, prisma, runner } }, compartilhado, origem }.
 * Workspaces sob "apps/" (ou o que os globs listarem fora de "packages/") são apps; "packages/*" e afins entram em
 * `compartilhado` (mudança neles roda o CI de todos os apps). Sem workspaces, o projeto inteiro é um app (dir ".").
 */
export function detectarApps(projeto, { pkg = lerJSON(path.join(projeto, 'package.json'), null) } = {}) {
  const { globs, origem } = lerWorkspaces(projeto, pkg);
  const apps = {};
  const compartilhado = [];
  const appDe = (dir) => {
    const abs = path.join(projeto, dir);
    const p = lerJSON(path.join(abs, 'package.json'), null);
    const d = depsDe(p);
    const runner = d.vitest ? 'vitest' : d.jest ? 'jest' : null;
    return { dir, banco: usaBanco(abs, p), shards: 1, prisma: existe(path.join(abs, 'prisma', 'schema.prisma')), runner, e2e: Object.prototype.hasOwnProperty.call(d, '@playwright/test') };
  };
  for (const g of globs) {
    const dirs = expandirWorkspace(projeto, g);
    const ehApp = /^apps\//.test(g) || (!/^(?:packages|libs|tooling|tools|configs?)\//.test(g) && dirs.every((d) => /^apps\//.test(d) || !/^(?:packages|libs|tooling|tools|configs?)\//.test(d)));
    if (!ehApp) {
      compartilhado.push(g.endsWith('/*') ? `${g.slice(0, -2)}/**` : `${g}/**`);
      continue;
    }
    for (const dir of dirs) apps[path.posix.basename(dir)] = appDe(dir);
  }
  if (!Object.keys(apps).length) {
    const nome = String(pkg?.name || path.basename(projeto)).replace(/^@[^/]+\//, '');
    apps[nome] = appDe('.');
  }
  return { apps, compartilhado, origem };
}
