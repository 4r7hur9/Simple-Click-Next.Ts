/**
 * Os parâmetros da linha de comando do perfil de simulação (card #130/#135).
 *
 * Funções puras: nada aqui toca banco nem rede. O perfil é reproduzível, e por
 * isso `--semente` e `--referencia` são OBRIGATÓRIOS e não têm valor padrão:
 * quem roda diz qual perfil quer, e o mesmo par dá sempre as mesmas 100 lojas
 * e os mesmos 1.000 pedidos (D-3).
 */

/** Erro de parâmetro: a mensagem é para quem digitou o comando. */
export class ErroDeParametros extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeParametros";
  }
}

/** Nome do banco descartável do perfil. */
export const BANCO_PADRAO = "simpleclick_simulacao";

/** Só estes nomes de banco são aceitos (D-2). */
export const PADRAO_DO_NOME_DO_BANCO = /^simpleclick_simulacao(_[a-z0-9]+)?$/;

/** Referência ISO 8601 COM fuso (Z ou ±HH:MM): sem fuso, a data mudaria de máquina para máquina. */
const PADRAO_DA_REFERENCIA =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

type Bruto = Map<string, string | true>;

/**
 * Separa `--chave valor`, `--chave=valor` e `--bandeira`. Ignora o `--` solto
 * que o pnpm repassa antes dos argumentos do script. Recusa o que não estiver
 * na lista do comando.
 */
export function lerArgumentos(
  argv: readonly string[],
  comValor: readonly string[],
  bandeiras: readonly string[],
): Bruto {
  const lidos: Bruto = new Map();
  for (let i = 0; i < argv.length; i++) {
    const argumento = argv[i]!;
    if (argumento === "--") continue;
    if (!argumento.startsWith("--")) {
      throw new ErroDeParametros(`Argumento inesperado: "${argumento}".`);
    }
    const igual = argumento.indexOf("=");
    const nome = igual === -1 ? argumento.slice(2) : argumento.slice(2, igual);
    if (lidos.has(nome)) {
      throw new ErroDeParametros(`--${nome} foi informado mais de uma vez.`);
    }
    if (bandeiras.includes(nome)) {
      if (igual !== -1) {
        throw new ErroDeParametros(`--${nome} não recebe valor.`);
      }
      lidos.set(nome, true);
    } else if (comValor.includes(nome)) {
      let valor: string | undefined;
      if (igual !== -1) {
        valor = argumento.slice(igual + 1);
      } else {
        valor = argv[i + 1];
        i++;
      }
      if (valor === undefined || valor === "" || valor.startsWith("--")) {
        throw new ErroDeParametros(`--${nome} precisa de um valor.`);
      }
      lidos.set(nome, valor);
    } else {
      throw new ErroDeParametros(`Opção desconhecida: --${nome}.`);
    }
  }
  return lidos;
}

const texto = (bruto: Bruto, nome: string): string | undefined => {
  const valor = bruto.get(nome);
  return typeof valor === "string" ? valor : undefined;
};

/** A semente: texto livre, curto e sem quebra de linha. */
export function validarSemente(valor: string | undefined): string {
  const semente = valor?.trim() ?? "";
  if (semente === "") {
    throw new ErroDeParametros(
      "--semente é obrigatório (texto que decide o perfil; ex.: --semente sc-2026).",
    );
  }
  if (semente.length > 80 || /[\r\n]/.test(semente)) {
    throw new ErroDeParametros(
      "--semente aceita até 80 caracteres, em uma linha só.",
    );
  }
  return semente;
}

/** A referência: o "agora" do perfil. */
export function validarReferencia(valor: string | undefined): Date {
  if (valor === undefined || valor.trim() === "") {
    throw new ErroDeParametros(
      "--referencia é obrigatório (data ISO com fuso; ex.: --referencia 2026-11-01T18:00:00-03:00).",
    );
  }
  const referencia = valor.trim();
  if (!PADRAO_DA_REFERENCIA.test(referencia)) {
    throw new ErroDeParametros(
      `--referencia precisa ser ISO 8601 com fuso (Z ou ±HH:MM); recebido "${referencia}".`,
    );
  }
  const data = new Date(referencia);
  if (Number.isNaN(data.getTime())) {
    throw new ErroDeParametros(`--referencia "${referencia}" não é uma data válida.`);
  }
  return data;
}

/** Nome do banco da simulação, já conferido contra o padrão. */
export function validarNomeDoBanco(valor: string | undefined): string {
  const nome = valor ?? BANCO_PADRAO;
  if (!PADRAO_DO_NOME_DO_BANCO.test(nome)) {
    throw new ErroDeParametros(
      `O banco da simulação precisa casar com ${String(PADRAO_DO_NOME_DO_BANCO)}; recebido "${nome}".`,
    );
  }
  return nome;
}

// ---------------------------------------------------------------------------
// Endereços locais (--site, --api)
// ---------------------------------------------------------------------------

/** `::1` chega de `new URL` entre colchetes: tira, para comparar. */
export const semColchetes = (host: string): string =>
  host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

export const HOSTS_LOCAIS: readonly string[] = ["localhost", "127.0.0.1", "::1"];

export const ehHostLocal = (host: string): boolean =>
  HOSTS_LOCAIS.includes(semColchetes(host).toLowerCase());

/**
 * Endereço HTTP de uma aplicação local. Devolve só a origem (sem barra final,
 * sem caminho, sem credencial). Recusa servidor que não seja desta máquina:
 * o perfil tem token previsível e senha conhecida e nunca pode tocar algo
 * publicado.
 */
export function validarEnderecoLocal(rotulo: string, valor: string): string {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new ErroDeParametros(`${rotulo}: endereço inválido.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ErroDeParametros(`${rotulo}: só http ou https.`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new ErroDeParametros(`${rotulo}: não pode levar credencial no endereço.`);
  }
  if (!ehHostLocal(url.hostname)) {
    throw new ErroDeParametros(
      `${rotulo}: só aceita endereço local (localhost, 127.0.0.1 ou ::1).`,
    );
  }
  return url.origin;
}

// ---------------------------------------------------------------------------
// Os três comandos
// ---------------------------------------------------------------------------

export interface ParametrosDaCarga {
  readonly semente: string;
  readonly referencia: Date;
  /** Como o usuário escreveu a referência (vai para o manifesto). */
  readonly referenciaTexto: string;
  readonly recriar: boolean;
  /** Só para provar a retomada: falha depois de N lojas gravadas. */
  readonly falharApos: number | null;
  /** Segue mesmo que o cluster aceite qualquer senha (pg_hba com trust). */
  readonly aceitarTrust: boolean;
  readonly banco: string;
}

export function lerParametrosDaCarga(argv: readonly string[]): ParametrosDaCarga {
  const bruto = lerArgumentos(
    argv,
    ["semente", "referencia", "falhar-apos", "banco"],
    ["recriar", "aceitar-trust"],
  );
  const semente = validarSemente(texto(bruto, "semente"));
  const referenciaTexto = texto(bruto, "referencia");
  const referencia = validarReferencia(referenciaTexto);
  const falhar = texto(bruto, "falhar-apos");
  let falharApos: number | null = null;
  if (falhar !== undefined) {
    if (!/^\d+$/.test(falhar) || Number(falhar) < 1) {
      throw new ErroDeParametros("--falhar-apos precisa ser um inteiro maior que zero.");
    }
    falharApos = Number(falhar);
  }
  return {
    semente,
    referencia,
    referenciaTexto: referenciaTexto!.trim(),
    recriar: bruto.has("recriar"),
    falharApos,
    aceitarTrust: bruto.has("aceitar-trust"),
    banco: validarNomeDoBanco(texto(bruto, "banco")),
  };
}

export interface ParametrosDaValidacao {
  readonly site: string | null;
  readonly api: string | null;
  readonly aceitarTrust: boolean;
  readonly banco: string;
  /** Sem estes dois, o perfil sai do manifesto. */
  readonly semente: string | null;
  readonly referencia: Date | null;
}

export function lerParametrosDaValidacao(
  argv: readonly string[],
): ParametrosDaValidacao {
  const bruto = lerArgumentos(
    argv,
    ["site", "api", "banco", "semente", "referencia"],
    ["aceitar-trust"],
  );
  const site = texto(bruto, "site");
  const api = texto(bruto, "api");
  if ((site === undefined) !== (api === undefined)) {
    throw new ErroDeParametros(
      "--site e --api andam juntos: informe os dois ou nenhum (só a camada do banco).",
    );
  }
  const semente = texto(bruto, "semente");
  const referencia = texto(bruto, "referencia");
  if ((semente === undefined) !== (referencia === undefined)) {
    throw new ErroDeParametros("--semente e --referencia andam juntos.");
  }
  return {
    site: site === undefined ? null : validarEnderecoLocal("--site", site),
    api: api === undefined ? null : validarEnderecoLocal("--api", api),
    aceitarTrust: bruto.has("aceitar-trust"),
    banco: validarNomeDoBanco(texto(bruto, "banco")),
    semente: semente === undefined ? null : validarSemente(semente),
    referencia: referencia === undefined ? null : validarReferencia(referencia),
  };
}

export interface ParametrosDaAplicacao {
  readonly portaDaApi: number;
  readonly portaDoSite: number;
  readonly aceitarTrust: boolean;
  readonly banco: string;
}

export const PORTA_DA_API = 3201;
export const PORTA_DO_SITE = 3200;

export function lerParametrosDaAplicacao(
  argv: readonly string[],
): ParametrosDaAplicacao {
  const bruto = lerArgumentos(argv, ["banco"], ["aceitar-trust"]);
  return {
    portaDaApi: PORTA_DA_API,
    portaDoSite: PORTA_DO_SITE,
    aceitarTrust: bruto.has("aceitar-trust"),
    banco: validarNomeDoBanco(texto(bruto, "banco")),
  };
}

// ---------------------------------------------------------------------------
// Endereços sem segredo
// ---------------------------------------------------------------------------

/**
 * Mostra só esquema, máquina, porta e banco: nunca usuário, senha, caminho ou
 * parâmetros. É a forma que pode ir para o terminal e para o relatório.
 */
export function mascararUrl(url: string): string {
  try {
    const u = new URL(url);
    const banco = u.pathname.replace(/^\//, "");
    return `${u.protocol}//${u.host}${banco === "" ? "" : `/${banco}`}`;
  } catch {
    return "<endereço inválido>";
  }
}
