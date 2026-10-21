/**
 * Como a demonstração escreve no banco: insere ou atualiza pela chave, com
 * ids previsíveis. Comum a todos os módulos da carga.
 */

import { createHash } from "node:crypto";

import type { ClienteSql } from "../../src/migrate.ts";
import { idDeExemplo } from "../deterministico.ts";

export type Valor = string | number | boolean | Date | null;
export type Linha = Readonly<Record<string, Valor>>;

/** Id previsível da demonstração: o mesmo nome dá sempre o mesmo id. */
export const id = (nome: string): string => idDeExemplo(`demo:${nome}`);

export const json = (valor: unknown): string => JSON.stringify(valor);

/**
 * Número previsível de 0 a `limite - 1` a partir de um nome: o "sorteio" da
 * demonstração, que dá o mesmo resultado em qualquer máquina.
 */
export function sorteio(nome: string, limite: number): number {
  if (limite <= 1) return 0;
  const resumo = createHash("sha1").update(nome).digest();
  return resumo.readUInt32BE(0) % limite;
}

/**
 * Insere ou atualiza pela chave. As colunas de criação não são reescritas na
 * atualização: o registro continua dizendo quando nasceu.
 */
export async function gravar(
  cliente: ClienteSql,
  tabela: string,
  linha: Linha,
  opcoes: { chave?: readonly string[]; atualizar?: boolean } = {},
): Promise<number> {
  const chave = opcoes.chave ?? ["id"];
  const colunas = Object.keys(linha);
  const valores = colunas.map((coluna) => linha[coluna] ?? null);
  const marcadores = colunas.map((_c, i) => `$${i + 1}`);
  const atualizaveis = colunas.filter(
    (coluna) => !chave.includes(coluna) && coluna !== "created_at",
  );
  const conflito =
    opcoes.atualizar === false || atualizaveis.length === 0
      ? "DO NOTHING"
      : `DO UPDATE SET ${atualizaveis
          .map((coluna) => `"${coluna}" = EXCLUDED."${coluna}"`)
          .join(", ")}`;
  const resultado = await cliente.query(
    `INSERT INTO app.${tabela} (${colunas.map((c) => `"${c}"`).join(", ")})
     VALUES (${marcadores.join(", ")})
     ON CONFLICT (${chave.map((c) => `"${c}"`).join(", ")}) ${conflito}`,
    valores,
  );
  return resultado.rowCount ?? 0;
}
