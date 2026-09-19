import { describe, expect, it, vi } from "vitest";

import { esquemaDeCadastroDeCliente } from "../../apps/api/src/modules/auth/auth.schema.ts";
import {
  cadastrarClienteFinal,
  type AvisosDeCadastro,
  type NovaIdentidade,
  type RepositorioDeIdentidades,
} from "../../apps/api/src/modules/auth/register.usecase.ts";

describe("cadastro", () => {
  it("@spec:AC-100 cadastro válido confirma a conta pendente e não libera acesso", async () => {
    const identidadesCriadas: NovaIdentidade[] = [];
    const verificacoes: { email: string; nome: string }[] = [];
    const identidades: RepositorioDeIdentidades = {
      criarSeAusente: vi.fn(async (identidade) => {
        identidadesCriadas.push(identidade);
        return { criada: true };
      }),
    };
    const avisos: AvisosDeCadastro = {
      enviarVerificacao: vi.fn(async (dados) => {
        verificacoes.push(dados);
      }),
      enviarAvisoDeCadastroExistente: vi.fn(),
    };

    const resposta = await cadastrarClienteFinal(
      esquemaDeCadastroDeCliente.parse({
        nome: "Ana Souza",
        email: "ana@exemplo.com",
        telefone: "+5511912345678",
        senha: "Cacto azul sob a lua 2026!",
      }),
      { identidades, avisos },
    );

    expect(resposta).toEqual({
      cadastrado: true,
      mensagem:
        "Seus dados foram recebidos. Enviamos instruções para confirmar seu e-mail.",
      verificacaoDeEmailPendente: true,
    });
    expect(identidadesCriadas).toHaveLength(1);
    expect(identidadesCriadas[0]?.emailVerificadoEm).toBeNull();
    expect(verificacoes).toEqual([
      { email: "ana@exemplo.com", nome: "Ana Souza" },
    ]);
  });
});
