#!/usr/bin/env node
/**
 * Migração compatível com a versão anterior (AC-030).
 *
 * Voltar à versão anterior sem perder dado não é consequência de coragem: é
 * consequência de uma regra sobre o formato das migrações. Enquanto a versão
 * nova está no ar, a anterior ainda pode voltar a receber tráfego — e ela
 * encontra o banco que a migração nova já mudou. Se a migração apagou uma
 * coluna que a versão anterior escreve, voltar atrás quebra; se apagou dado,
 * voltar atrás não recupera.
 *
 * A regra, portanto, é esta — e este arquivo é o que a torna mecânica:
 *
 *   1. Coluna nova entra ACEITANDO NULO (ou com valor padrão). A versão
 *      anterior não conhece a coluna e nunca a preenche.
 *   2. Remoção acontece em DUAS ETAPAS, em publicações diferentes: primeiro
 *      uma versão que para de usar a coluna, depois — passada a janela — a
 *      migração que a remove.
 *   3. Renomear é PROIBIDO. Renomear é remover e criar no mesmo instante, e
 *      não existe momento em que as duas versões concordem sobre o nome. O
 *      caminho é adicionar, copiar, parar de usar e só então remover.
 *
 * A segunda etapa da remoção precisa de prova de que a primeira aconteceu.
 * Essa prova é uma declaração no cabeçalho da migração:
 *
 *   -- @janela-cumprida: 0007_parar_de_usar_apelido.sql
 *
 * O verificador exige que o arquivo citado exista e seja ANTERIOR — sem isso a
 * declaração seria só uma frase, e frase não impede acidente.
 *
 * Uso:
 *   node infra/scripts/check-migracao-compativel.mjs [diretorio]
 *
 * Saída: 0 compatíveis · 1 alguma migração quebra a versão anterior ·
 * 2 diretório ausente ou sem migração (que também reprova: sem migração lida,
 * nada foi verificado, e isso não é aprovação).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Diretório das migrações do repositório, resolvido a partir deste arquivo. */
const DIRETORIO_PADRAO = fileURLToPath(
  new URL("../../packages/database/migrations/", import.meta.url),
);

const CODIGO = { compativel: 0, incompativel: 1, semMigracoes: 2 };

/** Declaração de que a primeira etapa da remoção já foi publicada. */
const JANELA_CUMPRIDA = /@janela-cumprida:\s*([\w.-]+\.sql)/gi;

// ---------------------------------------------------------------------------
// Leitura do SQL sem os pedaços que confundem a análise
// ---------------------------------------------------------------------------

/**
 * Separa o SQL em três coisas: comandos, comentários e corpos de bloco
 * (`$$ ... $$`).
 *
 * A varredura é caractere a caractere porque expressão regular sobre o texto
 * cru erra justamente onde importa: `--` dentro de literal não é comentário e
 * `;` dentro de corpo de função não termina comando. Literal de texto vira
 * `''`: o conteúdo dele nunca é estrutura, e mantê-lo só criaria falso alarme.
 */
export function separarSql(sql) {
  const comandos = [];
  const comentarios = [];
  const blocos = [];
  let atual = "";
  let i = 0;

  while (i < sql.length) {
    const dois = sql.slice(i, i + 2);

    if (dois === "--") {
      const fim = sql.indexOf("\n", i);
      const corte = fim === -1 ? sql.length : fim;
      comentarios.push(sql.slice(i, corte));
      i = corte;
      continue;
    }

    if (dois === "/*") {
      const fim = sql.indexOf("*/", i + 2);
      const corte = fim === -1 ? sql.length : fim + 2;
      comentarios.push(sql.slice(i, corte));
      i = corte;
      continue;
    }

    if (sql[i] === "'") {
      const fim = sql.indexOf("'", i + 1);
      i = fim === -1 ? sql.length : fim + 1;
      atual += "''";
      continue;
    }

    const abertura = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (abertura !== null) {
      const marca = abertura[0];
      const inicioDoCorpo = i + marca.length;
      const fim = sql.indexOf(marca, inicioDoCorpo);
      const fimDoCorpo = fim === -1 ? sql.length : fim;
      blocos.push(sql.slice(inicioDoCorpo, fimDoCorpo));
      i = fim === -1 ? sql.length : fim + marca.length;
      atual += " @@bloco@@ ";
      continue;
    }

    if (sql[i] === ";") {
      comandos.push(atual);
      atual = "";
      i += 1;
      continue;
    }

    atual += sql[i];
    i += 1;
  }

  comandos.push(atual);

  return {
    comandos: comandos.map(normalizar).filter((texto) => texto !== ""),
    comentarios,
    blocos,
  };
}

/** Espaço em branco vira um espaço só: a análise olha forma, não formatação. */
function normalizar(texto) {
  return texto.replace(/\s+/g, " ").trim();
}

/** Nome de tabela sem aspas e em minúsculas — `"App"."X"` e `app.x` são a mesma. */
function nomeDeTabela(bruto) {
  return bruto.replace(/"/g, "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

/**
 * Tipos de incompatibilidade. `remedio` é o que a pessoa faz em seguida — uma
 * recusa que não diz o caminho vira pressão para desligar a verificação.
 */
const REGRAS = {
  REMOCAO_DIRETA: {
    motivo: "remove estrutura que a versão anterior ainda usa",
    remedio:
      "remova em duas etapas: publique antes uma versão que pare de usar, e cite o arquivo dela em `-- @janela-cumprida:`",
  },
  RENOMEACAO: {
    motivo:
      "renomeia estrutura, e não existe instante em que as duas versões concordem sobre o nome",
    remedio:
      "adicione a estrutura nova, copie o conteúdo, pare de usar a antiga e remova depois, em outra publicação",
  },
  OBRIGATORIEDADE_RETROATIVA: {
    motivo:
      "torna obrigatória uma coluna que já existe, e a versão anterior grava linha sem ela",
    remedio:
      "deixe a coluna aceitando nulo até a versão anterior sair de circulação, e cite a migração da primeira etapa em `-- @janela-cumprida:`",
  },
  COLUNA_OBRIGATORIA_SEM_PADRAO: {
    motivo:
      "acrescenta coluna obrigatória sem valor padrão numa tabela que já existe",
    remedio:
      "declare a coluna aceitando nulo, ou dê a ela um DEFAULT — a versão anterior não sabe preenchê-la",
  },
  TROCA_DE_TIPO: {
    motivo: "troca o tipo de uma coluna que já existe",
    remedio:
      "crie a coluna nova com o tipo novo, copie o conteúdo e remova a antiga depois, em outra publicação",
  },
  BLOCO_DINAMICO: {
    motivo:
      "executa remoção ou renomeação dentro de bloco dinâmico, onde o alvo não é conferível",
    remedio:
      "escreva o comando fora do bloco, para que a compatibilidade possa ser verificada",
  },
  JANELA_INVALIDA: {
    motivo:
      "declara janela cumprida citando migração que não existe antes dela",
    remedio:
      "cite o arquivo real da publicação que parou de usar a estrutura — a declaração precisa apontar para algo verificável",
  },
};

/** Verbos que nem dentro de bloco dinâmico passam sem exame. */
const VERBOS_PERIGOSOS =
  /\bDROP\s+(COLUMN|TABLE)\b|\bRENAME\s+(COLUMN|TO)\b|\bSET\s+NOT\s+NULL\b/i;

/** Achado de uma migração: o que ela faz, e por que isso impede voltar atrás. */
function achado(arquivo, tipo, alvo, comando) {
  const regra = REGRAS[tipo];
  return {
    arquivo,
    tipo,
    alvo,
    comando: comando.length > 120 ? `${comando.slice(0, 117)}...` : comando,
    motivo: regra.motivo,
    remedio: regra.remedio,
  };
}

/** Parte as ações de um `ALTER TABLE` em itens, respeitando parênteses. */
function acoesDoAlter(acao) {
  const itens = [];
  let atual = "";
  let profundidade = 0;

  for (const caractere of acao) {
    if (caractere === "(") profundidade += 1;
    if (caractere === ")") profundidade -= 1;
    if (caractere === "," && profundidade === 0) {
      itens.push(atual.trim());
      atual = "";
      continue;
    }
    atual += caractere;
  }
  itens.push(atual.trim());
  return itens.filter((item) => item !== "");
}

/**
 * Examina um `ALTER TABLE` numa tabela que JÁ EXISTIA antes desta migração.
 *
 * Tabela criada pela própria migração não chega aqui: a versão anterior não
 * conhece tabela que não existia quando ela estava no ar, então nada que se
 * faça com ela pode quebrá-la.
 */
function examinarAlterTable(arquivo, tabela, acao, comando) {
  const achados = [];

  for (const item of acoesDoAlter(acao)) {
    if (
      /^DROP\s+COLUMN\b/i.test(item) ||
      /^DROP\s+"?[a-z_]\w*"?$/i.test(item)
    ) {
      achados.push(
        achado(arquivo, "REMOCAO_DIRETA", `${tabela} → ${item}`, comando),
      );
      continue;
    }
    if (/^RENAME\b/i.test(item)) {
      achados.push(
        achado(arquivo, "RENOMEACAO", `${tabela} → ${item}`, comando),
      );
      continue;
    }
    if (/^ALTER\s+(COLUMN\s+)?"?\w+"?\s+SET\s+NOT\s+NULL$/i.test(item)) {
      achados.push(
        achado(
          arquivo,
          "OBRIGATORIEDADE_RETROATIVA",
          `${tabela} → ${item}`,
          comando,
        ),
      );
      continue;
    }
    if (/^ALTER\s+(COLUMN\s+)?"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i.test(item)) {
      achados.push(
        achado(arquivo, "TROCA_DE_TIPO", `${tabela} → ${item}`, comando),
      );
      continue;
    }
    if (
      /^ADD\s+(COLUMN\s+)?/i.test(item) &&
      /\bNOT\s+NULL\b/i.test(item) &&
      !/\bDEFAULT\b/i.test(item) &&
      !/\bGENERATED\b/i.test(item)
    ) {
      achados.push(
        achado(
          arquivo,
          "COLUNA_OBRIGATORIA_SEM_PADRAO",
          `${tabela} → ${item}`,
          comando,
        ),
      );
    }
  }

  return achados;
}

/** Expressões que reconhecem a forma de cada comando examinado. */
const CRIACAO_DE_TABELA =
  /^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/i;
const ALTERACAO_DE_TABELA =
  /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w."]+)\s+(.+)$/i;
const REMOCAO_DE_TABELA = /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w."]+)/i;

/**
 * Examina os comandos de UMA migração e devolve o que ela quebra, mais as
 * tabelas que ela cria.
 *
 * As tabelas criadas saem junto porque são a memória da varredura: o que a
 * migração cria não tem versão anterior para quebrar, e o que ela cria hoje
 * passa a ser passado para a migração de amanhã.
 */
function examinarComandos(nome, comandos, tabelasAnteriores) {
  const tabelasCriadas = new Set();
  const achados = [];

  /** A tabela já existia antes desta migração — e a anterior a conhece. */
  const conhecidaPelaVersaoAnterior = (tabela) =>
    tabelasAnteriores.has(tabela) && !tabelasCriadas.has(tabela);

  for (const comando of comandos) {
    const criada = CRIACAO_DE_TABELA.exec(comando);
    if (criada !== null) {
      tabelasCriadas.add(nomeDeTabela(criada[1]));
      continue;
    }

    const alterada = ALTERACAO_DE_TABELA.exec(comando);
    if (alterada !== null) {
      const tabela = nomeDeTabela(alterada[1]);
      if (conhecidaPelaVersaoAnterior(tabela)) {
        achados.push(...examinarAlterTable(nome, tabela, alterada[2], comando));
      }
      continue;
    }

    const removida = REMOCAO_DE_TABELA.exec(comando);
    if (
      removida !== null &&
      conhecidaPelaVersaoAnterior(nomeDeTabela(removida[1]))
    ) {
      achados.push(
        achado(nome, "REMOCAO_DIRETA", nomeDeTabela(removida[1]), comando),
      );
    }
  }

  return { achados, tabelasCriadas };
}

/** Declarações de janela que não apontam para uma publicação anterior real. */
function examinarJanelas(nome, janelas, nomesConhecidos) {
  return janelas
    .filter((janela) => !nomesConhecidos.has(janela) || janela >= nome)
    .map((janela) =>
      achado(nome, "JANELA_INVALIDA", janela, `-- @janela-cumprida: ${janela}`),
    );
}

/** Remoção ou renomeação escondida em bloco dinâmico, onde o alvo não é conferível. */
function examinarBlocos(nome, blocos) {
  return blocos
    .filter((bloco) => VERBOS_PERIGOSOS.test(bloco))
    .map((bloco) =>
      achado(nome, "BLOCO_DINAMICO", "bloco $$...$$", normalizar(bloco)),
    );
}

/**
 * Analisa as migrações do diretório, na ordem em que serão aplicadas.
 *
 * A ordem é o que define "já existia": uma tabela criada em 0003 é passado para
 * a 0007, e o que a 0007 fizer com ela precisa caber na janela. O que a 0007
 * fizer com a tabela que ela mesma cria não tem versão anterior para quebrar.
 */
export function analisar(migracoes) {
  const nomes = new Set(migracoes.map((migracao) => migracao.nome));
  const tabelasAnteriores = new Set();
  const achados = [];

  for (const migracao of migracoes) {
    const { comandos, comentarios, blocos } = separarSql(migracao.sql);
    const janelas = declaracoesDeJanela(comentarios);
    const comandosExaminados = examinarComandos(
      migracao.nome,
      comandos,
      tabelasAnteriores,
    );

    const desteArquivo = [
      ...examinarJanelas(migracao.nome, janelas, nomes),
      ...comandosExaminados.achados,
      ...examinarBlocos(migracao.nome, blocos),
    ];

    achados.push(...aplicarJanela(desteArquivo, janelas.length > 0));
    for (const tabela of comandosExaminados.tabelasCriadas) {
      tabelasAnteriores.add(tabela);
    }
  }

  return achados;
}

/** Arquivos citados como primeira etapa já publicada, sem repetição. */
function declaracoesDeJanela(comentarios) {
  const citados = new Set();
  for (const comentario of comentarios) {
    for (const casou of comentario.matchAll(JANELA_CUMPRIDA)) {
      citados.add(casou[1]);
    }
  }
  return [...citados];
}

/**
 * O que a janela cumprida perdoa, por nome. É lista fechada de propósito: só
 * remoção e obrigatoriedade são a SEGUNDA etapa de um caminho de duas, e é
 * disso que a declaração dá notícia.
 *
 * Renomeação não tem segunda etapa nenhuma, troca de tipo tampouco, e bloco
 * dinâmico não é perdoável porque ninguém — nem a declaração — consegue dizer
 * o que ele vai fazer. Perdoar por exclusão ("tudo menos renomear") faria a
 * declaração virar chave-mestra: uma linha de comentário desligaria as outras
 * regras junto.
 */
const PERDOAVEIS_PELA_JANELA = new Set([
  "REMOCAO_DIRETA",
  "OBRIGATORIEDADE_RETROATIVA",
]);

/**
 * Aplica o perdão da janela cumprida aos achados de UMA migração.
 *
 * Janela inválida não se perdoa nem a si mesma: se a declaração aponta para um
 * arquivo que não existe, ela não é prova de nada, e nada do que ela cobriria
 * pode passar.
 */
function aplicarJanela(achados, temJanela) {
  if (!temJanela) return achados;
  if (achados.some((item) => item.tipo === "JANELA_INVALIDA")) return achados;
  return achados.filter((item) => !PERDOAVEIS_PELA_JANELA.has(item.tipo));
}

// ---------------------------------------------------------------------------
// Leitura do disco e relato
// ---------------------------------------------------------------------------

/** Lê as migrações do diretório, na ordem do número. */
export function lerMigracoesDoDisco(diretorio) {
  const arquivos = readdirSync(diretorio)
    .filter((nome) => nome.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  return arquivos.map((nome) => ({
    nome,
    sql: readFileSync(join(diretorio, nome), "utf8"),
  }));
}

const ESC = "";
const vermelho = (texto) => `${ESC}[31m${texto}${ESC}[0m`;
const verde = (texto) => `${ESC}[32m${texto}${ESC}[0m`;

function principal(argumentos) {
  const diretorio = argumentos[0] ?? DIRETORIO_PADRAO;

  let migracoes;
  try {
    if (!statSync(diretorio).isDirectory()) throw new Error("não é diretório");
    migracoes = lerMigracoesDoDisco(diretorio);
  } catch {
    console.error(
      vermelho(`✘ não há migrações para verificar em ${diretorio}`),
    );
    console.error(
      "    sem migração lida, nada foi verificado — e isso não é aprovação",
    );
    return CODIGO.semMigracoes;
  }

  if (migracoes.length === 0) {
    console.error(vermelho(`✘ nenhuma migração encontrada em ${diretorio}`));
    console.error(
      "    sem migração lida, nada foi verificado — e isso não é aprovação",
    );
    return CODIGO.semMigracoes;
  }

  console.log(
    "Verificando compatibilidade das migrações com a versão anterior (AC-030)",
  );

  const achados = analisar(migracoes);

  if (achados.length === 0) {
    console.log(
      verde(
        `✔ ${migracoes.length} migração(ões) deixam a versão anterior funcionar`,
      ),
    );
    return CODIGO.compativel;
  }

  for (const item of achados) {
    console.error(vermelho(`  ✘ ${item.arquivo} — ${item.motivo}`));
    console.error(`      alvo: ${item.alvo}`);
    console.error(`      comando: ${item.comando}`);
    console.error(`      saída: ${item.remedio}`);
  }
  console.error("");
  console.error(
    vermelho(
      `✘ ${achados.length} operação(ões) impedem voltar à versão anterior`,
    ),
  );
  console.error(
    "    voltar atrás com o banco já mudado quebraria a versão antiga",
  );
  return CODIGO.incompativel;
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (chamadoDiretamente) {
  process.exitCode = principal(process.argv.slice(2));
}
