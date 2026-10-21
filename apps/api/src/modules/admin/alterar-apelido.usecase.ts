/**
 * Troca do apelido da loja pela administração, preservando o endereço antigo
 * (AC-208).
 *
 * O apelido é o endereço da loja na web (`/loja/pastel-da-joi`), e ele já está
 * em todo lugar que o dono o divulgou: no WhatsApp, no Instagram, no cartaz do
 * balcão. Trocar sem guardar o antigo quebraria cada um desses links — e o
 * cliente que clicasse veria "loja não disponível" numa loja que está no ar.
 *
 * Por isso a troca GUARDA o apelido antigo como apelido antigo da
 * loja (`stores.slugs_antigos`), e o
 * site redireciona quem chega por ele (`app.resolve_legacy_slug`, migração
 * 0048). O antigo continua ocupado: entregá-lo a outra loja faria o link que o
 * cliente já tinha abrir a loja errada.
 *
 * Voltar a um apelido que a PRÓPRIA loja já usou é permitido: o endereço
 * antigo volta a ser o atual, e o que era atual passa a redirecionar.
 */

/** O apelido ficou ocupado entre a conferência e a gravação (corrida). */
export class ErroDeApelidoTomado extends Error {
  constructor() {
    super("O apelido foi tomado por outra loja no meio da troca.");
    this.name = "ErroDeApelidoTomado";
  }
}

/** O que a troca precisa do banco, dentro da transação da administração. */
export interface RepositorioDoApelido {
  /** O apelido atual, com a linha da loja travada. `null` se ela não existe. */
  lerApelidoAtual(lojaId: string): Promise<string | null>;
  /**
   * Quais destes apelidos pertencem a OUTRA loja — como atual ou como antigo.
   * Os antigos desta mesma loja não contam: voltar a eles é permitido.
   */
  apelidosDeOutraLoja(
    lojaId: string,
    candidatos: readonly string[],
  ): Promise<ReadonlySet<string>>;
  /**
   * Guarda o antigo como endereço que redireciona e grava o novo. Lança
   * `ErroDeApelidoTomado` se a chave única do banco recusar.
   */
  gravarApelido(
    lojaId: string,
    troca: { readonly antigo: string; readonly novo: string },
  ): Promise<void>;
  registrar(ato: {
    readonly lojaId: string;
    readonly atorId: string;
    readonly acao: "APELIDO_ALTERADO";
    readonly antes: unknown;
    readonly depois: unknown;
  }): Promise<void>;
}

export type ResultadoDaTrocaDeApelido =
  | {
      readonly ok: true;
      readonly mudou: boolean;
      readonly antigo: string;
      readonly novo: string;
    }
  | { readonly ok: false; readonly motivo: "NAO_ENCONTRADA" }
  | {
      readonly ok: false;
      readonly motivo: "APELIDO_EM_USO";
      readonly sugestao: string | null;
    };

/** O antes e o depois que vão para a trilha. O apelido é público. */
export function registroDaTrocaDeApelido(antigo: string, novo: string) {
  return {
    antes: { campos: { apelido: antigo } },
    depois: { campos: { apelido: novo } },
  };
}

/** O que a troca usa de fora: o banco e o sugeridor de variação livre. */
export interface DependenciasDaTrocaDeApelido {
  readonly repositorio: RepositorioDoApelido;
  /**
   * A mesma regra do cadastro (T-200): a primeira variação livre, para a tela
   * oferecer na hora em vez de deixar a pessoa adivinhando.
   */
  readonly sugerir: (base: string) => Promise<string | null>;
}

/** Troca o apelido e registra quem trocou, de qual para qual. */
export async function alterarApelido(
  lojaId: string,
  novo: string,
  administradorId: string,
  { repositorio, sugerir }: DependenciasDaTrocaDeApelido,
): Promise<ResultadoDaTrocaDeApelido> {
  const antigo = await repositorio.lerApelidoAtual(lojaId);
  if (antigo === null) return { ok: false, motivo: "NAO_ENCONTRADA" };
  if (antigo.toLowerCase() === novo.toLowerCase()) {
    return { ok: true, mudou: false, antigo, novo: antigo };
  }

  const deOutra = await repositorio.apelidosDeOutraLoja(lojaId, [novo]);
  if (deOutra.has(novo.toLowerCase())) {
    return {
      ok: false,
      motivo: "APELIDO_EM_USO",
      sugestao: await sugerir(novo),
    };
  }

  await repositorio.gravarApelido(lojaId, { antigo, novo });
  const { antes, depois } = registroDaTrocaDeApelido(antigo, novo);
  await repositorio.registrar({
    lojaId,
    atorId: administradorId,
    acao: "APELIDO_ALTERADO",
    antes,
    depois,
  });
  return { ok: true, mudou: true, antigo, novo };
}
