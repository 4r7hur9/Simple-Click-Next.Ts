// Modo host-provido: converte agents/*.md (frontmatter + prompt) para o formato de definição de agentes do
// Claude Agent SDK (opção "agents" do query()), para um host que não carrega os agentes do plugin registrar os 13
// papéis com os MESMOS nomes. A identidade continua sendo o agent_type atestado pelos hooks.
//
// Campos do AgentDefinition (sdk.d.ts 0.3.284) usados aqui: description, prompt, tools, model, skills.
// "color" do frontmatter é só da UI do Claude Code e não existe no SDK.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAPEIS, PREFIXO_NATIVO } from './ambiente.mjs';

export const RAIZ_PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CHAVES_AGENT_DEFINITION = ['description', 'prompt', 'tools', 'model', 'skills'];

/** Frontmatter simples (chave: valor e listas "  - item"), como nos agents/*.md do plugin. */
export function lerAgenteMd(arquivo) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${arquivo}: sem frontmatter.`);
  const meta = {};
  let chaveLista = null;
  for (const linha of m[1].split('\n')) {
    const item = linha.match(/^\s+-\s+(.*)$/);
    if (item && chaveLista) {
      meta[chaveLista].push(item[1].trim());
      continue;
    }
    const kv = linha.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2] === '') {
      chaveLista = kv[1];
      meta[chaveLista] = [];
    } else {
      chaveLista = null;
      meta[kv[1]] = kv[2].trim();
    }
  }
  return { meta, prompt: m[2].replace(/^\n+/, '').replace(/\s+$/, '') + '\n' };
}

export function exportarAgentes({ pasta = path.join(RAIZ_PLUGIN, 'agents'), prefixo = PREFIXO_NATIVO } = {}) {
  const definicoes = {};
  for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith('.md')).sort()) {
    const { meta, prompt } = lerAgenteMd(path.join(pasta, arquivo));
    const nome = meta.name || arquivo.replace(/\.md$/, '');
    const def = { description: meta.description, prompt };
    if (meta.tools) def.tools = meta.tools.split(',').map((t) => t.trim()).filter(Boolean);
    if (meta.model) def.model = meta.model;
    if (Array.isArray(meta.skills) && meta.skills.length) def.skills = meta.skills;
    definicoes[`${prefixo}${nome}`] = def;
  }
  const faltam = PAPEIS.filter((p) => !(`${prefixo}${p}` in definicoes));
  if (faltam.length) throw new Error(`agents/ não tem os papéis: ${faltam.join(', ')}.`);
  return definicoes;
}

export function serializarAgentes(definicoes, formato) {
  if (formato === 'sdk') return JSON.stringify(definicoes, null, 2) + '\n';
  if (formato === 'mjs') {
    return `// Gerado por "wf exportar-agentes --formato mjs". Passe como options.agents do query() do Claude Agent SDK.\nexport const agents = ${JSON.stringify(definicoes, null, 2)};\nexport default agents;\n`;
  }
  throw new Error(`Formato desconhecido: ${formato}. Use sdk (JSON) ou mjs (módulo ESM).`);
}
