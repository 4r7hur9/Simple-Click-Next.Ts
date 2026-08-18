/**
 * Blocos de esquema que mais de um domínio do contrato reaproveita.
 *
 * Mora aqui só o que já tem dois usos ou é regra do projeto inteiro. Contrato
 * de domínio que ainda não existe não é inventado neste arquivo: ele nasce no
 * arquivo do domínio, quando a rota dele nascer.
 */

import { z } from "zod";

/**
 * Código destinado à máquina: minúsculas, dígitos e sublinhado.
 *
 * É o formato de `erro` na resposta de falha. Existe como esquema, e não como
 * `z.string()` solto, porque cliente nativo faz `switch` em cima desse valor —
 * se um dia entrar `Nao Encontrado` com espaço e maiúscula, o aplicativo
 * quebra em produção e ninguém descobre no site.
 */
export const esquemaDeCodigoDeMaquina = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "código de máquina usa minúsculas, dígitos e sublinhado",
  );

/**
 * Nome de serviço, como aparece no sinal de vida da API.
 *
 * Aceita hífen porque é assim que os serviços se chamam (`simpleclick-api`),
 * e é por isso que não reaproveita o código de máquina acima.
 */
export const esquemaDeNomeDeServico = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*$/,
    "nome de serviço usa minúsculas, dígitos e hífen",
  );

/** Texto curto destinado a pessoa. O limite existe para não virar log. */
export const esquemaDeTextoCurto = z.string().min(1).max(200);

/**
 * Código de referência de um erro (AC-024).
 *
 * O cliente vê a referência, o servidor guarda o detalhe. É o que permite
 * investigar sem devolver traço de pilha nem dado pessoal para a tela (P-009).
 */
export const esquemaDeReferencia = z
  .string()
  .regex(/^ref-[0-9a-z]{4,32}$/, "referência tem a forma ref-<identificador>");
