import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  ajustarParaContraste,
  emHex,
  lerCor,
  relacaoDeContraste,
  textoLegivelSobre,
} from "./contraste";
import { calcularTemaDaLoja } from "./tema-loja";
import {
  COR_DE_DESTAQUE_PADRAO_DA_LOJA,
  COR_DE_FUNDO_DA_LOJA,
  PALETA_OFICIAL,
} from "./tokens";

/**
 * A cor de destaque da loja (personalização do dono).
 *
 * O FUNDO DA VITRINE É SEMPRE PRETO. O dono escolhe só a cor que pinta os
 * blocos de título, botões, filetes, selos e o LED. Daqui saem quatro valores:
 *
 * - `--cor-marca`: a cor escolhida, exatamente como o dono a escolheu. Pinta
 *   preenchimentos (botões, faixas, selos).
 * - `--cor-sobre-marca`: a cor da letra POR CIMA da marca, grafite ou branca,
 *   a que passar do contraste AA (4,5:1).
 * - `--cor-marca-texto`: a marca quando ela vira letra, ícone ou filete sobre
 *   o preto. Se a cor escolhida for escura demais para isso, esta é a versão
 *   clareada (mesma cor, mais luz) que alcança o contraste AA.
 * - mais as variáveis do tema escuro (`--cor-primaria` e companhia), para os
 *   componentes comuns dentro da loja seguirem a mesma cor.
 */

const GRAFITE = PALETA_OFICIAL.pretoTecnologico;
const BRANCO = PALETA_OFICIAL.branco;

export type MarcaDaLojaCalculada = {
  /** Valores prontos para o atributo `style`. */
  readonly variaveis: Readonly<Record<string, string>>;
  /** A cor de destaque efetiva (`#rrggbb`). */
  readonly cor: string;
  /** A cor de destaque era ilegível e foi trocada pela padrão. */
  readonly corRecusada: boolean;
  /** Letra sobre a marca. */
  readonly corSobreMarca: string;
  readonly relacaoSobreMarca: number;
  /** Marca usada como letra/ícone sobre o preto. */
  readonly corComoTexto: string;
  /** Contraste da cor escolhida contra o fundo preto. */
  readonly relacaoNoFundo: number;
  /** Cor parecida que passa de 3:1 no preto, quando a escolhida não passa. */
  readonly corSugerida: string | null;
  /** O que foi consertado ou merece atenção, em português simples. */
  readonly avisos: readonly string[];
};

const arredondar = (valor: number): string =>
  valor.toFixed(1).replace(".", ",");

export function marcaDaLoja(corEscolhida: string): MarcaDaLojaCalculada {
  const avisos: string[] = [];

  let cor: string;
  let corRecusada = false;
  try {
    cor = emHex(lerCor(corEscolhida));
  } catch {
    cor = COR_DE_DESTAQUE_PADRAO_DA_LOJA;
    corRecusada = true;
    avisos.push(
      `A cor "${corEscolhida}" não foi reconhecida. A loja está usando o verde SimpleClick.`,
    );
  }

  const sobre = textoLegivelSobre(
    cor,
    [GRAFITE, BRANCO],
    CONTRASTE_MINIMO_TEXTO,
  );
  const comoTexto = ajustarParaContraste(
    cor,
    COR_DE_FUNDO_DA_LOJA,
    CONTRASTE_MINIMO_TEXTO,
  );
  const relacaoNoFundo = relacaoDeContraste(cor, COR_DE_FUNDO_DA_LOJA);

  let corSugerida: string | null = null;
  if (relacaoNoFundo < CONTRASTE_MINIMO_GRAFICO) {
    // A sugestão já serve de letra (4,5:1): aceitar resolve os dois problemas.
    corSugerida = comoTexto.cor;
    avisos.push(
      `Esta cor é escura demais sobre o fundo preto (${arredondar(relacaoNoFundo)}:1; o mínimo é ${CONTRASTE_MINIMO_GRAFICO}:1). Botões e filetes quase somem, e os textos nessa cor usam uma versão mais clara. Sugestão: ${corSugerida}.`,
    );
  } else if (comoTexto.ajustada) {
    avisos.push(
      `Como letra sobre o preto esta cor fica difícil de ler (${arredondar(relacaoNoFundo)}:1). Os textos nessa cor usam uma versão mais clara (${comoTexto.cor}); botões e faixas mantêm a cor escolhida.`,
    );
  }

  const escuro = calcularTemaDaLoja(cor, { tema: "escuro" });

  return {
    variaveis: {
      ...escuro.variaveis,
      "--cor-marca": cor,
      "--cor-sobre-marca": sobre.cor,
      "--cor-marca-texto": comoTexto.cor,
    },
    cor,
    corRecusada,
    corSobreMarca: sobre.cor,
    relacaoSobreMarca: sobre.relacao,
    corComoTexto: comoTexto.cor,
    relacaoNoFundo,
    corSugerida,
    avisos,
  };
}
