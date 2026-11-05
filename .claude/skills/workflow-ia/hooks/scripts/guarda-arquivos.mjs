#!/usr/bin/env node
// PreToolUse (Write|Edit|MultiEdit|NotebookEdit): protege arquivos que o
// agente não pode alterar.
//  - .env e variantes (segredos)
//  - estado e provas do Workflow IA (só a CLI wf escreve)
//  - arquivos que só um subagente específico grava (revisão do plano,
//    julgamento da verificação, relatórios dos revisores e da triagem)
//  - configuração que é decisão humana (CI, hooks git, .git, settings do Claude)
//  - lockfiles (mudam pelo gerenciador de pacotes, não à mão)
//  - migrations já aplicadas (existem no branch base): crie uma nova
//
// Os caminhos são resolvidos de verdade (symlinks, "..") e comparados sem
// distinção de maiúsculas, porque o sistema de arquivos do macOS não distingue.

import os from 'node:os';
import path from 'node:path';
import { contexto, negar } from './_comum.mjs';
import {
  casaAlgum,
  gitExisteNoBase,
  baseDaTask,
  relativoReal,
  realpathParcial,
  ehEstadoProtegido,
  ehConfigHumana,
  ehArquivoEnv,
  ehMigration,
  donoDoArquivoDaTask,
  agenteEh,
} from '../../scripts/lib/core.mjs';

const { entrada, raiz, config, estado } = contexto();
const ti = entrada.tool_input || {};
const arquivo = ti.file_path || ti.notebook_path || ti.path;
if (!arquivo) process.exit(0);
const agente = entrada.agent_type || null;

// Fora do projeto: só bloqueia a configuração global do git e do Claude Code.
const abs = realpathParcial(path.resolve(entrada.cwd || raiz, arquivo));
const home = realpathParcial(os.homedir());
if (abs === path.join(home, '.gitconfig') || abs.startsWith(path.join(home, '.claude') + path.sep) || abs.startsWith(path.join(home, '.config', 'git') + path.sep) || abs.startsWith(path.join(home, '.config', 'gh') + path.sep)) {
  negar(`"${arquivo}" é configuração global do git, do gh ou do Claude Code: mudança é decisão humana.`);
}

const rel = relativoReal(raiz, arquivo, entrada.cwd || raiz);
if (!rel) process.exit(0);

const p = config.protecoes;
const relMin = rel.toLowerCase();
const base = relMin.split('/').pop();

if (ehArquivoEnv(rel, config)) {
  negar(`"${rel}" guarda segredos e não pode ser criado nem alterado pelo agente. Documente variáveis novas em .env.example e registre em decisoes.md que o humano precisa configurá-las.`);
}

if (ehEstadoProtegido(rel)) {
  negar(`"${rel}" é estado/prova do Workflow IA e só muda pela CLI (.workflow-ia/wf). Editar à mão invalidaria as provas.`);
}

const dono = donoDoArquivoDaTask(rel);
if (dono && !agenteEh(agente, dono)) {
  negar(`"${rel}" é gravado só pelo subagente workflow-ia:${dono}. Delegue a ele; o orquestrador não pode escrever esse arquivo.`);
}

if (ehConfigHumana(rel) || casaAlgum(relMin, p.arquivosSomenteHumano.map((g) => g.toLowerCase()))) {
  negar(`"${rel}" é configuração de CI, hooks, do git ou do próprio agente: mudança é decisão humana. Se a task exigir isso, registre em decisoes.md e encerre como BLOQUEADA com o motivo.`);
}

if (p.lockfiles.map((l) => l.toLowerCase()).includes(base)) {
  negar(`"${rel}" é lockfile: não edite à mão. Use o gerenciador de pacotes (ex.: "${config.projeto.gerenciadorPacotes} add <pacote>") e justifique a nova dependência no plano.`);
}

if (ehMigration(rel, config) && (gitExisteNoBase(raiz, config.git.branchBase, rel) || gitExisteNoBase(raiz, baseDaTask(estado, config), rel))) {
  negar(`"${rel}" é uma migration que já existe no branch base (considerada aplicada). Nunca edite migration aplicada: crie uma migration nova, seguindo expand/contract.`);
}

process.exit(0);
