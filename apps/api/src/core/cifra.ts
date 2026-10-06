/**
 * Cifra dos segredos que o banco guarda e a API precisa ler de volta (AC-130).
 *
 * O caso que motiva o arquivo é o segredo do aplicativo autenticador: ele não
 * pode ser resumido como uma senha, porque conferir o código de seis dígitos
 * exige o segredo original. Então ele vai cifrado, e a chave mora no ambiente,
 * nunca no código nem no banco (P-002). Quem lê o banco sem a chave lê um
 * texto que não serve para nada.
 *
 * Três decisões, e o modo de falha que cada uma fecha:
 *
 * 1. **AES-256-GCM, do `node:crypto`.** Cifra autenticada: o texto adulterado
 *    no banco não decifra para "outro segredo", ele simplesmente não decifra.
 *    A conferência falha fechada — código recusado —, nunca aberta.
 * 2. **Vetor novo a cada cifra, e contexto amarrado.** O vetor de 12 bytes sai
 *    de fonte aleatória a cada chamada (repetir vetor com a mesma chave quebra
 *    o GCM). O contexto (`simpleclick:totp`, por exemplo) entra como dado
 *    associado: um texto cifrado para um propósito não decifra noutro.
 * 3. **O formato diz com qual chave foi cifrado.** `v1.<chave>.<vetor>.<etiqueta>.<cifrado>`,
 *    em base64url. `<chave>` é um pedaço do resumo da chave — não a chave —, e
 *    é o que permite dizer "cifrado com outra chave" em vez de um erro genérico
 *    de decifração, e o que abre caminho para a troca de chave sem migração.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/** Variável de ambiente da chave que cifra o segredo do aplicativo autenticador. */
export const VARIAVEL_DA_CHAVE_DO_TOTP = "CHAVE_CIFRA_TOTP";

/** Contexto amarrado ao texto cifrado do segredo do aplicativo. */
export const CONTEXTO_DO_TOTP = "simpleclick:totp";

/** Prefixo do formato. A migração 0044 recusa segredo que não comece por ele. */
export const VERSAO_DA_CIFRA = "v1";

const ALGORITMO = "aes-256-gcm";
const TAMANHO_DA_CHAVE = 32;
const TAMANHO_DO_VETOR = 12;
const TAMANHO_DA_ETIQUETA = 16;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** Como gerar uma chave válida — vai na mensagem de quem configura o ambiente. */
export const COMO_GERAR_A_CHAVE =
  "32 bytes aleatórios em base64 — node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\"";

/** Chave ausente ou fora do formato. A mensagem nunca traz o valor recebido. */
export class ErroDeChaveDeCifra extends Error {
  constructor(motivo: string) {
    super(
      `A chave de cifra (${VARIAVEL_DA_CHAVE_DO_TOTP}) ${motivo}. Esperado: ${COMO_GERAR_A_CHAVE}.`,
    );
    this.name = "ErroDeChaveDeCifra";
  }
}

/**
 * O texto não decifra: adulterado, de outro formato ou cifrado com outra
 * chave. Quem confere um código trata isto como código recusado.
 */
export class ErroDeDecifracao extends Error {
  readonly motivo: "formato" | "outra_chave" | "adulterado";

  constructor(motivo: "formato" | "outra_chave" | "adulterado") {
    super(
      motivo === "outra_chave"
        ? "O segredo foi cifrado com outra chave."
        : motivo === "formato"
          ? "O segredo cifrado está fora do formato."
          : "O segredo cifrado foi alterado depois de cifrado.",
    );
    this.name = "ErroDeDecifracao";
    this.motivo = motivo;
  }
}

/** Os bytes da chave, ou o motivo de ela não servir. */
function decodificarChave(texto: string): Buffer | string {
  const limpo = texto.trim();
  if (limpo === "") return "está vazia";
  if (!BASE64.test(limpo)) return "não está em base64";
  const bytes = Buffer.from(limpo, "base64");
  if (bytes.length !== TAMANHO_DA_CHAVE) {
    return `tem ${bytes.length} bytes, e AES-256 pede ${TAMANHO_DA_CHAVE}`;
  }
  return bytes;
}

/**
 * Motivo de a chave não servir, ou `undefined` quando ela serve. É o que a
 * validação do ambiente usa na partida (`core/env.ts`).
 */
export function problemaDaChaveDeCifra(texto: string): string | undefined {
  const resultado = decodificarChave(texto);
  return typeof resultado === "string" ? resultado : undefined;
}

/** Cifra e decifra segredos curtos, sempre do mesmo contexto. */
export interface CifradorDeSegredos {
  cifrar(segredo: string): Promise<string>;
  decifrar(cifrado: string): Promise<string>;
}

/** Pedaço do resumo da chave que identifica com qual chave o texto foi cifrado. */
function identificadorDaChave(chave: Buffer): string {
  return createHash("sha256")
    .update("simpleclick:identificador-de-chave:")
    .update(chave)
    .digest("base64url")
    .slice(0, 8);
}

/** Monta o cifrador sobre a chave informada, já validada. */
export function criarCifradorDeSegredos(
  chaveEmBase64: string,
  contexto: string,
): CifradorDeSegredos {
  const chave = decodificarChave(chaveEmBase64);
  if (typeof chave === "string") throw new ErroDeChaveDeCifra(chave);
  const identificador = identificadorDaChave(chave);
  const dadoAssociado = Buffer.from(contexto, "utf8");

  return {
    async cifrar(segredo: string): Promise<string> {
      const vetor = randomBytes(TAMANHO_DO_VETOR);
      const cifra = createCipheriv(ALGORITMO, chave, vetor, {
        authTagLength: TAMANHO_DA_ETIQUETA,
      });
      cifra.setAAD(dadoAssociado);
      const cifrado = Buffer.concat([
        cifra.update(segredo, "utf8"),
        cifra.final(),
      ]);
      return [
        VERSAO_DA_CIFRA,
        identificador,
        vetor.toString("base64url"),
        cifra.getAuthTag().toString("base64url"),
        cifrado.toString("base64url"),
      ].join(".");
    },

    async decifrar(texto: string): Promise<string> {
      const partes = texto.split(".");
      if (partes.length !== 5 || partes[0] !== VERSAO_DA_CIFRA) {
        throw new ErroDeDecifracao("formato");
      }
      const [, deQualChave, vetor, etiqueta, cifrado] = partes as [
        string,
        string,
        string,
        string,
        string,
      ];
      if (deQualChave !== identificador) {
        throw new ErroDeDecifracao("outra_chave");
      }
      const bytesDoVetor = Buffer.from(vetor, "base64url");
      const bytesDaEtiqueta = Buffer.from(etiqueta, "base64url");
      if (
        bytesDoVetor.length !== TAMANHO_DO_VETOR ||
        bytesDaEtiqueta.length !== TAMANHO_DA_ETIQUETA
      ) {
        throw new ErroDeDecifracao("formato");
      }
      try {
        const decifra = createDecipheriv(ALGORITMO, chave, bytesDoVetor, {
          authTagLength: TAMANHO_DA_ETIQUETA,
        });
        decifra.setAAD(dadoAssociado);
        decifra.setAuthTag(bytesDaEtiqueta);
        return Buffer.concat([
          decifra.update(Buffer.from(cifrado, "base64url")),
          decifra.final(),
        ]).toString("utf8");
      } catch {
        throw new ErroDeDecifracao("adulterado");
      }
    },
  };
}

/**
 * O cifrador do segredo do aplicativo autenticador, montado do ambiente.
 *
 * Em produção a partida já recusou ambiente sem a chave (`core/env.ts`). Fora
 * dela a chave é opcional, e sem ela o cifrador responde de forma explícita —
 * recusa nomeando a variável — em vez de guardar o segredo de qualquer jeito.
 */
export function cifradorDoTotpDoAmbiente(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): CifradorDeSegredos {
  const chave = fonte[VARIAVEL_DA_CHAVE_DO_TOTP]?.trim();
  if (chave === undefined || chave === "") {
    const recusar = () =>
      Promise.reject(new ErroDeChaveDeCifra("não está definida"));
    return { cifrar: recusar, decifrar: recusar };
  }
  return criarCifradorDeSegredos(chave, CONTEXTO_DO_TOTP);
}
