import { describe, expect, it } from "vitest";
import {
  CODIGO_NAO_ENCONTRADO,
  ERROS_DE_TODA_ROTA,
  ESQUEMAS_DO_CONTRATO,
  ETIQUETAS_DO_CONTRATO,
  ROTAS_DO_CONTRATO,
  esquemaDeErro,
  esquemaDeIdentificacaoDaApi,
  rotaDeIdentificacao,
} from "./index.ts";

describe("contrato compartilhado", () => {
  it("@spec:AC-006 declara só as rotas que a API serve hoje", () => {
    // Contrato de domínio que ainda não existe não entra: documento que promete
    // rota inexistente faz o aplicativo nativo nascer chamando o vazio.
    expect(
      ROTAS_DO_CONTRATO.map(
        (rota) => `${rota.metodo} ${rota.caminhoDoDocumento}`,
      ),
    ).toEqual([
      "get /",
      "post /v1/auth/aplicativo/codigos-de-recuperacao",
      "post /v1/auth/aplicativo/confirmar",
      "post /v1/auth/aplicativo/preparar",
      "post /v1/auth/cadastro",
      "post /v1/auth/convite/aceitar",
      "post /v1/auth/email/reenviar",
      "post /v1/auth/email/verificar",
      "post /v1/auth/login",
      "post /v1/auth/lojas",
      "post /v1/auth/renovar",
      "post /v1/auth/segundo-fator",
      "post /v1/auth/segundo-fator/recuperacao",
      "post /v1/auth/senha/esqueci",
      "post /v1/auth/senha/redefinir",
      "post /v1/auth/sessoes/atual/encerrar",
      "post /v1/auth/sessoes/encerrar-todas",
      "delete /v1/conta/comentarios/{comentarioId}",
      "get /v1/conta/favoritos",
      "post /v1/conta/favoritos/{apelido}",
      "delete /v1/conta/favoritos/{apelido}",
      "get /v1/conta/recentes",
      "post /v1/conta/recentes/{apelido}",
      "get /v1/eu",
      "post /v1/feed/comentarios/{comentarioId}/denuncia",
      "get /v1/feed/favoritos",
      "post /v1/feed/favoritos/produtos/{produtoId}",
      "delete /v1/feed/favoritos/produtos/{produtoId}",
      "get /v1/feed/lojas",
      "get /v1/feed/lojas/{apelido}/comentarios",
      "post /v1/feed/lojas/{apelido}/comentarios",
      "post /v1/feed/lojas/{apelido}/curtida",
      "delete /v1/feed/lojas/{apelido}/curtida",
      "get /v1/feed/produtos",
      "get /v1/feed/produtos/{produtoId}/comentarios",
      "post /v1/feed/produtos/{produtoId}/comentarios",
      "post /v1/feed/produtos/{produtoId}/curtida",
      "delete /v1/feed/produtos/{produtoId}/curtida",
      "get /v1/feed/recentes",
      "get /v1/lojas/{apelido}/catalogo/produtos/{produtoId}/midias",
      "put /v1/lojas/{apelido}/catalogo/produtos/{produtoId}/midias/ordem",
      "post /v1/lojas/{apelido}/catalogo/produtos/{produtoId}/videos",
      "delete /v1/lojas/{apelido}/catalogo/produtos/{produtoId}/videos/{videoId}",
      "post /v1/lojas/{apelido}/catalogo/produtos/{produtoId}/videos/{videoId}/capa",
      "get /v1/lojas/{apelido}/comentarios",
      "delete /v1/lojas/{apelido}/comentarios/{comentarioId}",
      "post /v1/lojas/{apelido}/comentarios/{comentarioId}/aprovar",
      "post /v1/lojas/{apelido}/comentarios/{comentarioId}/bloquear-autor",
      "post /v1/lojas/{apelido}/comentarios/{comentarioId}/recusar",
      "get /v1/lojas/{apelido}/comentarios/bloqueios",
      "delete /v1/lojas/{apelido}/comentarios/bloqueios/{bloqueioId}",
      "get /v1/lojas/{apelido}/comentarios/configuracao",
      "put /v1/lojas/{apelido}/comentarios/configuracao",
      "get /v1/lojas/{apelido}/comentarios/contagem",
      "get /v1/lojas/{apelido}/stories",
      "post /v1/lojas/{apelido}/stories",
      "delete /v1/lojas/{apelido}/stories/{storyId}",
      "get /v1/midia/limites",
      "get /v1/stories",
      "post /v1/stories/{storyId}/visto",
      "get /v1/tipos-de-negocio",
      "get /v1/vitrine/{apelido}",
      "get /v1/vitrine/{apelido}/carrinho",
      "post /v1/vitrine/{apelido}/carrinho/conferencia",
      "post /v1/vitrine/{apelido}/carrinho/itens",
      "patch /v1/vitrine/{apelido}/carrinho/itens/{itemId}",
      "delete /v1/vitrine/{apelido}/carrinho/itens/{itemId}",
      "get /v1/vitrine/{apelido}/catalogo",
      "get /v1/vitrine/{apelido}/catalogo/produtos",
      "get /v1/vitrine/{apelido}/catalogo/resumo",
      "get /v1/vitrine/{apelido}/fechamento",
      "get /v1/vitrine/{apelido}/pedido/{token}",
      "post /v1/vitrine/{apelido}/pedidos",
      "get /v1/vitrine/{apelido}/produto/{produtoId}",
    ]);
  });

  it("@spec:AC-006 o sinal de vida tem uma forma só, e ela é estrita", () => {
    expect(
      esquemaDeIdentificacaoDaApi.parse({
        servico: "simpleclick-api",
        status: "viva",
      }),
    ).toEqual({ servico: "simpleclick-api", status: "viva" });

    // Campo a mais é divergência entre o que a API devolve e o que o contrato
    // promete — e divergência silenciosa é o que esta tarefa existe para
    // impedir.
    expect(
      esquemaDeIdentificacaoDaApi.safeParse({
        servico: "simpleclick-api",
        status: "viva",
        versaoInterna: "3",
      }).success,
    ).toBe(false);

    expect(
      esquemaDeIdentificacaoDaApi.safeParse({
        servico: "simpleclick-api",
        status: "morta",
      }).success,
    ).toBe(false);
  });

  it("@spec:AC-006 o erro tem código de máquina, e recusa código fora do formato", () => {
    expect(esquemaDeErro.parse({ erro: CODIGO_NAO_ENCONTRADO })).toEqual({
      erro: CODIGO_NAO_ENCONTRADO,
    });
    expect(
      esquemaDeErro.parse({
        erro: "limite_excedido",
        mensagem: "tente de novo em um minuto",
        referencia: "ref-7f3a",
      }).referencia,
    ).toBe("ref-7f3a");

    // Cliente nativo faz `switch` em cima do código: espaço e maiúscula
    // quebrariam o aplicativo, não o site.
    expect(esquemaDeErro.safeParse({ erro: "Não Encontrado" }).success).toBe(
      false,
    );
    // Detalhe interno não viaja no corpo de erro (AC-024, P-009).
    expect(
      esquemaDeErro.safeParse({
        erro: "falha",
        pilha: "at Object.<anonymous> (/app/src/db.ts:12)",
      }).success,
    ).toBe(false);
  });

  it("@spec:AC-007 toda rota do catálogo tem etiqueta descrita e resposta declarada", () => {
    for (const rota of ROTAS_DO_CONTRATO) {
      expect(ETIQUETAS_DO_CONTRATO[rota.etiqueta]).toBeTypeOf("string");
      expect(rota.resposta).toBeDefined();
      expect(rota.resumo.length).toBeGreaterThan(0);
    }
    expect(ERROS_DE_TODA_ROTA).toContain(404);
  });

  it("@spec:AC-007 os esquemas publicados com nome são os mesmos objetos usados pelas rotas", () => {
    // Se fossem cópias, o documento descreveria uma coisa e a validação faria
    // outra — as duas verdades que a decisão de 17/08 existe para evitar.
    expect(ESQUEMAS_DO_CONTRATO["IdentificacaoDaApi"]).toBe(
      esquemaDeIdentificacaoDaApi,
    );
    expect(ESQUEMAS_DO_CONTRATO["Erro"]).toBe(esquemaDeErro);
    expect(ROTAS_DO_CONTRATO[0]?.resposta).toBe(rotaDeIdentificacao.resposta);
  });
});
