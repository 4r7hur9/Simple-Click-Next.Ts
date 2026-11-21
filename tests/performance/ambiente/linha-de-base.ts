/**
 * O que o preparo comprova antes de qualquer tráfego.
 *
 *   node tests/performance/ambiente/linha-de-base.ts provar    <etapa>
 *   node tests/performance/ambiente/linha-de-base.ts base      <etapa>
 *   node tests/performance/ambiente/linha-de-base.ts metadados <etapa>
 *
 * provar    — uma vitrine e uma imagem do manifesto carregam (API e site);
 * base      — a linha de base do banco: 100 lojas, 10 pedidos em cada, nenhum
 *             pedido do k6, totais fechando, e a impressão dos 1.000 pedidos
 *             iniciais, que a reconciliação compara no fim;
 * metadados — SHA, k6, semente, data de referência, runner e configuração.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, arch, platform, totalmem } from "node:os";
import { resolve } from "node:path";

import {
  conectarNaBase,
  ehWebp,
  etapaDoArgumento,
  gravarJson,
  impressaoDosPedidosIniciais,
  INDICE_DO_REDIS,
  LIMITE_DO_CATALOGO_NO_ENSAIO,
  lerJson,
  lerManifesto,
  pastaDaSaida,
  RAIZ,
  rotuloDaSaida,
  REFERENCIA,
  SEMENTE,
  COM_VOLUME,
  SO_DA_BASE_DO_SEED,
  SO_DO_SEED,
  SO_DO_VOLUME,
  SQL_DOS_VINCULOS_ENTRE_LOJAS,
  sqlDasLinhasErradas,
  sqlDasLinhasErradasDaApi,
  sqlDosTotaisErrados,
  URL_DA_API,
  URL_DO_SITE,
  type Etapa,
  type LojaDoManifesto,
} from "./apoio.ts";
import { SENHA_DOS_DONOS } from "../../../packages/database/seed/demo/contas.ts";
import { corpoVigente, impressao } from "./corpos-de-meus-pedidos.ts";
import {
  LOJAS_DO_VOLUME,
  MAXIMO_POR_LOJA,
  MINIMO_POR_LOJA,
  PEDIDOS_DO_VOLUME,
} from "../../../packages/database/seed/volume/parametros.ts";

// ---------------------------------------------------------------------------
// provar
// ---------------------------------------------------------------------------

async function provarImagem(
  caminho: string,
  rotulo: string,
): Promise<string[]> {
  const r = await fetch(`${URL_DO_SITE}${caminho}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const tipo = r.headers.get("content-type") ?? "";
  const corpo = new Uint8Array(await r.arrayBuffer());
  const falhas: string[] = [];
  if (r.status !== 200) falhas.push(`${rotulo}: HTTP ${r.status}`);
  else if (!tipo.startsWith("image/"))
    falhas.push(`${rotulo}: content-type "${tipo}"`);
  else if (!ehWebp(corpo)) falhas.push(`${rotulo}: não é um WebP válido`);
  return falhas;
}

async function provar(): Promise<string[]> {
  const { lojas } = lerManifesto();
  const amostra: LojaDoManifesto[] = [
    lojas[0],
    lojas[Math.floor(lojas.length / 2)],
    lojas[lojas.length - 1],
  ].filter((l): l is LojaDoManifesto => l !== undefined);
  const falhas: string[] = [];
  for (const loja of amostra) {
    const vitrine = await fetch(`${URL_DA_API}/v1/vitrine/${loja.apelido}`, {
      signal: AbortSignal.timeout(30_000),
    });
    const corpo = (await vitrine.json().catch(() => null)) as {
      loja?: { apelido?: string };
    } | null;
    if (vitrine.status !== 200 || corpo?.loja?.apelido !== loja.apelido) {
      falhas.push(`vitrine ${loja.apelido}: HTTP ${vitrine.status}`);
    }
    const pagina = await fetch(`${URL_DO_SITE}/loja/${loja.apelido}`, {
      signal: AbortSignal.timeout(60_000),
    });
    const html = await pagina.text();
    if (pagina.status !== 200 || !html.includes(loja.nome)) {
      falhas.push(
        `página /loja/${loja.apelido}: HTTP ${pagina.status}${pagina.status === 200 ? " sem o nome da loja" : ""}`,
      );
    }
    falhas.push(...(await provarImagem(loja.logo, `logo de ${loja.apelido}`)));
    falhas.push(...(await provarImagem(loja.capa, `capa de ${loja.apelido}`)));
    const produto = loja.produtos[0];
    if (produto !== undefined) {
      falhas.push(
        ...(await provarImagem(
          produto.imagem,
          `foto de ${produto.slug} (${loja.apelido})`,
        )),
      );
    }
  }
  process.stdout.write(
    falhas.length === 0
      ? `✔ ${amostra.length} vitrines e suas imagens (logo, capa e foto de produto) carregam.\n`
      : `✘ ${falhas.join("\n✘ ")}\n`,
  );
  return falhas;
}

// ---------------------------------------------------------------------------
// base
// ---------------------------------------------------------------------------

interface LinhaDeBase {
  geradoEm: string;
  comVolume: boolean;
  lojas: number;
  lojasForaDoPerfil: number;
  pedidosIniciais: number;
  pedidosDoSeed: number;
  pedidosDoVolume: number;
  pedidosPorLojaMin: number;
  pedidosPorLojaMax: number;
  pedidosDoK6: number;
  pedidosNaBase: number;
  totaisErrados: number;
  linhasErradas: number;
  totaisErradosDoVolume: number;
  linhasErradasDoVolume: number;
  vinculosEntreLojas: { clientes: number; itens: number };
  lojasDoPainel: { menor: string; maior: string } | null;
  impressaoDosPedidosIniciais: string;
  impressaoDoSeed: unknown;
  reprovacoes: string[];
}

/** O que cada modo exige (constantes do seed e do volume, nunca lidas da base). */
export function esperadoDoModo(comVolume: boolean): {
  pedidosDoSeed: number;
  pedidosDoVolume: number;
  pedidosIniciais: number;
} {
  const pedidosDoSeed = LOJAS_DO_VOLUME * PEDIDOS_DA_BASE_POR_LOJA;
  const pedidosDoVolume = comVolume ? PEDIDOS_DO_VOLUME : 0;
  return { pedidosDoSeed, pedidosDoVolume, pedidosIniciais: pedidosDoSeed + pedidosDoVolume };
}

const PEDIDOS_DA_BASE_POR_LOJA = 10;

async function base(etapa: Etapa): Promise<string[]> {
  const cliente = await conectarNaBase();
  try {
    const lojas = await cliente.query(
      `SELECT s.code, s.slug,
              count(o.id) FILTER (WHERE ${SO_DA_BASE_DO_SEED})::int AS do_seed,
              count(o.id) FILTER (WHERE ${SO_DO_VOLUME})::int AS do_volume
         FROM app.stores s
         LEFT JOIN app.orders o ON o.store_id = s.id
        WHERE s.code LIKE 'SIM-%'
        GROUP BY s.code, s.slug ORDER BY s.code`,
    );
    type Loja = { code: string; slug: string; do_seed: number; do_volume: number };
    const linhasDasLojas = lojas.rows as Loja[];
    const doSeed = linhasDasLojas.map((l) => l.do_seed);
    const doVolume = linhasDasLojas.map((l) => l.do_volume);
    const total = await cliente.query(
      `SELECT (SELECT count(*) FROM app.stores)::int AS lojas,
              (SELECT count(*) FROM app.orders)::int AS pedidos,
              (SELECT count(*) FROM app.orders o WHERE NOT (${SO_DO_SEED}))::int AS do_k6`,
    );
    const totais = await cliente.query(sqlDosTotaisErrados(SO_DA_BASE_DO_SEED));
    const linhas = await cliente.query(sqlDasLinhasErradas(SO_DA_BASE_DO_SEED));
    const totaisV = await cliente.query(sqlDosTotaisErrados(SO_DO_VOLUME));
    const linhasV = await cliente.query(sqlDasLinhasErradasDaApi(SO_DO_VOLUME));
    const vinculos = await cliente.query(SQL_DOS_VINCULOS_ENTRE_LOJAS);
    const impressao = await impressaoDosPedidosIniciais(cliente);

    // O painel da carga: a menor e a maior loja em pedidos iniciais (desempate
    // pelo código), para a fila medir o histórico curto e o longo.
    const porTamanho = [...linhasDasLojas].sort(
      (a, b) => a.do_seed + a.do_volume - (b.do_seed + b.do_volume) || a.code.localeCompare(b.code),
    );
    const menor = porTamanho[0];
    const maior = porTamanho[porTamanho.length - 1];

    const soma = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
    const saida = pastaDaSaida(etapa);
    const resultado: LinhaDeBase = {
      geradoEm: new Date().toISOString(),
      comVolume: COM_VOLUME,
      lojas: linhasDasLojas.length,
      lojasForaDoPerfil: Number(total.rows[0].lojas) - linhasDasLojas.length,
      pedidosIniciais: soma(doSeed) + soma(doVolume),
      pedidosDoSeed: soma(doSeed),
      pedidosDoVolume: soma(doVolume),
      pedidosPorLojaMin: Math.min(...doSeed),
      pedidosPorLojaMax: Math.max(...doSeed),
      pedidosDoK6: Number(total.rows[0].do_k6),
      pedidosNaBase: Number(total.rows[0].pedidos),
      totaisErrados: totais.rows.length,
      linhasErradas: linhas.rows.length,
      totaisErradosDoVolume: totaisV.rows.length,
      linhasErradasDoVolume: linhasV.rows.length,
      vinculosEntreLojas: {
        clientes: Number(vinculos.rows[0].clientes),
        itens: Number(vinculos.rows[0].itens),
      },
      lojasDoPainel:
        menor !== undefined && maior !== undefined && menor.code !== maior.code
          ? { menor: menor.slug, maior: maior.slug }
          : null,
      impressaoDosPedidosIniciais: impressao,
      impressaoDoSeed: lerJson(
        resolve(RAIZ, "packages/database/seed/simulacao/saida/impressoes.json"),
      ),
      reprovacoes: [],
    };
    const esperado = esperadoDoModo(COM_VOLUME);
    const r = resultado.reprovacoes;
    if (resultado.lojas !== LOJAS_DO_VOLUME)
      r.push(`esperadas ${LOJAS_DO_VOLUME} lojas do perfil, achei ${resultado.lojas}`);
    if (resultado.lojasForaDoPerfil !== 0)
      r.push(`${resultado.lojasForaDoPerfil} loja(s) fora do perfil na base`);
    if (
      resultado.pedidosPorLojaMin !== PEDIDOS_DA_BASE_POR_LOJA ||
      resultado.pedidosPorLojaMax !== PEDIDOS_DA_BASE_POR_LOJA
    ) {
      r.push(
        `pedidos do seed por loja entre ${resultado.pedidosPorLojaMin} e ${resultado.pedidosPorLojaMax} (esperado ${PEDIDOS_DA_BASE_POR_LOJA} em todas)`,
      );
    }
    if (resultado.pedidosDoSeed !== esperado.pedidosDoSeed)
      r.push(`esperados ${esperado.pedidosDoSeed} pedidos do seed, achei ${resultado.pedidosDoSeed}`);
    if (resultado.pedidosDoVolume !== esperado.pedidosDoVolume)
      r.push(
        `esperados ${esperado.pedidosDoVolume} pedidos do volume (VOLUME=${COM_VOLUME ? "sim" : "nao"}), achei ${resultado.pedidosDoVolume}`,
      );
    if (COM_VOLUME) {
      const fora = doVolume.filter((n) => n < MINIMO_POR_LOJA || n > MAXIMO_POR_LOJA).length;
      if (fora > 0)
        r.push(`${fora} loja(s) com pedidos do volume fora de ${MINIMO_POR_LOJA}–${MAXIMO_POR_LOJA}`);
    }
    if (resultado.pedidosDoK6 !== 0)
      r.push(`já existem ${resultado.pedidosDoK6} pedidos do k6 na base`);
    if (resultado.pedidosNaBase !== esperado.pedidosIniciais)
      r.push(`a base tem ${resultado.pedidosNaBase} pedidos (esperado ${esperado.pedidosIniciais})`);
    if (resultado.totaisErrados !== 0)
      r.push(`${resultado.totaisErrados} pedido(s) do seed com total que não fecha`);
    if (resultado.linhasErradas !== 0)
      r.push(`${resultado.linhasErradas} linha(s) do seed com valor que não fecha`);
    if (resultado.totaisErradosDoVolume !== 0 || resultado.linhasErradasDoVolume !== 0)
      r.push(
        `${resultado.totaisErradosDoVolume} total(is) e ${resultado.linhasErradasDoVolume} linha(s) do volume que não fecham`,
      );
    if (resultado.vinculosEntreLojas.clientes !== 0 || resultado.vinculosEntreLojas.itens !== 0)
      r.push(
        `vínculos entre lojas: ${resultado.vinculosEntreLojas.clientes} pedido(s) com cliente de outra loja, ${resultado.vinculosEntreLojas.itens} item(ns) de outra loja`,
      );
    if (resultado.lojasDoPainel === null) r.push("não achei duas lojas distintas para o painel");
    gravarJson(resolve(saida, "linha-de-base.json"), resultado);
    process.stdout.write(
      r.length === 0
        ? `✔ linha de base: ${resultado.lojas} lojas, ${resultado.pedidosDoSeed} do seed (10 por loja) + ${resultado.pedidosDoVolume} do volume = ${resultado.pedidosIniciais}, nenhum do k6, totais fechando, 0 vínculo entre lojas. Impressão ${impressao.slice(0, 12)}…\n`
        : `✘ linha de base reprovada:\n  - ${r.join("\n  - ")}\n`,
    );
    return r;
  } finally {
    await cliente.end();
  }
}

// ---------------------------------------------------------------------------
// painel (#142): login dos donos e fila das duas lojas do cenário painel
// ---------------------------------------------------------------------------

async function painel(etapa: Etapa): Promise<string[]> {
  const base = lerJson<LinhaDeBase>(resolve(pastaDaSaida(etapa), "linha-de-base.json"));
  const lojas = base?.lojasDoPainel;
  if (!lojas) return ["sem lojasDoPainel na linha-de-base.json"];
  const falhas: string[] = [];
  const pares: [string, string][] = [
    [lojas.menor, lojas.maior],
    [lojas.maior, lojas.menor],
  ];
  for (const [apelido, outra] of pares) {
    const login = await fetch(`${URL_DA_API}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: URL_DO_SITE },
      body: JSON.stringify({ email: `dono@${apelido}.simulacao.test`, senha: SENHA_DOS_DONOS }),
      signal: AbortSignal.timeout(30_000),
    });
    const sessao = (await login.json().catch(() => null)) as {
      status?: string;
      tokenDeAcesso?: string;
    } | null;
    if (login.status !== 200 || sessao?.status !== "SESSAO_CRIADA" || !sessao.tokenDeAcesso) {
      falhas.push(`login do dono de ${apelido}: HTTP ${login.status}`);
      continue;
    }
    const cabecalho = { authorization: `Bearer ${sessao.tokenDeAcesso}` };
    const fila = await fetch(`${URL_DA_API}/v1/lojas/${apelido}/pedidos`, {
      headers: cabecalho,
      signal: AbortSignal.timeout(30_000),
    });
    const corpo = (await fila.json().catch(() => null)) as { pedidos?: unknown[] } | null;
    if (fila.status !== 200 || !Array.isArray(corpo?.pedidos))
      falhas.push(`fila de ${apelido}: HTTP ${fila.status}`);
    const cruzada = await fetch(`${URL_DA_API}/v1/lojas/${outra}/pedidos`, {
      headers: cabecalho,
      signal: AbortSignal.timeout(30_000),
    });
    if (cruzada.status >= 200 && cruzada.status < 300)
      falhas.push(`o dono de ${apelido} leu a fila de ${outra} (HTTP ${cruzada.status})`);
  }
  process.stdout.write(
    falhas.length === 0
      ? `✔ painel: os donos de ${lojas.menor} e ${lojas.maior} entram, abrem a própria fila e não abrem a da outra.\n`
      : `✘ ${falhas.join("\n✘ ")}\n`,
  );
  return falhas;
}

// ---------------------------------------------------------------------------
// metadados
// ---------------------------------------------------------------------------

function lerTexto(caminho: string): string | null {
  try {
    return readFileSync(caminho, "utf8").trim();
  } catch {
    return null;
  }
}

function git(...argumentos: string[]): string {
  try {
    return execFileSync("git", argumentos, {
      cwd: RAIZ,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * A identidade do harness (#142): sem commit, o SHA não diz que código rodou.
 * Hash do conteúdo dos arquivos de `tests/performance/` e de
 * `packages/database/seed/` que o git vê (rastreados e novos, sem os
 * ignorados: as saídas não entram). O comparar.ts recusa antes/depois com
 * harness diferente.
 */
function hashDoHarness(): string {
  const lista = git("ls-files", "-co", "--exclude-standard", "tests/performance", "packages/database/seed")
    .split("\n")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  for (const arquivo of lista) {
    hash.update(`${arquivo}\n`);
    try {
      hash.update(readFileSync(resolve(RAIZ, arquivo)));
    } catch {
      hash.update("<ausente>");
    }
  }
  return hash.digest("hex");
}

async function estadoDoBanco(): Promise<{
  migracoes: string[];
  impressaoDaFuncao: string;
  corpoVigente: string;
  pedidosDoVolume: number;
}> {
  const cliente = await conectarNaBase();
  try {
    const m = await cliente
      .query("SELECT nome FROM migracao.aplicadas ORDER BY nome")
      .catch(() => ({ rows: [] as { nome: string }[] }));
    const f = await cliente.query(
      `SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'meus_pedidos'`,
    );
    const v = await cliente.query(`SELECT count(*)::int AS n FROM app.orders o WHERE ${SO_DO_VOLUME}`);
    const prosrc = String(f.rows[0]?.prosrc ?? "");
    return {
      migracoes: (m.rows as { nome: string }[]).map((l) => String(l.nome)),
      impressaoDaFuncao: impressao(prosrc),
      corpoVigente: corpoVigente(prosrc),
      pedidosDoVolume: Number(v.rows[0]?.n ?? 0),
    };
  } finally {
    await cliente.end();
  }
}

async function metadados(etapa: Etapa): Promise<void> {
  const saida = pastaDaSaida(etapa);
  const banco = await estadoDoBanco();
  const planoDoVolume = lerJson<{ hashDoPlano?: string }>(resolve(saida, "volume", "baseline.json"));
  const sha =
    process.env.GITHUB_SHA?.trim() ||
    git("rev-parse", "HEAD") ||
    "desconhecido";
  const alterado = process.env.GITHUB_SHA
    ? false
    : git("status", "--porcelain") !== "";
  gravarJson(resolve(saida, "metadados.json"), {
    etapa,
    rodada: lerTexto(resolve(saida, "run-id")),
    preparadoEm: new Date().toISOString(),
    revisao: {
      sha,
      alteracoesLocaisNaoCommitadas: alterado,
      ref:
        process.env.GITHUB_REF_NAME ?? git("rev-parse", "--abbrev-ref", "HEAD"),
      evento: process.env.GITHUB_EVENT_NAME ?? "local",
      execucao: process.env.GITHUB_RUN_ID ?? null,
      sha12: sha.slice(0, 12),
      hashDoGitStatus: createHash("sha256").update(git("status", "--porcelain")).digest("hex"),
      hashDoHarness: hashDoHarness(),
    },
    rotulo: rotuloDaSaida(etapa),
    banco: {
      migracoes: banco.migracoes,
      impressaoDaFuncao: banco.impressaoDaFuncao,
      corpoVigenteDeMeusPedidos: banco.corpoVigente,
    },
    volume: {
      carregado: COM_VOLUME,
      pedidos: banco.pedidosDoVolume,
      hashDoPlano: planoDoVolume?.hashDoPlano ?? null,
    },
    seed: { semente: SEMENTE, dataDeReferencia: REFERENCIA },
    runner: {
      nome: process.env.RUNNER_NAME ?? "local",
      sistema: process.env.RUNNER_OS ?? platform(),
      imagem: process.env.ImageOS ?? null,
      arquitetura: process.env.RUNNER_ARCH ?? arch(),
      cpus: cpus().length,
      modeloDaCpu: cpus()[0]?.model ?? null,
      memoriaGb: Math.round(totalmem() / 1024 ** 3),
      node: process.version,
    },
    configuracao: {
      site: "build de produção (standalone)",
      api: "node apps/api/src/main.ts com NODE_ENV=development, como no lançador do seed",
      limiteDoCatalogoPorMinuto: Number(LIMITE_DO_CATALOGO_NO_ENSAIO),
      limitePadraoDoCatalogoPorMinuto: 60,
      indiceDoRedis: INDICE_DO_REDIS,
      segundoPlano: "desligado",
    },
  });
  process.stdout.write(`✔ metadados gravados (SHA ${sha.slice(0, 10)}).\n`);
}

// ---------------------------------------------------------------------------

const [comando, argumentoDaEtapa] = process.argv.slice(2);
try {
  const etapa = etapaDoArgumento(argumentoDaEtapa);
  if (comando === "provar")
    process.exitCode = (await provar()).length === 0 ? 0 : 1;
  else if (comando === "base")
    process.exitCode = (await base(etapa)).length === 0 ? 0 : 1;
  else if (comando === "painel")
    process.exitCode = (await painel(etapa)).length === 0 ? 0 : 1;
  else if (comando === "metadados") await metadados(etapa);
  else throw new Error("Uso: linha-de-base.ts <provar|base|painel|metadados> <etapa>");
} catch (erro) {
  process.stderr.write(
    `${erro instanceof Error ? erro.message : String(erro)}\n`,
  );
  process.exitCode = 1;
}
