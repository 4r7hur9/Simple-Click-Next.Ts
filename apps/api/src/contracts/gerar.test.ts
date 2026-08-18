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

const executar = promisify(execFile);

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const GERADOR = join(RAIZ, "apps/api/src/contracts/gerar.ts");
const PORTAO = join(RAIZ, "infra/scripts/verificar.sh");

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
    expect(Object.keys(caminhos)).toEqual(["/"]);
    expect(Object.keys(esquemas).sort()).toEqual([
      "Erro",
      "IdentificacaoDaApi",
    ]);
    // Toda rota descreve o erro pela mesma referência: cliente nativo gera um
    // tipo de erro, não um por rota.
    expect(JSON.stringify(caminhos)).toContain("#/components/schemas/Erro");
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

  it("@spec:AC-007 a etapa está ligada ao portão, e não só disponível", async () => {
    const portao = await readFile(PORTAO, "utf8");

    // Uma verificação que existe mas ninguém chama não reprova nada. Este
    // teste é o que impede a etapa de sair do portão sem alguém perceber.
    expect(portao).toContain("contrato:verificar");
    expect(portao).toMatch(/etapa "contrato publicado em dia"/);
  });
});
