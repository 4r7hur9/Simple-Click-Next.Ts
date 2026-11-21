/**
 * Confere uma resposta REAL contra o esquema que o documento publicado promete
 * para ela (card #137).
 *
 * O cliente nativo é gerado do `contrato/openapi.json`: se a API devolve um
 * corpo que o esquema publicado recusa, o aplicativo quebra ao ler o erro. A
 * prova transforma o esquema publicado de volta em Zod (resolvendo as
 * referências a `components.schemas`) e passa o corpo por ele.
 */
import { z } from "zod";

import {
  gerarDocumento,
  type ObjetoJson,
  type ValorJson,
} from "../src/contracts/gerar.ts";

const PREFIXO = "#/components/schemas/";

function ehObjeto(valor: ValorJson | undefined): valor is ObjetoJson {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Troca cada `$ref` local pelo esquema nomeado, recursivamente. */
function resolverReferencias(
  valor: ValorJson,
  componentes: ObjetoJson,
): ValorJson {
  if (Array.isArray(valor))
    return valor.map((item) => resolverReferencias(item, componentes));
  if (!ehObjeto(valor)) return valor;
  const referencia = valor["$ref"];
  if (typeof referencia === "string" && referencia.startsWith(PREFIXO)) {
    const alvo = componentes[referencia.slice(PREFIXO.length)];
    if (alvo === undefined)
      throw new Error(`referência sem esquema: ${referencia}`);
    return resolverReferencias(alvo, componentes);
  }
  return Object.fromEntries(
    Object.entries(valor).map(([chave, filho]) => [
      chave,
      resolverReferencias(filho, componentes),
    ]),
  );
}

/**
 * O esquema publicado da resposta `situacao` de `metodo caminho` (caminho como
 * no documento, ex.: `/v1/auth/lojas`), já como Zod.
 */
export function esquemaPublicadoDaResposta(
  caminho: string,
  metodo: string,
  situacao: number,
): z.ZodType {
  const documento = gerarDocumento();
  const caminhos = documento["paths"] as ObjetoJson;
  const operacao = (caminhos[caminho] as ObjetoJson | undefined)?.[
    metodo.toLowerCase()
  ];
  if (!ehObjeto(operacao))
    throw new Error(`rota fora do contrato: ${metodo} ${caminho}`);
  const resposta = (operacao["responses"] as ObjetoJson)[String(situacao)];
  if (!ehObjeto(resposta)) {
    throw new Error(
      `o contrato não publica ${situacao} para ${metodo} ${caminho}`,
    );
  }
  const esquema = (
    (resposta["content"] as ObjetoJson)["application/json"] as ObjetoJson
  )["schema"] as ValorJson;
  const componentes = (documento["components"] as ObjetoJson)[
    "schemas"
  ] as ObjetoJson;
  return z.fromJSONSchema(resolverReferencias(esquema, componentes) as never);
}
