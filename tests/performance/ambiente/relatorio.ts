/**
 * O relatório consolidado de uma etapa:
 *
 *   node tests/performance/ambiente/relatorio.ts <smoke|carga|estresse>
 *
 * Junta metadados, validação do seed, resumo do k6 e reconciliação do banco, e
 * separa o que deu errado em classes que não se misturam: lentidão, recusa de
 * negócio prevista, falha de infraestrutura, pedido duplicado — mais o defeito
 * conhecido AC-516 e o total incorreto. Funciona com a etapa incompleta (se o
 * preparo ou o k6 falharam, diz qual peça faltou).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  etapaDoArgumento,
  gravarJson,
  lerJson,
  pastaDaSaida,
} from "./apoio.ts";

interface Resumo {
  etapa: string;
  perfil: string;
  duracaoMs: number;
  todosOsThresholdsOk: boolean;
  lentidao: string[];
  contadores: Record<string, number>;
  lojas: { comTrafego: number | null; total: number };
  validade?: { ok: boolean };
  metasDeP95?: { ok: boolean };
  patamares?: {
    primeiroAcimaDaMeta: { patamar: string } | null;
    recuperou: boolean;
  } | null;
}

interface Reconciliacao {
  aprovada: boolean;
  pedidosIniciais: number | null;
  pedidosNovosNoBanco: number;
  verificacoes: { id: string; ok: boolean }[];
  classes: {
    duplicidade: string[];
    defeitoConhecidoAc516: string[];
    falhaDeInfraestrutura: string[];
    timeoutsAceitos: string[];
  };
}

interface Metadados {
  revisao: {
    sha: string;
    ref: string;
    evento: string;
    alteracoesLocaisNaoCommitadas: boolean;
  };
  seed: { semente: string; dataDeReferencia: string };
  runner: Record<string, string | number | null>;
  configuracao: Record<string, string | number>;
}

interface K6 {
  versao: string;
  inicio: string;
  fim: string;
  codigoDeSaida: number;
  perfil: string;
}

function lerTexto(caminho: string): string | null {
  return existsSync(caminho) ? readFileSync(caminho, "utf8") : null;
}

const etapa = etapaDoArgumento(process.argv[2]);
const saida = pastaDaSaida(etapa);
const arquivo = (nome: string): string => resolve(saida, nome);

const metadados = lerJson<Metadados>(arquivo("metadados.json"));
const k6 = lerJson<K6>(arquivo("k6.json"));
const resumo = lerJson<Resumo>(arquivo("resumo.json"));
const reconc = lerJson<Reconciliacao>(arquivo("reconciliacao.json"));
const linhaDoSeed = (lerTexto(arquivo("validacao-do-seed/relatorio.md")) ?? "")
  .split("\n")
  .find((l) => l.startsWith("**Resultado:"));

const faltas: string[] = [];
if (metadados === null) faltas.push("metadados.json (o preparo não terminou)");
if (k6 === null) faltas.push("k6.json (o k6 não rodou)");
if (resumo === null) faltas.push("resumo.json (o k6 não terminou o resumo)");
if (reconc === null)
  faltas.push("reconciliacao.json (a reconciliação não rodou)");

const c = resumo?.contadores ?? {};
const classes = {
  lentidao: resumo?.lentidao.length ?? null,
  recusaDeNegocioPrevista: c.recusas_negocio ?? null,
  falhaDeInfraestrutura:
    resumo === null && reconc === null
      ? null
      : (c.falhas_infra ?? 0) +
        (reconc?.classes.falhaDeInfraestrutura.length ?? 0),
  pedidoDuplicado: reconc?.classes.duplicidade.length ?? null,
  defeitoConhecidoAc516: reconc?.classes.defeitoConhecidoAc516.length ?? null,
  totalIncorreto: c.totais_errados ?? null,
  rejeicaoInesperada: c.rejeicoes_inesperadas ?? null,
};

const k6Aprovado = k6 !== null && k6.codigoDeSaida === 0;
const geral =
  faltas.length === 0 && k6Aprovado && reconc?.aprovada === true
    ? "APROVADA"
    : "REPROVADA";
// #142: a execução VALE como medida (preparo, integridade, isolamento e
// trabalho fixo) mesmo quando reprova as metas de p95 — é o "antes" esperado.
const validaComoMedida =
  faltas.length === 0 &&
  reconc?.aprovada === true &&
  (resumo?.validade === undefined ? k6Aprovado : resumo.validade.ok);

const n = (x: number | null): string => (x === null ? "sem dado" : String(x));
const linhas: string[] = [];
linhas.push(`# Desempenho — ${etapa}: ${geral}`);
linhas.push("");
if (faltas.length > 0) {
  linhas.push(`> Faltou: ${faltas.join("; ")}.`);
  linhas.push("");
}
linhas.push("## Identificação");
linhas.push("");
linhas.push("| | |");
linhas.push("|---|---|");
linhas.push(
  `| SHA | \`${metadados?.revisao.sha ?? "?"}\`${metadados?.revisao.alteracoesLocaisNaoCommitadas ? " (+ alterações locais não commitadas)" : ""} |`,
);
linhas.push(
  `| ref / evento | ${metadados?.revisao.ref ?? "?"} / ${metadados?.revisao.evento ?? "?"} |`,
);
linhas.push(`| versão do k6 | ${k6?.versao ?? "?"} |`);
linhas.push(`| semente do seed | \`${metadados?.seed.semente ?? "?"}\` |`);
linhas.push(
  `| data de referência | \`${metadados?.seed.dataDeReferencia ?? "?"}\` |`,
);
linhas.push(
  `| intervalo medido | ${k6?.inicio ?? "?"} → ${k6?.fim ?? "?"} (perfil ${k6?.perfil ?? "?"}) |`,
);
if (metadados) {
  const r = metadados.runner;
  linhas.push(
    `| runner | ${r.nome} · ${r.sistema}/${r.arquitetura} · ${r.cpus} CPUs (${r.modeloDaCpu}) · ${r.memoriaGb} GB · Node ${r.node} |`,
  );
  linhas.push(
    `| configuração do ensaio | ${Object.entries(metadados.configuracao)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ")} |`,
  );
}
linhas.push(`| validação do seed | ${linhaDoSeed ?? "sem relatório"} |`);
linhas.push("");
linhas.push("## Resultado por camada");
linhas.push("");
linhas.push(
  `- execução válida como medida (preparo, reconciliação, integridade, isolamento e trabalho fixo): **${validaComoMedida ? "sim" : "NÃO"}**`,
);
if (resumo?.metasDeP95)
  linhas.push(`- metas de p95/p99: **${resumo.metasDeP95.ok ? "atingidas" : "NÃO atingidas"}**`);
linhas.push(
  `- k6 (thresholds): **${k6 === null ? "não rodou" : k6Aprovado ? "aprovado" : `reprovado (código ${k6.codigoDeSaida})`}**`,
);
linhas.push(
  `- reconciliação com o banco: **${reconc === null ? "não rodou" : reconc.aprovada ? "aprovada" : "reprovada"}**`,
);
if (reconc)
  linhas.push(
    `- pedidos iniciais + novas compras confirmadas: ${reconc.pedidosIniciais ?? "?"} + ${reconc.pedidosNovosNoBanco}; o replay soma zero`,
  );
if (resumo && etapa === "carga")
  linhas.push(
    resumo.lojas.comTrafego === null
      ? "- lojas com tráfego: não medido neste perfil (só o perfil completo exige as 100 lojas)"
      : `- lojas com tráfego: ${resumo.lojas.comTrafego} de ${resumo.lojas.total}`,
  );
if (resumo?.patamares) {
  linhas.push(
    `- estresse — primeiro patamar acima da meta: ${resumo.patamares.primeiroAcimaDaMeta ? resumo.patamares.primeiroAcimaDaMeta.patamar : "nenhum (60 VUs sustentados)"}; recuperação: ${resumo.patamares.recuperou ? "ok" : "NÃO recuperou"}`,
  );
}
linhas.push("");
linhas.push("## Classificação das ocorrências");
linhas.push("");
linhas.push(
  "Cada ocorrência cai em uma classe só. Lentidão não é falha; recusa prevista não é erro; o defeito conhecido não é infraestrutura.",
);
linhas.push("");
linhas.push("| classe | quantidade | o que é |");
linhas.push("|---|---:|---|");
linhas.push(
  `| Lentidão | ${n(classes.lentidao)} | meta de p95 ultrapassada (catálogo < 500 ms, criação < 1.000 ms) |`,
);
linhas.push(
  `| Recusa de negócio prevista | ${n(classes.recusaDeNegocioPrevista)} | loja fechada ou subtotal abaixo do mínimo, observados na própria iteração |`,
);
linhas.push(
  `| Falha de infraestrutura | ${n(classes.falhaDeInfraestrutura)} | tempo esgotado, 429, 5xx, ou 500 sem pedido gravado |`,
);
linhas.push(
  `| Pedido duplicado | ${n(classes.pedidoDuplicado)} | mais de um pedido para a mesma chave de compra, no banco |`,
);
linhas.push(
  `| Defeito conhecido AC-516 | ${n(classes.defeitoConhecidoAc516)} | 500 na confirmação com o pedido gravado (duas confirmações simultâneas com a mesma chave). Corrigido no #134 (savepoint); a classe fica para pegar regressão. NÃO é infraestrutura |`,
);
linhas.push(
  `| Total incorreto | ${n(classes.totalIncorreto)} | total ≠ subtotal + taxa, ou consulta ≠ criação |`,
);
linhas.push(
  `| Rejeição inesperada | ${n(classes.rejeicaoInesperada)} | 4xx fora do previsto (403, 401, 404, 400, 409/422 sem explicação) |`,
);
linhas.push("");
linhas.push("## Arquivos desta etapa");
linhas.push("");
linhas.push(
  "`resumo.json` · `resumo.md` · `reconciliacao.json` · `reconciliacao.md` · `linha-de-base.json` · `metadados.json` · `k6.json` · `k6.log` · `chaves-incertas.json` · `validacao-do-seed/` · `api.log` · `site.log` · `build-site.log`",
);
linhas.push("");

const texto = `${linhas.join("\n")}\n`;
writeFileSync(arquivo("relatorio.md"), texto);
gravarJson(arquivo("relatorio.json"), {
  etapa,
  resultado: geral,
  validaComoMedida,
  metasAtingidas: resumo?.metasDeP95?.ok ?? null,
  faltas,
  classes,
});
process.stdout.write(texto);
