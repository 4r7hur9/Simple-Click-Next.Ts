import { createHash, randomBytes } from "node:crypto";

export const PRAZO_DO_CONVITE_EM_MS = 7 * 24 * 60 * 60 * 1000;

export type DadosDaNovaLoja = {
  nome: string;
  apelido: string;
  tipoDeNegocio: string;
  dono: { nome: string; email: string; telefone: string };
};

export type ConviteDoDono = {
  resumoDoToken: string;
  expiraEm: Date;
};

/**
 * A criação da loja, da identidade do dono e do convite precisa ser atômica.
 * O adaptador de produção deve executar a operação numa única transação.
 */
export type RepositorioDeConvites = {
  criarLojaEConvite(dados: {
    loja: DadosDaNovaLoja;
    convite: ConviteDoDono;
  }): Promise<{ lojaId: string; codigoDaLoja: string; statusInicial: string }>;
  consumirConviteEDefinirSenha(dados: {
    resumoDoToken: string;
    hashDaSenha: string;
    agora: Date;
  }): Promise<boolean>;
  reenviarConvite(dados: {
    lojaId: string;
    resumoDoToken: string;
    expiraEm: Date;
    agora: Date;
  }): Promise<{ email: string; nome: string } | null>;
};

export type DependenciasDeConvite = {
  repositorio: RepositorioDeConvites;
  enviarConvite(dados: {
    para: string;
    nome: string;
    token: string;
    expiraEm: Date;
  }): Promise<void>;
  validarNovaSenha(senha: string): Promise<void>;
  gerarHashDaSenha(senha: string): Promise<string>;
  agora(): Date;
  gerarToken(): string;
  resumirToken(token: string): string;
};

/**
 * O que definir a primeira senha usa: só o consumo do convite. A criação da
 * loja com o convite é do cadastro da administração, e quem aceita o convite
 * não precisa dela (T-111).
 */
export type DependenciasDaPrimeiraSenha = Pick<
  DependenciasDeConvite,
  "validarNovaSenha" | "gerarHashDaSenha" | "agora" | "resumirToken"
> & {
  repositorio: Pick<RepositorioDeConvites, "consumirConviteEDefinirSenha">;
};

/** O que reenviar o convite usa: só a troca do link. */
export type DependenciasDoReenvioDeConvite = Pick<
  DependenciasDeConvite,
  "enviarConvite" | "agora" | "gerarToken" | "resumirToken"
> & {
  repositorio: Pick<RepositorioDeConvites, "reenviarConvite">;
};

export type ResultadoDaPrimeiraSenha =
  | { ok: true; acessoLiberado: true }
  | { ok: false; motivo: "SENHA_INVALIDA" | "CONVITE_INVALIDO" };

function expiraEmSeteDias(agora: Date): Date {
  return new Date(agora.getTime() + PRAZO_DO_CONVITE_EM_MS);
}

/** Cria a loja e entrega ao responsável um convite para assumir o acesso. */
export async function criarLojaEConvidarDono(
  loja: DadosDaNovaLoja,
  dependencias: DependenciasDeConvite,
) {
  const agora = dependencias.agora();
  const token = dependencias.gerarToken();
  const expiraEm = expiraEmSeteDias(agora);
  const criada = await dependencias.repositorio.criarLojaEConvite({
    loja,
    convite: {
      resumoDoToken: dependencias.resumirToken(token),
      expiraEm,
    },
  });

  await dependencias.enviarConvite({
    para: loja.dono.email,
    nome: loja.dono.nome,
    token,
    expiraEm,
  });
  return criada;
}

/** Um convite válido define a primeira senha, verifica o e-mail e libera o dono. */
export async function definirPrimeiraSenha(
  dados: { token: string; senha: string },
  dependencias: DependenciasDaPrimeiraSenha,
): Promise<ResultadoDaPrimeiraSenha> {
  try {
    await dependencias.validarNovaSenha(dados.senha);
  } catch {
    return { ok: false, motivo: "SENHA_INVALIDA" };
  }

  const aplicado = await dependencias.repositorio.consumirConviteEDefinirSenha({
    resumoDoToken: dependencias.resumirToken(dados.token),
    hashDaSenha: await dependencias.gerarHashDaSenha(dados.senha),
    agora: dependencias.agora(),
  });
  return aplicado
    ? { ok: true, acessoLiberado: true }
    : { ok: false, motivo: "CONVITE_INVALIDO" };
}

/** Reenvio substitui o link anterior; ele não volta a tornar um convite usado válido. */
export async function reenviarConviteDoDono(
  lojaId: string,
  dependencias: DependenciasDoReenvioDeConvite,
): Promise<boolean> {
  const agora = dependencias.agora();
  const token = dependencias.gerarToken();
  const expiraEm = expiraEmSeteDias(agora);
  const destinatario = await dependencias.repositorio.reenviarConvite({
    lojaId,
    resumoDoToken: dependencias.resumirToken(token),
    expiraEm,
    agora,
  });
  if (destinatario === null) return false;

  await dependencias.enviarConvite({
    para: destinatario.email,
    nome: destinatario.nome,
    token,
    expiraEm,
  });
  return true;
}

export function gerarTokenDeConvite(): string {
  return randomBytes(32).toString("base64url");
}

export function resumirTokenDeConvite(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
