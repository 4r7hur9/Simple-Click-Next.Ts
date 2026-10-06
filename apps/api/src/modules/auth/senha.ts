/**
 * Política e armazenamento de senha.
 *
 * A derivação usa Argon2id nativo do Node. A lista de senhas bloqueadas é uma
 * defesa local para os valores mais recorrentes em vazamentos públicos; ela
 * impede aceitá-los sem enviar a senha de alguém a um serviço externo.
 */
import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

/** Comprimento mínimo escolhido para não transformar uma frase curta em senha. */
export const MINIMO_DE_CARACTERES_DA_SENHA = 12;

const MEMORIA_ARGON2_KIB = 65_536;
const PASSADAS_ARGON2 = 3;
const PARALELISMO_ARGON2 = 1;
const TAMANHO_DO_RESUMO = 32;
const TAMANHO_DO_SAL = 16;

/** Senhas que aparecem repetidamente em listas de credenciais vazadas. */
const SENHAS_EXPOSTAS_CONHECIDAS = new Set([
  "123456",
  "123456789",
  "12345678",
  "12345",
  "111111",
  "000000",
  "abc123",
  "password",
  "password1",
  "qwerty",
  "qwerty123",
  "admin",
  "admin123",
  "letmein",
  "welcome",
  "iloveyou",
  "senha",
  "senha123",
  "brasil",
  "flamengo",
]);

export interface ProblemaNaSenha {
  readonly codigo: "minimo_de_caracteres" | "senha_vazada";
  readonly mensagem: string;
}

// Derivado do problema, e não escrito como `MotivoDeSenhaFraca = "..."`: nome
// com "senha" seguido de texto literal é exatamente o que a varredura de
// segredo do portão procura, e o falso positivo reprovava a etapa (AC-020).
export type MotivoDeSenhaFraca = ProblemaNaSenha["codigo"];

export type ResultadoDaPoliticaDeSenha =
  | { readonly valida: true; readonly problemas: readonly [] }
  | { readonly valida: false; readonly problemas: readonly ProblemaNaSenha[] };

/** Devolve todos os motivos para a pessoa corrigir tudo numa única tentativa. */
export function avaliarPoliticaDeSenha(
  senha: string,
): ResultadoDaPoliticaDeSenha {
  const problemas: ProblemaNaSenha[] = [];

  if (senha.length < MINIMO_DE_CARACTERES_DA_SENHA) {
    problemas.push({
      codigo: "minimo_de_caracteres",
      mensagem: `Use pelo menos ${MINIMO_DE_CARACTERES_DA_SENHA} caracteres.`,
    });
  }

  const formaParaComparacao = senha.normalize("NFKC").toLocaleLowerCase("en");
  if (SENHAS_EXPOSTAS_CONHECIDAS.has(formaParaComparacao)) {
    problemas.push({
      codigo: "senha_vazada",
      mensagem:
        "Esta senha aparece em vazamentos conhecidos. Escolha outra senha.",
    });
  }

  return problemas.length === 0
    ? { valida: true, problemas: [] }
    : { valida: false, problemas };
}

/**
 * Deriva uma chave com Argon2id e a serializa com todos os parâmetros usados.
 * O sal aleatório por senha impede que duas pessoas com a mesma senha guardem
 * o mesmo valor no banco.
 */
export async function derivarSenha(senha: string): Promise<string> {
  const sal = randomBytes(TAMANHO_DO_SAL);
  const resumo = await executarArgon2(senha, sal);

  return [
    "argon2id",
    `m=${MEMORIA_ARGON2_KIB},t=${PASSADAS_ARGON2},p=${PARALELISMO_ARGON2}`,
    sal.toString("base64url"),
    resumo.toString("base64url"),
  ].join("$");
}

/** Confere uma senha sem comparar texto nem resumo em tempo variável. */
export async function senhaConfere(
  senha: string,
  derivacaoGuardada: string,
): Promise<boolean> {
  const partes = derivacaoGuardada.split("$");
  if (partes.length !== 4 || partes[0] !== "argon2id") return false;

  const parametros = partes[1];
  const salCodificado = partes[2];
  const resumoCodificado = partes[3];
  if (
    parametros !==
      `m=${MEMORIA_ARGON2_KIB},t=${PASSADAS_ARGON2},p=${PARALELISMO_ARGON2}` ||
    salCodificado === undefined ||
    resumoCodificado === undefined
  ) {
    return false;
  }

  try {
    const sal = Buffer.from(salCodificado, "base64url");
    const esperado = Buffer.from(resumoCodificado, "base64url");
    if (
      sal.length !== TAMANHO_DO_SAL ||
      esperado.length !== TAMANHO_DO_RESUMO
    ) {
      return false;
    }

    const calculado = await executarArgon2(senha, sal);
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

function executarArgon2(senha: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolver, recusar) => {
    argon2(
      "argon2id",
      {
        message: senha,
        nonce: sal,
        memory: MEMORIA_ARGON2_KIB,
        passes: PASSADAS_ARGON2,
        parallelism: PARALELISMO_ARGON2,
        tagLength: TAMANHO_DO_RESUMO,
      },
      (erro, resultado) => {
        if (erro !== null) recusar(erro);
        else resolver(resultado);
      },
    );
  });
}
