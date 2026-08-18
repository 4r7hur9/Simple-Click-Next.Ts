/**
 * Apoio de teste do SimpleClick.
 *
 * Nada daqui vai ao ar: é o que os testes usam para montar cenário próprio, a
 * começar pelo banco descartável de cada arquivo (AC-003).
 */

export {
  apagarBanco,
  apontamParaOMesmoBanco,
  bancoDoArquivo,
  comBancoDeTeste,
  conectar,
  conectarNoBancoDoArquivo,
  criarBancoDeTeste,
  ErroDeAmbienteDeTeste,
  ErroDeBancoProtegido,
  esquecerBancoDoArquivo,
  exigirNomeEfemero,
  garantirMolde,
  identidadeDoBanco,
  instanteDoNome,
  nomeDoMolde,
  nomeNovoDeBancoDeTeste,
  PREFIXO_DO_BANCO_DE_TESTE,
  PREFIXO_DO_MOLDE,
  recusarBancoDeDesenvolvimento,
  registrarBancoDoArquivo,
  urlDoBanco,
  urlDoServidorDeTeste,
  varrerBancosAbandonados,
  type Ambiente,
  type BancoDeTeste,
  type OpcoesDeBancoDeTeste,
} from "./db-test.ts";
