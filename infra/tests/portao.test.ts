import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

/**
 * Prova do portão de qualidade (AC-017 a AC-020, AC-040 a AC-043).
 *
 * O que este arquivo NÃO faz: conferir que existe um arquivo chamado
 * `verificar.sh`, ou que `lefthook.yml` tem tal linha. Isso não é prova de
 * nada — um portão desligado continua existindo em disco.
 *
 * O que ele faz: EXECUTA o portão e os ganchos de verdade e olha o efeito.
 *
 * - o portão roda com o motor de ensaio (`PORTAO_ENSAIO`), que percorre a lista
 *   inteira de etapas sem chamar `tsc`, banco nem Redis. É o que torna
 *   possível provar "reprova quando qualquer etapa falha" em milissegundos, e
 *   provar isso para a etapa que EU escolher — coisa impossível se a única
 *   forma de fazer uma etapa falhar fosse quebrar o projeto de verdade.
 * - os ganchos rodam pelo lefthook de verdade, com o `lefthook.yml` de verdade,
 *   em repositórios git descartáveis criados aqui. `git commit` e `git push`
 *   são chamados como pessoa nenhuma chamaria diferente, e o que se assere é
 *   se o commit entrou ou não, e se o remoto recebeu ou não.
 * - a auditoria da especificação roda contra um projeto de especificação de
 *   mentira, montado aqui. Assim dá para provar "critério sem teste reprova"
 *   sem precisar de um critério sem teste no projeto de verdade.
 *
 * Nenhum teste daqui precisa de banco, Redis ou Docker: o que eles exercitam é
 * o portão, e o portão precisa continuar provável numa máquina recém-clonada.
 */

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const VERIFICAR = join(RAIZ, "infra", "scripts", "verificar.sh");
const LEFTHOOK = join(RAIZ, "node_modules", ".bin", "lefthook");
const MOTOR_DA_ESPECIFICACAO = join(
  homedir(),
  ".claude",
  "skills",
  "onp-spec-driven",
  "scripts",
  "onp-spec.mjs",
);

interface Execucao {
  readonly codigo: number;
  readonly saida: string;
}

/** Tira a cor: comparar saída colorida é comparar sequência de escape. */
function semCor(texto: string): string {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/\u001B\[[0-9;:]*m/g, "");
}

function rodar(
  comando: string,
  argumentos: readonly string[],
  opcoes: { readonly cwd: string; readonly env?: Record<string, string> } = {
    cwd: RAIZ,
  },
): Execucao {
  const resultado = spawnSync(comando, [...argumentos], {
    cwd: opcoes.cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      // Sem cor e sem TTY a saída é a mesma em terminal e em captura — é o que
      // permite comparar duas execuções caractere a caractere (AC-042).
      NO_COLOR: "1",
      ...(opcoes.env ?? {}),
    },
  });
  if (resultado.error) throw resultado.error;
  return {
    codigo: resultado.status ?? 1,
    saida: semCor(`${resultado.stdout ?? ""}${resultado.stderr ?? ""}`),
  };
}

/** O portão, rodado como quem roda: um comando, sem argumento nenhum. */
function rodarPortao(env: Record<string, string> = {}): Execucao {
  return rodar("bash", [VERIFICAR], { cwd: RAIZ, env });
}

/** Os nomes das etapas declaradas, na ordem em que o portão as roda. */
function etapasDeclaradas(): readonly string[] {
  const listagem = rodar("bash", [VERIFICAR, "--listar"], { cwd: RAIZ });
  expect(listagem.codigo).toBe(0);
  return listagem.saida
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "");
}

/** Diretórios descartáveis criados pelos testes, apagados no fim do arquivo. */
const descartaveis: string[] = [];

function pastaDescartavel(rotulo: string): string {
  const caminho = mkdtempSync(join(tmpdir(), `portao-${rotulo}-`));
  descartaveis.push(caminho);
  return caminho;
}

afterAll(() => {
  for (const caminho of descartaveis) {
    rmSync(caminho, { recursive: true, force: true });
  }
});

/**
 * Repositório git descartável com os ganchos DE VERDADE instalados.
 *
 * Copia `lefthook.yml` e os scripts do portão do repositório real: o que está
 * sob prova é a nossa configuração, não o lefthook. O `LEFTHOOK_BIN` aponta
 * para o binário fixado no `node_modules` daqui, para o gancho não sair
 * procurando um lefthook qualquer que a máquina tenha instalado (AC-042).
 */
function repositorioComGanchos(rotulo: string): {
  readonly caminho: string;
  readonly remoto: string;
  readonly env: Record<string, string>;
  readonly git: (...argumentos: string[]) => Execucao;
} {
  const base = pastaDescartavel(rotulo);
  const caminho = join(base, "repo");
  const remoto = join(base, "remoto");
  mkdirSync(caminho, { recursive: true });
  mkdirSync(remoto, { recursive: true });

  // `LEFTHOOK_EXCLUDE` tira do gancho os dois comandos que dependem do
  // `node_modules` deste monorepo — o repositório de prova não tem um, e se
  // eles rodassem toda prova de gancho reprovaria por motivo alheio, o que
  // não prova nada. O que sobra (segredo, mensagem, registro de dívida) é
  // exatamente o que estes testes exercitam; formatação, qualidade e tipos são
  // provados no repositório de verdade, na prova de AC-040.
  const env = {
    LEFTHOOK_BIN: LEFTHOOK,
    LEFTHOOK_EXCLUDE: "formatacao,qualidade,tipos",
  };
  const git = (...argumentos: string[]): Execucao =>
    rodar("git", argumentos, { cwd: caminho, env });

  rodar("git", ["init", "--bare", "-q", "."], { cwd: remoto });
  git("init", "-q", ".");
  git("config", "user.email", "portao@prova.local");
  git("config", "user.name", "Prova do Portão");
  git("config", "commit.gpgsign", "false");

  mkdirSync(join(caminho, "infra", "scripts"), { recursive: true });
  mkdirSync(join(caminho, "docs"), { recursive: true });
  for (const script of [
    "verificar.sh",
    "portao-lib.sh",
    "registrar-pulo.sh",
    "check-segredos.sh",
    "check-mensagem.sh",
  ]) {
    cpSync(
      join(RAIZ, "infra", "scripts", script),
      join(caminho, "infra", "scripts", script),
    );
  }
  cpSync(join(RAIZ, "lefthook.yml"), join(caminho, "lefthook.yml"));
  writeFileSync(
    join(caminho, "docs", "pendencias.md"),
    "# Pendências\n\n## Portão contornado\n\n<!-- portao-contornado:inicio -->\n\n<!-- portao-contornado:fim -->\n",
  );
  writeFileSync(join(caminho, "leiame.txt"), "repositório de prova\n");

  git("add", "-A");
  git("commit", "-q", "-m", "T-000 fundacao: base da prova", "--no-verify");
  git("remote", "add", "origem", remoto);
  git("push", "-q", "-u", "origem", "HEAD");

  const instalacao = rodar(LEFTHOOK, ["install"], { cwd: caminho, env });
  expect(
    instalacao.codigo,
    `lefthook install falhou:\n${instalacao.saida}`,
  ).toBe(0);

  // Mesma ordem do `prepare` da instalação: instalar os ganchos e marcar de
  // onde a vigilância de portão pulado começa nesta cópia.
  const partida = rodar(
    "bash",
    [join(caminho, "infra", "scripts", "registrar-pulo.sh"), "--iniciar"],
    {
      cwd: caminho,
      env,
    },
  );
  expect(
    partida.codigo,
    `marcar o ponto de partida falhou:\n${partida.saida}`,
  ).toBe(0);

  return { caminho, remoto, env, git };
}

/** A versão que o remoto tem agora — é o que "o histórico remoto recebeu". */
function versaoNoRemoto(
  repositorio: ReturnType<typeof repositorioComGanchos>,
): string {
  const saida = rodar("git", ["log", "-1", "--format=%H"], {
    cwd: repositorio.remoto,
  }).saida.trim();
  return saida;
}

/**
 * Projeto de especificação de mentira, com dois critérios de aceite: um com
 * teste de verdade e outro que a prova de cada teste vai mexer.
 *
 * O executor é o `node --test` embutido: sem dependência nova (P-014), e com
 * skip DE VERDADE — o que importa em AC-019 é que o teste tenha sido pulado
 * pelo executor, e não que alguém tenha escrito "skip" num relatório à mão.
 */
function projetoDeEspecificacao(rotulo: string): {
  readonly caminho: string;
  readonly env: Record<string, string>;
} {
  const caminho = pastaDescartavel(rotulo);
  mkdirSync(join(caminho, ".spec", "features", "exemplo"), { recursive: true });
  mkdirSync(join(caminho, "testes"), { recursive: true });
  mkdirSync(join(caminho, "src"), { recursive: true });

  writeFileSync(
    join(caminho, "onpspec.config.json"),
    `${JSON.stringify(
      {
        testCommand: "node --test --test-reporter=tap testes/*.test.mjs",
        reporter: "tap",
        testGlobs: ["testes/**"],
        srcGlobs: ["src/**"],
        ignoreGlobs: ["node_modules/**", ".git/**", ".spec/**"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(caminho, ".spec", "constituicao.md"),
    [
      "# Constituição — exemplo — v1.0.0",
      "",
      "## P-001 [DEVE] Todo requisito tem prova executável",
      "",
      "Nada é declarado pronto sem a auditoria sair limpa.",
      "",
      "- verificação(gate): intrínseca ao audit",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(caminho, ".spec", "features", "exemplo", "spec.md"),
    [
      "# Feature: exemplo",
      "",
      "## Contexto",
      "",
      "Projeto de mentira, existe só para a prova do portão.",
      "",
      "## Suposições",
      "",
      "Nenhuma.",
      "",
      "## Perguntas em aberto",
      "",
      "Nenhuma.",
      "",
      "## Histórias",
      "",
      "### US-901 — História de exemplo",
      "",
      "Como pessoa, quero uma coisa, para que outra aconteça.",
      "",
      "#### AC-901 — Critério com teste que passa",
      "",
      "- **Dado** um estado",
      "- **Quando** algo acontece",
      "- **Então** o resultado é o esperado",
      "",
      "#### AC-902 — Critério que a prova vai deixar sem prova",
      "",
      "- **Dado** um estado",
      "- **Quando** algo acontece",
      "- **Então** o resultado é o esperado",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(caminho, ".spec", "features", "exemplo", "tasks.md"),
    [
      "# Tarefas — exemplo",
      "",
      "## T-901 — Faz a coisa [concluida]",
      "",
      "- Refs: US-901, AC-901, AC-902",
      "- Arquivos: src/coisa.mjs",
      "- Esforço: baixo",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(caminho, "src", "coisa.mjs"),
    "export const coisa = () => 1;\n",
  );
  writeFileSync(
    join(caminho, "testes", "coisa.test.mjs"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { coisa } from "../src/coisa.mjs";',
      "",
      'test("@spec:AC-901 a coisa devolve um", () => {',
      "  assert.equal(coisa(), 1);",
      "});",
      "",
    ].join("\n"),
  );

  // O histórico de sinais do motor é global por máquina. Apontá-lo para dentro
  // da pasta descartável impede que a prova suje o histórico de verdade.
  return { caminho, env: { ONP_SPEC_HOME: join(caminho, ".onp-home") } };
}

function auditar(projeto: {
  caminho: string;
  env: Record<string, string>;
}): Execucao {
  return rodar("node", [MOTOR_DA_ESPECIFICACAO, "audit", "--ci"], {
    cwd: projeto.caminho,
    env: projeto.env,
  });
}

function verificarProvas(projeto: {
  caminho: string;
  env: Record<string, string>;
}): Execucao {
  return rodar("node", [MOTOR_DA_ESPECIFICACAO, "verify", "exemplo"], {
    cwd: projeto.caminho,
    env: projeto.env,
  });
}

// ---------------------------------------------------------------------------
// AC-017 — um comando roda a verificação completa
// ---------------------------------------------------------------------------

describe("portão de qualidade — o comando único", () => {
  it("@spec:AC-017 um comando só percorre tipos, qualidade, testes, banco, telas e a auditoria da especificação", () => {
    const etapas = etapasDeclaradas();

    // Cada linha é uma exigência do critério, escrita como PERGUNTA sobre o que
    // o portão cobre — e não como nome exato de etapa. É o que deixa a T-020
    // acrescentar as telas de ponta a ponta sem reescrever esta prova.
    const exigencias: ReadonlyArray<readonly [string, RegExp]> = [
      ["verificação de tipos", /tipos/i],
      ["qualidade de código", /qualidade de código/i],
      ["testes de unidade", /testes de unidade/i],
      ["testes de integração contra o banco de teste", /integração.*banco/i],
      ["guardas estruturais do banco", /guardas estruturais do banco/i],
      ["telas e acessibilidade", /(telas|site).*acessibilidade/i],
      ["auditoria da especificação", /auditoria da especificação/i],
      // Entrou depois de uma deriva real: duas migrações foram editadas
      // depois de aplicadas, o banco local ficou com nove colunas a menos e
      // nada acusou por duas fatias inteiras. As outras etapas de banco rodam
      // contra bancos efêmeros, que nascem do zero e por isso nunca derivam.
      ["banco local em dia com as migrações", /banco local em dia/i],
    ];

    for (const [exigencia, padrao] of exigencias) {
      expect(
        etapas.some((etapa) => padrao.test(etapa)),
        `o portão não tem etapa que cubra "${exigencia}". Etapas de hoje:\n  ${etapas.join("\n  ")}`,
      ).toBe(true);
    }

    // Uma execução de verdade roda TODAS as declaradas, e não um subconjunto.
    const execucao = rodarPortao({ PORTAO_ENSAIO: "1" });
    expect(execucao.codigo).toBe(0);
    expect(execucao.saida).toContain(
      `${etapas.length} etapas declaradas · ${etapas.length} executadas`,
    );
    expect(execucao.saida).toContain("portão limpo");
  });

  it("@spec:AC-017 reprova dizendo qual etapa falhou, e não reprova as que passaram", () => {
    const etapas = etapasDeclaradas();
    const alvo = "guardas estruturais do banco";
    expect(etapas).toContain(alvo);

    const execucao = rodarPortao({ PORTAO_ENSAIO: `reprovar:${alvo}` });

    expect(execucao.codigo).not.toBe(0);
    expect(execucao.saida).toContain("portão reprovou em 1 etapa(s)");
    expect(execucao.saida).toContain(`✘ ${alvo}`);
    expect(execucao.saida).toContain(
      `${etapas.length} etapas declaradas · ${etapas.length} executadas · ${etapas.length - 1} aprovadas · 1 reprovadas`,
    );

    // O resumo lista só quem reprovou: um portão que despeja a lista inteira em
    // vermelho não informa nada a quem precisa consertar.
    const resumo = execucao.saida.slice(
      execucao.saida.indexOf("portão reprovou"),
    );
    for (const etapa of etapas) {
      if (etapa === alvo) continue;
      expect(resumo).not.toContain(`✘ ${etapa}`);
    }
  });

  it("@spec:AC-017 basta UMA etapa falhar para o comando inteiro reprovar", () => {
    for (const alvo of ["formatação", "testes de unidade"]) {
      const execucao = rodarPortao({ PORTAO_ENSAIO: `reprovar:${alvo}` });
      expect(
        execucao.codigo,
        `o portão passou mesmo com "${alvo}" reprovando`,
      ).not.toBe(0);
      expect(execucao.saida).toContain(`✘ ${alvo}`);
    }
  });

  it("@spec:AC-017 cada etapa diz o que verificou, e não apenas que passou", () => {
    const execucao = rodarPortao({ PORTAO_ENSAIO: "1" });
    const etapas = etapasDeclaradas();

    for (const etapa of etapas) {
      const posicao = execucao.saida.indexOf(`▸ ${etapa}`);
      expect(
        posicao,
        `a etapa "${etapa}" não se anunciou na execução`,
      ).toBeGreaterThanOrEqual(0);
      const anuncio = execucao.saida.slice(posicao, posicao + 400);
      const explicacao = /\n {2}verifica: (.+)/.exec(anuncio)?.[1] ?? "";
      expect(
        explicacao.length,
        `a etapa "${etapa}" não diz o que verifica — sinal verde sem conteúdo não é informação`,
      ).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-018 e AC-019 — a auditoria da especificação
// ---------------------------------------------------------------------------

describe("auditoria da especificação — o que conta como prova", () => {
  it("@spec:AC-018 critério de aceite sem teste reprova a auditoria, apontando qual", () => {
    const projeto = projetoDeEspecificacao("sem-teste");
    const auditoria = auditar(projeto);

    expect(
      auditoria.codigo,
      `a auditoria passou com um critério sem teste:\n${auditoria.saida}`,
    ).not.toBe(0);
    expect(auditoria.saida).toContain("AC-902");
    expect(auditoria.saida).toMatch(
      /AC-902.*não tem nenhum teste anotado com @spec:AC-902/,
    );

    // O critério que TEM teste não pode aparecer como sem teste: se aparecesse,
    // a auditoria estaria reprovando tudo e não apontando nada.
    expect(auditoria.saida).not.toMatch(/AC-901.*não tem nenhum teste anotado/);

    // E a tarefa que se declarou concluída cai junto: não dá para dar por
    // pronto o que não foi verificado.
    expect(auditoria.saida).toMatch(
      /T-901 está \[concluida\] mas o critério AC-902/,
    );
  });

  it("@spec:AC-019 teste PULADO não conta como prova: o critério continua sem prova", () => {
    const projeto = projetoDeEspecificacao("pulado");

    // Um teste de verdade, anotado com o critério, e pulado pelo executor.
    writeFileSync(
      join(projeto.caminho, "testes", "pulado.test.mjs"),
      [
        'import test from "node:test";',
        'import assert from "node:assert/strict";',
        "",
        'test("@spec:AC-902 o critério é provado por um teste pulado", { skip: "pulado de propósito" }, () => {',
        "  assert.equal(1, 1);",
        "});",
        "",
      ].join("\n"),
    );

    const provas = verificarProvas(projeto);
    expect(provas.saida).toContain("SKIP (não é prova) AC-902");

    // O registro de provas é o que a auditoria consome: nele, o critério do
    // teste pulado não fica com "pass".
    const registro = JSON.parse(
      readFileSync(
        join(projeto.caminho, ".spec", "verification", "exemplo.json"),
        "utf8",
      ),
    ) as { results: Record<string, { status: string }> };
    expect(registro.results["AC-901"]?.status).toBe("pass");
    expect(registro.results["AC-902"]?.status).toBe("skip");

    const auditoria = auditar(projeto);
    expect(
      auditoria.codigo,
      `a auditoria aceitou um teste pulado como prova:\n${auditoria.saida}`,
    ).not.toBe(0);
    expect(auditoria.saida).toMatch(/AC-902.*PULADO.*skip não é prova/);
    expect(auditoria.saida).toMatch(
      /T-901 está \[concluida\] mas o critério AC-902/,
    );

    // Contraprova: o critério com teste que roda de verdade fica provado. Sem
    // isto, "reprovou" poderia significar só que a auditoria reprova sempre.
    expect(auditoria.saida).not.toMatch(/AC-901.*skip não é prova/);
    expect(auditoria.saida).toContain("1/2 provados");
  });
});

// ---------------------------------------------------------------------------
// AC-017 — a explicação da falha chega junto do veredito
// ---------------------------------------------------------------------------

describe("o portão explica a etapa que reprovou", () => {
  it("@spec:AC-017 o resumo repete as últimas linhas de cada etapa que reprovou", () => {
    // O portão tem dezesseis etapas e leva minutos. Sem esta repetição, a
    // explicação de uma falha fica centenas de linhas acima do veredito: quem
    // lê rola para cima procurando, ou reexecuta filtrando a saída e não vê
    // nada — que é como uma falha intermitente vira "roda de novo que passa".
    const nome = `fora-de-formato-${process.pid}.ts`;
    const alvo = join(RAIZ, nome);
    try {
      writeFileSync(alvo, "const   x   =    1\n");

      const execucao = rodar("bash", [VERIFICAR, "--somente", "formatação"], {
        cwd: RAIZ,
      });

      expect(execucao.saida).toContain("últimas linhas de");
      // E o trecho repetido é o que EXPLICA: o nome do arquivo culpado.
      const resumo = execucao.saida.slice(
        execucao.saida.indexOf("últimas linhas de"),
      );
      expect(resumo).toContain(nome);
    } finally {
      rmSync(alvo, { force: true });
    }
    // Espera folgada de propósito: esta prova roda o Prettier sobre o
    // repositório inteiro, num processo separado. Isolada leva ~2s; junto com a
    // suíte completa, disputando processador com as outras, passa dos 5s
    // padrão. Foi assim que ela nasceu verde e reprovou na primeira execução
    // cheia — o mesmo jeito que um teste vira intermitente.
  }, 60_000);
});

// ---------------------------------------------------------------------------
// AC-020 e AC-040 — o gancho antes do registro
// ---------------------------------------------------------------------------

describe("gancho antes do registro", () => {
  it("@spec:AC-020 segredo escrito no código bloqueia o registro e não chega ao histórico", () => {
    const repositorio = repositorioComGanchos("segredo");
    const segredo = "p4ssw0rd-de-verdade-123";
    writeFileSync(
      join(repositorio.caminho, "vazamento.ts"),
      `export const senhaDoBanco = "${segredo}";\n`,
    );
    repositorio.git("add", "vazamento.ts");

    const antes = repositorio.git("rev-parse", "HEAD").saida.trim();
    const commit = repositorio.git(
      "commit",
      "-m",
      "T-001 fundacao: tenta vazar",
    );
    const depois = repositorio.git("rev-parse", "HEAD").saida.trim();

    expect(
      commit.codigo,
      `o commit com segredo entrou:\n${commit.saida}`,
    ).not.toBe(0);
    expect(commit.saida).toContain("possível segredo em vazamento.ts");
    expect(commit.saida).toContain("1:export const senhaDoBanco");
    expect(depois).toBe(antes);

    // O que o critério promete é que o segredo não chega ao histórico.
    const historico = repositorio.git("log", "-p", "--all").saida;
    expect(historico).not.toContain(segredo);
  });

  it("@spec:AC-020 o mesmo arquivo, sem o segredo, entra normalmente", () => {
    const repositorio = repositorioComGanchos("sem-segredo");
    writeFileSync(
      join(repositorio.caminho, "configuracao.ts"),
      "export const senhaDoBanco = process.env.SENHA_BANCO_APLICACAO ?? '';\n",
    );
    repositorio.git("add", "configuracao.ts");

    const commit = repositorio.git(
      "commit",
      "-m",
      "T-001 fundacao: le do ambiente",
    );

    expect(commit.codigo, `o commit limpo foi barrado:\n${commit.saida}`).toBe(
      0,
    );
    expect(repositorio.git("log", "-1", "--format=%s").saida).toContain(
      "T-001 fundacao: le do ambiente",
    );
  });

  it("@spec:AC-020 a varredura do portão pega segredo que entrou por fora do gancho", () => {
    // O gancho olha o que foi preparado para entrar. Quem enviou com o portão
    // pulado não passou por gancho nenhum — por isso o portão varre TUDO que
    // está versionado, e é essa etapa que fecha o buraco.
    const etapa = rodar("bash", [VERIFICAR, "--somente", "segredo"], {
      cwd: RAIZ,
    });
    expect(etapa.codigo).toBe(0);
    expect(etapa.saida).toContain("▸ segredo no código");

    const arquivo = join(pastaDescartavel("varredura"), "vazado.ts");
    writeFileSync(
      arquivo,
      'export const apiKeyDaLoja = "sk_live_9f8a7b6c5d4e";\n',
    );
    const varredura = rodar(
      "bash",
      [join(RAIZ, "infra", "scripts", "check-segredos.sh"), arquivo],
      {
        cwd: RAIZ,
      },
    );
    expect(varredura.codigo).not.toBe(0);
    expect(varredura.saida).toContain("apiKeyDaLoja");
  });

  it("@spec:AC-040 o gancho roda formatação, qualidade, tipos e segredo em segundos, sem ninguém pedir", () => {
    // Aqui o gancho roda no repositório DE VERDADE, com o `node_modules` de
    // verdade: é a única forma de provar que ele responde em segundos com as
    // ferramentas que ele realmente usa. `--file` troca a lista de arquivos
    // preparados por um arquivo desta prova, e `--no-stage-fixed` garante que
    // nada é preparado para entrar no histórico por causa do teste.
    const nome = `prova-do-portao-${process.pid}.ts`;
    const alvo = join(RAIZ, nome);
    const preparadosAntes = rodar("git", ["diff", "--cached", "--name-only"], {
      cwd: RAIZ,
    }).saida;
    try {
      writeFileSync(alvo, "export const taxaDeEntregaEmCentavos = 750;\n");

      const inicio = Date.now();
      const gancho = rodar(
        LEFTHOOK,
        [
          "run",
          "pre-commit",
          "--file",
          nome,
          "--force",
          "--no-auto-install",
          "--no-stage-fixed",
        ],
        // O registro de dívida fica de fora: ele escreve em docs/pendencias.md
        // do repositório de verdade, e teste não mexe no repositório de quem o
        // roda. Ele tem prova própria, em AC-043.
        { cwd: RAIZ, env: { LEFTHOOK_EXCLUDE: "registro-de-pulo" } },
      );
      const segundos = (Date.now() - inicio) / 1000;

      expect(
        gancho.codigo,
        `o gancho reprovou um arquivo limpo:\n${gancho.saida}`,
      ).toBe(0);
      for (const comando of ["formatacao", "qualidade", "tipos", "segredos"]) {
        expect(gancho.saida, `o gancho não rodou "${comando}"`).toContain(
          comando,
        );
      }
      expect(
        segundos,
        `o gancho antes do registro levou ${segundos.toFixed(1)}s — nesse tempo ele vira LEFTHOOK=0`,
      ).toBeLessThan(60);

      // E ele não mexe no que está preparado para entrar.
      expect(
        rodar("git", ["diff", "--cached", "--name-only"], { cwd: RAIZ }).saida,
      ).toBe(preparadosAntes);
    } finally {
      rmSync(alvo, { force: true });
    }
  }, 180_000);

  it("@spec:AC-040 o gancho bloqueia quando a qualidade do que mudou reprova", () => {
    const nome = `prova-do-portao-ruim-${process.pid}.ts`;
    const alvo = join(RAIZ, nome);
    try {
      // `eqeqeq` é erro na configuração do projeto: um arquivo assim não pode
      // atravessar o gancho.
      writeFileSync(
        alvo,
        "export const igual = (a: string, b: string) => a == b;\n",
      );

      const gancho = rodar(
        LEFTHOOK,
        [
          "run",
          "pre-commit",
          "--file",
          nome,
          "--force",
          "--no-auto-install",
          "--no-stage-fixed",
        ],
        { cwd: RAIZ, env: { LEFTHOOK_EXCLUDE: "registro-de-pulo" } },
      );

      expect(
        gancho.codigo,
        `o gancho deixou passar código que o ESLint reprova:\n${gancho.saida}`,
      ).not.toBe(0);
      expect(gancho.saida).toContain("eqeqeq");
    } finally {
      rmSync(alvo, { force: true });
    }
  }, 180_000);
});

// ---------------------------------------------------------------------------
// AC-041 — o gancho antes do envio
// ---------------------------------------------------------------------------

describe("gancho antes do envio", () => {
  it("@spec:AC-041 envio é bloqueado quando qualquer etapa do portão falha, e o remoto não recebe nada", () => {
    const repositorio = repositorioComGanchos("envio-bloqueado");
    const noRemotoAntes = versaoNoRemoto(repositorio);

    writeFileSync(join(repositorio.caminho, "novo.txt"), "trabalho novo\n");
    repositorio.git("add", "-A");
    repositorio.git(
      "commit",
      "-q",
      "-m",
      "T-002 fundacao: trabalho novo",
      "--no-verify",
    );
    const local = repositorio.git("rev-parse", "HEAD").saida.trim();
    expect(local).not.toBe(noRemotoAntes);

    const envio = rodar("git", ["push", "origem", "HEAD"], {
      cwd: repositorio.caminho,
      env: {
        ...repositorio.env,
        PORTAO_ENSAIO: "reprovar:verificação de tipos",
      },
    });

    expect(
      envio.codigo,
      `o envio passou com o portão reprovando:\n${envio.saida}`,
    ).not.toBe(0);
    expect(envio.saida).toContain("portão reprovou em 1 etapa(s)");
    expect(envio.saida).toContain("✘ verificação de tipos");
    expect(versaoNoRemoto(repositorio)).toBe(noRemotoAntes);
  }, 120_000);

  it("@spec:AC-041 o gancho antes do envio roda o portão INTEIRO, e não uma parte dele", () => {
    const repositorio = repositorioComGanchos("envio-completo");
    const etapas = etapasDeclaradas();

    writeFileSync(join(repositorio.caminho, "novo.txt"), "trabalho novo\n");
    repositorio.git("add", "-A");
    repositorio.git(
      "commit",
      "-q",
      "-m",
      "T-002 fundacao: trabalho novo",
      "--no-verify",
    );
    const local = repositorio.git("rev-parse", "HEAD").saida.trim();

    const envio = rodar("git", ["push", "origem", "HEAD"], {
      cwd: repositorio.caminho,
      env: { ...repositorio.env, PORTAO_ENSAIO: "1" },
    });

    expect(
      envio.codigo,
      `o envio foi barrado com o portão limpo:\n${envio.saida}`,
    ).toBe(0);
    expect(envio.saida).toContain(
      `${etapas.length} etapas declaradas · ${etapas.length} executadas`,
    );
    for (const etapa of etapas) {
      expect(envio.saida, `a etapa "${etapa}" não rodou no envio`).toContain(
        `▸ ${etapa}`,
      );
    }
    expect(versaoNoRemoto(repositorio)).toBe(local);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// AC-042 — reprodutibilidade
// ---------------------------------------------------------------------------

describe("reprodutibilidade da verificação", () => {
  /** Tira da saída o que muda entre duas execuções por não ser resultado. */
  function semRelogio(saida: string): string {
    return saida
      .replace(/\(\d+s\)/g, "(NNs)")
      .replace(/tempo: \d+m\d+s/g, "tempo: NNmNNs")
      .replace(/\d+(\.\d+)?\s?(ms|s)\b/g, "NN");
  }

  it("@spec:AC-042 a mesma versão verificada duas vezes dá exatamente o mesmo resultado", () => {
    // Duas execuções REAIS das etapas que não dependem de serviço no ar: elas
    // leem o repositório inteiro e são o pedaço do portão que dá para repetir
    // dentro de um teste. As etapas de banco provam a mesma propriedade por
    // construção — cada arquivo recebe um banco criado do zero e apagado no
    // fim (AC-003), então nenhuma execução enxerga dado da anterior.
    const primeira = rodar("bash", [VERIFICAR, "--somente", "segredo"], {
      cwd: RAIZ,
    });
    const segunda = rodar("bash", [VERIFICAR, "--somente", "segredo"], {
      cwd: RAIZ,
    });

    expect(primeira.codigo).toBe(segunda.codigo);
    expect(semRelogio(primeira.saida)).toBe(semRelogio(segunda.saida));

    // E o portão inteiro, com a lista de etapas na ordem: portão que sorteia a
    // ordem não é reproduzível nem quando cada etapa é.
    const ensaioUm = rodarPortao({ PORTAO_ENSAIO: "reprovar:formatação" });
    const ensaioDois = rodarPortao({ PORTAO_ENSAIO: "reprovar:formatação" });
    expect(ensaioUm.codigo).toBe(ensaioDois.codigo);
    expect(semRelogio(ensaioUm.saida)).toBe(semRelogio(ensaioDois.saida));
  }, 180_000);

  it("@spec:AC-042 a ferramenta que roda é a versão fixada, e não a que a máquina tiver", () => {
    const manifesto = JSON.parse(
      readFileSync(join(RAIZ, "package.json"), "utf8"),
    ) as {
      packageManager: string;
      devDependencies: Record<string, string>;
    };

    // Nenhuma faixa: `^`, `~`, `*`, `x` e `latest` fazem duas máquinas (ou a
    // mesma máquina em dois dias) resolverem versões diferentes.
    for (const [pacote, versao] of Object.entries(manifesto.devDependencies)) {
      if (versao.startsWith("workspace:")) continue;
      expect(versao, `${pacote} está declarado como faixa "${versao}"`).toMatch(
        /^\d+\.\d+\.\d+$/,
      );
    }
    expect(manifesto.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);

    // O que vale não é o que está declarado: é o que roda. Cada ferramenta é
    // perguntada sobre a própria versão.
    const conferir: ReadonlyArray<
      readonly [string, readonly string[], string]
    > = [
      ["eslint", ["--version"], manifesto.devDependencies.eslint ?? ""],
      ["prettier", ["--version"], manifesto.devDependencies.prettier ?? ""],
      ["tsc", ["--version"], manifesto.devDependencies.typescript ?? ""],
      ["vitest", ["--version"], manifesto.devDependencies.vitest ?? ""],
    ];
    for (const [ferramenta, argumentos, esperada] of conferir) {
      const saida = rodar(
        join(RAIZ, "node_modules", ".bin", ferramenta),
        argumentos,
        {
          cwd: RAIZ,
        },
      ).saida;
      expect(
        saida,
        `${ferramenta} instalado não é a versão fixada (${esperada})`,
      ).toContain(esperada);
    }
  }, 120_000);

  it("@spec:AC-042 o catálogo do monorepo fixa uma versão exata por biblioteca", () => {
    // Duas versões da mesma biblioteca em pacotes diferentes é a classe de bug
    // que só aparece em produção — e faz a verificação deixar de significar a
    // mesma coisa em cada pacote.
    const espacoDeTrabalho = readFileSync(
      join(RAIZ, "pnpm-workspace.yaml"),
      "utf8",
    );
    const catalogo =
      /\ncatalog:\n((?: {2}.*\n|\n)*)/.exec(espacoDeTrabalho)?.[1] ?? "";
    const entradas = [...catalogo.matchAll(/^ {2}([\w@/-]+):\s*(\S+)/gm)];

    expect(entradas.length).toBeGreaterThan(0);
    for (const [, biblioteca, versao] of entradas) {
      expect(
        versao,
        `o catálogo declara ${biblioteca} como faixa "${versao}"`,
      ).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-043 — pular o portão é deliberado, e fica registrado
// ---------------------------------------------------------------------------

describe("pular o portão", () => {
  it("@spec:AC-043 pular exige sinalização explícita: sem ela, o portão bloqueia", () => {
    const repositorio = repositorioComGanchos("pulo-exige-sinal");
    const noRemotoAntes = versaoNoRemoto(repositorio);

    writeFileSync(join(repositorio.caminho, "novo.txt"), "trabalho novo\n");
    repositorio.git("add", "-A");
    repositorio.git(
      "commit",
      "-q",
      "-m",
      "T-002 fundacao: trabalho novo",
      "--no-verify",
    );

    const semSinal = rodar("git", ["push", "origem", "HEAD"], {
      cwd: repositorio.caminho,
      env: {
        ...repositorio.env,
        PORTAO_ENSAIO: "reprovar:qualidade de código",
      },
    });
    expect(semSinal.codigo).not.toBe(0);
    expect(versaoNoRemoto(repositorio)).toBe(noRemotoAntes);

    // A saída existe, e é um ato: escrever LEFTHOOK=0 no comando.
    const comSinal = rodar("git", ["push", "origem", "HEAD"], {
      cwd: repositorio.caminho,
      env: {
        ...repositorio.env,
        LEFTHOOK: "0",
        PORTAO_ENSAIO: "reprovar:qualidade de código",
      },
    });
    expect(
      comSinal.codigo,
      `a saída explícita não funcionou:\n${comSinal.saida}`,
    ).toBe(0);
    expect(versaoNoRemoto(repositorio)).not.toBe(noRemotoAntes);
  }, 120_000);

  it("@spec:AC-043 o pulo vira dívida escrita em docs/pendencias.md, com data e o que ficou sem verificação", () => {
    const repositorio = repositorioComGanchos("pulo-registrado");
    const pendencias = join(repositorio.caminho, "docs", "pendencias.md");

    writeFileSync(join(repositorio.caminho, "novo.txt"), "trabalho novo\n");
    repositorio.git("add", "-A");
    repositorio.git(
      "commit",
      "-q",
      "-m",
      "T-002 fundacao: trabalho novo",
      "--no-verify",
    );
    const enviada = repositorio.git("rev-parse", "HEAD").saida.trim();
    const curta = repositorio.git("rev-parse", "--short", "HEAD").saida.trim();

    rodar("git", ["push", "origem", "HEAD"], {
      cwd: repositorio.caminho,
      env: {
        ...repositorio.env,
        LEFTHOOK: "0",
        PORTAO_ENSAIO: "reprovar:formatação",
      },
    });
    expect(versaoNoRemoto(repositorio)).toBe(enviada);
    expect(readFileSync(pendencias, "utf8")).not.toContain(curta);

    // É o próximo trabalho que revela a dívida: o gancho antes do registro
    // compara o que foi enviado com o que o portão aprovou.
    writeFileSync(join(repositorio.caminho, "outro.txt"), "mais trabalho\n");
    repositorio.git("add", "-A");
    const commit = repositorio.git(
      "commit",
      "-m",
      "T-003 fundacao: mais trabalho",
    );
    expect(
      commit.codigo,
      `o registro da dívida barrou o commit:\n${commit.saida}`,
    ).toBe(0);

    const texto = readFileSync(pendencias, "utf8");
    expect(texto).toContain(curta);
    expect(texto).toContain("enviado sem passar pelo portão");
    // Data de hoje, no formato do documento.
    const hoje = new Date();
    const dataDeHoje = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    expect(texto).toContain(dataDeHoje);
    // E o que exatamente ficou sem verificação: a lista de etapas do portão.
    for (const etapa of etapasDeclaradas()) {
      expect(
        texto,
        `a dívida não diz que "${etapa}" ficou sem verificação`,
      ).toContain(etapa);
    }

    // A dívida entra no histórico junto com o commit — dívida que fica só no
    // disco de quem pulou não é visível para mais ninguém.
    expect(
      repositorio.git("show", "--stat", "--format=", "HEAD").saida,
    ).toContain("docs/pendencias.md");

    // E não vira uma linha por commit: registrada uma vez, registrada.
    writeFileSync(join(repositorio.caminho, "terceiro.txt"), "ainda mais\n");
    repositorio.git("add", "-A");
    repositorio.git("commit", "-m", "T-004 fundacao: ainda mais");
    const depois = readFileSync(pendencias, "utf8");
    expect(depois.split("enviado sem passar pelo portão").length - 1).toBe(1);
  }, 180_000);

  it("@spec:AC-043 o registro não inventa dívida para o histórico que já existia antes dele", () => {
    // O registro do portão nasce vazio a cada clone: ele sabe o que ESTA
    // máquina verificou, e mais nada. Sem ponto de partida, o primeiro commit
    // depois de clonar acusaria como contornado todo o histórico que já estava
    // no remoto — e dívida falsa ensina a ignorar o arquivo de pendências.
    const repositorio = repositorioComGanchos("ponto-de-partida");
    const pendencias = join(repositorio.caminho, "docs", "pendencias.md");

    writeFileSync(join(repositorio.caminho, "novo.txt"), "trabalho novo\n");
    repositorio.git("add", "-A");
    const commit = repositorio.git(
      "commit",
      "-m",
      "T-002 fundacao: trabalho novo",
    );

    expect(commit.codigo, commit.saida).toBe(0);
    expect(readFileSync(pendencias, "utf8")).not.toContain(
      "enviado sem passar pelo portão",
    );

    // Mas o que acontecer DEPOIS do ponto de partida é registrado.
    rodar("git", ["push", "origem", "HEAD"], {
      cwd: repositorio.caminho,
      env: {
        ...repositorio.env,
        LEFTHOOK: "0",
        PORTAO_ENSAIO: "reprovar:formatação",
      },
    });
    writeFileSync(join(repositorio.caminho, "outro.txt"), "mais trabalho\n");
    repositorio.git("add", "-A");
    repositorio.git("commit", "-m", "T-003 fundacao: mais trabalho");

    expect(readFileSync(pendencias, "utf8")).toContain(
      "enviado sem passar pelo portão",
    );
  }, 120_000);

  it("@spec:AC-043 versão que passou pelo portão não vira dívida", () => {
    const repositorio = repositorioComGanchos("sem-divida");

    // Um portão mínimo, construído sobre o MESMO motor do portão de verdade
    // (`portao-lib.sh`): é ele que anota a versão aprovada. Aqui a lista de
    // etapas é uma só, e trivial, porque o que está sob prova é a anotação.
    writeFileSync(
      join(repositorio.caminho, "infra", "scripts", "portao-minimo.sh"),
      [
        "#!/usr/bin/env bash",
        "set -uo pipefail",
        'RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"',
        'cd "$RAIZ" || exit 1',
        '. "$RAIZ/infra/scripts/portao-lib.sh"',
        'portao_etapa "etapa de prova" "que o motor anota a versão aprovada" true',
        "portao_resumo",
        "",
      ].join("\n"),
    );
    repositorio.git("add", "-A");
    repositorio.git(
      "commit",
      "-q",
      "-m",
      "T-002 fundacao: portao minimo",
      "--no-verify",
    );
    const aprovada = repositorio
      .git("rev-parse", "--short", "HEAD")
      .saida.trim();

    const portao = rodar(
      "bash",
      [join(repositorio.caminho, "infra", "scripts", "portao-minimo.sh")],
      {
        cwd: repositorio.caminho,
      },
    );
    expect(portao.codigo, portao.saida).toBe(0);
    expect(portao.saida).toContain(
      `versão ${aprovada} anotada como verificada`,
    );

    rodar("git", ["push", "origem", "HEAD"], {
      cwd: repositorio.caminho,
      env: { ...repositorio.env, LEFTHOOK: "0" },
    });

    const registro = rodar(
      "bash",
      [join(repositorio.caminho, "infra", "scripts", "registrar-pulo.sh")],
      {
        cwd: repositorio.caminho,
      },
    );
    expect(registro.codigo).toBe(0);
    expect(
      readFileSync(join(repositorio.caminho, "docs", "pendencias.md"), "utf8"),
    ).not.toContain("enviado sem passar pelo portão");
  }, 120_000);
});
