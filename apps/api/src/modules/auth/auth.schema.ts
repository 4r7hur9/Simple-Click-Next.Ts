/**
 * Formas da entrada das rotas de identidade na borda da API (P-007).
 *
 * A fonte é o contrato compartilhado (`@simpleclick/contracts`): o mesmo
 * esquema valida a requisição aqui e descreve a rota no documento publicado.
 * A política de senha vive em `senha.ts`, porque precisa devolver todos os
 * motivos legíveis de uma vez; o esquema só confirma a forma dos campos.
 */
import { esquemaDoCadastro } from "@simpleclick/contracts";
import type { z } from "zod";

/** Cadastro de cliente final recebido por `POST /v1/auth/cadastro`. */
export const esquemaDeCadastroDeCliente = esquemaDoCadastro;

export type CadastroDeCliente = z.infer<typeof esquemaDeCadastroDeCliente>;
