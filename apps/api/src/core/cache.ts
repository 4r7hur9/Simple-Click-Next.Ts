/**
 * Cache da API: toda chave começa pelo identificador da loja (AC-027), e o
 * dado alterado aparece dentro de um prazo definido, sem reinício de serviço
 * nem limpeza manual (AC-028).
 *
 * ## Por que a chave começa pela loja
 *
 * O isolamento entre lojas é imposto pelo banco (decisão de 17/08): política
 * de linha, contexto por transação, credencial que não contorna nada. O cache
 * fica NA FRENTE do banco — quem responde a partir dele nunca chega às
 * políticas. Ou seja: a única defesa contra servir o catálogo da loja A para a
 * loja B é a forma da chave. Uma chave `catalogo` compartilhada vaza dado
 * entre lojas sem que uma única política do PostgreSQL seja violada, sem erro
 * no registro e sem nada para a revisão de código enxergar.
 *
 * Por isso `chaveDeCache` **recusa** montar chave sem loja, em vez de aceitar
 * um valor vazio: chave sem loja não é um caso de uso, é um defeito.
 *
 * ## Por que o prazo existe mesmo havendo invalidação
 *
 * A invalidação empurrada (o dono altera o produto → o catálogo daquela loja
 * some do cache) é o caminho rápido. O prazo de validade é a rede de proteção:
 * se a invalidação se perder — processo reiniciado no meio, rede oscilando, um
 * caminho de escrita novo que ninguém lembrou de ligar —, o dado velho morre
 * sozinho em `TTL_PADRAO_SEGUNDOS`. É o que impede o cache de guardar uma
 * mentira para sempre e exigir "reiniciar o serviço", que é justamente o que
 * AC-028 proíbe.
 *
 * ## Por que a queda do cache não derruba a loja
 *
 * O Redis é descartável por decisão registrada (17/08: fila de impressão no
 * PostgreSQL, "se o cache cair, a cozinha continua recebendo pedido"). Aqui
 * isso vira comportamento: toda falha de cache é engolida, anotada por
 * `aoDegradar` e respondida indo ao banco. Nenhuma exceção do cache sobe para
 * o caso de uso.
 *
 * ## Por que o cliente de Redis é escrito à mão
 *
 * P-014 pede benefício demonstrável antes de somar dependência. Deste módulo o
 * Redis recebe cinco comandos (`AUTH`, `SELECT`, `GET`, `SET`, `DEL`, `SCAN`) e
 * uma exigência incomum: **falhar rápido**. As bibliotecas maduras fazem o
 * oposto por padrão — enfileiram o comando enquanto reconectam, e é essa fila
 * que transforma "o cache caiu" em "a página pendurou". O que sobraria delas
 * seria o que aqui cabe em duzentas linhas: codificar RESP, ler RESP e casar
 * resposta com pedido. Nenhum agrupamento, nenhum assinante, nenhum Lua.
 */

import net from "node:net";

// ---------------------------------------------------------------------------
// Regra da chave
// ---------------------------------------------------------------------------

/** Separador entre as partes da chave. */
const SEPARADOR = ":";

/**
 * O que pode aparecer em uma parte de chave.
 *
 * O separador está fora da lista de propósito: com ele permitido, a loja
 * `a` com o dado `b:c` e a loja `a:b` com o dado `c` produziriam a MESMA
 * chave, e uma passaria a ler o dado da outra. É o mesmo defeito de AC-027,
 * entrando por outra porta.
 */
const FORMA_DA_PARTE = /^[A-Za-z0-9_.-]+$/;

/** Prazo de validade padrão de uma entrada, em segundos. */
export const TTL_PADRAO_SEGUNDOS = 60;

/** Quanto tempo o cache fica de lado depois de uma falha, em milissegundos. */
export const ESPERA_APOS_FALHA_PADRAO_MS = 5_000;

/** Quanto um comando pode demorar antes de ser considerado perdido. */
export const TEMPO_LIMITE_PADRAO_MS = 1_000;

/** Parte de chave que não serve — com o motivo dito por extenso. */
export class ErroDeChaveDeCache extends Error {
  readonly parte: string;

  constructor(parte: string, motivo: string) {
    super(
      [
        `A chave de cache não pode ser montada: ${parte} ${motivo}.`,
        "",
        "Toda chave de cache começa pelo identificador da loja (AC-027). O cache",
        "responde ANTES do banco, então a política de isolamento não é consultada:",
        "chave sem loja serviria o dado de uma loja para outra sem violar nada.",
      ].join("\n"),
    );
    this.name = "ErroDeChaveDeCache";
    this.parte = parte;
  }
}

/** Devolve a parte já conferida, ou recusa dizendo qual delas está errada. */
function exigirParte(nomeDaParte: string, valor: string): string {
  const limpo = valor.trim();
  if (limpo === "") {
    throw new ErroDeChaveDeCache(nomeDaParte, "veio vazio");
  }
  if (!FORMA_DA_PARTE.test(limpo)) {
    throw new ErroDeChaveDeCache(
      nomeDaParte,
      `tem caractere que a chave não aceita ("${limpo}") — só letras, números, ponto, hífen e sublinhado`,
    );
  }
  return limpo;
}

/**
 * Monta a chave de cache: `<loja>:<nome>[:<parte>…]`.
 *
 * O identificador da loja vem PRIMEIRO, e não no meio, porque é isso que torna
 * "tudo desta loja" um prefixo — e prefixo é o que permite invalidar a loja
 * inteira em uma varredura só, sem manter índice paralelo de chaves.
 */
export function chaveDeCache(
  lojaId: string,
  nome: string,
  ...partes: readonly string[]
): string {
  const loja = exigirParte("o identificador da loja", lojaId);
  const dado = exigirParte("o nome do dado", nome);
  const resto = partes.map((parte, indice) =>
    exigirParte(`a parte ${indice + 1} da chave`, parte),
  );
  return [loja, dado, ...resto].join(SEPARADOR);
}

/** Prefixo que cobre todas as chaves de uma loja, e só as dela. */
export function prefixoDaLoja(lojaId: string): string {
  return `${exigirParte("o identificador da loja", lojaId)}${SEPARADOR}`;
}

// ---------------------------------------------------------------------------
// O que o cache espera de um cliente
// ---------------------------------------------------------------------------

/**
 * O contrato mínimo com o servidor de cache.
 *
 * Todo método PODE lançar: quem trata a queda é `criarCache`, num lugar só.
 * Um cliente que engolisse a falha por dentro esconderia a degradação de quem
 * precisa medi-la.
 */
export interface ClienteDeCache {
  buscar(chave: string): Promise<string | undefined>;
  guardar(chave: string, valor: string, ttlSegundos: number): Promise<void>;
  remover(chaves: readonly string[]): Promise<number>;
  listarPorPrefixo(prefixo: string): Promise<string[]>;
  encerrar(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Cliente de Redis mínimo, falando RESP sobre TCP
// ---------------------------------------------------------------------------

/** Resposta do Redis, já convertida do protocolo para valor de JavaScript. */
type RespostaRedis = string | number | null | ErroDoRedis | RespostaRedis[];

/** O servidor respondeu com erro (`-ERR …`). */
export class ErroDoRedis extends Error {
  constructor(mensagem: string) {
    super(`O cache recusou o comando: ${mensagem}`);
    this.name = "ErroDoRedis";
  }
}

/** A conversa com o cache não aconteceu: caiu, não conectou ou demorou demais. */
export class ErroDeCacheIndisponivel extends Error {
  constructor(motivo: string) {
    super(`O cache está indisponível: ${motivo}.`);
    this.name = "ErroDeCacheIndisponivel";
  }
}

/** Um comando codificado em RESP: vetor de cadeias de tamanho declarado. */
function codificarComando(argumentos: readonly string[]): Buffer {
  const partes = argumentos.map(
    (argumento) => `$${Buffer.byteLength(argumento)}\r\n${argumento}\r\n`,
  );
  return Buffer.from(`*${argumentos.length}\r\n${partes.join("")}`, "utf8");
}

/** Um valor lido do fluxo, com a posição em que ele termina. */
interface Leitura {
  readonly valor: RespostaRedis;
  readonly fim: number;
}

/** Lê o vetor cujo cabeçalho já foi consumido, ou `undefined` se faltar dado. */
function lerVetor(
  dados: Buffer,
  quantidade: number,
  inicio: number,
): Leitura | undefined {
  const itens: RespostaRedis[] = [];
  let posicao = inicio;
  for (let indice = 0; indice < quantidade; indice += 1) {
    const item = lerResposta(dados, posicao);
    if (item === undefined) return undefined;
    itens.push(item.valor);
    posicao = item.fim;
  }
  return { valor: itens, fim: posicao };
}

/**
 * Lê UMA resposta a partir de `inicio`, ou devolve `undefined` quando o pedaço
 * que chegou ainda não a contém inteira.
 *
 * Devolver `undefined` em vez de esperar é o que faz o cliente aguentar o TCP
 * real, que parte a resposta onde bem entende — inclusive no meio do número
 * que diz o tamanho da resposta.
 */
function lerResposta(dados: Buffer, inicio: number): Leitura | undefined {
  const fimDaLinha = dados.indexOf("\r\n", inicio);
  if (fimDaLinha === -1) return undefined;

  const tipo = dados[inicio];
  const texto = dados.toString("utf8", inicio + 1, fimDaLinha);
  const depoisDaLinha = fimDaLinha + 2;

  // "+" simples, "-" erro, ":" inteiro — todos cabem na própria linha.
  if (tipo === 0x2b) return { valor: texto, fim: depoisDaLinha };
  if (tipo === 0x2d)
    return { valor: new ErroDoRedis(texto), fim: depoisDaLinha };
  if (tipo === 0x3a) return { valor: Number(texto), fim: depoisDaLinha };

  if (tipo === 0x24) {
    // "$" cadeia longa: o tamanho vem na linha, o conteúdo vem depois.
    const tamanho = Number(texto);
    if (tamanho === -1) return { valor: null, fim: depoisDaLinha };
    const fim = depoisDaLinha + tamanho + 2;
    if (dados.length < fim) return undefined;
    return {
      valor: dados.toString("utf8", depoisDaLinha, depoisDaLinha + tamanho),
      fim,
    };
  }

  if (tipo === 0x2a) {
    // "*" vetor: o cabeçalho diz quantos itens vêm em seguida.
    const quantidade = Number(texto);
    if (quantidade === -1) return { valor: null, fim: depoisDaLinha };
    return lerVetor(dados, quantidade, depoisDaLinha);
  }

  throw new ErroDoRedis(
    `resposta em formato desconhecido (byte ${String(tipo)})`,
  );
}

/** Só os textos de uma resposta em vetor — o resto é descartado. */
function apenasTextos(valor: RespostaRedis): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string");
}

/** Neutraliza os curingas de `SCAN MATCH` dentro de um prefixo literal. */
function escaparCuringas(texto: string): string {
  return texto.replace(/[*?[\]\\]/g, (achado) => `\\${achado}`);
}

/** Pedido à espera da resposta correspondente, na ordem em que foi enviado. */
interface Pendente {
  readonly resolver: (valor: RespostaRedis) => void;
  readonly rejeitar: (erro: Error) => void;
}

/** Ajustes do cliente de Redis. */
export interface OpcoesDoClienteRedis {
  /** Endereço completo: `redis://usuario:senha@maquina:porta/indice`. */
  readonly url: string;
  /** Quanto esperar por conexão e por resposta, em milissegundos. */
  readonly tempoLimiteMs?: number;
}

/** Endereço do cache que não dá para usar. */
export class ErroDeEnderecoDoCache extends Error {
  constructor(motivo: string) {
    super(
      `O endereço do cache não serve: ${motivo}. Esperado redis://maquina:porta/indice, vindo do ambiente (P-002).`,
    );
    this.name = "ErroDeEnderecoDoCache";
  }
}

/** Partes do endereço que o cliente precisa para abrir e autenticar a conexão. */
interface DestinoDoCache {
  readonly maquina: string;
  readonly porta: number;
  readonly usuario: string;
  readonly senha: string;
  readonly indice: string;
}

/** Interpreta o endereço do cache, recusando o que não é endereço de cache. */
export function lerEnderecoDoCache(url: string): DestinoDoCache {
  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    throw new ErroDeEnderecoDoCache(`"${url}" não é uma URL`);
  }
  if (endereco.protocol !== "redis:" && endereco.protocol !== "rediss:") {
    throw new ErroDeEnderecoDoCache(`o esquema é "${endereco.protocol}"`);
  }
  return {
    maquina: endereco.hostname,
    porta: Number(endereco.port === "" ? "6379" : endereco.port),
    usuario: decodeURIComponent(endereco.username),
    senha: decodeURIComponent(endereco.password),
    indice: endereco.pathname.replace(/^\//, ""),
  };
}

/**
 * Abre — preguiçosamente — uma conexão com o Redis e fala RESP nela.
 *
 * Preguiçoso porque importar este módulo não pode abrir soquete: teste de
 * unidade importa a API inteira e não tem cache no ar.
 */
export function criarClienteRedis(
  opcoes: OpcoesDoClienteRedis,
): ClienteDeCache {
  const destino = lerEnderecoDoCache(opcoes.url);
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;

  const pendentes: Pendente[] = [];
  let conexao: Promise<net.Socket> | undefined;
  let soquete: net.Socket | undefined;
  // Anotado porque o pedaço que chega do soquete não promete `ArrayBuffer`
  // exclusivo, e sem o tipo aberto a concatenação não compila.
  let sobra: Buffer = Buffer.alloc(0);
  let encerrado = false;

  /**
   * Derruba a conexão e recusa TODO pedido em voo.
   *
   * Não existe reaproveitar uma conexão que falhou no meio: o fluxo de
   * respostas é casado por ordem de chegada, e um pedaço perdido faria cada
   * resposta seguinte ser entregue ao pedido errado — cache servindo a chave
   * de outra chave, que é a versão silenciosa do defeito de AC-027.
   */
  function derrubar(erro: Error): void {
    conexao = undefined;
    sobra = Buffer.alloc(0);
    const antigo = soquete;
    soquete = undefined;
    antigo?.destroy();
    while (pendentes.length > 0) pendentes.shift()?.rejeitar(erro);
  }

  /** Consome do fluxo tudo que já forma resposta completa. */
  function receber(pedaco: Buffer): void {
    sobra = sobra.length === 0 ? pedaco : Buffer.concat([sobra, pedaco]);
    let posicao = 0;
    try {
      for (;;) {
        const leitura = lerResposta(sobra, posicao);
        if (leitura === undefined) break;
        posicao = leitura.fim;
        const pedido = pendentes.shift();
        if (leitura.valor instanceof ErroDoRedis) {
          pedido?.rejeitar(leitura.valor);
        } else {
          pedido?.resolver(leitura.valor);
        }
      }
    } catch (causa) {
      // Fluxo que não dá para interpretar derruba a conexão em vez de subir
      // como exceção sem dono: este código roda no tratador de evento do
      // soquete, e uma exceção aqui encerraria o processo inteiro da API por
      // causa do cache — o oposto de tratar a queda do cache como degradação.
      derrubar(
        new ErroDeCacheIndisponivel(
          causa instanceof Error ? causa.message : "resposta ilegível",
        ),
      );
      return;
    }
    sobra = posicao === 0 ? sobra : sobra.subarray(posicao);
  }

  /** Enfileira o pedido e escreve o comando, com prazo próprio de resposta. */
  function enviar(
    canal: net.Socket,
    argumentos: readonly string[],
  ): Promise<RespostaRedis> {
    return new Promise<RespostaRedis>((resolver, rejeitar) => {
      const prazo = setTimeout(() => {
        derrubar(
          new ErroDeCacheIndisponivel(
            `o comando ${argumentos[0] ?? "?"} passou de ${tempoLimiteMs}ms sem resposta`,
          ),
        );
      }, tempoLimiteMs);
      prazo.unref();

      pendentes.push({
        resolver: (valor) => {
          clearTimeout(prazo);
          resolver(valor);
        },
        rejeitar: (erro) => {
          clearTimeout(prazo);
          rejeitar(erro);
        },
      });
      canal.write(codificarComando(argumentos));
    });
  }

  /** Autentica e escolhe o índice, antes de qualquer comando de quem chamou. */
  async function apresentar(canal: net.Socket): Promise<void> {
    if (destino.senha !== "") {
      const credencial =
        destino.usuario === ""
          ? ["AUTH", destino.senha]
          : ["AUTH", destino.usuario, destino.senha];
      await enviar(canal, credencial);
    }
    if (destino.indice !== "") await enviar(canal, ["SELECT", destino.indice]);
  }

  /** Uma conexão por cliente, criada na primeira necessidade. */
  function conectar(): Promise<net.Socket> {
    if (encerrado) {
      return Promise.reject(
        new ErroDeCacheIndisponivel("o cliente foi encerrado"),
      );
    }
    conexao ??= new Promise<net.Socket>((resolver, rejeitar) => {
      const canal = net.connect({
        host: destino.maquina,
        port: destino.porta,
        timeout: tempoLimiteMs,
      });
      canal.setNoDelay(true);

      const desistir = (erro: Error): void => {
        derrubar(erro);
        rejeitar(erro);
      };

      canal.once("error", (erro: Error) => {
        desistir(new ErroDeCacheIndisponivel(erro.message));
      });
      canal.once("timeout", () => {
        desistir(
          new ErroDeCacheIndisponivel(
            `a conexão com ${destino.maquina}:${destino.porta} passou de ${tempoLimiteMs}ms`,
          ),
        );
      });

      canal.once("connect", () => {
        // O prazo de conexão não pode virar prazo de ociosidade: cache parado
        // entre dois pedidos é o estado normal, não uma falha.
        canal.setTimeout(0);
        canal.on("data", receber);
        canal.on("close", () => {
          derrubar(new ErroDeCacheIndisponivel("a conexão foi encerrada"));
        });
        soquete = canal;
        apresentar(canal).then(() => resolver(canal), desistir);
      });
    });
    return conexao;
  }

  /** Garante conexão e executa um comando nela. */
  async function executar(
    ...argumentos: readonly string[]
  ): Promise<RespostaRedis> {
    const canal = await conectar();
    return enviar(canal, argumentos);
  }

  return {
    async buscar(chave) {
      const resposta = await executar("GET", chave);
      return typeof resposta === "string" ? resposta : undefined;
    },

    async guardar(chave, valor, ttlSegundos) {
      // O Redis recusa prazo zero ou negativo; um segundo é o menor prazo real.
      const segundos = Math.max(1, Math.ceil(ttlSegundos));
      await executar("SET", chave, valor, "EX", String(segundos));
    },

    async remover(chaves) {
      if (chaves.length === 0) return 0;
      const resposta = await executar("DEL", ...chaves);
      return typeof resposta === "number" ? resposta : 0;
    },

    async listarPorPrefixo(prefixo) {
      const padrao = `${escaparCuringas(prefixo)}*`;
      const achadas: string[] = [];
      let cursor = "0";
      do {
        const resposta = await executar(
          "SCAN",
          cursor,
          "MATCH",
          padrao,
          "COUNT",
          "500",
        );
        if (!Array.isArray(resposta)) break;
        cursor = typeof resposta[0] === "string" ? resposta[0] : "0";
        achadas.push(...apenasTextos(resposta[1] ?? null));
      } while (cursor !== "0");
      return achadas;
    },

    async encerrar() {
      encerrado = true;
      derrubar(new ErroDeCacheIndisponivel("o cliente foi encerrado"));
      return Promise.resolve();
    },
  };
}

// ---------------------------------------------------------------------------
// O cache propriamente dito
// ---------------------------------------------------------------------------

/** O que falhou no cache, para quem quiser medir a degradação. */
export interface FalhaDeCache {
  readonly operacao: "buscar" | "guardar" | "listar" | "remover";
  readonly chave: string;
  readonly causa: unknown;
}

/** Ajustes do cache. Tudo tem padrão; teste sobrescreve o que precisa. */
export interface OpcoesDeCache {
  readonly cliente: ClienteDeCache;
  /** Prazo de validade padrão das entradas, em segundos. */
  readonly ttlSegundos?: number;
  /** Quanto tempo o cache fica de lado depois de falhar, em milissegundos. */
  readonly esperaAposFalhaMs?: number;
  /** Chamado a cada falha engolida — é por aqui que a degradação vira número. */
  readonly aoDegradar?: (falha: FalhaDeCache) => void;
  /** Relógio, para o teste não precisar esperar de verdade. */
  readonly agora?: () => number;
}

/** Ajustes de uma leitura com cache. */
export interface OpcoesDeLembranca {
  /** Partes extras da chave, depois do nome do dado. */
  readonly partes?: readonly string[];
  /** Prazo desta entrada, em segundos. */
  readonly ttlSegundos?: number;
}

/** O cache, visto por quem o usa. Nenhum método deste objeto lança por falha do cache. */
export interface Cache {
  chave(lojaId: string, nome: string, ...partes: readonly string[]): string;
  lembrar<T>(
    lojaId: string,
    nome: string,
    calcular: () => Promise<T>,
    opcoes?: OpcoesDeLembranca,
  ): Promise<T>;
  esquecer(
    lojaId: string,
    nome: string,
    ...partes: readonly string[]
  ): Promise<void>;
  invalidarLoja(lojaId: string): Promise<number>;
  degradado(): boolean;
  encerrar(): Promise<void>;
}

/**
 * Envelope do valor guardado.
 *
 * Existe para separar "não tem nada guardado" de "está guardado o valor nulo".
 * Sem ele, um catálogo legitimamente vazio seria recalculado a cada visita, e
 * o cache passaria a não acelerar nada justamente na loja que ainda não tem
 * produto — a que mais aparece em demonstração.
 */
interface EnvelopeGuardado<T> {
  readonly v: T;
}

/** Texto guardado, ou `undefined` quando o valor não é representável em JSON. */
function empacotar<T>(valor: T): string | undefined {
  const envelope: EnvelopeGuardado<T> = { v: valor };
  const texto = JSON.stringify(envelope);
  return typeof texto === "string" && texto.includes('"v"') ? texto : undefined;
}

/** Valor guardado, ou `undefined` quando o texto não é um envelope válido. */
function desempacotar<T>(texto: string): EnvelopeGuardado<T> | undefined {
  try {
    const lido: unknown = JSON.parse(texto);
    if (typeof lido !== "object" || lido === null || !("v" in lido)) {
      return undefined;
    }
    return lido as EnvelopeGuardado<T>;
  } catch {
    // Conteúdo estragado é tratado como ausência: recalcular custa uma
    // consulta; devolver lixo para a vitrine custa a confiança da loja.
    return undefined;
  }
}

/**
 * Monta o cache sobre um cliente.
 *
 * A tradução de "cache" para "leitura que vai ao banco quando o cache não
 * responde" acontece toda aqui, num lugar só, para que nenhum caso de uso
 * precise lembrar de tratar a queda do Redis.
 */
export function criarCache(opcoes: OpcoesDeCache): Cache {
  const cliente = opcoes.cliente;
  const ttlPadrao = opcoes.ttlSegundos ?? TTL_PADRAO_SEGUNDOS;
  const esperaAposFalhaMs =
    opcoes.esperaAposFalhaMs ?? ESPERA_APOS_FALHA_PADRAO_MS;
  const agora = opcoes.agora ?? Date.now;
  const aoDegradar = opcoes.aoDegradar;

  /**
   * Até quando o cache é ignorado.
   *
   * Depois de uma falha, insistir a cada requisição só multiplica a espera:
   * cada leitura pagaria o prazo de conexão antes de ir ao banco, e a loja
   * ficaria lenta em vez de ficar sem cache. Passada a espera, a próxima
   * leitura tenta de novo — e é assim que o cache volta sozinho, sem
   * reinício de serviço.
   */
  let ignorarAte = 0;

  function degradado(): boolean {
    return agora() < ignorarAte;
  }

  /** Executa uma operação de cache; falha vira `undefined` e nunca sobe. */
  async function tentar<T>(
    operacao: FalhaDeCache["operacao"],
    chave: string,
    acao: () => Promise<T>,
  ): Promise<T | undefined> {
    if (degradado()) return undefined;
    try {
      return await acao();
    } catch (causa) {
      ignorarAte = agora() + esperaAposFalhaMs;
      aoDegradar?.({ operacao, chave, causa });
      return undefined;
    }
  }

  return {
    chave: chaveDeCache,

    async lembrar<T>(
      lojaId: string,
      nome: string,
      calcular: () => Promise<T>,
      ajustes: OpcoesDeLembranca = {},
    ): Promise<T> {
      const chave = chaveDeCache(lojaId, nome, ...(ajustes.partes ?? []));

      const guardado = await tentar("buscar", chave, () =>
        cliente.buscar(chave),
      );
      if (guardado !== undefined) {
        const envelope = desempacotar<T>(guardado);
        if (envelope !== undefined) return envelope.v;
      }

      const valor = await calcular();
      const texto = empacotar(valor);
      if (texto !== undefined) {
        await tentar("guardar", chave, () =>
          cliente.guardar(chave, texto, ajustes.ttlSegundos ?? ttlPadrao),
        );
      }
      return valor;
    },

    async esquecer(lojaId, nome, ...partes) {
      const chave = chaveDeCache(lojaId, nome, ...partes);
      await tentar("remover", chave, () => cliente.remover([chave]));
    },

    /**
     * Apaga tudo que é daquela loja — e nada que não seja.
     *
     * É a varredura por prefixo que a regra da chave comprou: sem o
     * identificador da loja na frente, "esquecer o que mudou nesta loja"
     * exigiria manter um índice paralelo de chaves, que envelhece e mente.
     */
    async invalidarLoja(lojaId) {
      const prefixo = prefixoDaLoja(lojaId);
      const chaves = await tentar("listar", prefixo, () =>
        cliente.listarPorPrefixo(prefixo),
      );
      if (chaves === undefined || chaves.length === 0) return 0;
      const removidas = await tentar("remover", prefixo, () =>
        cliente.remover(chaves),
      );
      return removidas ?? 0;
    },

    degradado,

    encerrar() {
      return cliente.encerrar();
    },
  };
}

// ---------------------------------------------------------------------------
// O cache da aplicação
// ---------------------------------------------------------------------------

/** De onde as variáveis são lidas — normalmente `process.env`. */
export type FonteDeAmbiente = Readonly<Record<string, string | undefined>>;

let cacheDaAplicacao: Cache | undefined;

/**
 * O cache que a API usa em execução, montado uma vez a partir do ambiente.
 * Preguiçoso pelo mesmo motivo de `banco()`: importar não pode abrir conexão.
 */
export function cache(fonte: FonteDeAmbiente = process.env): Cache {
  cacheDaAplicacao ??= criarCache({
    cliente: criarClienteRedis({ url: fonte.REDIS_URL ?? "" }),
  });
  return cacheDaAplicacao;
}

/** Encerra o cache da aplicação. Serve ao desligamento ordenado da API. */
export async function encerrarCache(): Promise<void> {
  const atual = cacheDaAplicacao;
  cacheDaAplicacao = undefined;
  await atual?.encerrar();
}

// ---------------------------------------------------------------------------
// Aviso ao site: a outra metade de AC-028
// ---------------------------------------------------------------------------

/**
 * O site tem cache próprio, do lado dele (Next), e a API não alcança a memória
 * daquele processo. Quando o dono altera o catálogo, a API limpa o próprio
 * cache (`invalidarLoja`) e AVISA o site para limpar o dele.
 *
 * O aviso é uma chamada autenticada por segredo compartilhado, vindo do
 * ambiente (P-002). Sem autenticação, qualquer um na rede poderia derrubar o
 * cache de qualquer loja em laço — negação de serviço barata, porque cada
 * limpeza empurra tráfego para o banco.
 *
 * E o aviso é BEST-EFFORT de propósito: se o site não responder, o dado velho
 * ainda morre sozinho no prazo de validade. Uma alteração de produto não pode
 * falhar porque o cache do site estava fora do ar.
 */

/** Cabeçalho que carrega o segredo compartilhado. */
export const CABECALHO_DE_REVALIDACAO = "x-simpleclick-revalidacao";

/** Caminho da rota de invalidação no site. */
export const CAMINHO_DE_REVALIDACAO = "/api/revalidate";

/** Segredo curto é adivinhável; 32 caracteres é o mesmo piso do resto do projeto. */
export const TAMANHO_MINIMO_DO_SEGREDO = 32;

/** Quanto o aviso ao site pode demorar antes de ser dado por perdido. */
export const TEMPO_LIMITE_DO_AVISO_MS = 2_000;

/** Configuração do aviso pela metade, ou com segredo que não é segredo. */
export class ErroDeConfiguracaoDoAviso extends Error {
  readonly variavel: string;

  constructor(variavel: string, motivo: string) {
    super(
      [
        `O aviso de invalidação ao site não pode ser montado: ${variavel} ${motivo}.`,
        "",
        "URL_DO_SITE e SEGREDO_DE_REVALIDACAO andam juntas: com uma só, a API",
        "chamaria o site sem se identificar, e o site recusaria — a alteração do",
        "catálogo só apareceria quando o prazo de validade vencesse.",
      ].join("\n"),
    );
    this.name = "ErroDeConfiguracaoDoAviso";
    this.variavel = variavel;
  }
}

/** Para onde avisar e com qual segredo. */
export interface ConfiguracaoDoAviso {
  readonly urlDoSite: string;
  readonly segredo: string;
}

/** Valor da variável já sem espaços, ou `undefined` quando ela não veio. */
function variavel(fonte: FonteDeAmbiente, nome: string): string | undefined {
  const bruto = fonte[nome]?.trim();
  return bruto === undefined || bruto === "" ? undefined : bruto;
}

/**
 * Lê a configuração do aviso, ou devolve `undefined` quando ele não está
 * configurado — caso legítimo em desenvolvimento, onde o prazo de validade
 * basta. Configuração pela metade, essa sim, é recusada: ela pareceria ligada
 * e nunca funcionaria.
 */
export function lerConfiguracaoDoAviso(
  fonte: FonteDeAmbiente,
): ConfiguracaoDoAviso | undefined {
  const urlDoSite = variavel(fonte, "URL_DO_SITE");
  const segredo = variavel(fonte, "SEGREDO_DE_REVALIDACAO");

  if (urlDoSite === undefined && segredo === undefined) return undefined;
  if (urlDoSite === undefined) {
    throw new ErroDeConfiguracaoDoAviso("URL_DO_SITE", "não está definida");
  }
  if (segredo === undefined) {
    throw new ErroDeConfiguracaoDoAviso(
      "SEGREDO_DE_REVALIDACAO",
      "não está definida",
    );
  }
  if (segredo.length < TAMANHO_MINIMO_DO_SEGREDO) {
    throw new ErroDeConfiguracaoDoAviso(
      "SEGREDO_DE_REVALIDACAO",
      `tem ${segredo.length} caracteres, e o mínimo é ${TAMANHO_MINIMO_DO_SEGREDO}`,
    );
  }
  return { urlDoSite, segredo };
}

/** O que aconteceu com o aviso — nenhum destes casos derruba quem chamou. */
export type ResultadoDoAviso =
  "enviado" | "nao_configurado" | "recusado" | "indisponivel";

/**
 * O que mudou: a loja e, opcionalmente, quais dados dela.
 *
 * A loja pode vir de dois jeitos, e cada um apaga uma família de entradas do
 * site. Pelo IDENTIFICADOR, o que o site guardou com `lembrarNoSite`. Pelo
 * APELIDO, a vitrine pública: o site a lê pelo endereço que o cliente abriu, e
 * a etiqueta precisa existir antes de se saber qual loja responde (dívida 93).
 * Os nomes são dados de uma loja identificada, e por isso só andam com o
 * identificador.
 */
export type AvisoDeMudanca =
  | {
      readonly lojaId: string;
      readonly nomes?: readonly string[];
      readonly apelido?: string;
    }
  | { readonly apelido: string };

/** Ajustes do aviso ao site. */
export interface OpcoesDoAviso {
  readonly configuracao: ConfiguracaoDoAviso | undefined;
  /** Como falar com o site. Existe para o teste não precisar de rede. */
  readonly enviar?: typeof fetch;
  readonly tempoLimiteMs?: number;
}

/** Corpo do aviso, exatamente como a rota do site o espera. */
function corpoDoAviso(aviso: AvisoDeMudanca): string {
  const apelido =
    aviso.apelido === undefined
      ? undefined
      : exigirParte("o apelido da loja", aviso.apelido);
  if (!("lojaId" in aviso)) return JSON.stringify({ apelido });

  const lojaId = exigirParte("o identificador da loja", aviso.lojaId);
  const nomes = (aviso.nomes ?? []).map((nome) =>
    exigirParte("o nome do dado", nome),
  );
  return JSON.stringify({
    lojaId,
    ...(nomes.length === 0 ? {} : { nomes }),
    ...(apelido === undefined ? {} : { apelido }),
  });
}

/**
 * Monta o avisador. Quem chama recebe uma função que nunca lança por causa do
 * site: o pior resultado possível é `"indisponivel"`, e aí o prazo de validade
 * assume.
 */
export function criarAvisoDoSite(
  opcoes: OpcoesDoAviso,
): (aviso: AvisoDeMudanca) => Promise<ResultadoDoAviso> {
  const configuracao = opcoes.configuracao;
  const enviar = opcoes.enviar ?? fetch;
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_DO_AVISO_MS;

  return async function avisar(aviso) {
    if (configuracao === undefined) return "nao_configurado";
    const corpo = corpoDoAviso(aviso);

    try {
      const resposta = await enviar(
        new URL(CAMINHO_DE_REVALIDACAO, configuracao.urlDoSite).toString(),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [CABECALHO_DE_REVALIDACAO]: configuracao.segredo,
          },
          body: corpo,
          signal: AbortSignal.timeout(tempoLimiteMs),
        },
      );
      if (resposta.ok) return "enviado";
      // 401 e 403 são o site dizendo "não te reconheço": não adianta insistir,
      // e confundir isso com queda esconderia segredo trocado entre os dois.
      return resposta.status === 401 || resposta.status === 403
        ? "recusado"
        : "indisponivel";
    } catch {
      return "indisponivel";
    }
  };
}
