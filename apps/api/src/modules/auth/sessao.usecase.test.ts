import { describe, expect, it } from "vitest";

import {
  iniciarSessao,
  renovarSessao,
  type AvisadorDeReusoDeSessao,
  type DependenciasDaSessao,
  type PedidoDeRotacao,
  type RepositorioDeSessoes,
  type ResultadoDaRotacaoNoRepositorio,
  type SessaoPersistida,
} from "./sessao.usecase.ts";
import {
  tokenDoCabecalhoDeAutorizacao,
  verificarTokenDeAcesso,
} from "./token.ts";

const SEGREDO_DE_ASSINATURA_DE_TESTE =
  "assinatura-de-teste-com-entropia-suficiente-para-a-suite";
const AGORA = new Date("2026-08-23T12:00:00.000Z");

interface SessaoGuardada extends SessaoPersistida {
  consumida: boolean;
  revogada: boolean;
}

/**
 * Dublê fiel da garantia que a persistência real deve fornecer em transação.
 * Ele existe para provar a regra; não é adaptador de produção.
 */
class RepositorioDeSessoesEmMemoria implements RepositorioDeSessoes {
  private readonly porResumo = new Map<string, SessaoGuardada>();

  async criar(sessao: SessaoPersistida): Promise<void> {
    this.porResumo.set(sessao.resumoDoRefresh, {
      ...sessao,
      consumida: false,
      revogada: false,
    });
  }

  async rotacionar(
    resumoApresentado: string,
    pedido: PedidoDeRotacao,
    agora: Date,
  ): Promise<ResultadoDaRotacaoNoRepositorio> {
    const anterior = this.porResumo.get(resumoApresentado);
    if (anterior === undefined) return { estado: "recusada" };

    if (anterior.consumida) {
      const familiaJaEstavaRevogada = anterior.revogada;
      for (const sessao of this.porResumo.values()) {
        if (sessao.familiaId === anterior.familiaId) sessao.revogada = true;
      }
      return {
        estado: "reuso_detectado",
        identidadeId: anterior.identidadeId,
        familiaId: anterior.familiaId,
        familiaJaEstavaRevogada,
      };
    }
    if (anterior.revogada || anterior.expiraEm <= agora) {
      return { estado: "recusada" };
    }

    anterior.consumida = true;
    const substituta: SessaoGuardada = {
      id: pedido.sessaoId,
      familiaId: anterior.familiaId,
      identidadeId: anterior.identidadeId,
      papel: anterior.papel,
      cliente: anterior.cliente,
      resumoDoRefresh: pedido.resumoDoNovoRefresh,
      criadaEm: pedido.criadaEm,
      expiraEm: pedido.expiraEm,
      consumida: false,
      revogada: false,
    };
    this.porResumo.set(substituta.resumoDoRefresh, substituta);

    return { estado: "rotacionada", anterior, substituta };
  }
}

function dependenciasDeTeste(): {
  readonly dependencias: DependenciasDaSessao;
  readonly avisos: {
    readonly identidadeId: string;
    readonly familiaId: string;
  }[];
} {
  let proximoId = 0;
  let proximoRefresh = 0;
  const avisos: { identidadeId: string; familiaId: string }[] = [];
  const avisador: AvisadorDeReusoDeSessao = {
    avisarReusoDeToken: async (dados) => {
      avisos.push(dados);
    },
  };

  return {
    avisos,
    dependencias: {
      repositorio: new RepositorioDeSessoesEmMemoria(),
      avisador,
      segredoDeAssinatura: SEGREDO_DE_ASSINATURA_DE_TESTE,
      agora: () => AGORA,
      gerarIdentificador: () => `sessao-${++proximoId}`,
      gerarRefresh: () => `refresh-${++proximoRefresh}`,
    },
  };
}

describe("rotação de refresh", () => {
  it("@spec:AC-110 renovação troca o par, reuso revoga a família e envia um aviso", async () => {
    const { dependencias, avisos } = dependenciasDeTeste();
    const inicial = await iniciarSessao(
      { identidadeId: "identidade-ana", papel: "OWNER", cliente: "navegador" },
      dependencias,
    );
    expect(inicial.destino).toBe("navegador");

    const renovada = await renovarSessao(
      inicial.tokenDeRenovacao,
      dependencias,
    );
    expect(renovada.estado).toBe("renovada");
    if (renovada.estado !== "renovada") return;
    expect(renovada.sessao.tokenDeRenovacao).not.toBe(inicial.tokenDeRenovacao);
    expect(renovada.sessao.tokenDeAcesso).not.toBe(inicial.tokenDeAcesso);

    const reuso = await renovarSessao(inicial.tokenDeRenovacao, dependencias);
    expect(reuso).toEqual({ estado: "reuso_detectado" });
    expect(avisos).toEqual([
      { identidadeId: "identidade-ana", familiaId: "sessao-1" },
    ]);

    const depoisDaRevogacao = await renovarSessao(
      renovada.sessao.tokenDeRenovacao,
      dependencias,
    );
    expect(depoisDaRevogacao).toEqual({ estado: "recusada" });
  });
});

describe("sessão nativa", () => {
  it("@spec:AC-111 cliente nativo recebe o par no corpo e usa o acesso como Bearer na mesma API", async () => {
    const { dependencias } = dependenciasDeTeste();
    const sessao = await iniciarSessao(
      { identidadeId: "identidade-bia", papel: "CUSTOMER", cliente: "nativo" },
      dependencias,
    );

    expect(sessao.destino).toBe("nativo");
    expect(sessao.tokenDeAcesso).not.toBe("");
    expect(sessao.tokenDeRenovacao).not.toBe("");

    const bearer = tokenDoCabecalhoDeAutorizacao(
      `Bearer ${sessao.tokenDeAcesso}`,
    );
    expect(
      verificarTokenDeAcesso(
        bearer ?? "",
        SEGREDO_DE_ASSINATURA_DE_TESTE,
        AGORA,
      ),
    ).toMatchObject({
      identidadeId: "identidade-bia",
      papel: "CUSTOMER",
    });
  });
});
