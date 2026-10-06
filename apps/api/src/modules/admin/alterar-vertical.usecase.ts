/**
 * Troca do tipo de negócio de uma loja pela administração (AC-214, AC-320).
 *
 * O tipo de negócio muda o vocabulário e a disposição de TODAS as telas da
 * loja — cardápio ou catálogo, ingredientes ou grade de tamanho e cor — e
 * liga ou desliga o controle de estoque do ramo. Por isso ele é da plataforma,
 * e não do dono: a credencial das lojas não tem privilégio de escrita nessa
 * coluna (migração 0003), e a rota do dono responde que o ajuste é da
 * administração (AC-323, provado em `apps/api/tests/vertical-somente-admin`).
 *
 * O QUE A TROCA MEXE, e o que ela NÃO mexe:
 *
 * - mexe na LOJA: o ramo, a versão do esquema do ramo e a versão do catálogo
 *   (que é o que faz a vitrine deixar de servir o vocabulário antigo);
 * - NÃO mexe em produto, categoria, grupo de escolha, variação nem preço. O
 *   produto guarda o ramo e a versão com que nasceu (`products.vertical_code`)
 *   justamente para que a troca não invalide o que já foi cadastrado
 *   (modelo de dados, AC-320). Nada é apagado, nada é reescrito.
 *
 * O CONTROLE DE ESTOQUE segue o ramo: a grade do painel pergunta ao ramo da
 * loja se conta unidades (`tracks_stock`), então trocar para roupa liga a
 * contagem na hora. A quantidade das variações que já existem NÃO é
 * inventada: elas continuam "sem contagem" até o dono informar o saldo, porque
 * nascer com zero poria o catálogo inteiro como esgotado de uma vez.
 *
 * Tudo numa transação só, com a linha da trilha: troca sem registro é o que a
 * trilha existe para impedir (AC-214).
 */

/** Um tipo de negócio do catálogo da plataforma. */
export interface TipoDeNegocioDaPlataforma {
  readonly codigo: string;
  readonly nome: string;
  readonly versaoDoEsquema: number;
  readonly controlaEstoque: boolean;
}

/** O que a troca precisa do banco, dentro da transação da administração. */
export interface RepositorioDoTipoDeNegocio {
  /** O tipo atual, com a linha da loja travada. `null` se a loja não existe. */
  lerTipoAtual(lojaId: string): Promise<TipoDeNegocioDaPlataforma | null>;
  lerTipo(codigo: string): Promise<TipoDeNegocioDaPlataforma | null>;
  gravarTipo(lojaId: string, tipo: TipoDeNegocioDaPlataforma): Promise<void>;
  registrar(ato: {
    readonly lojaId: string;
    readonly atorId: string;
    readonly acao: "TIPO_DE_NEGOCIO_ALTERADO";
    readonly antes: unknown;
    readonly depois: unknown;
  }): Promise<void>;
}

export type ResultadoDaTroca =
  | {
      readonly ok: true;
      readonly mudou: boolean;
      readonly de: TipoDeNegocioDaPlataforma;
      readonly para: TipoDeNegocioDaPlataforma;
    }
  | { readonly ok: false; readonly motivo: "NAO_ENCONTRADA" }
  | { readonly ok: false; readonly motivo: "TIPO_DESCONHECIDO" };

/** O antes e o depois que vão para a trilha. Nada aqui é dado pessoal. */
export function registroDaTroca(
  de: TipoDeNegocioDaPlataforma,
  para: TipoDeNegocioDaPlataforma,
): { readonly antes: unknown; readonly depois: unknown } {
  return {
    antes: {
      campos: {
        tipoDeNegocio: de.codigo,
        controlaEstoque: de.controlaEstoque,
      },
    },
    depois: {
      campos: {
        tipoDeNegocio: para.codigo,
        controlaEstoque: para.controlaEstoque,
      },
    },
  };
}

/**
 * Troca o tipo de negócio e registra quem trocou, de qual para qual.
 *
 * Pedir o tipo que a loja já tem não grava nem registra nada: a trilha que
 * registra "nada mudou" esconde a linha que importa.
 */
export async function alterarTipoDeNegocio(
  lojaId: string,
  codigo: string,
  administradorId: string,
  repositorio: RepositorioDoTipoDeNegocio,
): Promise<ResultadoDaTroca> {
  const de = await repositorio.lerTipoAtual(lojaId);
  if (de === null) return { ok: false, motivo: "NAO_ENCONTRADA" };

  const para = await repositorio.lerTipo(codigo);
  if (para === null) return { ok: false, motivo: "TIPO_DESCONHECIDO" };

  if (de.codigo === para.codigo) return { ok: true, mudou: false, de, para };

  await repositorio.gravarTipo(lojaId, para);
  const { antes, depois } = registroDaTroca(de, para);
  await repositorio.registrar({
    lojaId,
    atorId: administradorId,
    acao: "TIPO_DE_NEGOCIO_ALTERADO",
    antes,
    depois,
  });
  return { ok: true, mudou: true, de, para };
}
