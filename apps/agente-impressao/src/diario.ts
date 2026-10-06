/**
 * O diário local do agente: os identificadores dos trabalhos já impressos
 * (T-609 — AC-625).
 *
 * A ordem é o que importa: imprimir, GRAVAR no diário (com `fsync`, para
 * sobreviver a uma queda de energia) e só então confirmar à API. Se a
 * confirmação se perder na rede, o servidor reenvia o MESMO trabalho depois
 * do prazo de posse; o agente acha o identificador aqui e só confirma de
 * novo, sem imprimir outra vez.
 *
 * Uma linha por trabalho, só o identificador — nenhum dado do pedido nem do
 * cliente fica na máquina da loja. As linhas mais antigas que o limite saem na
 * abertura seguinte, para o arquivo não crescer para sempre: um trabalho só é
 * reenviado enquanto está na fila, e a fila desiste muito antes.
 */
import { open, readFile, writeFile } from "node:fs/promises";

/** Quantos identificadores o diário guarda. Um dia cheio de loja cabe folgado. */
export const LIMITE_DO_DIARIO = 5_000;

export interface Diario {
  /** Este trabalho já saiu na impressora desta máquina? */
  jaImpresso(id: string): boolean;
  /** Grava o trabalho como impresso, no disco, antes de devolver. */
  registrar(id: string): Promise<void>;
}

/** Abre (ou cria) o diário no caminho dado. */
export async function abrirDiario(
  caminho: string,
  limite = LIMITE_DO_DIARIO,
): Promise<Diario> {
  let conteudo = "";
  try {
    conteudo = await readFile(caminho, "utf8");
  } catch (causa) {
    if ((causa as NodeJS.ErrnoException).code !== "ENOENT") throw causa;
  }
  let ids = conteudo
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "");
  if (ids.length > limite) {
    ids = ids.slice(-limite);
    await writeFile(caminho, `${ids.join("\n")}\n`, "utf8");
  }
  const impressos = new Set(ids);

  return {
    jaImpresso: (id) => impressos.has(id),
    async registrar(id) {
      if (impressos.has(id)) return;
      const arquivo = await open(caminho, "a");
      try {
        await arquivo.appendFile(`${id}\n`, "utf8");
        await arquivo.sync();
      } finally {
        await arquivo.close();
      }
      impressos.add(id);
    },
  };
}
