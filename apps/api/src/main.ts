import { criarApp } from "./app.ts";
import { avisoDoSiteDoAmbiente } from "./core/aviso-ao-site.ts";
import { registrar } from "./core/log.ts";

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

// O aviso ao site é lido aqui, na partida, e não dentro de `criarApp`: é o
// processo que serve de verdade que precisa avisar o site quando o dono muda a
// loja (dívida 93). Configuração pela metade recusa a partida, nomeando a
// variável, como a porta acima.
const avisarSite = avisoDoSiteDoAmbiente(process.env);

criarApp({ avisarSite }).listen(porta, () => {
  // A linha de partida já sai pelo registro estruturado (AC-021): quem lê a
  // saída da API por máquina não deveria encontrar uma linha em outro formato
  // logo na primeira. A porta entra como campo, não como texto interpolado.
  registrar.info("api.iniciou", { porta });
});
