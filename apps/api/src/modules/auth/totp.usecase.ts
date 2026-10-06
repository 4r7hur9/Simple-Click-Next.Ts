import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASSO_EM_MS = 30_000;
const JANELA_DE_PASSOS = 1;

export type PapelComSegundoFator = "CLIENTE" | "DONO" | "ADMINISTRADOR";

export interface CifradorDeSegredoTotp {
  cifrar(segredo: string): Promise<string>;
}

export interface CredencialTotpCifrada {
  readonly identidadeId: string;
  readonly segredoCifrado: string;
  readonly ativo: boolean;
}

/**
 * A porta guarda apenas o segredo cifrado. A operação de confirmação e a de
 * consumo precisam ser atômicas no adaptador de produção: o passo consumido
 * não pode ser aceito duas vezes em duas requisições concorrentes.
 */
export interface RepositorioTotp {
  guardarPendente(credencial: CredencialTotpCifrada): Promise<void>;
  ativarSeCodigoConfere(entrada: {
    readonly identidadeId: string;
    readonly codigo: string;
    readonly agora: Date;
  }): Promise<boolean>;
  buscar(identidadeId: string): Promise<CredencialTotpCifrada | null>;
  validarEConsumir(entrada: {
    readonly identidadeId: string;
    readonly codigo: string;
    readonly agora: Date;
  }): Promise<boolean>;
}

export interface DependenciasDeAtivacaoTotp {
  readonly repositorio: RepositorioTotp;
  readonly cifrador: CifradorDeSegredoTotp;
  readonly gerarCodigosDeRecuperacao: (
    identidadeId: string,
  ) => Promise<readonly string[]>;
  readonly agora?: () => Date;
}

export interface AtivacaoTotpPreparada {
  readonly segredo: string;
  readonly uriDoAplicativo: string;
}

export interface ResultadoDaAtivacaoTotp {
  readonly status: "ATIVADO";
  readonly codigosDeRecuperacao: readonly string[];
}

export function prepararAtivacaoTotp(
  identidadeId: string,
  nomeDaConta: string,
  dependencias: Pick<DependenciasDeAtivacaoTotp, "repositorio" | "cifrador">,
  gerarBytes: () => Uint8Array = () => randomBytes(20),
): Promise<AtivacaoTotpPreparada> {
  const segredo = codificarBase32(gerarBytes());
  const uriDoAplicativo =
    `otpauth://totp/SimpleClick:${encodeURIComponent(nomeDaConta)}` +
    `?secret=${segredo}&issuer=SimpleClick&algorithm=SHA1&digits=6&period=30`;

  return dependencias.cifrador.cifrar(segredo).then(async (segredoCifrado) => {
    await dependencias.repositorio.guardarPendente({
      identidadeId,
      segredoCifrado,
      ativo: false,
    });
    return { segredo, uriDoAplicativo };
  });
}

export async function ativarAplicativoTotp(
  identidadeId: string,
  codigo: string,
  dependencias: DependenciasDeAtivacaoTotp,
): Promise<ResultadoDaAtivacaoTotp | { readonly status: "CODIGO_INVALIDO" }> {
  const aceito = await dependencias.repositorio.ativarSeCodigoConfere({
    identidadeId,
    codigo,
    agora: dependencias.agora?.() ?? new Date(),
  });
  if (!aceito) return { status: "CODIGO_INVALIDO" };

  return {
    status: "ATIVADO",
    codigosDeRecuperacao:
      await dependencias.gerarCodigosDeRecuperacao(identidadeId),
  };
}

export async function validarCodigoTotp(
  identidadeId: string,
  codigo: string,
  dependencias: Pick<DependenciasDeAtivacaoTotp, "repositorio"> & {
    readonly agora?: () => Date;
  },
): Promise<"ACEITO" | "INVALIDO"> {
  const aceito = await dependencias.repositorio.validarEConsumir({
    identidadeId,
    codigo,
    agora: dependencias.agora?.() ?? new Date(),
  });
  return aceito ? "ACEITO" : "INVALIDO";
}

export function gerarCodigoTotp(segredo: string, agora: Date): string {
  const segredoEmBytes = decodificarBase32(segredo);
  const contador = Math.floor(agora.getTime() / PASSO_EM_MS);
  const mensagem = Buffer.alloc(8);
  mensagem.writeBigUInt64BE(BigInt(contador));
  const digest = createHmac("sha1", segredoEmBytes).update(mensagem).digest();
  const deslocamento = digest[digest.length - 1]! & 0x0f;
  const numero =
    ((digest[deslocamento]! & 0x7f) << 24) |
    (digest[deslocamento + 1]! << 16) |
    (digest[deslocamento + 2]! << 8) |
    digest[deslocamento + 3]!;
  return String(numero % 1_000_000).padStart(6, "0");
}

export function codigosTotpAceitos(
  segredo: string,
  agora: Date,
): readonly string[] {
  return Array.from({ length: JANELA_DE_PASSOS * 2 + 1 }, (_, indice) => {
    const deslocamento = indice - JANELA_DE_PASSOS;
    return gerarCodigoTotp(
      segredo,
      new Date(agora.getTime() + deslocamento * PASSO_EM_MS),
    );
  });
}

export interface DecisaoDoSegundoFatorDoAdministrador {
  readonly status: "CONFIGURACAO_OBRIGATORIA" | "PODE_CONTINUAR";
  readonly caminho?: "/minha-conta/seguranca/aplicativo";
}

/** Administrador sem aplicativo nunca recebe uma rota alternativa por e-mail. */
export function decidirSegundoFatorObrigatorio(
  papel: PapelComSegundoFator,
  aplicativoAtivo: boolean,
): DecisaoDoSegundoFatorDoAdministrador {
  if (papel === "ADMINISTRADOR" && !aplicativoAtivo) {
    return {
      status: "CONFIGURACAO_OBRIGATORIA",
      caminho: "/minha-conta/seguranca/aplicativo",
    };
  }
  return { status: "PODE_CONTINUAR" };
}

function codificarBase32(bytes: Uint8Array): string {
  let acumulado = 0;
  let bits = 0;
  let resultado = "";
  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      resultado += ALFABETO_BASE32[(acumulado >>> bits) & 31];
    }
  }
  if (bits > 0) resultado += ALFABETO_BASE32[(acumulado << (5 - bits)) & 31];
  return resultado;
}

function decodificarBase32(segredo: string): Buffer {
  let acumulado = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const simbolo of segredo.replace(/=+$/g, "").toUpperCase()) {
    const valor = ALFABETO_BASE32.indexOf(simbolo);
    if (valor < 0) throw new Error("Segredo TOTP inválido.");
    acumulado = (acumulado << 5) | valor;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulado >>> bits) & 255);
    }
  }
  return Buffer.from(bytes);
}

export function comparacaoSeguraTotp(a: string, b: string): boolean {
  const esquerda = Buffer.from(a);
  const direita = Buffer.from(b);
  return (
    esquerda.length === direita.length && timingSafeEqual(esquerda, direita)
  );
}
