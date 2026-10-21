/**
 * Cadastro de loja pela administração (AC-200, AC-201, AC-202).
 *
 * O caso de uso recebe os dados JÁ VALIDADOS pela borda — documento conferido
 * pelo dígito verificador, apelido no formato, e-mail e telefone normalizados
 * (`esquemaDaNovaLoja`, no contrato). O que sobra para ele decidir é o que só o
 * banco sabe responder: se o apelido está livre e se o tipo de negócio existe.
 *
 * DUAS ETAPAS, NESTA ORDEM, de propósito:
 *
 * 1. **Gravar**, numa transação só: loja, configuração, identidade do
 *    responsável, vínculo de dono com o convite e a linha da trilha. Metade de
 *    uma loja (loja sem dono, dono sem convite) é pior que loja nenhuma.
 * 2. **Enviar o convite**, depois do `COMMIT`. Mandar e-mail de dentro da
 *    transação faria uma falha do serviço de e-mail desfazer a loja — e, no
 *    caminho contrário, mandaria convite de uma loja que o banco recusou.
 *    Se o envio falhar, a loja fica criada e a resposta diz que o convite não
 *    saiu, para a administração reenviar. Nada se perde em silêncio.
 */

import type { NovaLojaNoContrato } from "@simpleclick/contracts";

/** Quanto o link do convite vale: o mesmo prazo do convite da identidade. */
export const PRAZO_DO_CONVITE_EM_MS = 7 * 24 * 60 * 60 * 1000;

/** Quantas variações o sugeridor tenta antes de desistir. */
const TENTATIVAS_DE_SUGESTAO = 30;

/** A loja como o banco a devolveu depois de gravar. */
export interface LojaGravada {
  readonly id: string;
  readonly codigo: string;
  readonly apelido: string;
  readonly status: "PENDING_APPROVAL" | "ACTIVE" | "REJECTED" | "INACTIVE" | "DELETED";
}

/** O que a gravação recebe: o cadastro, o convite e quem cadastrou. */
export interface LojaParaGravar {
  readonly dados: NovaLojaNoContrato;
  readonly convite: { readonly resumoDoToken: string; readonly expiraEm: Date };
  readonly criadaPor: string;
}

/** O apelido ficou ocupado entre a conferência e a gravação (corrida). */
export class ErroDeApelidoEmUso extends Error {
  constructor() {
    super("O apelido da loja já está em uso.");
    this.name = "ErroDeApelidoEmUso";
  }
}

/**
 * O que o cadastro precisa do banco. Tudo roda dentro da MESMA transação da
 * administração, aberta por quem monta o caso de uso.
 */
export interface RepositorioDoCadastro {
  tipoDeNegocioExiste(codigo: string): Promise<boolean>;
  /** Quais destes apelidos já pertencem a alguma loja, atual ou antigo. */
  apelidosOcupados(candidatos: readonly string[]): Promise<ReadonlySet<string>>;
  /** Lança `ErroDeApelidoEmUso` se o apelido for tomado no meio do caminho. */
  gravarLoja(loja: LojaParaGravar): Promise<LojaGravada>;
}

export interface DependenciasDoCadastro {
  /** Abre a transação da administração e entrega o repositório dentro dela. */
  executar<T>(
    trabalho: (repositorio: RepositorioDoCadastro) => Promise<T>,
  ): Promise<T>;
  enviarConvite(convite: {
    readonly para: string;
    readonly nome: string;
    readonly nomeDaLoja: string;
    readonly token: string;
    readonly expiraEm: Date;
  }): Promise<void>;
  gerarToken(): string;
  resumirToken(token: string): string;
  agora(): Date;
  /** Registro sem dado pessoal de que o convite não saiu. */
  avisarConviteNaoEnviado?(lojaId: string, causa: unknown): void;
}

export type ResultadoDoCadastro =
  | {
      readonly ok: true;
      readonly loja: LojaGravada;
      readonly conviteEnviado: boolean;
    }
  | {
      readonly ok: false;
      readonly motivo: "APELIDO_EM_USO";
      readonly sugestao: string | null;
    }
  | { readonly ok: false; readonly motivo: "TIPO_DESCONHECIDO" };

/**
 * Variações de um apelido, na ordem em que são oferecidas: `base-2`, `base-3`…
 * A base é encurtada quando precisa, para a variação caber nos 63 caracteres
 * de um rótulo de endereço.
 */
export function variacoesDoApelido(
  base: string,
  quantas: number = TENTATIVAS_DE_SUGESTAO,
): string[] {
  const variacoes: string[] = [];
  for (let numero = 2; variacoes.length < quantas; numero += 1) {
    const sufixo = `-${numero}`;
    const raiz = base.slice(0, 63 - sufixo.length).replace(/-+$/, "");
    variacoes.push(`${raiz}${sufixo}`);
  }
  return variacoes;
}

/** A primeira variação livre, ou `null` se todas estiverem tomadas. */
export async function sugerirApelido(
  base: string,
  repositorio: Pick<RepositorioDoCadastro, "apelidosOcupados">,
): Promise<string | null> {
  const candidatos = variacoesDoApelido(base);
  const ocupados = await repositorio.apelidosOcupados(candidatos);
  return candidatos.find((candidato) => !ocupados.has(candidato)) ?? null;
}

/**
 * Cadastra a loja e convida o responsável.
 *
 * O apelido é conferido ANTES de gravar para devolver a sugestão na hora
 * (AC-201), e de novo pela chave única do banco no momento da gravação — a
 * conferência sozinha perderia a corrida entre dois cadastros simultâneos.
 */
export async function cadastrarLoja(
  dados: NovaLojaNoContrato,
  administradorId: string,
  dependencias: DependenciasDoCadastro,
): Promise<ResultadoDoCadastro> {
  const agora = dependencias.agora();
  const token = dependencias.gerarToken();
  const expiraEm = new Date(agora.getTime() + PRAZO_DO_CONVITE_EM_MS);

  let gravacao: ResultadoDoCadastro;
  try {
    gravacao = await dependencias.executar(async (repositorio) => {
      if (!(await repositorio.tipoDeNegocioExiste(dados.tipoDeNegocio))) {
        return { ok: false, motivo: "TIPO_DESCONHECIDO" } as const;
      }

      const ocupados = await repositorio.apelidosOcupados([dados.apelido]);
      if (ocupados.has(dados.apelido)) {
        return {
          ok: false,
          motivo: "APELIDO_EM_USO",
          sugestao: await sugerirApelido(dados.apelido, repositorio),
        } as const;
      }

      const loja = await repositorio.gravarLoja({
        dados,
        convite: { resumoDoToken: dependencias.resumirToken(token), expiraEm },
        criadaPor: administradorId,
      });
      return { ok: true, loja, conviteEnviado: false } as const;
    });
  } catch (erro) {
    if (!(erro instanceof ErroDeApelidoEmUso)) throw erro;
    // A transação da gravação foi desfeita; a sugestão sai de outra, limpa.
    const sugestao = await dependencias.executar((repositorio) =>
      sugerirApelido(dados.apelido, repositorio),
    );
    return { ok: false, motivo: "APELIDO_EM_USO", sugestao };
  }

  if (!gravacao.ok) return gravacao;

  try {
    await dependencias.enviarConvite({
      para: dados.responsavel.email,
      nome: dados.responsavel.nome,
      nomeDaLoja: dados.nome,
      token,
      expiraEm,
    });
    return { ...gravacao, conviteEnviado: true };
  } catch (causa) {
    dependencias.avisarConviteNaoEnviado?.(gravacao.loja.id, causa);
    return { ...gravacao, conviteEnviado: false };
  }
}
