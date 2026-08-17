import type { CSSProperties, ReactNode } from "react";
import {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  ajustarParaContraste,
  emHex,
  lerCor,
  relacaoDeContraste,
  textoLegivelSobre,
} from "./contraste";
import { PALETAS, TINTAS_EXTREMAS, type NomeDoTema } from "./tokens";

/**
 * Identidade visual da loja aplicada sem quebrar o sistema (AC-015).
 *
 * O dono escolhe uma cor num seletor de cores. Ele não sabe — nem tem por que
 * saber — que amarelo com letra branca por cima é ilegível, e que foi assim que
 * o v1 entregou vitrines com botão que ninguém enxergava. Aqui o sistema aceita
 * a cor escolhida, calcula a relação de luminância do WCAG e conserta o que
 * precisa: troca a cor da **letra** sobre a cor da loja, e escurece (ou clareia)
 * a cor da loja **só onde ela vira letra**. O preenchimento continua sendo
 * exatamente a cor que o dono escolheu — a identidade não é sequestrada.
 *
 * Todo conserto vira aviso, porque conserto silencioso ensina o dono a escolher
 * errado de novo.
 */

/** O que o cálculo decidiu, pronto para virar variáveis de CSS. */
export type TemaDaLojaCalculado = {
  /** Valores declarados a sobrescrever, prontos para o atributo `style`. */
  readonly variaveis: Readonly<Record<string, string>>;
  /** Cor de preenchimento efetiva (a do dono, ou a do tema se a dele não valia). */
  readonly corPrincipal: string;
  /** Cor da letra sobre a cor principal. */
  readonly corDoTexto: string;
  /** Contraste alcançado entre a letra e a cor principal. */
  readonly relacaoDoTexto: number;
  /** Cor principal ajustada para servir de letra sobre o fundo da página. */
  readonly corPrincipalComoTexto: string;
  /** O que precisou ser consertado, em português, para quem configura a loja. */
  readonly avisos: readonly string[];
};

export type OpcoesDoTemaDaLoja = {
  /** Qual paleta serve de base. O cálculo muda: no escuro a letra padrão é escura. */
  tema?: NomeDoTema | undefined;
};

const arredondar = (valor: number): string => valor.toFixed(2);

/**
 * Calcula o tema da loja. É função pura: recebe a cor escolhida, devolve o que
 * aplicar e o que avisar. Testável sem renderizar nada.
 */
export function calcularTemaDaLoja(
  corEscolhida: string,
  { tema = "claro" }: OpcoesDoTemaDaLoja = {},
): TemaDaLojaCalculado {
  const paleta = PALETAS[tema];
  const avisos: string[] = [];

  let corPrincipal: string;
  try {
    corPrincipal = emHex(lerCor(corEscolhida));
  } catch {
    // Cor ilegível vinda da configuração não pode derrubar a vitrine inteira:
    // a loja continua no ar com a cor do sistema, e o dono é avisado.
    corPrincipal = paleta.primaria;
    avisos.push(
      `A cor "${corEscolhida}" não foi reconhecida. A vitrine está usando a cor padrão do sistema até a configuração ser corrigida.`,
    );
  }

  // A ordem é a preferência: a letra padrão do tema, depois a tinta oposta e,
  // só em último caso, os extremos absolutos — que sempre resolvem, mas custam
  // o tom do design system.
  const escolha = textoLegivelSobre(corPrincipal, [
    paleta.emPrimaria,
    paleta.tinta,
    TINTAS_EXTREMAS.clara,
    TINTAS_EXTREMAS.escura,
  ]);

  if (escolha.cor.toLowerCase() !== paleta.emPrimaria.toLowerCase()) {
    avisos.push(
      `A cor ${corPrincipal} não tem contraste suficiente com a letra padrão (${arredondar(
        relacaoDeContraste(paleta.emPrimaria, corPrincipal),
      )}:1, mínimo ${CONTRASTE_MINIMO_TEXTO}:1). A letra sobre ela passou a ser ${escolha.cor}, que alcança ${arredondar(escolha.relacao)}:1.`,
    );
  }

  const comoTexto = ajustarParaContraste(
    corPrincipal,
    paleta.fundo,
    CONTRASTE_MINIMO_TEXTO,
  );
  if (comoTexto.ajustada) {
    avisos.push(
      `Como letra sobre o fundo da página, ${corPrincipal} ficaria ilegível (${arredondar(
        relacaoDeContraste(corPrincipal, paleta.fundo),
      )}:1). Links e ícones usam ${comoTexto.cor}, que alcança ${arredondar(comoTexto.relacao)}:1.`,
    );
  }

  // O anel de foco é elemento gráfico: o piso dele é 3:1, não 4,5:1.
  const foco = ajustarParaContraste(
    corPrincipal,
    paleta.fundo,
    CONTRASTE_MINIMO_GRAFICO,
  );

  return {
    variaveis: {
      "--cor-primaria": corPrincipal,
      "--cor-em-primaria": escolha.cor,
      "--cor-primaria-texto": comoTexto.cor,
      "--cor-foco": foco.cor,
    },
    corPrincipal,
    corDoTexto: escolha.cor,
    relacaoDoTexto: escolha.relacao,
    corPrincipalComoTexto: comoTexto.cor,
    avisos,
  };
}

export type TemaDaLojaProps = {
  /** Cor principal escolhida pelo dono, em `#rgb`, `#rrggbb` ou `rgb(...)`. */
  corPrincipal: string;
  tema?: NomeDoTema | undefined;
  /**
   * Recebe os consertos feitos. Sem ele, os avisos vão para o registro do
   * ambiente de desenvolvimento — nunca para a tela do cliente final, que não
   * tem nada a ver com a configuração da loja.
   */
  aoAvisar?: ((avisos: readonly string[]) => void) | undefined;
  children: ReactNode;
  className?: string | undefined;
};

/**
 * Envolve a subárvore da loja e redefine, ali dentro, os valores declarados que
 * a identidade dela substitui. Quem está fora do envelope continua com o tema
 * do sistema — é o que impede a cor de uma loja de vazar para o painel ou para
 * a administração.
 */
export function TemaDaLoja({
  corPrincipal,
  tema = "claro",
  aoAvisar,
  children,
  className,
}: TemaDaLojaProps) {
  const calculado = calcularTemaDaLoja(corPrincipal, { tema });

  if (calculado.avisos.length > 0) {
    if (aoAvisar !== undefined) {
      aoAvisar(calculado.avisos);
    } else if (process.env.NODE_ENV !== "production") {
      for (const aviso of calculado.avisos) {
        console.warn(`[design system] ${aviso}`);
      }
    }
  }

  return (
    <div
      className={["sc-tema-loja", className].filter(Boolean).join(" ")}
      data-contraste-ajustado={calculado.avisos.length > 0 ? "sim" : undefined}
      style={calculado.variaveis as CSSProperties}
    >
      {children}
    </div>
  );
}
