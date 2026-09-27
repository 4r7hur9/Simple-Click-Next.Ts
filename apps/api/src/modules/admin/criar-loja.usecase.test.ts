import {
  esquemaDaNovaLoja,
  type NovaLojaEnviada,
} from "@simpleclick/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  cadastrarLoja,
  ErroDeApelidoEmUso,
  PRAZO_DO_CONVITE_EM_MS,
  variacoesDoApelido,
  type DependenciasDoCadastro,
  type LojaParaGravar,
  type RepositorioDoCadastro,
} from "./criar-loja.usecase.ts";
import { ASSUNTO_DO_CONVITE, montarEmailDoConvite } from "./convite-do-dono.ts";

const AGORA = new Date("2026-09-26T15:00:00.000Z");
const ADMINISTRADOR = "0f0e0d0c-0b0a-4009-8008-070605040302";

const CADASTRO: NovaLojaEnviada = {
  nome: "Pastel da Joi",
  razaoSocial: null,
  documento: "529.982.247-25",
  responsavel: {
    nome: "Joice Almeida",
    email: "Joice@Exemplo.test",
    telefone: "(11) 98888-7777",
  },
  endereco: {
    cep: "01310-100",
    logradouro: "Avenida Paulista",
    numero: "1000",
    complemento: null,
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "sp",
  },
  tipoDeNegocio: "FOOD_SNACK",
  apelido: "Pastel-da-Joi",
};

/** O cadastro como a borda o entrega ao caso de uso: validado e normalizado. */
const VALIDADO = esquemaDaNovaLoja.parse(CADASTRO);

/** Banco de mentira com o comportamento que importa: apelido ocupado ou não. */
function repositorio(ocupados: readonly string[] = []) {
  const gravadas: LojaParaGravar[] = [];
  const repo: RepositorioDoCadastro = {
    tipoDeNegocioExiste: vi.fn(async (codigo: string) =>
      ["FOOD_SNACK", "APPAREL"].includes(codigo),
    ),
    apelidosOcupados: vi.fn(
      async (candidatos: readonly string[]) =>
        new Set(candidatos.filter((c) => ocupados.includes(c))),
    ),
    gravarLoja: vi.fn(async (loja: LojaParaGravar) => {
      gravadas.push(loja);
      return {
        id: "loja-nova",
        codigo: "0002",
        apelido: loja.dados.apelido,
        status: "ACTIVE" as const,
      };
    }),
  };
  return { repo, gravadas };
}

function dependencias(
  repo: RepositorioDoCadastro,
  sobrescrita: Partial<DependenciasDoCadastro> = {},
): DependenciasDoCadastro {
  return {
    executar: (trabalho) => trabalho(repo),
    enviarConvite: vi.fn().mockResolvedValue(undefined),
    gerarToken: () => "token-do-convite-em-claro",
    resumirToken: (token) => `resumo(${token})`,
    agora: () => AGORA,
    ...sobrescrita,
  };
}

describe("cadastro de loja pela administração", () => {
  it("@spec:AC-200 cadastro completo grava a loja com o dono convidado e envia o convite para definir a senha", async () => {
    const { repo, gravadas } = repositorio();
    const deps = dependencias(repo);

    const resultado = await cadastrarLoja(VALIDADO, ADMINISTRADOR, deps);

    expect(resultado).toEqual({
      ok: true,
      loja: {
        id: "loja-nova",
        codigo: "0002",
        apelido: "pastel-da-joi",
        status: "ACTIVE",
      },
      conviteEnviado: true,
    });

    // O banco recebe o RESUMO do token, nunca o token.
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0]?.convite).toEqual({
      resumoDoToken: "resumo(token-do-convite-em-claro)",
      expiraEm: new Date(AGORA.getTime() + PRAZO_DO_CONVITE_EM_MS),
    });
    expect(gravadas[0]?.criadaPor).toBe(ADMINISTRADOR);
    // Documento só com dígitos, e-mail normalizado, telefone internacional.
    expect(gravadas[0]?.dados.documento).toBe("52998224725");
    expect(gravadas[0]?.dados.responsavel.email).toBe("joice@exemplo.test");
    expect(gravadas[0]?.dados.responsavel.telefone).toBe("+5511988887777");

    // O e-mail leva o token em claro, e só ele.
    expect(deps.enviarConvite).toHaveBeenCalledWith({
      para: "joice@exemplo.test",
      nome: "Joice Almeida",
      nomeDaLoja: "Pastel da Joi",
      token: "token-do-convite-em-claro",
      expiraEm: new Date(AGORA.getTime() + PRAZO_DO_CONVITE_EM_MS),
    });
  });

  it("@spec:AC-200 o convite só sai depois que a loja foi gravada, e a falha do e-mail não desfaz a loja", async () => {
    const ordem: string[] = [];
    const { repo } = repositorio();
    const deps = dependencias(repo, {
      executar: async (trabalho) => {
        ordem.push("abriu");
        const resultado = await trabalho(repo);
        ordem.push("gravou");
        return resultado;
      },
      enviarConvite: vi.fn(async () => {
        ordem.push("enviou");
        throw new Error("serviço de e-mail fora do ar");
      }),
      avisarConviteNaoEnviado: vi.fn(),
    });

    const resultado = await cadastrarLoja(VALIDADO, ADMINISTRADOR, deps);

    expect(ordem).toEqual(["abriu", "gravou", "enviou"]);
    expect(resultado).toMatchObject({ ok: true, conviteEnviado: false });
    expect(deps.avisarConviteNaoEnviado).toHaveBeenCalledWith(
      "loja-nova",
      expect.any(Error),
    );
  });

  it("@spec:AC-200 a mensagem do convite leva ao link de definir a primeira senha", () => {
    const mensagem = montarEmailDoConvite(
      {
        para: "joice@exemplo.test",
        nome: "Joice Almeida",
        nomeDaLoja: "Pastel da Joi",
        token: "abc_DEF-123",
        expiraEm: new Date("2026-10-03T15:00:00.000Z"),
      },
      "https://simpleclick.localhost/",
    );

    expect(mensagem.destinatario).toBe("joice@exemplo.test");
    expect(mensagem.assunto).toBe(ASSUNTO_DO_CONVITE);
    expect(mensagem.corpo).toContain(
      "https://simpleclick.localhost/definir-senha?convite=true&token=abc_DEF-123",
    );
    expect(mensagem.corpo).toContain("03/10/2026");
  });

  it("@spec:AC-201 apelido repetido é recusado com uma variação livre sugerida, e nada é gravado nem enviado", async () => {
    const { repo, gravadas } = repositorio([
      "pastel-da-joi",
      "pastel-da-joi-2",
    ]);
    const deps = dependencias(repo);

    const resultado = await cadastrarLoja(VALIDADO, ADMINISTRADOR, deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "APELIDO_EM_USO",
      sugestao: "pastel-da-joi-3",
    });
    expect(gravadas).toHaveLength(0);
    expect(deps.enviarConvite).not.toHaveBeenCalled();
  });

  it("@spec:AC-201 apelido tomado no meio do cadastro por outro cadastro simultâneo também vira recusa com sugestão", async () => {
    const { repo } = repositorio();
    repo.gravarLoja = vi.fn(async () => {
      throw new ErroDeApelidoEmUso();
    });
    const deps = dependencias(repo);

    const resultado = await cadastrarLoja(VALIDADO, ADMINISTRADOR, deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "APELIDO_EM_USO",
      sugestao: "pastel-da-joi-2",
    });
    expect(deps.enviarConvite).not.toHaveBeenCalled();
  });

  it("@spec:AC-201 a variação sugerida cabe no limite de um endereço, mesmo com apelido no tamanho máximo", () => {
    const longo = "a".repeat(63);
    const [primeira] = variacoesDoApelido(longo, 1);

    expect(primeira).toHaveLength(63);
    expect(primeira?.endsWith("-2")).toBe(true);
  });

  it("tipo de negócio que não existe é recusado sem gravar", async () => {
    const { repo, gravadas } = repositorio();
    const deps = dependencias(repo);

    const resultado = await cadastrarLoja(
      { ...VALIDADO, tipoDeNegocio: "NAVE_ESPACIAL" },
      ADMINISTRADOR,
      deps,
    );

    expect(resultado).toEqual({ ok: false, motivo: "TIPO_DESCONHECIDO" });
    expect(gravadas).toHaveLength(0);
  });
});
