/**
 * [CA-7] Só a lista fechada vai para docs/desempenho/, sanitizada; arquivo com
 * credencial, caminho de usuário, senha ou token é recusado. Roda com `node --test`.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { copiarArtefatos, sanitizar } from "./artefatos.ts";

const SHA = "69cf0958ae929d3decadcc10c856cdd61184d0d7";

function origem(): string {
  const pasta = mkdtempSync(join(tmpdir(), "sc-perf-artefatos-"));
  writeFileSync(join(pasta, "resumo.md"), "# Resumo do k6 — carga\n\n| meus_pedidos | 1500 | 5.00 | 12 ms |\n");
  writeFileSync(join(pasta, "relatorio.md"), `| SHA | \`${SHA}\` |\n| versão do k6 | k6 v1.3.0 (commit/5870e99ae8) |\n`);
  writeFileSync(
    join(pasta, "metadados.json"),
    JSON.stringify({ etapa: "carga", revisao: { sha: SHA, sha12: SHA.slice(0, 12), hashDoHarness: "a".repeat(64) }, runner: { nome: "local" } }),
  );
  for (const proibido of ["k6.log", "api.log", "chaves-incertas.json", "manifesto.json", "pontos.json.gz"])
    writeFileSync(join(pasta, proibido), "segredo");
  mkdirSync(join(pasta, "explain"));
  writeFileSync(join(pasta, "explain", "meus-pedidos-chamada.txt"), "Function Scan on meus_pedidos  (actual time=1.2..1.3 rows=20 loops=1)\n");
  return pasta;
}

describe("[CA-7] artefatos para o git", () => {
  it("[CA-7] um artefato real passa limpo e só a lista fechada é copiada", () => {
    const de = origem();
    const para = mkdtempSync(join(tmpdir(), "sc-perf-destino-"));
    const r = copiarArtefatos(de, para, ["Senha-k6-Simulacao-2026!"]);
    assert.deepEqual(r.recusados, []);
    assert.deepEqual(r.gravados.sort(), ["explain/meus-pedidos-chamada.txt", "metadados.json", "relatorio.md", "resumo.md"]);
    for (const proibido of ["k6.log", "api.log", "chaves-incertas.json", "manifesto.json", "pontos.json.gz"])
      assert.equal(existsSync(join(para, proibido)), false, proibido);
    const relatorio = readFileSync(join(para, "relatorio.md"), "utf8");
    assert.ok(relatorio.includes(SHA.slice(0, 12)) && !relatorio.includes(SHA), "SHA vai curto");
    const meta = JSON.parse(readFileSync(join(para, "metadados.json"), "utf8"));
    assert.equal(meta.revisao.sha, undefined);
    assert.equal(meta.revisao.sha12, SHA.slice(0, 12));
  });

  const vazamentos: [string, string][] = [
    ["URL do Postgres", "DATABASE_URL_DIRETA=postgresql://postgres:x@localhost:55440/simpleclick"],
    ["URL do Redis", "redis://localhost:63790/6"],
    ["Bearer", "Authorization: Bearer abc.def"],
    ["caminho de usuário", "/Users/fulano/Projetos/SC/tests"],
    ["caminho Linux", "/home/runner/work/SC"],
    ["variável de senha", "SENHA_BANCO_MIGRADOR=x"],
    ["arroba solto", "pacote @simpleclick/database"],
  ];
  for (const [rotulo, texto] of vazamentos) {
    it(`[CA-7] recusa: ${rotulo}`, () => {
      assert.equal(sanitizar(texto, []).ok, false);
    });
  }
  it("[CA-7] redige senha ligada, e-mail e token de 40 hex", () => {
    const r = sanitizar(`senha DemoSimpleClick2026, dono@loja.simulacao.test, token ${"ab".repeat(20)}`, ["DemoSimpleClick2026"]);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(!r.texto.includes("DemoSimpleClick2026"));
      assert.ok(!r.texto.includes("@"));
      assert.ok(r.texto.includes("<token>"));
    }
  });
  it("[CA-7] arquivo recusado não é gravado", () => {
    const de = origem();
    writeFileSync(join(de, "reconciliacao.md"), "postgresql://postgres:segredo@localhost:55440/x");
    const para = mkdtempSync(join(tmpdir(), "sc-perf-destino-"));
    const r = copiarArtefatos(de, para, []);
    assert.equal(r.recusados.length, 1);
    assert.equal(existsSync(join(para, "reconciliacao.md")), false);
  });
});
