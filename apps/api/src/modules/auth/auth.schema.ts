/**
 * Forma do cadastro na borda da API (P-007).
 *
 * A política de senha vive em `senha.ts`: ela precisa devolver todos os
 * motivos legíveis de uma vez, enquanto este esquema só confirma a forma dos
 * campos antes de o domínio ser chamado.
 */
import { z } from "zod";

/** Cadastro de cliente final recebido por `POST /v1/auth/register`. */
export const esquemaDeCadastroDeCliente = z.strictObject({
  nome: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(120, "Nome muito longo."),
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  telefone: z
    .string()
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Informe o telefone com código do país, por exemplo +5511912345678.",
    ),
  // Não aplicar trim: espaços podem ser parte de uma senha escolhida pela
  // pessoa e alterá-los aqui criaria uma credencial diferente da digitada.
  senha: z.string().min(1, "Informe uma senha."),
});

export type CadastroDeCliente = z.infer<typeof esquemaDeCadastroDeCliente>;
