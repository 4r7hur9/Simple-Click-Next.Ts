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

export { BotaoMarcavel } from "./botao-marcavel";
export type { BotaoMarcavelProps } from "./botao-marcavel";

export { Chip, FaixaDeChips } from "./chip";
export type { ChipProps, FaixaDeChipsProps } from "./chip";
export { Abas } from "./abas";
export type { AbaDeAbas, AbasProps } from "./abas";
export type {
  ComponenteDeLink,
  ComponenteDeLinkProps,
} from "./componente-de-link";

export { Gaveta } from "./gaveta";
export type { GavetaProps, LadoDaGaveta } from "./gaveta";
export { AvisoFlutuante, DURACAO_MINIMA_DO_AVISO_MS } from "./aviso-flutuante";
export type { AcaoDoAviso, AvisoFlutuanteProps } from "./aviso-flutuante";

export { Campo } from "./campo";
export type { CampoProps } from "./campo";
export { descritoresDoCampo } from "./campo-descritores";

export { Info, idDoTextoDoInfo, lerConteudoDoInfo } from "./info";
export type { ConteudoDoInfo, InfoProps } from "./info";
export {
  LARGURA_MAXIMA_DO_BALAO,
  calcularPosicaoDoBalao,
  larguraMaximaDoBalao,
} from "./info-posicao";
export type {
  EntradaDaPosicao,
  LadoDoBalao,
  PosicaoDoBalao,
  Retangulo,
} from "./info-posicao";

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

export { OPCOES_PARA_BUSCA, Seletor } from "./seletor";
export type { OpcaoDoSeletor, SeletorProps } from "./seletor";

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
export type { CartaoProps, NivelDeTitulo, SuperficieDoCartao } from "./cartao";

export { BarraInferior } from "./barra-inferior";
export type {
  BarraInferiorProps,
  ItemDaBarraInferior,
  ItemDeAcaoDaBarra,
  ItemDeLinkDaBarra,
} from "./barra-inferior";

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

export { TemaDaMarca } from "./tema-da-marca";
export type { TemaDaMarcaProps } from "./tema-da-marca";

export {
  CONTRASTE_MINIMO_GRAFICO,
  CONTRASTE_MINIMO_TEXTO,
  ajustarParaContraste,
  ajustarParaContrasteContraTodos,
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
  CORES_DO_SELO,
  PREFERENCIAS_DO_SELO,
  avaliarSelo,
  corMedia,
  ehAvermelhada,
  variacaoDoSelo,
} from "./selo-de-status";
export type {
  AvaliacaoDoSelo,
  CoresDoSelo,
  PreferenciaDoSelo,
  VariacaoDoSelo,
} from "./selo-de-status";

export {
  BRILHO_DO_CTA,
  COR_DA_ESTRELA_NO_ESCURO,
  ESCALA_TIPOGRAFICA,
  ESCALA_TIPOGRAFICA_COMPUTADOR,
  MEDIDAS,
  NOME_NO_CSS,
  NOME_NO_CSS_DA_ESCALA,
  NOME_NO_CSS_DAS_EXTREMAS,
  NOME_NO_CSS_DAS_MEDIDAS,
  PALETAS,
  PALETA_CLARA,
  PALETA_ESCURA,
  TINTAS_EXTREMAS,
} from "./tokens";
export type {
  NomeDoTema,
  PaletaDeCores,
  PapelTipografico,
  TipoDoPapel,
} from "./tokens";
export {
  AMOSTRAS_DE_DESTAQUE_DA_LOJA,
  COR_DE_DESTAQUE_PADRAO_DA_LOJA,
  COR_DE_FUNDO_DA_LOJA,
  COR_INICIAL_DA_LANDING,
  PALETA_DE_LOJA,
  PALETA_OFICIAL,
} from "./tokens";
export type { CorDeLoja } from "./tokens";

export { SeletorDePeriodo } from "./seletor-de-periodo";
export type { SeletorDePeriodoProps } from "./seletor-de-periodo";
export {
  atalhoDoPeriodo,
  descreverPeriodo,
  hojeNoFuso,
  periodoAnterior,
  periodoDoAtalho,
} from "./periodo";
export type { IdDoAtalho, PeriodoIso } from "./periodo";

export { RecortadorDeImagem } from "./recortador-de-imagem";
export type {
  AjusteDoRecorte,
  ArquivoDaVariante,
  EspacoDoRecorte,
  FundoDoRecorte,
  FormaDoEspaco,
  MiniaturaDoRecorte,
  RecortadorDeImagemProps,
  ResultadoDoRecorte,
  VarianteDoRecorte,
} from "./recortador-de-imagem";
export {
  LIMITE_DA_FOTO_ESCOLHIDA_EM_BYTES,
  TIPOS_DE_FOTO_PARA_RECORTAR,
  formatarMegabytes,
  nomeDoArquivoRecortado,
  tipoDoArquivo,
  validarArquivoDeImagem,
} from "./recorte-geometria";
export type { ModoDoRecorte } from "./recorte-geometria";
