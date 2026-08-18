/**
 * Preparação de banco do Vitest: cada arquivo de teste ganha o seu (AC-003).
 *
 * O Vitest executa este arquivo uma vez por arquivo de teste, e não uma vez por
 * suíte — é essa propriedade que transforma "um banco por arquivo" em algo que
 * acontece sozinho, sem cada teste precisar lembrar de pedir.
 *
 * O descarte fica no encerramento porque o encerramento roda também quando o
 * teste falha: banco de teste não pode depender de o teste ter passado para ser
 * apagado.
 */

import { afterAll, beforeAll, expect } from "vitest";

import {
  criarBancoDeTeste,
  esquecerBancoDoArquivo,
  registrarBancoDoArquivo,
  type BancoDeTeste,
} from "./db-test.ts";

/** A primeira execução do dia constrói o molde, e isso leva alguns segundos. */
const ESPERA_DA_PREPARACAO = 180_000;

/** Nome do arquivo no nome do banco: só serve para investigar sobra. */
function rotuloDoArquivo(): string {
  const caminho = expect.getState().testPath ?? "";
  const arquivo = caminho.split("/").pop() ?? "";
  return arquivo.replace(/\.(test|prova)\.[cm]?[jt]sx?$/, "");
}

let banco: BancoDeTeste | undefined;

beforeAll(async () => {
  banco = await criarBancoDeTeste({ rotulo: rotuloDoArquivo() });
  registrarBancoDoArquivo(banco);
}, ESPERA_DA_PREPARACAO);

afterAll(async () => {
  esquecerBancoDoArquivo();
  const aDescartar = banco;
  banco = undefined;
  await aDescartar?.descartar();
}, ESPERA_DA_PREPARACAO);
