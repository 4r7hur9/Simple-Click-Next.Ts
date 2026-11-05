// Adaptador dos hooks do plugin para o Claude Agent SDK (TypeScript/JavaScript).
//
// Um host que não carrega os hooks do plugin (ex.: RM Code, que hoje não passa "plugins" nem "hooks" ao query())
// pode ligar as MESMAS travas registrando estes callbacks em options.hooks. Cada callback executa o script de
// hooks/scripts/ com o payload no stdin, exatamente como o Claude Code faz, e devolve a saída JSON. Os scripts
// leem agent_id/agent_type do payload (o SDK os preenche dentro de subagentes), então a identidade dos papéis
// continua atestada pelo hook.
//
//   import { criarHooksWorkflowIA } from '<plugin>/scripts/host/hooks-sdk.mjs';
//   query({ prompt, options: { hooks: criarHooksWorkflowIA({ pluginRoot: '<plugin>' }), ... } });
//
// Fonte única da verdade: lê hooks/hooks.json (matchers, scripts e timeouts), em vez de copiá-los.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ_PADRAO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function executarScript(pluginRoot, script, payload, { timeoutSegundos, signal }) {
  return new Promise((resolve) => {
    const filho = spawn(process.execPath, [path.join(pluginRoot, 'hooks', 'scripts', script)], {
      cwd: payload.cwd || process.cwd(),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd() },
      stdio: ['pipe', 'pipe', 'ignore'],
      signal,
    });
    let saida = '';
    const limite = setTimeout(() => filho.kill('SIGKILL'), (timeoutSegundos || 30) * 1000);
    filho.stdout.on('data', (d) => (saida += d));
    filho.on('error', () => resolve({}));
    filho.on('close', () => {
      clearTimeout(limite);
      try {
        resolve(saida.trim() ? JSON.parse(saida) : {});
      } catch {
        resolve({});
      }
    });
    filho.stdin.on('error', () => {});
    filho.stdin.end(JSON.stringify(payload));
  });
}

/** Devolve o objeto para options.hooks do query(). */
export function criarHooksWorkflowIA({ pluginRoot = RAIZ_PADRAO } = {}) {
  const def = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
  const hooks = {};
  for (const [evento, grupos] of Object.entries(def.hooks)) {
    hooks[evento] = grupos.map((g) => {
      const callbacks = g.hooks
        .filter((h) => h.type === 'command')
        .map((h) => {
          const script = (h.command.match(/hooks\/scripts\/([\w.-]+\.mjs)/) || [])[1];
          if (!script) throw new Error(`hooks.json: não achei o script em "${h.command}".`);
          return async (input, _toolUseID, contexto) => executarScript(pluginRoot, script, input, { timeoutSegundos: h.timeout, signal: contexto?.signal });
        });
      const timeout = Math.max(...g.hooks.map((h) => h.timeout || 30));
      return { ...(g.matcher ? { matcher: g.matcher } : {}), hooks: callbacks, timeout };
    });
  }
  return hooks;
}
