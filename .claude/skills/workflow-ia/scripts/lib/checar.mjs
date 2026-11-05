// "wf checar": checagem estreita do que o fixer acabou de mudar (lint dos arquivos, typecheck do app e testes
// relacionados), ANTES de gastar um gate. Não é prova: não muda o estado, não conta no manifest e nada que só
// rodou aqui substitui o gate nem a verificação final. Fica em evidencias/checar/ como apoio.

import fs from 'node:fs';
import path from 'node:path';
import { caminhos, git, existe, casaAlgum, agoraISO, ultimasLinhas } from './core.mjs';
import { shAsync, aspasShell } from './gate.mjs';
import { vagasAtivas, criarReservaVaga } from './vagas.mjs';

/** Arquivos alterados e ainda não commitados (inclui os novos), fora do estado do Workflow IA. */
export function arquivosAlterados(raiz) {
  const mudados = git(raiz, ['-c', 'core.quotePath=false', 'diff', '--name-only', '-z', 'HEAD', '--']).out.split('\0');
  const novos = git(raiz, ['-c', 'core.quotePath=false', 'ls-files', '-z', '--others', '--exclude-standard']).out.split('\0');
  return [...new Set([...mudados, ...novos])].filter((f) => f && !f.startsWith('.workflow-ia/') && existe(path.join(raiz, f)));
}

/** Passos da checagem para os arquivos dados (comandos do config; vazio = passo ignorado). */
export function passosDaChecagem(config, arquivos) {
  const cmds = config.comandos || {};
  const lista = arquivos.map(aspasShell).join(' ');
  const passos = [];
  if (cmds.lintArquivo) for (const f of arquivos) passos.push({ nome: `lint-${f}`, tipo: 'lint', comando: cmds.lintArquivo.replaceAll('{arquivo}', aspasShell(f)) });
  else if (cmds.lint) passos.push({ nome: 'lint', tipo: 'lint', comando: cmds.lint });
  if (cmds.typecheckArquivos) passos.push({ nome: 'typecheck', tipo: 'typecheck', comando: cmds.typecheckArquivos.replaceAll('{arquivos}', lista) });
  else if (cmds.typecheck) passos.push({ nome: 'typecheck', tipo: 'typecheck', comando: cmds.typecheck });
  if (cmds.testesRelacionados) passos.push({ nome: 'testes-relacionados', tipo: 'testes', comando: cmds.testesRelacionados.replaceAll('{arquivos}', lista) });
  else {
    // Sem "related": roda só os arquivos de teste que estão na lista.
    const testes = arquivos.filter((f) => casaAlgum(f, config.protecoes?.padroesTeste || []));
    if (testes.length && cmds.testeArquivos) passos.push({ nome: 'testes', tipo: 'testes', comando: cmds.testeArquivos.replaceAll('{arquivos}', testes.map(aspasShell).join(' ')) });
    else if (testes.length && cmds.testeArquivo) for (const f of testes) passos.push({ nome: `teste-${f}`, tipo: 'testes', comando: cmds.testeArquivo.replaceAll('{arquivo}', aspasShell(f)) });
  }
  return passos;
}

export async function checar(raiz, config, { idTask = null, arquivos = [], pesado = false } = {}) {
  const alvo = arquivos.length ? arquivos : arquivosAlterados(raiz);
  if (!alvo.length) return { ok: false, mensagem: 'Nada para checar: informe os arquivos ("wf checar <arquivo>...") ou deixe as alterações sem commit.' };
  const passos = passosDaChecagem(config, alvo);
  if (!passos.length) return { ok: false, mensagem: 'Nenhum comando de checagem configurado (comandos.lintArquivo/lint, typecheckArquivos/typecheck, testesRelacionados/testeArquivo).' };
  const carimbo = agoraISO().replace(/[:.]/g, '-');
  const dir = idTask ? path.join(caminhos(raiz, idTask).evidencias, 'checar', carimbo) : path.join(caminhos(raiz).runtime, 'checar', carimbo);
  fs.mkdirSync(dir, { recursive: true });
  const reserva = pesado && vagasAtivas(config) ? criarReservaVaga(config, { task: idTask, raiz }) : null;
  const resultados = [];
  try {
    let vaga = null;
    if (reserva) {
      const v = await reserva.pegar();
      if (v.erro) return { ok: false, mensagem: v.erro };
      vaga = v.numero;
    }
    for (const p of passos) {
      const r = await shAsync(p.comando, { cwd: raiz, timeoutSegundos: config.gate?.timeoutSegundos || 900, env: { ...(idTask ? { WF_TASK: idTask } : {}), ...(vaga !== null ? { WF_VAGA: String(vaga) } : {}) } });
      const log = path.join(dir, `${p.nome.replace(/[^A-Za-z0-9._-]+/g, '_')}.log`);
      fs.writeFileSync(log, `$ ${p.comando}\n# exit=${r.exit} duracao=${r.duracaoMs}ms\n\n${r.saida}`);
      resultados.push({ nome: p.nome, tipo: p.tipo, comando: p.comando, status: r.timeout ? 'timeout' : r.exit === 0 ? 'ok' : 'falhou', exit: r.exit, duracaoMs: r.duracaoMs, log: path.relative(raiz, log), trecho: r.exit === 0 ? undefined : ultimasLinhas(r.saida, 30) });
    }
  } finally {
    if (reserva) reserva.soltar();
  }
  const falhas = resultados.filter((x) => x.status !== 'ok');
  const registro = { ok: falhas.length === 0, em: agoraISO(), arquivos: alvo, passos: resultados.map(({ trecho, ...r }) => r), nota: 'Checagem estreita de apoio: não é gate nem prova.' };
  fs.writeFileSync(path.join(dir, 'checar.json'), JSON.stringify(registro, null, 2) + '\n');
  return { ...registro, passos: resultados, arquivo: path.relative(raiz, path.join(dir, 'checar.json')), falhas: falhas.map((x) => x.nome) };
}
