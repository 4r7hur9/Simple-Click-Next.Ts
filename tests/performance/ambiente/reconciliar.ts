/**
 * A reconciliação do fim de cada etapa:
 *
 *   node tests/performance/ambiente/reconciliar.ts <smoke|carga|estresse>
 *
 * 1.000 pedidos iniciais + as compras novas confirmadas. O replay recupera a
 * MESMA compra e soma zero. O veredito sai do BANCO, e não do status HTTP que o
 * k6 viu: é o banco que diz se um pedido foi duplicado, se um total não fecha
 * ou se um 500 escondia uma compra que foi gravada.
 *
 * Reprova (código 1) por: pedido inicial alterado, loja com ≠ 10 pedidos
 * iniciais, mais de um pedido por chave, pedidos fora da faixa que o k6 explica,
 * total que não fecha. Um 500 que deixou 1 pedido gravado é o defeito conhecido
 * AC-516 (duas confirmações simultâneas com a mesma chave) e é CLASSIFICADO, não
 * reprovado: a gravação está certa e o defeito é a resposta de erro.
 */
import {
  createReadStream,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import {
  conectarNaBase,
  etapaDoArgumento,
  gravarJson,
  impressaoDosPedidosIniciais,
  lerJson,
  pastaDaSaida,
  SO_DA_BASE_DO_SEED,
  SQL_DOS_VINCULOS_ENTRE_LOJAS,
  sqlDasLinhasErradasDaApi,
  sqlDasOpcoesSemPreco,
  sqlDosTotaisErrados,
  type Etapa,
} from "./apoio.ts";

interface ChaveIncerta {
  chave: string;
  tipo: "timeout" | "500";
  fase: string;
}

interface ResumoDoK6 {
  contadores: Record<string, number>;
}

interface LinhaDeBase {
  impressaoDosPedidosIniciais: string;
  pedidosIniciais: number;
}

interface Verificacao {
  id: string;
  descricao: string;
  ok: boolean;
  detalhe: string;
}

/** Extrai do JSON bruto do k6 só as chaves incertas e apaga o bruto (é enorme). */
async function extrairChavesIncertas(saida: string): Promise<ChaveIncerta[]> {
  const bruto = resolve(saida, "pontos.json.gz");
  const destino = resolve(saida, "chaves-incertas.json");
  if (!existsSync(bruto)) return lerJson<ChaveIncerta[]>(destino) ?? [];
  const achadas = new Map<string, ChaveIncerta>();
  const linhas = createInterface({
    input: createReadStream(bruto).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const linha of linhas) {
    if (
      !linha.includes('"metric":"chave_incerta"') ||
      !linha.includes('"type":"Point"')
    )
      continue;
    const ponto = JSON.parse(linha) as {
      data?: {
        tags?: { chave?: string; tipo?: "timeout" | "500"; fase?: string };
      };
    };
    const t = ponto.data?.tags;
    if (t?.chave !== undefined && t.tipo !== undefined) {
      achadas.set(`${t.chave}|${t.tipo}|${t.fase ?? ""}`, {
        chave: t.chave,
        tipo: t.tipo,
        fase: t.fase ?? "",
      });
    }
  }
  const lista = [...achadas.values()];
  gravarJson(destino, lista);
  rmSync(bruto, { force: true });
  return lista;
}

function tabela(verificacoes: readonly Verificacao[]): string {
  return [
    "| | verificação | resultado |",
    "|---|---|---|",
    ...verificacoes.map(
      (v) => `| ${v.ok ? "✔" : "✘"} | ${v.descricao} | ${v.detalhe} |`,
    ),
  ].join("\n");
}

async function reconciliar(etapa: Etapa): Promise<boolean> {
  const saida = pastaDaSaida(etapa);
  const rodada = readFileSync(resolve(saida, "run-id"), "utf8").trim();
  if (!/^[0-9a-f]{8}$/.test(rodada))
    throw new Error(`run-id inválido: "${rodada}".`);
  const prefixo = `k6-${rodada}-`;
  const filtroDoK6 = `o.idempotency_key LIKE '${prefixo}%'`;

  const base = lerJson<LinhaDeBase>(resolve(saida, "linha-de-base.json"));
  const resumo = lerJson<ResumoDoK6>(resolve(saida, "resumo.json"));
  const incertas = await extrairChavesIncertas(saida);
  const c = resumo?.contadores ?? {};
  const criadas = c.compras_criadas ?? 0;
  const recuperadas = c.compras_recuperadas ?? 0;
  const incertasDoK6 = c.criacoes_incertas ?? 0;
  const replaysOk = c.replays_ok ?? 0;
  // #142: as compras do setup da carga (contas fixas) também são pedidos novos.
  const doPreparo = c.compras_preparo ?? 0;

  const cliente = await conectarNaBase();
  const v: Verificacao[] = [];
  const classes = {
    duplicidade: [] as string[],
    defeitoConhecidoAc516: [] as string[],
    falhaDeInfraestrutura: [] as string[],
    timeoutsAceitos: [] as string[],
  };
  const total = { novos: 0, pedidosNaBase: 0 };
  try {
    // Os pedidos iniciais continuam exatamente os mesmos, 10 por loja.
    const impressao = await impressaoDosPedidosIniciais(cliente);
    v.push({
      id: "iniciais-intactos",
      descricao: `os ${base?.pedidosIniciais ?? "?"} pedidos iniciais continuam idênticos aos da linha de base`,
      ok: base !== null && impressao === base.impressaoDosPedidosIniciais,
      detalhe:
        base === null
          ? "sem linha-de-base.json"
          : `impressão ${impressao.slice(0, 12)}… ${impressao === base.impressaoDosPedidosIniciais ? "igual" : "DIFERENTE da base"}`,
    });
    const porLoja = await cliente.query(
      `SELECT s.code, count(o.id)::int AS n
         FROM app.stores s LEFT JOIN app.orders o ON o.store_id = s.id AND ${SO_DA_BASE_DO_SEED}
        WHERE s.code LIKE 'SIM-%' GROUP BY s.code`,
    );
    const foraDe10 = porLoja.rows.filter(
      (l: { n: number }) => l.n !== 10,
    ).length;
    v.push({
      id: "dez-por-loja",
      descricao: "as 100 lojas continuam com exatamente 10 pedidos do seed",
      ok: porLoja.rows.length === 100 && foraDe10 === 0,
      detalhe: `${porLoja.rows.length} lojas, ${foraDe10} fora de 10`,
    });

    // As compras novas do k6.
    const doK6 = await cliente.query(
      `SELECT o.idempotency_key AS chave FROM app.orders o WHERE ${filtroDoK6}`,
    );
    total.novos = doK6.rows.length;
    const porChave = new Map<string, number>();
    for (const l of doK6.rows as { chave: string }[]) {
      porChave.set(l.chave, (porChave.get(l.chave) ?? 0) + 1);
    }
    for (const [chave, n] of porChave)
      if (n > 1) classes.duplicidade.push(`${chave} (${n} pedidos)`);
    v.push({
      id: "sem-duplicidade",
      descricao: "nenhuma chave de compra gerou mais de um pedido",
      ok: classes.duplicidade.length === 0,
      detalhe:
        classes.duplicidade.length === 0
          ? `${porChave.size} chaves, todas com 1 pedido`
          : classes.duplicidade.slice(0, 5).join("; "),
    });

    const minimo = criadas + recuperadas + doPreparo;
    const maximo = criadas + recuperadas + doPreparo + incertasDoK6;
    v.push({
      id: "faixa-de-novos",
      descricao:
        "pedidos novos no banco = compras confirmadas pelo k6 (replay soma zero)",
      ok: resumo !== null && total.novos >= minimo && total.novos <= maximo,
      detalhe:
        resumo === null
          ? "sem resumo.json: o k6 não terminou"
          : `banco ${total.novos}; k6 criou ${criadas}, recuperou ${recuperadas}, preparo ${doPreparo}, incertas ${incertasDoK6} (faixa ${minimo}–${maximo}); replays corretos ${replaysOk}, somando zero`,
    });
    if (etapa === "smoke") {
      v.push({
        id: "smoke-uma-compra",
        descricao: "smoke: exatamente uma compra nova no banco",
        ok: total.novos === 1 && criadas === 1 && incertasDoK6 === 0,
        detalhe: `${total.novos} nova(s) no banco, ${criadas} criada(s) pelo k6`,
      });
    }

    const todos = await cliente.query(
      `SELECT count(*)::int AS n FROM app.orders`,
    );
    total.pedidosNaBase = Number(todos.rows[0].n);
    const esperado = (base?.pedidosIniciais ?? 1000) + total.novos;
    v.push({
      id: "soma-final",
      descricao: `${base?.pedidosIniciais ?? 1000} iniciais + ${total.novos} novas = ${esperado} pedidos na base`,
      ok: total.pedidosNaBase === esperado,
      detalhe: `a base tem ${total.pedidosNaBase}`,
    });

    const totais = await cliente.query(sqlDosTotaisErrados(filtroDoK6));
    const linhas = await cliente.query(sqlDasLinhasErradasDaApi(filtroDoK6));
    v.push({
      id: "totais-dos-novos",
      descricao:
        "total, subtotal e linhas de todo pedido novo fecham em centavos",
      ok: totais.rows.length === 0 && linhas.rows.length === 0,
      detalhe:
        `${totais.rows.length} total(is) e ${linhas.rows.length} linha(s) que não fecham, em ${total.novos} pedido(s)` +
        [...totais.rows, ...linhas.rows]
          .slice(0, 3)
          .map((r) => ` · ${JSON.stringify(r)}`)
          .join(""),
    });

    const vinculos = await cliente.query(SQL_DOS_VINCULOS_ENTRE_LOJAS);
    const clientesCruzados = Number(vinculos.rows[0]?.clientes ?? -1);
    const itensCruzados = Number(vinculos.rows[0]?.itens ?? -1);
    v.push({
      id: "sem-vinculo-entre-lojas",
      descricao: "nenhum pedido ligado a cliente de outra loja e nenhum item de outra loja",
      ok: clientesCruzados === 0 && itensCruzados === 0,
      detalhe: `${clientesCruzados} pedido(s), ${itensCruzados} item(ns)`,
    });

    const semPreco = await cliente.query(sqlDasOpcoesSemPreco(filtroDoK6));
    v.push({
      id: "opcoes-sem-preco",
      descricao:
        "observação (não reprova): itens com acréscimo de opção cujas linhas de opção gravaram preço 0",
      ok: true,
      detalhe: `${Number(semPreco.rows[0]?.itens ?? 0)} item(ns): a API guarda o acréscimo só em options_total_cents`,
    });

    // Chaves incertas: quem decide o que foi cada uma é o banco.
    for (const { chave, tipo, fase } of incertas) {
      const n = porChave.get(chave) ?? 0;
      const rotulo = `${chave} (${tipo}, ${fase})`;
      if (tipo === "500" && n === 1) classes.defeitoConhecidoAc516.push(rotulo);
      else if (tipo === "500")
        classes.falhaDeInfraestrutura.push(
          `${rotulo}: ${n} pedido(s) no banco`,
        );
      else if (n <= 1)
        classes.timeoutsAceitos.push(`${rotulo}: ${n} pedido(s) no banco`);
    }
  } finally {
    await cliente.end();
  }

  const { novos, pedidosNaBase } = total;
  const aprovada = v.every((x) => x.ok);
  const resultado = {
    etapa,
    rodada,
    aprovada,
    pedidosIniciais: base?.pedidosIniciais ?? null,
    pedidosNovosNoBanco: novos,
    pedidosNaBase,
    comprasCriadasPeloK6: criadas,
    comprasRecuperadasPeloReplay: recuperadas,
    comprasDoPreparo: doPreparo,
    criacoesIncertas: incertasDoK6,
    replaysCorretos: replaysOk,
    verificacoes: v,
    classes,
  };
  gravarJson(resolve(saida, "reconciliacao.json"), resultado);

  const md = [
    `# Reconciliação — ${etapa} (rodada ${rodada})`,
    "",
    `**Resultado: ${aprovada ? "APROVADA" : "REPROVADA"}** — ${pedidosNaBase} pedidos na base = ${base?.pedidosIniciais ?? "?"} iniciais + ${novos} novos.`,
    "",
    tabela(v),
    "",
    "## Classes encontradas no banco",
    "",
    `- duplicidade (mais de um pedido por chave): **${classes.duplicidade.length}**`,
    `- defeito conhecido AC-516 (500 com o pedido gravado, uma vez): **${classes.defeitoConhecidoAc516.length}**${classes.defeitoConhecidoAc516.length ? ` — ${classes.defeitoConhecidoAc516.slice(0, 5).join("; ")}` : ""}`,
    `- falha de infraestrutura (500 sem pedido gravado): **${classes.falhaDeInfraestrutura.length}**${classes.falhaDeInfraestrutura.length ? ` — ${classes.falhaDeInfraestrutura.slice(0, 5).join("; ")}` : ""}`,
    `- tempo esgotado na criação, aceito dentro da faixa: **${classes.timeoutsAceitos.length}**`,
    "",
  ].join("\n");
  writeFileSync(resolve(saida, "reconciliacao.md"), md);
  process.stdout.write(`${md}\n`);
  return aprovada;
}

try {
  const etapa = etapaDoArgumento(process.argv[2]);
  process.exitCode = (await reconciliar(etapa)) ? 0 : 1;
} catch (erro) {
  process.stderr.write(
    `${erro instanceof Error ? erro.message : String(erro)}\n`,
  );
  process.exitCode = 1;
}
