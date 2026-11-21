/**
 * Vínculos pela administração da plataforma (card #170, T-4): pôr e tirar
 * donos e equipe de uma loja, e trocar o dono.
 *
 * As regras moram aqui e o banco chega por uma porta (`RepositorioDeVinculos`),
 * para que a prova das regras não precise de banco. Quem chama roda cada ato
 * numa transação só, pela credencial `sc_admin`: ou tudo fica (o vínculo, as
 * sessões revogadas e as duas linhas de trilha), ou nada fica.
 *
 * ORDEM DE TRAVA (a mesma em todo ato daqui):
 *
 *   1. as travas ADVISORY dos limites, com as MESMAS chaves de 0051/0052
 *      (`lojas-do-dono:<pessoa>` e `<loja>:staff`). Vêm antes de tudo porque
 *      quem cria pela loja (`solicitar_loja`, `medir_limite_da_loja`) pega a
 *      advisory e DEPOIS encosta na loja e na pessoa pela chave estrangeira
 *      (FOR KEY SHARE). Se a administração travasse a loja antes da advisory,
 *      as duas pontas se esperariam (deadlock, 40P01);
 *   2. a LOJA (FOR UPDATE): dois atos na mesma loja — remover dois donos ao
 *      mesmo tempo, por exemplo — passam um de cada vez, e o segundo vê o
 *      resultado do primeiro;
 *   3. as PESSOAS (FOR UPDATE, em ordem de id), como em pessoas.usecase.ts:
 *      lojas antes da identidade, identidade antes de sessões e vínculos;
 *   4. os vínculos e, por fim, as sessões.
 *
 * REGRAS (D-6):
 * - dono ATIVO = vínculo aceito, não revogado, de conta não desativada;
 * - só recebe vínculo a pessoa com senha, não desativada e não protegida;
 * - rotas de dono só tocam linha OWNER, e as de equipe só STAFF (a outra é
 *   404); a equipe que vira dona é UPDATE da mesma linha (há um vínculo por
 *   pessoa e loja);
 * - a loja não fica sem dono ativo (409 `ultimo_dono`);
 * - a troca é atômica, e as sessões do dono antigo caem (ROLE_CHANGED);
 * - remover é `revoked_at`: nenhum vínculo é apagado, e nenhum convite
 *   pendente nasce — quem vira dono já entra com a senha que tem.
 *
 * NADA DE ADMINISTRAÇÃO AQUI (D-7): nenhum ato escreve em `platform_admins`,
 * e a conta com grant ativo não é alvo de vínculo (409 `conta_protegida`),
 * conferido com a pessoa já travada.
 *
 * TRILHA (D-8): a loja guarda no `audit_log` só ids e papel — a equipe da
 * loja lê essa trilha. O MOTIVO, que pode falar da pessoa, vai só para a
 * trilha da plataforma (`audit_platform`, entidade `store`).
 */

/** Atos gravados por aqui, nas duas trilhas. */
export const ATOS_DE_VINCULO = {
  donoAdicionado: "DONO_ADICIONADO",
  donoSubstituido: "DONO_SUBSTITUIDO",
  donoRemovido: "DONO_REMOVIDO",
  equipeAdicionada: "EQUIPE_ADICIONADA",
  equipeRemovida: "EQUIPE_REMOVIDA",
} as const;

/** Como os atos de vínculo se chamam na coluna `entity` da plataforma. */
export const ENTIDADE_DA_LOJA = "store";

/**
 * Situações em que a loja ocupa vaga no limite de lojas do dono — as mesmas
 * de `app.limite_de_lojas_do_dono` (0051). Recusada não ocupa.
 */
export const SITUACOES_QUE_OCUPAM_VAGA: ReadonlySet<string> = new Set([
  "PENDING_APPROVAL",
  "ACTIVE",
  "INACTIVE",
]);

export type PapelDoVinculo = "OWNER" | "STAFF";

/** A loja travada (FOR UPDATE). Excluída não aparece. */
export interface LojaTravada {
  readonly id: string;
  readonly status: string;
}

/** A pessoa travada (FOR UPDATE), com o que decide se recebe vínculo. */
export interface PessoaDoVinculo {
  readonly id: string;
  readonly temSenha: boolean;
  readonly desativada: boolean;
  /** Tem grant ativo de administração da plataforma: intocável aqui. */
  readonly protegida: boolean;
}

/** A linha de `store_members` da pessoa naquela loja, travada. */
export interface VinculoTravado {
  readonly id: string;
  readonly papel: PapelDoVinculo;
  readonly revogado: boolean;
  readonly aceito: boolean;
}

/** Uso e limite de um recurso, já com a trava advisory pega. */
export interface Vagas {
  readonly limite: number;
  readonly uso: number;
}

/** O banco, como estes atos o enxergam. Tudo na transação em curso. */
export interface RepositorioDeVinculos {
  /** Advisory `lojas-do-dono:<pessoa>` (0052) e o limite de lojas dela. */
  travarVagasDeLojas(identidadeId: string): Promise<Vagas>;
  /** Advisory `<loja>:staff` (0051) e o limite de equipe da loja. */
  travarVagasDeEquipe(lojaId: string): Promise<Vagas>;
  /** Trava a loja (FOR UPDATE). `null`: não existe ou foi excluída. */
  travarLoja(lojaId: string): Promise<LojaTravada | null>;
  /**
   * Trava as pessoas (FOR UPDATE, em ordem de id). Quem não existe ou foi
   * anonimizado fica de fora do mapa.
   */
  travarPessoas(
    identidadeIds: readonly string[],
  ): Promise<ReadonlyMap<string, PessoaDoVinculo>>;
  /** O vínculo da pessoa na loja, travado (FOR UPDATE). */
  travarVinculo(
    lojaId: string,
    identidadeId: string,
  ): Promise<VinculoTravado | null>;
  /** Quantos OUTROS donos ativos a loja tem, além desta pessoa. */
  outrosDonosAtivos(lojaId: string, identidadeId: string): Promise<number>;
  /**
   * Põe a pessoa no papel, aceito e ativo: atualiza a linha que já existe
   * (mesmo revogada) ou cria uma. Devolve o id do vínculo.
   */
  gravarVinculo(dados: {
    readonly lojaId: string;
    readonly identidadeId: string;
    readonly papel: PapelDoVinculo;
    readonly existente: VinculoTravado | null;
    readonly administradorId: string;
    readonly agora: Date;
  }): Promise<string>;
  /** `revoked_at` no vínculo. Nada é apagado. */
  revogarVinculo(vinculoId: string, agora: Date): Promise<void>;
  /** Revoga as sessões vivas da pessoa por ROLE_CHANGED; devolve quantas. */
  revogarSessoes(identidadeId: string, agora: Date): Promise<number>;
  /** O ato na trilha da LOJA: só ids e papel. */
  registrarNaLoja(ato: {
    readonly lojaId: string;
    readonly administradorId: string;
    readonly acao: string;
    readonly vinculoId: string;
    readonly antes: Readonly<Record<string, unknown>> | null;
    readonly depois: Readonly<Record<string, unknown>> | null;
  }): Promise<void>;
  /** O ato na trilha da PLATAFORMA, com o motivo. */
  registrarNaPlataforma(ato: {
    readonly lojaId: string;
    readonly administradorId: string;
    readonly acao: string;
    readonly depois: Readonly<Record<string, unknown>>;
  }): Promise<void>;
}

export interface DependenciasDosVinculos {
  readonly repositorio: RepositorioDeVinculos;
  readonly agora: () => Date;
}

export type RecusaDoVinculo =
  | { readonly ok: false; readonly motivo: "LOJA_NAO_ENCONTRADA" }
  | { readonly ok: false; readonly motivo: "PESSOA_NAO_ENCONTRADA" }
  | { readonly ok: false; readonly motivo: "VINCULO_NAO_ENCONTRADO" }
  | { readonly ok: false; readonly motivo: "PROTEGIDA" }
  | { readonly ok: false; readonly motivo: "DESATIVADA" }
  | { readonly ok: false; readonly motivo: "SEM_ACESSO_DEFINIDO" }
  | { readonly ok: false; readonly motivo: "JA_E_DONO" }
  | { readonly ok: false; readonly motivo: "ULTIMO_DONO" }
  | { readonly ok: false; readonly motivo: "MESMA_PESSOA" }
  | {
      readonly ok: false;
      readonly motivo: "LIMITE_ATINGIDO";
      readonly recurso: "lojas" | "staff";
      readonly limite: number;
      readonly uso: number;
    };

export type ResultadoDoVinculo =
  | {
      readonly ok: true;
      /** O vínculo que ficou ativo (o novo, na troca). */
      readonly vinculoId: string;
      /** `false` quando a pessoa já estava no papel e nada mudou. */
      readonly criado: boolean;
    }
  | RecusaDoVinculo;

export type ResultadoDaRemocao = { readonly ok: true } | RecusaDoVinculo;

function recusa<M extends RecusaDoVinculo["motivo"]>(
  motivo: M,
): Extract<RecusaDoVinculo, { motivo: M }> {
  return { ok: false, motivo } as Extract<RecusaDoVinculo, { motivo: M }>;
}

/** Quem RECEBE vínculo: existe, não é protegida, está ativa e tem senha. */
function pessoaQueRecebe(
  pessoa: PessoaDoVinculo | undefined,
): RecusaDoVinculo | null {
  if (pessoa === undefined) return recusa("PESSOA_NAO_ENCONTRADA");
  if (pessoa.protegida) return recusa("PROTEGIDA");
  if (pessoa.desativada) return recusa("DESATIVADA");
  if (!pessoa.temSenha) return recusa("SEM_ACESSO_DEFINIDO");
  return null;
}

/** Quem PERDE vínculo: existe e não é protegida (desativada pode sair). */
function pessoaQuePerde(
  pessoa: PessoaDoVinculo | undefined,
): RecusaDoVinculo | null {
  if (pessoa === undefined) return recusa("PESSOA_NAO_ENCONTRADA");
  if (pessoa.protegida) return recusa("PROTEGIDA");
  return null;
}

function donoAtivoAceito(vinculo: VinculoTravado | null): boolean {
  return (
    vinculo !== null &&
    vinculo.papel === "OWNER" &&
    !vinculo.revogado &&
    vinculo.aceito
  );
}

/** O vínculo, se ele está ativo (não revogado) neste papel; senão `null`. */
function ativoNoPapel(
  vinculo: VinculoTravado | null,
  papel: PapelDoVinculo,
): VinculoTravado | null {
  return vinculo !== null && vinculo.papel === papel && !vinculo.revogado
    ? vinculo
    : null;
}

/** Ganhar a loja passaria do limite de lojas da pessoa? */
function passaDoLimiteDeLojas(
  loja: LojaTravada,
  vagas: Vagas,
): RecusaDoVinculo | null {
  if (!SITUACOES_QUE_OCUPAM_VAGA.has(loja.status)) return null;
  if (vagas.uso + 1 <= vagas.limite) return null;
  return {
    ok: false,
    motivo: "LIMITE_ATINGIDO",
    recurso: "lojas",
    limite: vagas.limite,
    uso: vagas.uso,
  };
}

// ---------------------------------------------------------------------------
// Donos
// ---------------------------------------------------------------------------

/**
 * Põe a pessoa como dona da loja. Se ela já é da equipe, a mesma linha vira
 * OWNER; se tinha convite de dono pendente, o vínculo é aceito agora (ela já
 * tem senha). Já dona ativa: 409.
 */
export async function adicionarDono(
  pedido: {
    readonly lojaId: string;
    readonly identidadeId: string;
    readonly motivo: string;
  },
  administradorId: string,
  dependencias: DependenciasDosVinculos,
): Promise<ResultadoDoVinculo> {
  const { repositorio } = dependencias;
  const { lojaId, identidadeId, motivo } = pedido;

  const vagas = await repositorio.travarVagasDeLojas(identidadeId);
  const loja = await repositorio.travarLoja(lojaId);
  if (loja === null) return recusa("LOJA_NAO_ENCONTRADA");
  const pessoas = await repositorio.travarPessoas([identidadeId]);
  const recusada = pessoaQueRecebe(pessoas.get(identidadeId));
  if (recusada !== null) return recusada;

  const existente = await repositorio.travarVinculo(lojaId, identidadeId);
  if (donoAtivoAceito(existente)) return recusa("JA_E_DONO");
  // Convite de dono ainda pendente já ocupa a vaga na contagem do limite.
  const jaOcupaVaga = ativoNoPapel(existente, "OWNER") !== null;
  if (!jaOcupaVaga) {
    const limite = passaDoLimiteDeLojas(loja, vagas);
    if (limite !== null) return limite;
  }

  const agora = dependencias.agora();
  const vinculoId = await repositorio.gravarVinculo({
    lojaId,
    identidadeId,
    papel: "OWNER",
    existente,
    administradorId,
    agora,
  });
  const papelAnterior =
    existente !== null && !existente.revogado ? existente.papel : null;
  await repositorio.registrarNaLoja({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.donoAdicionado,
    vinculoId,
    antes: papelAnterior === null ? null : { identidadeId, papel: papelAnterior },
    depois: { identidadeId, papel: "OWNER" },
  });
  await repositorio.registrarNaPlataforma({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.donoAdicionado,
    depois: {
      motivo,
      identidadeId,
      papel: "OWNER",
      ...(papelAnterior === null ? {} : { papelAnterior }),
      sensivel: true,
    },
  });
  return { ok: true, vinculoId, criado: true };
}

/**
 * Troca o dono: o novo fica ativo e o antigo, revogado, numa transação só, e
 * as sessões do antigo caem (ROLE_CHANGED). A loja nunca fica sem dono no
 * meio. Nenhum dado da loja muda — só os vínculos.
 */
export async function substituirDono(
  pedido: {
    readonly lojaId: string;
    readonly antigoId: string;
    readonly novoId: string;
    readonly motivo: string;
  },
  administradorId: string,
  dependencias: DependenciasDosVinculos,
): Promise<ResultadoDoVinculo & { readonly sessoesEncerradas?: number }> {
  const { repositorio } = dependencias;
  const { lojaId, antigoId, novoId, motivo } = pedido;
  if (antigoId === novoId) return recusa("MESMA_PESSOA");

  const vagas = await repositorio.travarVagasDeLojas(novoId);
  const loja = await repositorio.travarLoja(lojaId);
  if (loja === null) return recusa("LOJA_NAO_ENCONTRADA");
  const pessoas = await repositorio.travarPessoas([antigoId, novoId]);
  const antigoRecusado = pessoaQuePerde(pessoas.get(antigoId));
  if (antigoRecusado !== null) return antigoRecusado;

  // Vínculos em ordem de id da pessoa, como as pessoas.
  const [primeiro, segundo] = [antigoId, novoId].sort();
  const vinculos = new Map<string, VinculoTravado | null>();
  for (const id of [primeiro, segundo] as string[]) {
    vinculos.set(id, await repositorio.travarVinculo(lojaId, id));
  }
  const doAntigo = ativoNoPapel(vinculos.get(antigoId) ?? null, "OWNER");
  if (doAntigo === null) return recusa("VINCULO_NAO_ENCONTRADO");

  const novoRecusado = pessoaQueRecebe(pessoas.get(novoId));
  if (novoRecusado !== null) return novoRecusado;
  const doNovo = vinculos.get(novoId) ?? null;
  if (donoAtivoAceito(doNovo)) return recusa("JA_E_DONO");
  if (ativoNoPapel(doNovo, "OWNER") === null) {
    const limite = passaDoLimiteDeLojas(loja, vagas);
    if (limite !== null) return limite;
  }

  const agora = dependencias.agora();
  const vinculoId = await repositorio.gravarVinculo({
    lojaId,
    identidadeId: novoId,
    papel: "OWNER",
    existente: doNovo,
    administradorId,
    agora,
  });
  await repositorio.revogarVinculo(doAntigo.id, agora);
  const sessoesEncerradas = await repositorio.revogarSessoes(antigoId, agora);

  await repositorio.registrarNaLoja({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.donoSubstituido,
    vinculoId,
    antes: { identidadeId: antigoId, papel: "OWNER" },
    depois: { identidadeId: novoId, papel: "OWNER" },
  });
  await repositorio.registrarNaPlataforma({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.donoSubstituido,
    depois: {
      motivo,
      antigoDonoId: antigoId,
      novoDonoId: novoId,
      sessoesEncerradas,
      sensivel: true,
    },
  });
  return { ok: true, vinculoId, criado: true, sessoesEncerradas };
}

/**
 * Tira um dono da loja (`revoked_at`), desde que fique outro dono ativo. As
 * sessões dele caem (ROLE_CHANGED): o papel que o token carregava mudou.
 */
export async function removerDono(
  pedido: {
    readonly lojaId: string;
    readonly identidadeId: string;
    readonly motivo: string;
  },
  administradorId: string,
  dependencias: DependenciasDosVinculos,
): Promise<ResultadoDaRemocao> {
  const { repositorio } = dependencias;
  const { lojaId, identidadeId, motivo } = pedido;

  const loja = await repositorio.travarLoja(lojaId);
  if (loja === null) return recusa("LOJA_NAO_ENCONTRADA");
  const pessoas = await repositorio.travarPessoas([identidadeId]);
  const recusada = pessoaQuePerde(pessoas.get(identidadeId));
  if (recusada !== null) return recusada;

  const vinculo = ativoNoPapel(
    await repositorio.travarVinculo(lojaId, identidadeId),
    "OWNER",
  );
  if (vinculo === null) return recusa("VINCULO_NAO_ENCONTRADO");
  if ((await repositorio.outrosDonosAtivos(lojaId, identidadeId)) === 0) {
    return recusa("ULTIMO_DONO");
  }

  const agora = dependencias.agora();
  await repositorio.revogarVinculo(vinculo.id, agora);
  const sessoesEncerradas = await repositorio.revogarSessoes(
    identidadeId,
    agora,
  );
  await repositorio.registrarNaLoja({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.donoRemovido,
    vinculoId: vinculo.id,
    antes: { identidadeId, papel: "OWNER" },
    depois: null,
  });
  await repositorio.registrarNaPlataforma({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.donoRemovido,
    depois: { motivo, identidadeId, sessoesEncerradas, sensivel: true },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

/**
 * Põe a pessoa na equipe da loja, dentro do limite de equipe. Dona da loja:
 * 409 `ja_e_dono` (a rota de equipe não rebaixa dono). Já na equipe: nada
 * muda e a resposta é a mesma (repetir o clique é seguro).
 */
export async function adicionarEquipe(
  pedido: {
    readonly lojaId: string;
    readonly identidadeId: string;
    readonly motivo: string;
  },
  administradorId: string,
  dependencias: DependenciasDosVinculos,
): Promise<ResultadoDoVinculo> {
  const { repositorio } = dependencias;
  const { lojaId, identidadeId, motivo } = pedido;

  const vagas = await repositorio.travarVagasDeEquipe(lojaId);
  const loja = await repositorio.travarLoja(lojaId);
  if (loja === null) return recusa("LOJA_NAO_ENCONTRADA");
  const pessoas = await repositorio.travarPessoas([identidadeId]);
  const recusada = pessoaQueRecebe(pessoas.get(identidadeId));
  if (recusada !== null) return recusada;

  const existente = await repositorio.travarVinculo(lojaId, identidadeId);
  if (ativoNoPapel(existente, "OWNER") !== null) return recusa("JA_E_DONO");
  const naEquipe = ativoNoPapel(existente, "STAFF");
  if (naEquipe !== null) {
    return { ok: true, vinculoId: naEquipe.id, criado: false };
  }
  if (vagas.uso + 1 > vagas.limite) {
    return {
      ok: false,
      motivo: "LIMITE_ATINGIDO",
      recurso: "staff",
      limite: vagas.limite,
      uso: vagas.uso,
    };
  }

  const agora = dependencias.agora();
  const vinculoId = await repositorio.gravarVinculo({
    lojaId,
    identidadeId,
    papel: "STAFF",
    existente,
    administradorId,
    agora,
  });
  await repositorio.registrarNaLoja({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.equipeAdicionada,
    vinculoId,
    antes: null,
    depois: { identidadeId, papel: "STAFF" },
  });
  await repositorio.registrarNaPlataforma({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.equipeAdicionada,
    depois: { motivo, identidadeId, papel: "STAFF" },
  });
  return { ok: true, vinculoId, criado: true };
}

/** Tira a pessoa da equipe (`revoked_at`). Linha de dono: 404. */
export async function removerEquipe(
  pedido: {
    readonly lojaId: string;
    readonly identidadeId: string;
    readonly motivo: string;
  },
  administradorId: string,
  dependencias: DependenciasDosVinculos,
): Promise<ResultadoDaRemocao> {
  const { repositorio } = dependencias;
  const { lojaId, identidadeId, motivo } = pedido;

  const loja = await repositorio.travarLoja(lojaId);
  if (loja === null) return recusa("LOJA_NAO_ENCONTRADA");
  const pessoas = await repositorio.travarPessoas([identidadeId]);
  const recusada = pessoaQuePerde(pessoas.get(identidadeId));
  if (recusada !== null) return recusada;

  const vinculo = ativoNoPapel(
    await repositorio.travarVinculo(lojaId, identidadeId),
    "STAFF",
  );
  if (vinculo === null) return recusa("VINCULO_NAO_ENCONTRADO");

  await repositorio.revogarVinculo(vinculo.id, dependencias.agora());
  await repositorio.registrarNaLoja({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.equipeRemovida,
    vinculoId: vinculo.id,
    antes: { identidadeId, papel: "STAFF" },
    depois: null,
  });
  await repositorio.registrarNaPlataforma({
    lojaId,
    administradorId,
    acao: ATOS_DE_VINCULO.equipeRemovida,
    depois: { motivo, identidadeId, papel: "STAFF" },
  });
  return { ok: true };
}
