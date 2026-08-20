/**
 * Porta única do design system.
 *
 * Quem consome o pacote importa daqui, nunca de um arquivo interno: é o que
 * permite reorganizar os componentes sem quebrar tela nenhuma.
 *
 * A folha de estilo entra separada, uma vez só, no CSS raiz do consumidor:
 *
 *   @import "@simpleclick/ui/styles/theme.css";
 */

export { Botao } from "./botao";
export type { BotaoProps, VarianteDeBotao } from "./botao";

export { Campo } from "./campo";
export type { CampoProps } from "./campo";

export { Cartao } from "./cartao";
export type { CartaoProps, NivelDeTitulo } from "./cartao";

export { Lista } from "./lista";
export type { ListaProps } from "./lista";

export { Aviso } from "./aviso";
export type { AvisoProps, TomDeAviso } from "./aviso";

export { Dialogo } from "./dialogo";
export type { DialogoProps } from "./dialogo";

export {
  Carregando,
  Erro,
  Esqueleto,
  Girando,
  Sucesso,
  Vazio,
} from "./estados";
export type {
  CarregandoProps,
  ErroProps,
  EsqueletoProps,
  EstadoDaTela,
  SucessoProps,
  VazioProps,
} from "./estados";

export { TemaDaLoja, calcularTemaDaLoja } from "./tema-loja";
export type {
  OpcoesDoTemaDaLoja,
  TemaDaLojaCalculado,
  TemaDaLojaProps,
} from "./tema-loja";

export {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  ajustarParaContraste,
  contrasteSuficienteParaTexto,
  emHex,
  lerCor,
  luminanciaRelativa,
  misturar,
  relacaoDeContraste,
  textoLegivelSobre,
} from "./contraste";
export type { Ajuste, Cor, EscolhaDeTexto, Rgb } from "./contraste";

export {
  NOME_NO_CSS,
  NOME_NO_CSS_DAS_EXTREMAS,
  PALETAS,
  PALETA_CLARA,
  PALETA_ESCURA,
  TINTAS_EXTREMAS,
} from "./tokens";
export type { NomeDoTema, PaletaDeCores } from "./tokens";
export { COR_INICIAL_DA_LANDING, PALETA_DE_LOJA } from "./tokens";
export type { CorDeLoja } from "./tokens";
