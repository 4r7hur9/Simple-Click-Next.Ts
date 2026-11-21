import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { definirRota, ROTAS_DO_CONTRATO } from "@simpleclick/contracts";
import {
  CAMINHO_PUBLICADO,
  compararComPublicado,
  explicar,
  gerarDocumento,
  lerPublicado,
  serializar,
  type ObjetoJson,
} from "./gerar.ts";
import { esquemaPublicadoDaResposta } from "../../tests/apoio-do-contrato.ts";

const executar = promisify(execFile);

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const GERADOR = join(RAIZ, "apps/api/src/contracts/gerar.ts");

let pasta: string;

beforeAll(async () => {
  pasta = await mkdtemp(join(tmpdir(), "sc-contrato-"));
});

afterAll(async () => {
  await rm(pasta, { recursive: true, force: true });
});

/** Roda o gerador como o portão roda, devolvendo saída e código de saída. */
async function rodarGerador(
  argumentos: readonly string[],
): Promise<{ saida: string; codigoDeSaida: number }> {
  try {
    const { stdout } = await executar(
      process.execPath,
      [GERADOR, ...argumentos],
      {
        cwd: RAIZ,
      },
    );
    return { saida: stdout, codigoDeSaida: 0 };
  } catch (erro) {
    const falha = erro as { code?: number; stdout?: string };
    return { saida: falha.stdout ?? "", codigoDeSaida: falha.code ?? 1 };
  }
}

describe("documento de contrato publicado", () => {
  it("@spec:AC-007 o arquivo versionado é exatamente o que o código produz hoje", async () => {
    const publicado = await lerPublicado(CAMINHO_PUBLICADO);
    const comparacao = compararComPublicado(gerarDocumento(), publicado);

    // Se este teste reprovar, o conserto é regravar o documento — nunca
    // afrouxar a comparação.
    expect(explicar(comparacao, CAMINHO_PUBLICADO)).toContain("em dia");
    expect(comparacao.emDia).toBe(true);
  });

  it("@spec:AC-007 o documento é OpenAPI 3.1 e descreve saúde e erro", () => {
    const documento = gerarDocumento();
    const caminhos = documento["paths"] as ObjetoJson;
    const componentes = documento["components"] as ObjetoJson;
    const esquemas = componentes["schemas"] as ObjetoJson;

    expect(documento["openapi"]).toMatch(/^3\.1\./);
    // As duas listas são INVENTÁRIO, e mudam por decisão: rota ou esquema novo
    // no documento é promessa nova ao aplicativo nativo, e passar por aqui é o
    // momento em que alguém confere que a promessa é intencional.
    expect(Object.keys(caminhos)).toEqual([
      "/",
      "/v1/auth/aplicativo/codigos-de-recuperacao",
      "/v1/auth/aplicativo/confirmar",
      "/v1/auth/aplicativo/preparar",
      "/v1/auth/cadastro",
      "/v1/auth/convite/aceitar",
      "/v1/auth/email/reenviar",
      "/v1/auth/email/verificar",
      "/v1/auth/login",
      "/v1/auth/lojas",
      "/v1/auth/renovar",
      "/v1/auth/segundo-fator",
      "/v1/auth/segundo-fator/recuperacao",
      "/v1/auth/senha/esqueci",
      "/v1/auth/senha/redefinir",
      "/v1/auth/sessoes/atual/encerrar",
      "/v1/auth/sessoes/encerrar-todas",
      "/v1/conta/comentarios/{comentarioId}",
      "/v1/conta/favoritos",
      "/v1/conta/favoritos/{apelido}",
      "/v1/conta/recentes",
      "/v1/conta/recentes/{apelido}",
      "/v1/eu",
      "/v1/feed/comentarios/{comentarioId}/denuncia",
      "/v1/feed/favoritos",
      "/v1/feed/favoritos/produtos/{produtoId}",
      "/v1/feed/lojas",
      "/v1/feed/lojas/{apelido}/comentarios",
      "/v1/feed/lojas/{apelido}/curtida",
      "/v1/feed/produtos",
      "/v1/feed/produtos/{produtoId}/comentarios",
      "/v1/feed/produtos/{produtoId}/curtida",
      "/v1/feed/recentes",
      "/v1/lojas/{apelido}/catalogo/produtos/{produtoId}/midias",
      "/v1/lojas/{apelido}/catalogo/produtos/{produtoId}/midias/ordem",
      "/v1/lojas/{apelido}/catalogo/produtos/{produtoId}/videos",
      "/v1/lojas/{apelido}/catalogo/produtos/{produtoId}/videos/{videoId}",
      "/v1/lojas/{apelido}/catalogo/produtos/{produtoId}/videos/{videoId}/capa",
      "/v1/lojas/{apelido}/comentarios",
      "/v1/lojas/{apelido}/comentarios/{comentarioId}",
      "/v1/lojas/{apelido}/comentarios/{comentarioId}/aprovar",
      "/v1/lojas/{apelido}/comentarios/{comentarioId}/bloquear-autor",
      "/v1/lojas/{apelido}/comentarios/{comentarioId}/recusar",
      "/v1/lojas/{apelido}/comentarios/bloqueios",
      "/v1/lojas/{apelido}/comentarios/bloqueios/{bloqueioId}",
      "/v1/lojas/{apelido}/comentarios/configuracao",
      "/v1/lojas/{apelido}/comentarios/contagem",
      "/v1/lojas/{apelido}/stories",
      "/v1/lojas/{apelido}/stories/{storyId}",
      "/v1/midia/limites",
      "/v1/stories",
      "/v1/stories/{storyId}/visto",
      "/v1/tipos-de-negocio",
      "/v1/vitrine/{apelido}",
      "/v1/vitrine/{apelido}/carrinho",
      "/v1/vitrine/{apelido}/carrinho/conferencia",
      "/v1/vitrine/{apelido}/carrinho/itens",
      "/v1/vitrine/{apelido}/carrinho/itens/{itemId}",
      "/v1/vitrine/{apelido}/catalogo",
      "/v1/vitrine/{apelido}/catalogo/produtos",
      "/v1/vitrine/{apelido}/catalogo/resumo",
      "/v1/vitrine/{apelido}/fechamento",
      "/v1/vitrine/{apelido}/pedido/{token}",
      "/v1/vitrine/{apelido}/pedidos",
      "/v1/vitrine/{apelido}/produto/{produtoId}",
    ]);
    expect(Object.keys(esquemas).sort()).toEqual([
      "Abertura",
      "Acompanhamento",
      "Carrinho",
      "ChavePix",
      "ComentarioDaLoja",
      "ComentarioPublico",
      "Conferencia",
      "ContatoDoPedido",
      "Curtida",
      "DeclaracaoDaTela",
      "EnderecoDaLoja",
      "EntregaDaLoja",
      "Erro",
      "ErroComEnvelope",
      "ErroDeEntradaInvalida",
      "ErroDeEntradaRecusada",
      "Eu",
      "Fechamento",
      "GrupoDeEscolha",
      "IdentificacaoDaApi",
      "ImagemDoProduto",
      "ItemConferido",
      "ItemDoCarrinho",
      "ItemParaAcrescentar",
      "LojaComStories",
      "LojaDaSessao",
      "LojaDoFeed",
      "LojaPublica",
      "LojasDoFeed",
      "MidiaPublica",
      "MudancaNoCarrinho",
      "Opcao",
      "OpcaoNoCarrinho",
      "PedidoCriado",
      "PedidoParaCriar",
      "PerfilDaLoja",
      "Produto",
      "ProdutoDoFeed",
      "ProdutosDoFeed",
      "ResultadoDoLogin",
      "ResultadoDoSegundoFator",
      "ResumoSocial",
      "RotulosDoRamo",
      "SessaoAberta",
      "StoryPublico",
      "TemaDaLoja",
      "Variacao",
      "Vitrine",
    ]);
    // Toda rota descreve o erro pela mesma referência: cliente nativo gera um
    // tipo de erro, não um por rota.
    expect(JSON.stringify(caminhos)).toContain("#/components/schemas/Erro");
  });

  it("[CA-1] o 400 publicado aceita toda resposta 400 que a API escreve, e recusa corpo sem código", () => {
    // Os corpos são os que as rotas devolvem de verdade (card #137): a borda
    // de validação, o 400 escrito à mão de POST /v1/auth/lojas
    // (auth.routes.ts), o da importação sem `campos` (importacao.routes.ts),
    // os com detalhe próprio (metricas.routes.ts, especificacoes.routes.ts) e
    // o envelope do manipulador global.
    const corposReais = [
      {
        erro: "entrada_invalida",
        campos: [{ onde: "body", caminho: "nome", mensagem: "obrigatório" }],
      },
      {
        erro: "tipo_desconhecido",
        campos: [
          {
            onde: "body",
            caminho: "tipoDeNegocio",
            mensagem: "Escolha um tipo de negócio da lista.",
          },
        ],
      },
      { erro: "entrada_invalida" },
      { erro: "periodo_invalido", explicacao: "o fim vem antes do início" },
      { erro: "imagem_invalida", mensagem: "formato não aceito" },
      {
        erro: "especificacao_invalida",
        problemas: [{ campo: "valor", mensagem: "obrigatório" }],
      },
      {
        erro: {
          codigo: "entrada_invalida",
          mensagem: "Entrada inválida.",
          referencia: "ref-1",
        },
      },
    ];
    const caminhos = gerarDocumento()["paths"] as ObjetoJson;
    const comQuatrocentos = Object.entries(caminhos).flatMap(([caminho, operacoes]) =>
      Object.entries(operacoes as ObjetoJson)
        .filter(([, operacao]) => {
          const respostas = (operacao as ObjetoJson)["responses"] as ObjetoJson;
          return respostas["400"] !== undefined;
        })
        .map(([metodo]) => ({ caminho, metodo })),
    );
    expect(comQuatrocentos.length).toBeGreaterThan(0);
    expect(comQuatrocentos).toContainEqual({ caminho: "/v1/auth/lojas", metodo: "post" });

    for (const { caminho, metodo } of comQuatrocentos) {
      const esquema = esquemaPublicadoDaResposta(caminho, metodo, 400);
      for (const corpo of corposReais) {
        expect(esquema.safeParse(corpo).success, `${metodo} ${caminho}: ${JSON.stringify(corpo)}`).toBe(true);
      }
      // Continua sendo contrato: sem o código de máquina não passa.
      expect(esquema.safeParse({ campos: [] }).success).toBe(false);
      expect(esquema.safeParse({ erro: 42 }).success).toBe(false);
    }
  });

  it("@spec:AC-007 gerar duas vezes dá o mesmo texto, byte a byte", () => {
    // Sem isso a etapa do portão reprovaria por ordem de chave ou por carimbo
    // de tempo, e todo mundo aprenderia a ignorá-la.
    expect(serializar(gerarDocumento())).toBe(serializar(gerarDocumento()));
  });

  it("@spec:AC-007 rota nova no código sem regravar o documento reprova, nomeando a rota", async () => {
    const rotaNova = definirRota({
      metodo: "get",
      caminho: "/v1/store/orders",
      etiqueta: "saude",
      resumo: "Rota que ninguém publicou ainda",
      resposta: z.object({ total: z.number().int() }),
    });

    const comComRotaNova = gerarDocumento([...ROTAS_DO_CONTRATO, rotaNova]);
    const comparacao = compararComPublicado(
      comComRotaNova,
      await lerPublicado(CAMINHO_PUBLICADO),
    );

    expect(comparacao.emDia).toBe(false);
    expect(comparacao.motivo).toBe("divergente");
    const explicacao = explicar(comparacao, CAMINHO_PUBLICADO);
    expect(explicacao).toContain("paths./v1/store/orders");
    expect(explicacao).toContain("contrato:escrever");
  });

  it("@spec:AC-007 campo removido do documento publicado reprova, nomeando o campo", async () => {
    const publicado = JSON.parse(
      (await lerPublicado(CAMINHO_PUBLICADO)) ?? "{}",
    ) as ObjetoJson;
    const esquemas = (publicado["components"] as ObjetoJson)[
      "schemas"
    ] as ObjetoJson;
    const identificacao = esquemas["IdentificacaoDaApi"] as ObjetoJson;
    delete (identificacao["properties"] as ObjetoJson)["status"];

    const comparacao = compararComPublicado(
      gerarDocumento(),
      `${JSON.stringify(publicado, null, 2)}\n`,
    );

    expect(comparacao.emDia).toBe(false);
    const onde = comparacao.divergencias.map((d) => d.onde);
    expect(onde).toContain(
      "components.schemas.IdentificacaoDaApi.properties.status",
    );
    expect(explicar(comparacao, CAMINHO_PUBLICADO)).toContain("(ausente)");
  });

  it("@spec:AC-007 documento equivalente mas fora do formato de gravação também reprova", async () => {
    const publicado = JSON.parse(
      (await lerPublicado(CAMINHO_PUBLICADO)) ?? "{}",
    ) as ObjetoJson;

    // Mesmo conteúdo, outro recuo. Sem esta reprovação, o próximo `escrever`
    // mudaria o arquivo sem que nada tivesse mudado no contrato — e a
    // diferença apareceria no registro de alguém que não mexeu em contrato.
    const comparacao = compararComPublicado(
      gerarDocumento(),
      JSON.stringify(publicado),
    );

    expect(comparacao.emDia).toBe(false);
    expect(comparacao.motivo).toBe("formato");
    expect(explicar(comparacao, CAMINHO_PUBLICADO)).toContain("formato");
  });

  it("@spec:AC-007 documento ausente reprova dizendo que ele não existe", () => {
    const comparacao = compararComPublicado(gerarDocumento(), null);

    expect(comparacao.emDia).toBe(false);
    expect(comparacao.motivo).toBe("ausente");
  });
});

describe("etapa do portão de qualidade", () => {
  it("@spec:AC-007 a verificação por linha de comando passa com o documento em dia", async () => {
    const { saida, codigoDeSaida } = await rodarGerador(["verificar"]);

    expect(codigoDeSaida).toBe(0);
    expect(saida).toContain("em dia");
  }, 60000);

  it("@spec:AC-007 a verificação SAI COM ERRO quando o documento publicado diverge", async () => {
    const adulterado = join(pasta, "openapi-adulterado.json");
    const documento = JSON.parse(
      (await lerPublicado(CAMINHO_PUBLICADO)) ?? "{}",
    ) as ObjetoJson;
    const caminhos = documento["paths"] as ObjetoJson;
    const raiz = caminhos["/"] as ObjetoJson;
    const get = raiz["get"] as ObjetoJson;
    get["summary"] = "resumo que ninguém escreveu no código";
    await writeFile(adulterado, `${JSON.stringify(documento, null, 2)}\n`);

    const { saida, codigoDeSaida } = await rodarGerador([
      "verificar",
      "--arquivo",
      adulterado,
    ]);

    // É isto que faz a mudança não passar: o comando do portão sai diferente
    // de zero e a etapa reprova.
    expect(codigoDeSaida).toBe(1);
    expect(saida).toContain("paths./.get.summary");
    expect(saida).toContain("resumo que ninguém escreveu no código");
  }, 60000);

  it("@spec:AC-007 gravar o documento devolve o arquivo ao estado em dia", async () => {
    const destino = join(pasta, "openapi-regravado.json");
    await writeFile(destino, "{}\n");

    const gravacao = await rodarGerador(["escrever", "--arquivo", destino]);
    const conferencia = await rodarGerador(["verificar", "--arquivo", destino]);

    expect(gravacao.codigoDeSaida).toBe(0);
    expect(conferencia.codigoDeSaida).toBe(0);
    expect(await readFile(destino, "utf8")).toBe(
      await readFile(CAMINHO_PUBLICADO, "utf8"),
    );
  }, 60000);
});
