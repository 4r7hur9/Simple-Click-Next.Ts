/**
 * Limite de tentativas por CONTA e por ORIGEM, com bloqueio progressivo
 * (AC-119, AC-120).
 *
 * Existe contra o ataque mais barato que há: pegar uma lista de senhas vazadas
 * e testá-la contra as contas das lojas. Sem limite, a única defesa é a força
 * da senha de cada lojista — e essa é justamente a defesa que não está nas
 * nossas mãos.
 *
 * Quatro decisões de desenho, e o modo de falha que cada uma fecha:
 *
 * 1. **Dois eixos, com a conta em primeiro lugar.** O eixo da conta pega o
 *    ataque concentrado (mil senhas contra um e-mail); o eixo da origem pega o
 *    ataque distribuído (uma senha contra mil e-mails), que passa despercebido
 *    por qualquer limite que olhe só a conta. Quando os dois disparam, a
 *    resposta é a da conta: é a informação útil para o dono legítimo, que
 *    precisa saber que a conta dele está sob ataque.
 * 2. **O endereço vem da borda confiável, e não da conexão.** Atrás do
 *    roteador, o endereço da conexão é sempre o mesmo — o do roteador. Um
 *    limite ingênuo somaria as tentativas do mundo inteiro num balde só e
 *    bloquearia todos os clientes juntos no primeiro ataque. Mas o cabeçalho
 *    também não pode ser lido inteiro, porque quem chama escreve nele o que
 *    quiser: contamos SALTOS a partir do fim, e só a borda que a gente
 *    controla escreve depois do atacante (AC-120).
 * 3. **O tempo é parâmetro, não `Date.now()` por dentro.** O bloqueio
 *    progressivo é uma regra sobre o tempo; com o relógio escondido, prová-la
 *    exigiria esperar minutos de verdade e o teste viraria um teste que
 *    ninguém roda. O instante entra em cada chamada e vai como argumento ao
 *    Redis, onde a comparação acontece.
 * 4. **A decisão inteira é um script no Redis.** Ler, comparar e gravar em
 *    chamadas separadas abre janela entre a leitura e a escrita — e ataque de
 *    força bruta é, por definição, muitas requisições ao mesmo tempo. O script
 *    roda inteiro sem intercalar com outro, então o décimo primeiro atacante
 *    não passa por ter chegado junto com o décimo.
 *
 * O que NÃO mora aqui: mandar o e-mail de aviso que AC-119 pede. Este módulo
 * anuncia o bloqueio novo por `aoBloquear`; quem transforma o anúncio em
 * mensagem é o módulo de identidade, com a fila da T-014. Assim o limite não
 * depende de servidor de e-mail para funcionar.
 */

import { createHash } from "node:crypto";
import { createClient } from "@redis/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";

// ---------------------------------------------------------------------------
// Tipos de fronteira
// ---------------------------------------------------------------------------

/**
 * O mínimo que o limitador precisa de um Redis: rodar um script e receber a
 * resposta. A porta é estreita de propósito — é ela que permite trocar o
 * cliente do cache mexendo em um lugar só.
 */
export interface CacheDoLimite {
  executarScript(
    script: string,
    chaves: readonly string[],
    argumentos: readonly string[],
  ): Promise<unknown>;
}

/** Cache com a conexão sob controle de quem a abriu. */
export interface CacheDoLimiteAberto extends CacheDoLimite {
  encerrar(): Promise<void>;
}

/** Em qual eixo o limite foi aplicado. */
export type EscopoDoLimite = "conta" | "origem";

/**
 * O que o limitador decidiu sobre uma tentativa.
 *
 * `barrado` e `bloqueioNovo` são coisas diferentes de propósito: a tentativa
 * que COMPLETA a cota cria o bloqueio e ainda é atendida; barradas são as
 * seguintes. É o que faz `limite: 10` querer dizer "dez tentativas toleradas"
 * nos dois eixos — no da conta, que conta falhas depois da rota, e no da
 * origem, que conta requisições antes dela.
 */
export interface VereditoDoLimite {
  readonly escopo: EscopoDoLimite;
  /** Esta tentativa esbarrou num bloqueio que já estava em vigor. */
  readonly barrado: boolean;
  /** Quanto falta do bloqueio, em milissegundos. Zero quando não há bloqueio. */
  readonly esperaMs: number;
  /** Quantas tentativas ainda cabem na janela. */
  readonly tentativasRestantes: number;
  /** Quantos bloqueios este balde já acumulou — é o que faz a espera crescer. */
  readonly bloqueiosSeguidos: number;
  /** Verdadeiro só na tentativa que criou o bloqueio, nunca nas seguintes. */
  readonly bloqueioNovo: boolean;
}

/** Anúncio de bloqueio novo, para quem precisa avisar alguém (AC-119). */
export interface AvisoDeBloqueio {
  readonly escopo: EscopoDoLimite;
  /** Conta ou endereço, como quem chamou os informou. */
  readonly identificador: string;
  readonly esperaMs: number;
  readonly bloqueiosSeguidos: number;
}

/** Uma regra de limite: quantas tentativas, em quanto tempo, e qual castigo. */
export interface RegraDeLimite {
  /**
   * Tentativas toleradas dentro da janela. A que completa a cota ainda é
   * atendida e liga o bloqueio; da seguinte em diante, tudo é barrado.
   */
  readonly limite: number;
  /** Tamanho da janela de contagem, em milissegundos. */
  readonly janelaMs: number;
  /** Espera do primeiro bloqueio, em milissegundos. */
  readonly esperaBaseMs: number;
  /** Teto da espera, para o castigo não virar banimento eterno. */
  readonly esperaMaximaMs: number;
  /** Por quanto a espera é multiplicada a cada bloqueio novo. Padrão: 2. */
  readonly fatorDeCrescimento?: number;
  /** Por quanto tempo o balde lembra dos bloqueios anteriores. Padrão: 24h. */
  readonly memoriaMs?: number;
}

/** A regra por conta precisa saber de qual conta a requisição fala. */
export interface RegraPorConta extends RegraDeLimite {
  /**
   * Qual conta esta requisição tenta usar — normalmente o e-mail do corpo já
   * validado. `undefined` quando a requisição não nomeia conta nenhuma.
   */
  identificar(req: Request): string | undefined;
}

/** Ajustes do limitador. Só o cache é obrigatório. */
export interface OpcoesDoLimitador {
  readonly cache: CacheDoLimite;
  /** Prefixo das chaves no cache. Separa ambientes que dividem o servidor. */
  readonly prefixo?: string;
  readonly porConta?: RegraPorConta;
  readonly porOrigem?: RegraDeLimite;
  /** Quantas bordas nossas escrevem no cabeçalho de encaminhamento. Padrão: 1. */
  readonly proxiesConfiaveis?: number;
  /** De onde sai o instante atual. Padrão: o relógio do sistema. */
  readonly agora?: () => number;
  /** Chamado uma vez por bloqueio NOVO, para quem precisa avisar alguém. */
  readonly aoBloquear?: (aviso: AvisoDeBloqueio) => void | Promise<void>;
}

/** O que o domínio usa para dizer como a tentativa terminou. */
export interface RegistroDeTentativa {
  /** Endereço real de quem chamou, já resolvido pela borda confiável. */
  readonly endereco: string;
  /** Conta que a requisição tenta usar, se houver. */
  readonly conta: string | undefined;
  /** A tentativa falhou (senha errada, código errado): conta contra a conta. */
  registrarFalha(): Promise<VereditoDoLimite>;
  /** A tentativa deu certo: zera a contagem de falhas da conta. */
  registrarSucesso(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Código HTTP de excesso de requisições. */
export const STATUS_DE_EXCESSO = 429;

/** Prefixo das chaves no cache, quando quem chama não escolhe outro. */
export const PREFIXO_PADRAO = "sc:limite";

/** O ambiente roda atrás de UMA borda nossa: o roteador local, e depois o CDN. */
export const PROXIES_CONFIAVEIS_PADRAO = 1;

/** Cada bloqueio dobra a espera do anterior. */
const FATOR_DE_CRESCIMENTO_PADRAO = 2;

/** Um dia: tempo que o balde lembra dos bloqueios já sofridos. */
const MEMORIA_PADRAO_MS = 24 * 60 * 60 * 1000;

/** Endereço usado quando nem a conexão nem a borda sabem dizer quem chamou. */
const ENDERECO_DESCONHECIDO = "desconhecido";

// ---------------------------------------------------------------------------
// Scripts do Redis
// ---------------------------------------------------------------------------

/**
 * Todo script devolve a mesma tupla, para o lado TypeScript ler um formato só:
 *   {barrado, esperaMs, tentativasRestantes, bloqueiosSeguidos, bloqueioNovo}
 */

/**
 * Conta uma tentativa e decide.
 *
 * O bloqueio é gravado como INSTANTE FINAL, e não como tempo de vida da chave.
 * Guardar só o tempo de vida faria a memória dos bloqueios anteriores morrer
 * junto com o bloqueio, e a espera nunca cresceria: o atacante levaria sempre o
 * mesmo castigo, esperaria, e recomeçaria do zero.
 *
 * A tentativa que completa a cota LIGA o bloqueio e devolve `barrado = 0` — ela
 * é a décima, não a décima primeira. Barrar já esta faria `limite: 10` valer
 * nove tentativas no eixo que conta antes da rota e dez no que conta depois.
 */
const SCRIPT_CONTAR = `
local chave = KEYS[1]
local agora = tonumber(ARGV[1])
local janela = tonumber(ARGV[2])
local limite = tonumber(ARGV[3])
local base = tonumber(ARGV[4])
local fator = tonumber(ARGV[5])
local teto = tonumber(ARGV[6])
local memoria = tonumber(ARGV[7])

local ate = tonumber(redis.call('HGET', chave, 'ate') or '0')
local bloqueios = tonumber(redis.call('HGET', chave, 'bloqueios') or '0')

if ate > agora then
  return {1, ate - agora, 0, bloqueios, 0}
end

local inicio = tonumber(redis.call('HGET', chave, 'inicio') or '0')
local contagem = tonumber(redis.call('HGET', chave, 'contagem') or '0')
if inicio == 0 or (agora - inicio) >= janela then
  inicio = agora
  contagem = 0
end
contagem = contagem + 1

if contagem >= limite then
  bloqueios = bloqueios + 1
  local espera = math.floor(math.min(base * (fator ^ (bloqueios - 1)), teto))
  ate = agora + espera
  redis.call('HSET', chave, 'contagem', 0, 'inicio', agora, 'bloqueios', bloqueios, 'ate', ate)
  redis.call('PEXPIRE', chave, math.max(memoria, espera) + janela)
  return {0, espera, 0, bloqueios, 1}
end

redis.call('HSET', chave, 'contagem', contagem, 'inicio', inicio)
redis.call('PEXPIRE', chave, math.max(memoria, janela))
return {0, 0, limite - contagem, bloqueios, 0}
`;

/** Olha o balde sem contar tentativa: é a conferência feita antes da senha. */
const SCRIPT_CONSULTAR = `
local chave = KEYS[1]
local agora = tonumber(ARGV[1])
local janela = tonumber(ARGV[2])
local limite = tonumber(ARGV[3])

local ate = tonumber(redis.call('HGET', chave, 'ate') or '0')
local bloqueios = tonumber(redis.call('HGET', chave, 'bloqueios') or '0')

if ate > agora then
  return {1, ate - agora, 0, bloqueios, 0}
end

local inicio = tonumber(redis.call('HGET', chave, 'inicio') or '0')
local contagem = tonumber(redis.call('HGET', chave, 'contagem') or '0')
if inicio == 0 or (agora - inicio) >= janela then
  contagem = 0
end
return {0, 0, limite - contagem, bloqueios, 0}
`;

/**
 * Zera a contagem de falhas depois de uma entrada bem-sucedida — e SÓ ela.
 *
 * A memória dos bloqueios fica. Se acertar a senha apagasse o histórico, quem
 * tem uma conta válida na plataforma zeraria o castigo de graça entre as
 * rodadas de tentativa contra as outras contas.
 */
const SCRIPT_LIMPAR = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('HSET', KEYS[1], 'contagem', 0)
end
return 1
`;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** O domínio pediu o registro de uma requisição que não passou pelo limitador. */
export class ErroSemLimitador extends Error {
  constructor() {
    super(
      [
        "Pedido de registro de tentativa numa requisição que não passou pelo limitador.",
        "",
        "Monte a rota com o middleware e registre o desfecho por ele:",
        "",
        "  app.post('/v1/auth/login', limitarTentativas({ … }), async (req, res) => {",
        "    const limite = limiteDaRequisicao(req);",
        "    if (!senhaConfere) { await limite.registrarFalha(); … }",
        "    await limite.registrarSucesso();",
        "  });",
      ].join("\n"),
    );
    this.name = "ErroSemLimitador";
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Abre a conexão do cache e devolve só a porta estreita que o limitador usa.
 *
 * O script vai inteiro a cada chamada, em vez de por resumo pré-carregado: o
 * ganho do resumo é uma fração de milissegundo, e o custo é ter de tratar o
 * caso do cache reiniciado, que perde os scripts guardados e devolve erro no
 * meio de uma rota de entrada (P-014).
 */
export async function conectarNoCacheDoLimite(
  url: string,
): Promise<CacheDoLimiteAberto> {
  const cliente = createClient({ url });
  // Sem ouvinte de erro, o cliente derruba o processo com erro não tratado
  // quando o cache cai — e cache é o serviço que mais cai (decisão de 17/08).
  cliente.on("error", () => {});
  await cliente.connect();

  return {
    async executarScript(script, chaves, argumentos) {
      return cliente.eval(script, {
        keys: [...chaves],
        arguments: [...argumentos],
      });
    },
    async encerrar() {
      await cliente.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Endereço real de quem chamou
// ---------------------------------------------------------------------------

/** Tira o embrulho IPv6 de endereço IPv4 e normaliza a caixa. */
function normalizarEndereco(bruto: string): string {
  const limpo = bruto.trim().toLowerCase();
  return limpo.startsWith("::ffff:") ? limpo.slice("::ffff:".length) : limpo;
}

/**
 * O endereço real de quem chamou (AC-120).
 *
 * `X-Forwarded-For` é uma LISTA em que cada borda acrescenta ao fim quem falou
 * com ela. Quem chama escreve o começo da lista à vontade — o atacante pode
 * mandar `X-Forwarded-For: 1.2.3.4` e ganhar um balde novo a cada requisição.
 * O que ele não consegue é escrever DEPOIS da nossa borda: por isso a leitura
 * é por saltos contados a partir do fim, e nunca pelo primeiro item.
 *
 * Com zero bordas confiáveis, o cabeçalho é ignorado por inteiro e vale o
 * endereço da conexão — que é o certo quando a API atende direto.
 */
export function enderecoDoCliente(
  req: Request,
  proxiesConfiaveis: number,
): string {
  const daConexao = req.socket.remoteAddress ?? ENDERECO_DESCONHECIDO;
  if (proxiesConfiaveis <= 0) return normalizarEndereco(daConexao);

  const bruto = req.headers["x-forwarded-for"];
  const lista = (Array.isArray(bruto) ? bruto.join(",") : (bruto ?? ""))
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (lista.length === 0) return normalizarEndereco(daConexao);

  // Menos itens do que saltos significa que alguém pulou uma borda; ficar com
  // o primeiro seria confiar em quem chamou, então cai para a conexão.
  const indice = lista.length - proxiesConfiaveis;
  const escolhido = indice < 0 ? daConexao : (lista[indice] ?? daConexao);
  return normalizarEndereco(escolhido);
}

// ---------------------------------------------------------------------------
// Chaves e leitura da resposta
// ---------------------------------------------------------------------------

/**
 * Chave do balde: o identificador entra resumido, nunca em claro.
 *
 * O identificador da conta é o e-mail de alguém, e o da origem é o endereço de
 * rede de alguém — os dois são dado pessoal (LGPD). O resumo dá o mesmo balde
 * para o mesmo identificador sem deixar uma lista de e-mails legível dentro do
 * cache, que é o serviço mais descartável e menos protegido do arranjo.
 */
function chaveDoBalde(
  prefixo: string,
  escopo: EscopoDoLimite,
  identificador: string,
): string {
  const resumo = createHash("sha256")
    .update(identificador)
    .digest("base64url")
    .slice(0, 32);
  return `${prefixo}:${escopo}:${resumo}`;
}

/** Lê a tupla que os scripts devolvem, sem confiar no formato. */
function lerVeredito(
  escopo: EscopoDoLimite,
  resposta: unknown,
): VereditoDoLimite {
  const tupla = Array.isArray(resposta) ? resposta : [];
  const numero = (posicao: number): number => Number(tupla[posicao] ?? 0);

  return {
    escopo,
    barrado: numero(0) === 1,
    esperaMs: numero(1),
    tentativasRestantes: numero(2),
    bloqueiosSeguidos: numero(3),
    bloqueioNovo: numero(4) === 1,
  };
}

/** Argumentos da regra, na ordem em que os scripts os esperam. */
function argumentosDaRegra(regra: RegraDeLimite, agora: number): string[] {
  return [
    String(agora),
    String(regra.janelaMs),
    String(regra.limite),
    String(regra.esperaBaseMs),
    String(regra.fatorDeCrescimento ?? FATOR_DE_CRESCIMENTO_PADRAO),
    String(regra.esperaMaximaMs),
    String(regra.memoriaMs ?? MEMORIA_PADRAO_MS),
  ];
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const REGISTRO = Symbol("registro de tentativa do limitador");

/**
 * O registro desta requisição, para o domínio dizer como a tentativa terminou.
 * Recusa quando a rota não foi montada com o limitador.
 */
export function limiteDaRequisicao(req: Request): RegistroDeTentativa {
  const guardado = (req as unknown as Record<symbol, unknown>)[REGISTRO];
  if (guardado === undefined) throw new ErroSemLimitador();
  return guardado as RegistroDeTentativa;
}

/** Espera em segundos inteiros, sempre ao menos 1: "espere 0s" não ajuda. */
function esperaEmSegundos(esperaMs: number): number {
  return Math.max(1, Math.ceil(esperaMs / 1000));
}

/** Responde o excesso, dizendo quanto falta — e sem nomear a conta (P-009). */
function responderExcesso(res: Response, veredito: VereditoDoLimite): void {
  const segundos = esperaEmSegundos(veredito.esperaMs);
  res.setHeader("Retry-After", String(segundos));
  res.status(STATUS_DE_EXCESSO).json({
    erro: "muitas_tentativas",
    escopo: veredito.escopo,
    esperaSegundos: segundos,
  });
}

/**
 * Middleware de limite de tentativas (AC-119, AC-120).
 *
 * Roda ANTES do domínio: a conta bloqueada é recusada sem que a senha chegue a
 * ser conferida, que é o que AC-119 pede quando diz "mesmo com a senha
 * correta".
 */
export function limitarTentativas(opcoes: OpcoesDoLimitador): RequestHandler {
  const prefixo = opcoes.prefixo ?? PREFIXO_PADRAO;
  const proxies = opcoes.proxiesConfiaveis ?? PROXIES_CONFIAVEIS_PADRAO;
  const relogio = opcoes.agora ?? Date.now;

  /** Dispara o anúncio sem segurar a resposta nem deixá-la quebrar por ele. */
  function anunciar(
    escopo: EscopoDoLimite,
    identificador: string,
    veredito: VereditoDoLimite,
  ): void {
    if (!veredito.bloqueioNovo || opcoes.aoBloquear === undefined) return;
    const aviso: AvisoDeBloqueio = {
      escopo,
      identificador,
      esperaMs: veredito.esperaMs,
      bloqueiosSeguidos: veredito.bloqueiosSeguidos,
    };
    Promise.resolve(opcoes.aoBloquear(aviso)).catch((causa: unknown) => {
      // Sem o identificador: aviso de bloqueio fala de gente (P-009). O
      // registro estruturado da T-012 substitui esta linha.
      console.error("falha ao anunciar bloqueio", { escopo, causa });
    });
  }

  async function contar(
    escopo: EscopoDoLimite,
    regra: RegraDeLimite,
    identificador: string,
  ): Promise<VereditoDoLimite> {
    const resposta = await opcoes.cache.executarScript(
      SCRIPT_CONTAR,
      [chaveDoBalde(prefixo, escopo, identificador)],
      argumentosDaRegra(regra, relogio()),
    );
    const veredito = lerVeredito(escopo, resposta);
    anunciar(escopo, identificador, veredito);
    return veredito;
  }

  async function consultar(
    escopo: EscopoDoLimite,
    regra: RegraDeLimite,
    identificador: string,
  ): Promise<VereditoDoLimite> {
    const resposta = await opcoes.cache.executarScript(
      SCRIPT_CONSULTAR,
      [chaveDoBalde(prefixo, escopo, identificador)],
      [String(relogio()), String(regra.janelaMs), String(regra.limite)],
    );
    return lerVeredito(escopo, resposta);
  }

  function montarRegistro(
    endereco: string,
    conta: string | undefined,
  ): RegistroDeTentativa {
    const regra = opcoes.porConta;
    return {
      endereco,
      conta,
      async registrarFalha() {
        if (regra === undefined || conta === undefined) {
          return lerVeredito("conta", []);
        }
        return contar("conta", regra, conta);
      },
      async registrarSucesso() {
        if (regra === undefined || conta === undefined) return;
        await opcoes.cache.executarScript(
          SCRIPT_LIMPAR,
          [chaveDoBalde(prefixo, "conta", conta)],
          [],
        );
      },
    };
  }

  async function aplicar(
    req: Request,
    res: Response,
    proximo: NextFunction,
  ): Promise<void> {
    const endereco = enderecoDoCliente(req, proxies);
    const conta = opcoes.porConta?.identificar(req);

    const daConta =
      opcoes.porConta !== undefined && conta !== undefined
        ? await consultar("conta", opcoes.porConta, conta)
        : undefined;

    // A origem conta mesmo quando a conta já está bloqueada: quem espalha as
    // tentativas entre contas precisa acumular volume em algum lugar, e esse
    // lugar é o balde da origem.
    const daOrigem =
      opcoes.porOrigem !== undefined
        ? await contar("origem", opcoes.porOrigem, endereco)
        : undefined;

    if (daConta?.barrado === true) {
      responderExcesso(res, daConta);
      return;
    }
    if (daOrigem?.barrado === true) {
      responderExcesso(res, daOrigem);
      return;
    }

    (req as unknown as Record<symbol, unknown>)[REGISTRO] = montarRegistro(
      endereco,
      conta,
    );
    proximo();
  }

  return (req: Request, res: Response, proximo: NextFunction) => {
    aplicar(req, res, proximo).catch(proximo);
  };
}

// ---------------------------------------------------------------------------
// Cache aberto sob demanda, que falha rápido (T-608)
// ---------------------------------------------------------------------------

/** Quanto uma conversa com o cache do limite pode durar antes de desistir. */
export const TEMPO_LIMITE_DO_CACHE_DO_LIMITE_MS = 1_500;

/** O cache do limite não respondeu, não está configurado, ou caiu. */
export class ErroDoCacheDoLimite extends Error {
  constructor(motivo: string, causa?: unknown) {
    super(
      `O cache do limite de tentativas não respondeu: ${motivo}.`,
      causa === undefined ? undefined : { cause: causa },
    );
    this.name = "ErroDoCacheDoLimite";
  }
}

/**
 * O cache do limite para uma rota de produção: conecta na PRIMEIRA tentativa
 * (montar a aplicação não pode exigir Redis no ar, como não exige banco) e
 * FALHA RÁPIDO quando o Redis não responde.
 *
 * Falhar rápido é o ponto. O cliente do Redis, por padrão, guarda o comando
 * enquanto tenta reconectar — e a rota pendura até alguém desistir. Aqui não
 * há fila de espera nem reconexão automática: o comando que não volta dentro
 * do prazo rejeita com `ErroDoCacheDoLimite`, a conexão é descartada, e a
 * tentativa seguinte abre outra. O que fazer com a recusa é decisão da rota:
 * a do pareamento do agente de impressão FECHA (responde indisponível), porque
 * sem contagem o código de seis dígitos ficaria aberto à força bruta.
 *
 * Sem endereço configurado, todo comando rejeita — a ausência de configuração
 * fecha a porta, nunca a abre.
 */
export function cacheDoLimiteSobDemanda(
  url: string | undefined,
  tempoLimiteMs: number = TEMPO_LIMITE_DO_CACHE_DO_LIMITE_MS,
): CacheDoLimite {
  /** O mínimo do cliente que esta função usa: rodar o script e descartar. */
  interface Cliente {
    rodar(
      script: string,
      chaves: readonly string[],
      argumentos: readonly string[],
    ): Promise<unknown>;
    destroy(): void;
  }
  let conectado: Promise<Cliente> | undefined;

  function descartar(cliente: Promise<Cliente> | undefined): void {
    if (conectado === cliente) conectado = undefined;
    void cliente
      ?.then((aberto) => {
        try {
          aberto.destroy();
        } catch {
          // Já estava fechado: nada a descartar.
        }
      })
      .catch(() => {});
  }

  async function conectar(endereco: string): Promise<Cliente> {
    const cliente = createClient({
      url: endereco,
      disableOfflineQueue: true,
      socket: { connectTimeout: tempoLimiteMs, reconnectStrategy: false },
    });
    // Sem ouvinte, o erro do cliente derruba o processo (ver acima).
    cliente.on("error", () => {});
    await cliente.connect();
    return {
      rodar: (script, chaves, argumentos) =>
        cliente.eval(script, {
          keys: [...chaves],
          arguments: [...argumentos],
        }),
      destroy: () => cliente.destroy(),
    };
  }

  function comPrazo<T>(promessa: Promise<T>): Promise<T> {
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const prazo = new Promise<never>((_, rejeitar) => {
      relogio = setTimeout(
        () => rejeitar(new ErroDoCacheDoLimite("o prazo acabou")),
        tempoLimiteMs,
      );
    });
    return Promise.race([promessa, prazo]).finally(() => clearTimeout(relogio));
  }

  return {
    async executarScript(script, chaves, argumentos) {
      const endereco = url?.trim();
      if (endereco === undefined || endereco === "") {
        throw new ErroDoCacheDoLimite("REDIS_URL não está configurada");
      }
      conectado ??= conectar(endereco);
      const desta = conectado;
      try {
        const cliente = await comPrazo(desta);
        return await comPrazo(cliente.rodar(script, chaves, argumentos));
      } catch (causa) {
        descartar(desta);
        if (causa instanceof ErroDoCacheDoLimite) throw causa;
        throw new ErroDoCacheDoLimite("a conexão falhou", causa);
      }
    },
  };
}
