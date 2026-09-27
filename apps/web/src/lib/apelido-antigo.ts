/**
 * Regras puras do redirecionamento do apelido antigo (AC-208).
 *
 * Quando a administração troca o apelido da loja, o link antigo — o que já
 * está no WhatsApp, no Instagram, no cartaz do balcão — precisa continuar
 * levando à loja. Quem decide PARA ONDE é a API (`endereco-atual`); aqui mora
 * só a regra de onde está o apelido num endereço e como fica o endereço novo,
 * testável sem servidor e sem Next.
 */

/** Apelido aceito: minúsculas, números e hífen, de 2 a 63 caracteres. */
const FORMATO_DO_APELIDO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

/** O apelido de um caminho `/l/<apelido>/...`, ou `null`. */
export function apelidoDoCaminho(caminho: string): string | null {
  const achado = /^\/l\/([^/]+)(?:\/|$)/.exec(caminho);
  const apelido = achado?.[1]?.toLowerCase();
  return apelido !== undefined && FORMATO_DO_APELIDO.test(apelido)
    ? apelido
    : null;
}

/** O mesmo caminho, com o apelido novo no lugar do antigo. */
export function caminhoComApelidoNovo(
  caminho: string,
  antigo: string,
  novo: string,
): string {
  const prefixo = `/l/${antigo}`;
  if (caminho.toLowerCase() === prefixo) return `/l/${novo}`;
  if (caminho.toLowerCase().startsWith(`${prefixo}/`)) {
    return `/l/${novo}${caminho.slice(prefixo.length)}`;
  }
  return caminho;
}

/** O mesmo endereço, com o apelido novo no primeiro rótulo do host. */
export function hostComApelidoNovo(
  host: string,
  antigo: string,
  novo: string,
): string {
  const [primeiro, ...resto] = host.split(".");
  return primeiro?.toLowerCase() === antigo ? [novo, ...resto].join(".") : host;
}

/**
 * Lembrança curta das respostas da API, por apelido.
 *
 * Sem ela, cada página de loja custaria uma pergunta a mais à API. Com ela, é
 * uma pergunta por apelido por minuto — e a troca de apelido passa a valer, no
 * pior caso, um minuto depois, a mesma janela do cache da vitrine.
 */
export class LembrancaDeApelidos {
  private readonly respostas = new Map<
    string,
    { readonly atual: string | null; readonly ate: number }
  >();

  constructor(
    private readonly duracaoMs: number = 60_000,
    private readonly maximo: number = 1_000,
  ) {}

  /** `undefined` quando não lembra; `null` quando lembra que não é antigo. */
  consultar(apelido: string, agora: number): string | null | undefined {
    const lembrada = this.respostas.get(apelido);
    if (lembrada === undefined) return undefined;
    if (lembrada.ate <= agora) {
      this.respostas.delete(apelido);
      return undefined;
    }
    return lembrada.atual;
  }

  lembrar(apelido: string, atual: string | null, agora: number): void {
    // Teto de tamanho: um robô pedindo apelidos inventados não pode fazer a
    // lembrança crescer sem fim. A mais velha sai primeiro.
    if (this.respostas.size >= this.maximo) {
      const maisVelha = this.respostas.keys().next().value;
      if (maisVelha !== undefined) this.respostas.delete(maisVelha);
    }
    this.respostas.set(apelido, { atual, ate: agora + this.duracaoMs });
  }
}
