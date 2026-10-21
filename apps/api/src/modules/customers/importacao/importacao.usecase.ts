/**
 * A prévia e a confirmação da importação de clientes (card #60).
 *
 * PRÉVIA não grava nada: lê o arquivo, sugere o mapeamento (com o manual por
 * cima), confere cada linha como o cadastro manual conferiria e conta quantos
 * seriam novos, repetidos e inválidos — e quantos ficariam de fora pelo
 * limite de clientes da loja.
 *
 * CONFIRMAR grava com as regras do cadastro que já existe (`cadastrarCliente`:
 * mesma conferência, mesma chave de repetido, mesmo limite), em LOTES:
 * cada lote é uma transação. Um arquivo de 5 mil linhas numa transação só
 * seguraria a trava do limite da loja (e o pool) por todo o tempo; lote a
 * lote, o que já entrou fica, e uma queda no meio não desfaz tudo. Antes de
 * cada lote mede-se o limite (`exigirLimiteDaLoja`, que trava o recurso até o
 * fim da transação): quem não cabe sai como "fora do limite", sem estourar a
 * importação inteira.
 *
 * Repetido NUNCA vira duplicata. Com `ignorar`, a ficha existente fica como
 * está; com `completar`, só os campos VAZIOS dela são preenchidos, pela
 * correção da ficha que já existe (`editarCliente`).
 *
 * No fim, uma linha na trilha de auditoria da loja com as contagens — sem
 * nome, telefone ou e-mail de ninguém.
 */
import {
  CAMPOS_DA_IMPORTACAO,
  CAMPOS_OBRIGATORIOS_DA_IMPORTACAO,
  LINHAS_DA_PREVIA_DA_IMPORTACAO,
  PROBLEMAS_NA_PREVIA_DA_IMPORTACAO,
  ROTULOS_DOS_CAMPOS_DA_IMPORTACAO,
  type LinhaDoRelatorioDaImportacao,
  type MapeamentoDaImportacao,
  type PreviaDaImportacaoNoContrato,
  type ProblemaDaImportacao,
  type RegraDeRepetidosDaImportacao,
  type RepetidoDaImportacao,
  type ResultadoDaImportacaoNoContrato,
} from "@simpleclick/contracts";

import {
  exigirContexto,
  exigirLojaDoContexto,
} from "../../../core/contexto.ts";
import { transacaoAtual } from "../../../core/db.ts";
import {
  ErroDeLimiteAtingido,
  exigirLimiteDaLoja,
} from "../../../core/limites-da-loja.ts";
import { editarCliente, type ClienteParaEditar } from "../editar.usecase.ts";
import {
  enderecoParaGravar,
  lerEnderecoDaFicha,
  lerFichaAtiva,
} from "../ficha.ts";
import {
  analisarLinhas,
  classificar,
  repetidoDaLojaNoContrato,
  repetidoDoArquivoNoContrato,
  type Classificacao,
  type LeadDaLinha,
  type LinhaAnalisada,
  type RepetidoNaLoja,
} from "./analisar.ts";
import { buscarExistentesNaLoja } from "./existentes.ts";
import {
  aplicarMapeamento,
  exemplosDaColuna,
  sugerirMapeamento,
  type MapeamentoAplicado,
} from "./mapeamento.ts";
import { nomeDoRelatorio, relatorioEmCsv } from "./relatorio.ts";
import type { TabelaLida } from "./tabela.ts";

/** Quantas linhas cada transação grava. */
export const TAMANHO_DO_LOTE_DA_IMPORTACAO = 500;

/** Completar é ficha a ficha (leitura, conferência e correção): lote menor. */
export const TAMANHO_DO_LOTE_DE_COMPLETAR = 100;

/** Roda `acao` numa transação da loja, como quem pediu. */
export type RodarNaLoja = <T>(acao: () => Promise<T>) => Promise<T>;

interface Capacidade {
  readonly limite: number;
  readonly uso: number;
}

/** O limite de clientes da loja, sem estourar quando já passou dele. */
async function medirCapacidade(): Promise<Capacidade> {
  try {
    return await exigirLimiteDaLoja("clientes", 0);
  } catch (causa) {
    if (causa instanceof ErroDeLimiteAtingido) {
      return { limite: causa.limite, uso: causa.uso };
    }
    throw causa;
  }
}

function restanteDe(capacidade: Capacidade): number {
  return Math.max(0, capacidade.limite - capacidade.uso);
}

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

/** Lê, mapeia e confere; a parte que não depende do banco. */
function prepararLinhas(
  tabela: TabelaLida,
  manual: MapeamentoDaImportacao,
): {
  readonly aplicado: MapeamentoAplicado;
  readonly linhas: readonly LinhaAnalisada[];
} {
  const aplicado = aplicarMapeamento(tabela, manual);
  return { aplicado, linhas: analisarLinhas(tabela, aplicado.indices) };
}

/** As chaves que a busca de repetidos na loja precisa. */
function chavesDasLinhas(linhas: readonly LinhaAnalisada[]): {
  telefones: string[];
  emails: string[];
} {
  const telefones: string[] = [];
  const emails: string[] = [];
  for (const linha of linhas) {
    if (linha.tipo !== "valida") continue;
    telefones.push(linha.chave);
    if (linha.email !== null) emails.push(linha.email);
  }
  return { telefones, emails };
}

async function classificarNaLoja(
  linhas: readonly LinhaAnalisada[],
): Promise<Classificacao> {
  const { telefones, emails } = chavesDasLinhas(linhas);
  return classificar(linhas, await buscarExistentesNaLoja(telefones, emails));
}

function avisosDoMapeamento(aplicado: MapeamentoAplicado): string[] {
  const avisos: string[] = [];
  for (const campo of CAMPOS_OBRIGATORIOS_DA_IMPORTACAO) {
    if (aplicado.porNome[campo] === null) {
      avisos.push(
        `Nenhuma coluna foi ligada a "${ROTULOS_DOS_CAMPOS_DA_IMPORTACAO[campo]}", que é obrigatório: escolha a coluna antes de importar.`,
      );
    }
  }
  for (const coluna of aplicado.desconhecidas) {
    avisos.push(
      `A coluna "${coluna}" não existe no arquivo e foi deixada de fora.`,
    );
  }
  return avisos;
}

function arquivoLido(tabela: TabelaLida, nome: string | null) {
  return {
    nome,
    formato: tabela.formato,
    codificacao: tabela.codificacao,
    separador: tabela.separador,
    linhas: tabela.linhas.length,
  };
}

/** A prévia: nada é gravado. Roda numa transação da loja. */
export async function previaDaImportacao(
  tabela: TabelaLida,
  manual: MapeamentoDaImportacao,
  nomeDoArquivo: string | null,
): Promise<PreviaDaImportacaoNoContrato> {
  const { aplicado, linhas } = prepararLinhas(tabela, manual);
  const classificacao = await classificarNaLoja(linhas);
  const capacidade = await medirCapacidade();
  const restante = restanteDe(capacidade);
  const novos = classificacao.novos.length;
  const excedentes = Math.max(0, novos - restante);

  const situacao = new Map<
    number,
    { situacao: "novo" | "repetido" | "invalido"; motivo: string | null }
  >();
  for (const lead of classificacao.novos)
    situacao.set(lead.linha, { situacao: "novo", motivo: null });
  for (const repetido of classificacao.repetidosNaLoja) {
    situacao.set(repetido.lead.linha, {
      situacao: "repetido",
      motivo: `Já é cliente da loja (${repetido.existente.nome}), pelo ${repetido.motivo === "TELEFONE" ? "telefone" : "e-mail"}.`,
    });
  }
  for (const repetido of classificacao.repetidosNoArquivo) {
    situacao.set(repetido.linha, {
      situacao: "repetido",
      motivo: `Mesmo ${repetido.motivo === "TELEFONE" ? "telefone" : "e-mail"} da linha ${repetido.linhaOriginal}.`,
    });
  }
  for (const invalida of classificacao.invalidos) {
    situacao.set(invalida.linha, {
      situacao: "invalido",
      motivo: invalida.problema.motivo,
    });
  }

  const sugestao = sugerirMapeamento(tabela);
  const campoSugeridoDaColuna = new Map<
    number,
    (typeof CAMPOS_DA_IMPORTACAO)[number]
  >();
  for (const [campo, indice] of sugestao)
    campoSugeridoDaColuna.set(indice, campo);

  const avisos = avisosDoMapeamento(aplicado);
  if (excedentes > 0) {
    avisos.push(
      `A loja ainda comporta ${restante} cliente(s) (limite de ${capacidade.limite}): ${excedentes} novo(s) ficariam de fora.`,
    );
  }

  return {
    arquivo: arquivoLido(tabela, nomeDoArquivo),
    colunas: tabela.colunas.map((nome, indice) => ({
      nome,
      indice,
      exemplos: [...exemplosDaColuna(tabela, indice)],
      campoSugerido: campoSugeridoDaColuna.get(indice) ?? null,
    })),
    mapeamento: { ...aplicado.porNome },
    campos: CAMPOS_DA_IMPORTACAO.map((campo) => ({
      campo,
      rotulo: ROTULOS_DOS_CAMPOS_DA_IMPORTACAO[campo],
      obrigatorio: CAMPOS_OBRIGATORIOS_DA_IMPORTACAO.includes(campo),
    })),
    primeirasLinhas: tabela.linhas
      .slice(0, LINHAS_DA_PREVIA_DA_IMPORTACAO)
      .map((linha) => ({
        linha: linha.numero,
        valores: Object.fromEntries(
          tabela.colunas.map((nome, c) => [nome, linha.valores[c] ?? ""]),
        ),
        situacao: situacao.get(linha.numero)?.situacao ?? "invalido",
        motivo: situacao.get(linha.numero)?.motivo ?? null,
      })),
    previsao: {
      total: tabela.linhas.length,
      novos,
      repetidos:
        classificacao.repetidosNaLoja.length +
        classificacao.repetidosNoArquivo.length,
      repetidosNaLoja: classificacao.repetidosNaLoja.length,
      repetidosNoArquivo: classificacao.repetidosNoArquivo.length,
      invalidos: classificacao.invalidos.length,
    },
    limite: { ...capacidade, restante, excedentes },
    problemas: classificacao.invalidos
      .slice(0, PROBLEMAS_NA_PREVIA_DA_IMPORTACAO)
      .map((invalida) => invalida.problema),
    avisos,
  };
}

/** Os campos vazios da ficha que a linha do arquivo tem como preencher. */
async function completarFicha(repetido: RepetidoNaLoja): Promise<boolean> {
  const atual = await lerFichaAtiva(repetido.existente.clienteId);
  if (atual === null) return false;
  const dados = repetido.lead.dados;
  const identificadores: Record<string, unknown> = {};
  const demais: Record<string, unknown> = {};
  if (!atual.displayName?.trim()) demais.nome = dados.nome;
  if (!atual.phoneE164) identificadores.telefone = dados.telefone;
  // O e-mail de quem tem conta mora na conta, não na ficha.
  if (!atual.email && atual.identityId === null && dados.email) {
    identificadores.email = dados.email;
  }
  if (!atual.notes?.trim() && dados.observacao)
    demais.observacao = dados.observacao;
  if (lerEnderecoDaFicha(atual.address) === null && dados.endereco) {
    demais.endereco = dados.endereco;
  }

  const tudo = { ...demais, ...identificadores };
  if (Object.keys(tudo).length === 0) return false;
  let resultado = await editarCliente(atual.id, tudo as ClienteParaEditar);
  // Telefone ou e-mail que já é de OUTRO cliente: completa o resto sem eles.
  if (resultado.tipo !== "editado" && Object.keys(demais).length > 0) {
    resultado = await editarCliente(atual.id, demais as ClienteParaEditar);
  }
  return resultado.tipo === "editado";
}

/** O que um lote produziu, juntado só depois que a transação dele fechou. */
interface ResultadoDoLote {
  criados: number;
  atualizados: number;
  repetidos: RepetidoDaImportacao[];
  invalidos: { problema: ProblemaDaImportacao; lead: LeadDaLinha }[];
  foraDoLimite: LeadDaLinha[];
  capacidade: Capacidade | null;
}

function loteVazio(): ResultadoDoLote {
  return {
    criados: 0,
    atualizados: 0,
    repetidos: [],
    invalidos: [],
    foraDoLimite: [],
    capacidade: null,
  };
}

/**
 * Grava um lote de novos numa transação.
 *
 * AS REGRAS SÃO AS DE `cadastrarCliente`, aplicadas ao lote de uma vez: o
 * limite medido UMA vez (com a trava do recurso até o fim da transação), os
 * repetidos conferidos de novo pela mesma busca da prévia (alguém pode ter
 * cadastrado entre a prévia e agora) e a mesma linha gravada — nome, telefone
 * em E.164, e-mail sem caixa, observação e endereço normalizado. Linha a
 * linha pelo cadastro, cada cliente recontaria todos os clientes da loja para
 * o limite: com 5 mil linhas, a transação do lote estoura o tempo.
 */
async function gravarNovos(
  lote: readonly LeadDaLinha[],
): Promise<ResultadoDoLote> {
  const resultado = loteVazio();
  const capacidade = await medirCapacidade();
  const existentes = await buscarExistentesNaLoja(
    lote.map((lead) => lead.chave),
    lote.flatMap((lead) => (lead.email === null ? [] : [lead.email])),
  );

  const aGravar: LeadDaLinha[] = [];
  for (const lead of lote) {
    const porTelefone = existentes.porTelefone.get(lead.chave);
    const porEmail =
      lead.email === null ? undefined : existentes.porEmail.get(lead.email);
    const existente = porTelefone ?? porEmail;
    if (existente !== undefined) {
      resultado.repetidos.push({
        linha: lead.linha,
        onde: "loja",
        motivo: porTelefone !== undefined ? "TELEFONE" : "EMAIL",
        clienteId: existente.clienteId,
        nome: existente.nome,
        linhaOriginal: null,
      });
      continue;
    }
    if (aGravar.length >= restanteDe(capacidade)) {
      resultado.foraDoLimite.push(lead);
      continue;
    }
    aGravar.push(lead);
  }

  if (aGravar.length > 0) {
    const lojaId = exigirLojaDoContexto();
    const gravados = await transacaoAtual().storeCustomer.createMany({
      data: aGravar.map((lead) => {
        const endereco = enderecoParaGravar(lead.dados.endereco);
        return {
          storeId: lojaId,
          displayName: lead.dados.nome.trim(),
          phoneE164: lead.e164,
          email: lead.email,
          notes: lead.dados.observacao?.trim() || null,
          origin: "IMPORT",
          ...(endereco === null ? {} : { address: endereco }),
        };
      }),
    });
    resultado.criados = gravados.count;
  }
  resultado.capacidade = {
    limite: capacidade.limite,
    uso: capacidade.uso + resultado.criados,
  };
  return resultado;
}

async function completarRepetidos(
  lote: readonly RepetidoNaLoja[],
): Promise<ResultadoDoLote> {
  const resultado = loteVazio();
  for (const repetido of lote) {
    if (await completarFicha(repetido)) resultado.atualizados += 1;
  }
  return resultado;
}

async function registrarNaTrilha(
  depois: Record<string, unknown>,
): Promise<void> {
  const contexto = exigirContexto();
  const autor = contexto.usuarioId;
  await transacaoAtual().auditLog.create({
    data: {
      storeId: exigirLojaDoContexto(),
      actorId:
        autor !== undefined && /^[0-9a-f-]{36}$/i.test(autor) ? autor : null,
      actorRole: contexto.papel,
      action: "CLIENTES_IMPORTADOS",
      entity: "store_customer",
      entityId: null,
      afterData: depois as never,
    },
  });
}

/** A confirmação: grava em lotes, uma transação por lote. */
export interface PedidoDeImportacao {
  readonly tabela: TabelaLida;
  readonly manual: MapeamentoDaImportacao;
  readonly regra: RegraDeRepetidosDaImportacao;
  readonly nomeDoArquivo: string | null;
}

export async function confirmarImportacao(
  { tabela, manual, regra, nomeDoArquivo }: PedidoDeImportacao,
  rodar: RodarNaLoja,
): Promise<ResultadoDaImportacaoNoContrato> {
  const { linhas } = prepararLinhas(tabela, manual);
  const classificacao = await rodar(() => classificarNaLoja(linhas));

  let criados = 0;
  let atualizados = 0;
  const repetidos: RepetidoDaImportacao[] = [
    ...classificacao.repetidosNoArquivo.map(repetidoDoArquivoNoContrato),
    ...classificacao.repetidosNaLoja.map(repetidoDaLojaNoContrato),
  ];
  const invalidos: {
    problema: ProblemaDaImportacao;
    cru: LeadDaLinha["cru"];
  }[] = classificacao.invalidos.map((invalida) => ({
    problema: invalida.problema,
    cru: invalida.cru,
  }));
  const foraDoLimite: LeadDaLinha[] = [];
  let capacidade: Capacidade | null = null;

  for (const lote of emLotes(
    classificacao.novos,
    TAMANHO_DO_LOTE_DA_IMPORTACAO,
  )) {
    const feito = await rodar(() => gravarNovos(lote));
    criados += feito.criados;
    repetidos.push(...feito.repetidos);
    invalidos.push(
      ...feito.invalidos.map(({ problema, lead }) => ({
        problema,
        cru: lead.cru,
      })),
    );
    foraDoLimite.push(...feito.foraDoLimite);
    capacidade = feito.capacidade;
  }

  if (regra === "completar") {
    for (const lote of emLotes(
      classificacao.repetidosNaLoja,
      TAMANHO_DO_LOTE_DE_COMPLETAR,
    )) {
      const feito = await rodar(() => completarRepetidos(lote));
      atualizados += feito.atualizados;
    }
  }

  capacidade ??= await rodar(() => medirCapacidade());
  const restante = restanteDe(capacidade);

  const crus = new Map<number, LeadDaLinha["cru"]>();
  for (const linha of linhas) crus.set(linha.linha, linha.cru);
  const relatorio: LinhaDoRelatorioDaImportacao[] = [
    ...invalidos.map(({ problema, cru }) => ({
      linha: problema.linha,
      situacao: "invalido" as const,
      motivo: problema.motivo,
      ...cru,
    })),
    ...repetidos.map((repetido) => ({
      linha: repetido.linha,
      situacao: "repetido" as const,
      motivo:
        repetido.onde === "arquivo"
          ? `Mesmo ${repetido.motivo === "TELEFONE" ? "telefone" : "e-mail"} da linha ${repetido.linhaOriginal}.`
          : `Já é cliente da loja (${repetido.nome ?? "sem nome"}), pelo ${repetido.motivo === "TELEFONE" ? "telefone" : "e-mail"}.`,
      ...(crus.get(repetido.linha) ?? {
        nome: null,
        telefone: null,
        email: null,
      }),
    })),
    ...foraDoLimite.map((lead) => ({
      linha: lead.linha,
      situacao: "fora_do_limite" as const,
      motivo: `A loja chegou ao limite de ${capacidade.limite} clientes.`,
      ...lead.cru,
    })),
  ].sort((a, b) => a.linha - b.linha);

  const contagens = {
    formato: tabela.formato,
    total: tabela.linhas.length,
    criados,
    atualizados,
    repetidos: repetidos.length,
    invalidos: invalidos.length,
    foraDoLimite: foraDoLimite.length,
    repetidosComo: regra,
  };
  if (criados > 0 || atualizados > 0) {
    await rodar(() => registrarNaTrilha(contagens));
  }

  return {
    arquivo: arquivoLido(tabela, nomeDoArquivo),
    repetidosComo: regra,
    total: tabela.linhas.length,
    criados,
    atualizados,
    repetidos: repetidos.sort((a, b) => a.linha - b.linha),
    invalidos: invalidos
      .map(({ problema }) => problema)
      .sort((a, b) => a.linha - b.linha),
    foraDoLimite: foraDoLimite.map((lead) => lead.linha),
    limite: {
      ...capacidade,
      restante,
      excedentes: foraDoLimite.length,
    },
    relatorio:
      relatorio.length === 0
        ? null
        : {
            nomeDoArquivo: nomeDoRelatorio(nomeDoArquivo),
            tipo: "text/csv",
            csv: relatorioEmCsv(relatorio),
            linhas: relatorio,
          },
  };
}
