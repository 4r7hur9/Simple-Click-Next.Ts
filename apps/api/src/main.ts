import { criarApp } from "./app.ts";

/** Porta usada quando o ambiente não diz outra. */
export const PORTA_PADRAO = 3001;

/**
 * Lê a porta do ambiente e recusa valor que não seja porta válida.
 *
 * Falhar aqui, na partida, é melhor do que subir num número inesperado e o
 * roteador local não achar a API. A validação completa das variáveis
 * obrigatórias é da T-003 (AC-002) e mora em `core/env.ts`.
 */
export function lerPorta(ambiente: NodeJS.ProcessEnv): number {
  const bruto = ambiente.API_PORT;
  if (bruto === undefined || bruto === "") return PORTA_PADRAO;

  const porta = Number(bruto);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    throw new Error(
      `API_PORT inválida: esperado um inteiro entre 1 e 65535, recebido "${bruto}".`,
    );
  }
  return porta;
}

const porta = lerPorta(process.env);

criarApp().listen(porta, () => {
  // O registro estruturado é da T-012; até lá, a linha de partida vai direto
  // para a saída padrão para não depender de nada que ainda não existe.
  process.stdout.write(`API do SimpleClick ouvindo na porta ${porta}\n`);
});
