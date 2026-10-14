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
export type {
  BotaoProps,
  FormaDeBotao,
  TamanhoDeBotao,
  VarianteDeBotao,
} from "./botao";

export { Campo } from "./campo";
export type { CampoProps } from "./campo";

export {
  CampoDeSenha,
  NIVEL_MAXIMO_DE_FORCA,
  avaliarForcaDaSenha,
} from "./campo-senha";
export type {
  CampoDeSenhaProps,
  ForcaDaSenha,
  NivelDeForca,
} from "./campo-senha";

export { Selo } from "./selo";
export type { SeloProps, TomDeSelo } from "./selo";

export { Sanfona } from "./sanfona";
export type { SanfonaProps } from "./sanfona";

export { MenuSuspenso } from "./menu-suspenso";
export type { ItemDoMenu, MenuSuspensoProps } from "./menu-suspenso";

export { Tabela, ordenarLinhas } from "./tabela";
export type {
  ColunaDaTabela,
  DirecaoDaOrdem,
  OrdemDaTabela,
  TabelaProps,
  ValorOrdenavel,
} from "./tabela";

export * from "./icones";

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
  MEDIDAS,
  NOME_NO_CSS,
  NOME_NO_CSS_DAS_EXTREMAS,
  NOME_NO_CSS_DAS_MEDIDAS,
  PALETAS,
  PALETA_CLARA,
  PALETA_ESCURA,
  TINTAS_EXTREMAS,
} from "./tokens";
export type { NomeDoTema, PaletaDeCores } from "./tokens";
export { COR_INICIAL_DA_LANDING, PALETA_DE_LOJA } from "./tokens";
export type { CorDeLoja } from "./tokens";
