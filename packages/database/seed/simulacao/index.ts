/**
 * Seed de simulação: 100 lojas e exatamente 10 pedidos por loja (1.000), numa
 * base descartável, para alimentar o teste de carga (k6).
 *
 * Uso (depois de definir a semente e a referência):
 *
 *   pnpm --filter @simpleclick/database seed:simulacao -- \
 *     --semente sc-2026 --referencia 2026-11-01T18:00:00-03:00 [--recriar]
 *
 * O que ele faz, em ordem: guarda (só a base `simpleclick_simulacao`), cria ou
 * recria a base, autentica os papéis, migra, e grava UMA LOJA POR TRANSAÇÃO.
 * Repetir o comando completa o que faltou: tudo vira upsert e o pedido entra
 * com `DO NOTHING`. `--falhar-apos N` existe só para provar essa retomada.
 *
 * A escrita (loja, catálogo, imagens, clientes, pedidos com retrato histórico)
 * é a do seed de demonstração (`../demo/index.ts`), sobre as lojas que
 * `perfil.ts` planeja. Este arquivo só cuida da loja do perfil, do atacado,
 * da sequência e das saídas.
 *
 * NUNCA em produção, NUNCA fora da máquina local: o perfil tem senha conhecida
 * e token de pedido previsível.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ClienteSql } from "../../src/migrate.ts";
import { garantirConta, SENHA_DOS_DONOS, vincular } from "../demo/contas.ts";
import { gravar, id } from "../demo/escrita.ts";
import {
  atualizarTotaisDosClientes,
  type Contexto,
  idDoProdutoDemo,
  plantarCatalogo,
  plantarClientes,
  plantarPedidos,
  prepararLoja,
} from "../demo/index.ts";
import {
  ErroDeGuarda,
  conectarAdministracao,
  montarAlvo,
  prepararBanco,
} from "./banco.ts";
import {
  escreverSaida,
  impressoesDoBanco,
  montarManifesto,
  PASTA_DE_SAIDA,
} from "./manifesto.ts";
import {
  ErroDeParametros,
  lerParametrosDaCarga,
  mascararUrl,
  type ParametrosDaCarga,
} from "./parametros.ts";
import { ATACADO, montarPlano, type PlanoDaLoja, type PlanoDoPerfil } from "./perfil.ts";

const FUSO = "America/Fortaleza";

/** A falha pedida por `--falhar-apos`: não é defeito, é a prova da retomada. */
export class FalhaInduzida extends Error {
  constructor(gravadas: number) {
    super(
      `Falha induzida (--falhar-apos): parei depois de ${gravadas} loja(s) gravada(s). Rode de novo, sem --falhar-apos, para completar.`,
    );
    this.name = "FalhaInduzida";
  }
}

// ---------------------------------------------------------------------------
// Uma loja
// ---------------------------------------------------------------------------

/** Cria (ou atualiza) a loja do perfil e o dono dela. A data é do perfil, nunca "agora". */
async function criarLojaDoPerfil(
  cliente: ClienteSql,
  plano: PlanoDaLoja,
): Promise<{ lojaId: string; donaId: string }> {
  const nova = plano.loja.nova!;
  const donaId = await garantirConta(cliente, {
    email: nova.dono.email,
    nome: nova.dono.nome,
    senha: SENHA_DOS_DONOS,
  });
  const lojaId = id(`loja:${plano.chave}`);
  await gravar(cliente, "stores", {
    id: lojaId,
    code: plano.codigo,
    name: nova.nome,
    slug: nova.apelido,
    status: "ACTIVE",
    vertical_code: nova.ramo,
    vertical_schema_version: 1,
    timezone: FUSO,
    created_by: donaId,
    created_at: plano.criadaEm,
    approved_at: plano.aprovadaEm,
  });
  await vincular(cliente, lojaId, donaId, "OWNER");
  return { lojaId, donaId };
}

/** A faixa de atacado do produto: mínimo de 10 unidades, 5 % de desconto, presa ao produto. */
async function plantarAtacado(
  cliente: ClienteSql,
  plano: PlanoDaLoja,
  lojaId: string,
): Promise<boolean> {
  if (plano.atacado === null) return false;
  await gravar(cliente, "product_prices", {
    id: id(`sim:atacado:${plano.chave}:${plano.atacado.produto}`),
    store_id: lojaId,
    product_id: idDoProdutoDemo(plano.loja, plano.atacado.produto),
    variant_id: null,
    kind: "WHOLESALE",
    label: "Atacado",
    amount_cents: 0,
    min_quantity: ATACADO.minimo,
    currency: "BRL",
    sort_order: 9,
    is_active: true,
    discount_kind: "PERCENT",
    discount_value: ATACADO.desconto,
  });
  return true;
}

/** Tudo de uma loja, dentro de uma transação. */
export async function gravarLoja(
  cliente: ClienteSql,
  plano: PlanoDaLoja,
  referencia: Date,
): Promise<{ produtos: number; pedidos: number; atacado: boolean }> {
  await cliente.query("BEGIN");
  try {
    const { lojaId, donaId } = await criarLojaDoPerfil(cliente, plano);
    const contexto: Contexto = {
      cliente,
      lojaId,
      loja: plano.loja,
      nome: plano.loja.nova!.nome,
      ramo: plano.loja.nova!.ramo,
      donaId,
      agora: referencia,
    };
    await prepararLoja(contexto);
    const produtos = await plantarCatalogo(contexto);
    const atacado = await plantarAtacado(cliente, plano, lojaId);
    // Sem a Ana: o perfil não depende das contas de teste.
    await plantarClientes(contexto, "");
    const pedidos = await plantarPedidos(contexto, referencia, plano.pedidos);
    await atualizarTotaisDosClientes(cliente, lojaId);
    await cliente.query("COMMIT");
    return { produtos, pedidos, atacado };
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// A carga
// ---------------------------------------------------------------------------

/**
 * Recusa base que tem loja de outro perfil (impressão diferente) ou loja que
 * não é do perfil: perfis não se misturam, e a saída é `--recriar`.
 */
export async function conferirPerfilDoBanco(
  cliente: ClienteSql,
  plano: PlanoDoPerfil,
): Promise<number> {
  const r = await cliente.query("SELECT code FROM app.stores ORDER BY code");
  for (const linha of r.rows) {
    const codigo = String(linha.code);
    const partes = /^SIM-([0-9a-f]{8})-\d{3}$/.exec(codigo);
    if (partes === null) {
      throw new ErroDeGuarda(
        `A base tem uma loja fora do perfil (code "${codigo}"). Use --recriar.`,
      );
    }
    if (partes[1] !== plano.impressao) {
      throw new ErroDeGuarda(
        `A base já tem lojas de outro perfil (impressão ${partes[1]}, e o pedido é ${plano.impressao}). Use --recriar para trocar de perfil.`,
      );
    }
  }
  return r.rows.length;
}

export interface ResultadoDaCarga {
  readonly lojasGravadas: number;
  readonly pedidosNovos: number;
}

export async function carregarSimulacao(opcoes: {
  readonly cliente: ClienteSql;
  readonly plano: PlanoDoPerfil;
  readonly falharApos?: number | null;
  readonly relatar?: (linha: string) => void;
}): Promise<ResultadoDaCarga> {
  const { cliente, plano, falharApos = null, relatar = () => {} } = opcoes;
  const jaExistiam = await conferirPerfilDoBanco(cliente, plano);
  if (jaExistiam > 0) {
    relatar(`↻ a base já tem ${jaExistiam} loja(s) deste perfil: completando o que faltar.`);
  }
  let gravadas = 0;
  let pedidosNovos = 0;
  for (const planoDaLoja of plano.lojas) {
    const inicio = Date.now();
    const r = await gravarLoja(cliente, planoDaLoja, plano.referencia);
    gravadas++;
    pedidosNovos += r.pedidos;
    relatar(
      `✔ ${planoDaLoja.chave} ${planoDaLoja.loja.nova!.nome} [${planoDaLoja.segmento}]: ${r.produtos} produtos${r.atacado ? " (1 com atacado)" : ""}, ${r.pedidos} pedido(s) novo(s) — ${gravadas}/${plano.lojas.length} em ${Date.now() - inicio} ms`,
    );
    if (falharApos !== null && gravadas === falharApos) {
      throw new FalhaInduzida(gravadas);
    }
  }
  return { lojasGravadas: gravadas, pedidosNovos };
}

// ---------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------

async function principal(argv: readonly string[]): Promise<number> {
  const escrever = (linha: string): void => {
    process.stdout.write(`${linha}\n`);
  };
  let parametros: ParametrosDaCarga;
  try {
    parametros = lerParametrosDaCarga(argv);
  } catch (erro) {
    if (erro instanceof ErroDeParametros) {
      process.stderr.write(`${erro.message}\n`);
      return 2;
    }
    throw erro;
  }

  let cliente: Awaited<ReturnType<typeof conectarAdministracao>> | null = null;
  try {
    const alvo = montarAlvo(process.env, parametros.banco);
    escrever(`Base da simulação: ${mascararUrl(alvo.urlDoMigrador)}`);
    await prepararBanco(alvo, {
      recriar: parametros.recriar,
      aceitarTrust: parametros.aceitarTrust,
      relatar: escrever,
    });
    const plano = montarPlano(parametros.semente, parametros.referencia);
    escrever(
      `Perfil ${plano.impressao}: ${plano.lojas.length} lojas, ${plano.lojas.length * 10} pedidos (semente "${parametros.semente}", referência ${parametros.referenciaTexto}).`,
    );
    cliente = await conectarAdministracao(alvo);
    const resultado = await carregarSimulacao({
      cliente,
      plano,
      falharApos: parametros.falharApos,
      relatar: escrever,
    });

    const impressoes = await impressoesDoBanco(cliente);
    const manifesto = await montarManifesto(cliente, plano, {
      banco: parametros.banco,
      referenciaTexto: parametros.referenciaTexto,
    });
    const caminho = await escreverSaida("manifesto.json", `${JSON.stringify(manifesto, null, 2)}\n`);
    await escreverSaida(
      "impressoes.json",
      `${JSON.stringify({ perfil: plano.impressao, ...impressoes }, null, 2)}\n`,
    );
    escrever(
      `Pronto: ${impressoes.lojas} lojas e ${impressoes.pedidos} pedidos na base (${resultado.pedidosNovos} pedido(s) novo(s) nesta execução).`,
    );
    escrever(`impressão dos ids      ${impressoes.ids}`);
    escrever(`impressão do conteúdo  ${impressoes.conteudo}`);
    escrever(`Manifesto: ${caminho}`);
    escrever(`Imagens em apps/web/public/demo/simulacao/ (fora do git); saídas em ${PASTA_DE_SAIDA}.`);
    return 0;
  } catch (erro) {
    if (erro instanceof FalhaInduzida) {
      process.stderr.write(`${erro.message}\n`);
      return 3;
    }
    process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
    return 1;
  } finally {
    await cliente?.end().catch(() => {});
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal(process.argv.slice(2));
}
