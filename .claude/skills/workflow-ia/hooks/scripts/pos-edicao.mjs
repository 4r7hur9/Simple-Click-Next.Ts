#!/usr/bin/env node
// PostToolUse (Write|Edit|MultiEdit): feedback imediato por arquivo.
//  - formata e roda o lint no arquivo editado (erros voltam para o agente)
//  - typecheck opcional (hooks.typecheckAoEditar)
//  - registra edições em arquivos de teste depois do RED, para o
//    test-reviewer conferir se algum teste foi enfraquecido

import fs from 'node:fs';
import { contexto, relativo, taskEmExecucao } from './_comum.mjs';
import { caminhos, casaAlgum, sh, ultimasLinhas, existe, agoraISO } from '../../scripts/lib/core.mjs';

const { entrada, raiz, config, estado } = contexto();
const ti = entrada.tool_input || {};
const rel = relativo(raiz, ti.file_path || ti.notebook_path);
if (!rel || rel.startsWith('.workflow-ia/')) process.exit(0);
if (!existe(`${raiz}/${rel}`)) process.exit(0);

const problemas = [];
const avisos = [];
const aspas = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const ehCodigo = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|css|scss)$/.test(rel);
const timeout = config.hooks.timeoutPosEdicaoSegundos || 60;

if (ehCodigo && config.hooks.lintAoEditar) {
  const fmt = config.comandos.formatarArquivo;
  if (fmt) sh(fmt.replaceAll('{arquivo}', aspas(rel)), { cwd: raiz, timeoutSegundos: timeout });
  const lint = config.comandos.lintArquivo;
  if (lint && /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/.test(rel)) {
    const r = sh(lint.replaceAll('{arquivo}', aspas(rel)), { cwd: raiz, timeoutSegundos: timeout });
    if (r.exit !== 0 && !r.timeout) problemas.push(`Lint falhou em ${rel}:\n${ultimasLinhas(r.saida, 40)}`);
  }
}

if (ehCodigo && config.hooks.typecheckAoEditar && config.comandos.typecheck && /\.(?:[cm]?tsx?|vue)$/.test(rel)) {
  const r = sh(config.comandos.typecheck, { cwd: raiz, timeoutSegundos: timeout * 2 });
  if (r.exit !== 0 && !r.timeout) {
    const linhas = r.saida.split('\n');
    const doArquivo = linhas.filter((l) => l.includes(rel));
    problemas.push(`Typecheck com erros${doArquivo.length ? ` (${doArquivo.length} no arquivo editado)` : ''}:\n${(doArquivo.length ? doArquivo : linhas).slice(0, 30).join('\n')}`);
  }
}

if (taskEmExecucao(estado) && ['implementacao', 'loop', 'verificacao'].includes(estado.fase) && casaAlgum(rel, config.protecoes.padroesTeste)) {
  const c = caminhos(raiz, estado.id);
  try {
    fs.mkdirSync(c.evidencias, { recursive: true });
    fs.appendFileSync(c.edicoesTestes, JSON.stringify({ em: agoraISO(), arquivo: rel, fase: estado.fase, iteracao: estado.iteracao, ferramenta: entrada.tool_name }) + '\n');
  } catch {
    /* melhor esforço */
  }
  avisos.push(`Você alterou o arquivo de teste "${rel}" depois do RED. A edição foi registrada e o test-reviewer vai comparar com o baseline. Só altere um teste se ele estava errado em relação ao critério de aceite — nunca para fazer o código passar. Justifique em decisoes.md.`);
}

if (problemas.length) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: `[Workflow IA] Corrija antes de seguir:\n\n${[...problemas, ...avisos].join('\n\n')}` }));
} else if (avisos.length) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `[Workflow IA] ${avisos.join('\n')}` } }));
}
process.exit(0);
