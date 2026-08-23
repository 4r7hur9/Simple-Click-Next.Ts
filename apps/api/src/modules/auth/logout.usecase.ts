/**
 * Encerramento de sessões (AC-112, AC-113).
 *
 * O cookie só diz ao navegador para parar de enviar o token. A revogação que
 * impede o uso em outro cliente acontece no repositório, que a implementação
 * de sessão da T-103 conecta à sua persistência.
 */

export interface RepositorioDeSessoes {
  /** Revoga uma única sessão, identificada pelo servidor. */
  revogarSessao(idDaSessao: string): Promise<void>;

  /** Revoga todas as sessões de renovação pertencentes à mesma identidade. */
  revogarSessoesDaIdentidade(idDaIdentidade: string): Promise<void>;
}

export class ErroDeEncerramentoDeSessao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeEncerramentoDeSessao";
  }
}

function exigirIdentificador(valor: string, nome: string): void {
  if (valor.trim() === "") {
    throw new ErroDeEncerramentoDeSessao(`${nome} é obrigatório`);
  }
}

/**
 * Invalida no servidor a sessão que originou a solicitação de saída.
 *
 * A rota deve chamar esta função antes de remover o cookie: se a persistência
 * falhar, manter o cookie permite tentar de novo em vez de deixar o token
 * válido escondido em outro navegador.
 */
export async function encerrarSessaoAtual(
  idDaSessao: string,
  repositorio: RepositorioDeSessoes,
): Promise<void> {
  exigirIdentificador(idDaSessao, "id da sessão");
  await repositorio.revogarSessao(idDaSessao);
}

/**
 * Invalida inclusive a sessão corrente e todas as de outros dispositivos.
 *
 * Tokens de renovação revogados não podem emitir novo token de acesso; por
 * isso os outros dispositivos caem na próxima tentativa de renovação.
 */
export async function encerrarTodasAsSessoes(
  idDaIdentidade: string,
  repositorio: RepositorioDeSessoes,
): Promise<void> {
  exigirIdentificador(idDaIdentidade, "id da identidade");
  await repositorio.revogarSessoesDaIdentidade(idDaIdentidade);
}
