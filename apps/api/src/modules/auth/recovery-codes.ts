import { createHash, randomBytes } from "node:crypto";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const QUANTIDADE_PADRAO = 10;

export interface CodigoDeRecuperacaoPersistido {
  readonly identidadeId: string;
  readonly resumo: string;
}

export interface RepositorioDeCodigosDeRecuperacao {
  criar(codigos: readonly CodigoDeRecuperacaoPersistido[]): Promise<void>;
  consumir(entrada: {
    readonly identidadeId: string;
    readonly resumo: string;
  }): Promise<boolean>;
}

export interface AvisadorDeUsoDeRecuperacao {
  avisarUso(entrada: { readonly identidadeId: string }): Promise<void>;
}

export interface ResultadoDoCodigoDeRecuperacao {
  readonly status: "SESSAO_LIBERADA";
  readonly sessaoId: string;
  readonly orientarPara: "/minha-conta/seguranca/aplicativo";
}

export async function criarCodigosDeRecuperacao(
  identidadeId: string,
  repositorio: RepositorioDeCodigosDeRecuperacao,
  quantidade = QUANTIDADE_PADRAO,
  gerarBytes: () => Uint8Array = () => randomBytes(5),
): Promise<readonly string[]> {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
    throw new Error(
      "A quantidade de códigos de recuperação deve estar entre 1 e 20.",
    );
  }
  const codigos = Array.from({ length: quantidade }, () =>
    formatarCodigo(gerarBytes()),
  );
  await repositorio.criar(
    codigos.map((codigo) => ({ identidadeId, resumo: resumirCodigo(codigo) })),
  );
  return codigos;
}

export async function usarCodigoDeRecuperacao(
  entrada: { readonly identidadeId: string; readonly codigo: string },
  dependencias: {
    readonly repositorio: RepositorioDeCodigosDeRecuperacao;
    readonly avisador: AvisadorDeUsoDeRecuperacao;
    readonly criarSessao: (
      identidadeId: string,
    ) => Promise<{ readonly sessaoId: string }>;
  },
): Promise<ResultadodoCodigoOuInvalido> {
  const consumido = await dependencias.repositorio.consumir({
    identidadeId: entrada.identidadeId,
    resumo: resumirCodigo(entrada.codigo),
  });
  if (!consumido) return { status: "CODIGO_INVALIDO" };

  const sessao = await dependencias.criarSessao(entrada.identidadeId);
  await dependencias.avisador.avisarUso({ identidadeId: entrada.identidadeId });
  return {
    status: "SESSAO_LIBERADA",
    sessaoId: sessao.sessaoId,
    orientarPara: "/minha-conta/seguranca/aplicativo",
  };
}

export type ResultadodoCodigoOuInvalido =
  ResultadoDoCodigoDeRecuperacao | { readonly status: "CODIGO_INVALIDO" };

export function resumirCodigo(codigo: string): string {
  const normalizado = codigo.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return createHash("sha256").update(normalizado, "utf8").digest("hex");
}

function formatarCodigo(bytes: Uint8Array): string {
  let codigo = "";
  for (let indice = 0; indice < 8; indice += 1) {
    codigo += ALFABETO[bytes[indice % bytes.length]! % ALFABETO.length];
  }
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}
