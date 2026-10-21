/**
 * A borda das configurações da loja (P-007, AC-921, AC-923).
 *
 * UM ESQUEMA POR SEÇÃO, e a lista de seções é fechada. Rota de configuração que
 * não está aqui não existe: o dono não tem como enviar "tipo de negócio",
 * "apelido" ou "documento" por nenhuma delas, porque todo esquema é estrito e
 * campo desconhecido é recusado — não ignorado (AC-921). Ignorar em silêncio
 * faria o dono achar que mudou algo que não mudou.
 *
 * A FORMA VEM DO CONTRATO, e a regra vem de `packages/core`. O contrato diz que
 * a chave PIX é texto; a regra diz que um CPF tem dígito verificador. As duas
 * se juntam AQUI, na borda, para a recusa sair inteira de uma vez e no mesmo
 * formato de toda recusa da API (`core/validar.ts`).
 */
import { z } from "zod";
import { normalizarWhatsApp, validarChavePix } from "@simpleclick/core";
import {
  esquemaDaConfiguracaoDeAparencia,
  esquemaDaConfiguracaoDeContato,
  esquemaDaConfiguracaoDeEntrega,
  esquemaDaConfiguracaoDeHorario,
  esquemaDaConfiguracaoDePagamento,
  esquemaDoApelido,
  REGRAS_DAS_IMAGENS_DA_LOJA,
  SECOES_DO_DONO,
  type SecaoDoDono,
} from "@simpleclick/contracts";

import { esquemaDaConfiguracaoDeImpressao } from "./impressao-config.usecase.ts";

/** A seção pedida na URL. Fora da lista fechada é rota inexistente. */
export const esquemaDaSecao = z.enum(SECOES_DO_DONO);

/** Os parâmetros de uma rota de configuração. */
export const esquemaDosParametrosDaSecao = esquemaDoApelido;

/** Os parâmetros do envio de imagem: a loja e qual das duas imagens. */
export const esquemaDosParametrosDaImagem = esquemaDoApelido.extend({
  tipo: z.enum(
    Object.keys(REGRAS_DAS_IMAGENS_DA_LOJA) as [
      "logo",
      "capa",
      "fundo",
      "fundoCelular",
      "topo",
      "topoCelular",
      "original",
    ],
    "Imagem desconhecida: use logo, capa, fundo, fundoCelular, topo, topoCelular ou original.",
  ),
});

/**
 * O pagamento, com a chave PIX conferida pelo tipo escolhido (AC-901).
 *
 * A recusa sai no campo da chave e diz o formato que aquele tipo pede. A
 * chave aceita sai NORMALIZADA — CPF só com dígitos, telefone com +55 —,
 * que é como o banco do cliente a procura.
 */
const esquemaDoPagamento = esquemaDaConfiguracaoDePagamento.transform(
  (valor, contexto) => {
    if (valor.pix === null) return valor;
    const conferida = validarChavePix(valor.pix.tipo, valor.pix.chave);
    if (!conferida.ok) {
      contexto.addIssue({
        code: "custom",
        path: ["pix", "chave"],
        message: conferida.formatoEsperado,
      });
      return z.NEVER;
    }
    return { ...valor, pix: { ...valor.pix, chave: conferida.chave } };
  },
);

/**
 * O contato, com o número já no formato internacional (AC-913).
 *
 * Número impossível é recusado NA BORDA, com a frase que a regra escreveu —
 * "falta o nove", "DDD que não existe" —, e não depois de gravado: número
 * errado gera link que abre conversa inexistente, e o dono só descobriria no
 * primeiro pedido perdido.
 */
const esquemaDoContato = esquemaDaConfiguracaoDeContato.transform(
  (valor, contexto) => {
    const numero = normalizarWhatsApp(valor.numero);
    if (!numero.ok) {
      contexto.addIssue({
        code: "custom",
        path: ["numero"],
        message: numero.explicacao,
      });
      return z.NEVER;
    }
    return { ...valor, numero: numero.e164 };
  },
);

/**
 * O corpo aceito por seção.
 *
 * `satisfies` e não anotação: assim cada entrada guarda o próprio tipo de
 * saída, e quem grava a seção recebe o objeto já validado com o formato
 * certo — sem conversão no meio do caminho.
 */
export const ESQUEMAS_DAS_SECOES = {
  pagamento: esquemaDoPagamento,
  entrega: esquemaDaConfiguracaoDeEntrega,
  horario: esquemaDaConfiguracaoDeHorario,
  contato: esquemaDoContato,
  aparencia: esquemaDaConfiguracaoDeAparencia,
  impressao: esquemaDaConfiguracaoDeImpressao,
} as const satisfies Record<SecaoDoDono, z.ZodType>;

/** O valor validado de cada seção. */
export type ValorDaSecao<S extends SecaoDoDono> = z.output<
  (typeof ESQUEMAS_DAS_SECOES)[S]
>;

/**
 * O que é da PLATAFORMA, e não do dono (AC-323, AC-921, ASM-306).
 *
 * Os nomes com que alguém tentaria mandar cada coisa — pelo corpo de uma seção
 * ou pelo endereço — apontam para o rótulo que a explicação usa. A recusa já
 * acontecia (esquema estrito, rota inexistente); o que esta tabela acrescenta é
 * DIZER por quê: "campo desconhecido" deixaria o dono achando que errou o nome,
 * e ele tentaria de novo com outro.
 */
const DA_PLATAFORMA: Readonly<Record<string, string>> = {
  verticalCode: "tipo de negócio",
  vertical_code: "tipo de negócio",
  vertical: "tipo de negócio",
  ramo: "tipo de negócio",
  tipoDeNegocio: "tipo de negócio",
  "tipo-de-negocio": "tipo de negócio",
  slug: "apelido da loja",
  apelido: "apelido da loja",
  docNumber: "documento da loja",
  documento: "documento da loja",
  contrato: "contrato",
  funcionalidades: "funcionalidades liberadas",
};

/** A frase da recusa, para o que a administração da plataforma decide. */
export function explicacaoDaPlataforma(rotulo: string): string {
  return `Esse ajuste (${rotulo}) é feito pela administração da plataforma, e não pelo painel da loja. Para mudar, fale com o suporte do SimpleClick.`;
}

/**
 * O primeiro campo da plataforma que veio no corpo, já com o rótulo — ou
 * `null` quando o corpo só tem campos da seção.
 */
export function campoDaPlataformaNoCorpo(
  corpo: unknown,
): { readonly campo: string; readonly rotulo: string } | null {
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    return null;
  }
  for (const campo of Object.keys(corpo)) {
    const rotulo = DA_PLATAFORMA[campo];
    if (rotulo !== undefined) return { campo, rotulo };
  }
  return null;
}

/** O rótulo de um endereço que alguém tentaria para um ajuste da plataforma. */
export function rotuloDoEnderecoDaPlataforma(trecho: string): string | null {
  return DA_PLATAFORMA[trecho] ?? null;
}
