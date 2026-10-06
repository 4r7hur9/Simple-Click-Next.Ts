/**
 * Arranque de produção, pela linha de comando (T-024, AC-049 a AC-051).
 *
 * Roda UMA vez, no terminal de quem opera, contra o banco de produção
 * recém-criado:
 *
 *   node --env-file=<arquivo fora do repositório> apps/api/src/arranque.ts
 *   (na imagem: node apps/api/dist/arranque.js)
 *
 * 1. Leva o banco ao estado do código com a credencial de dono
 *    (`DATABASE_URL_ARRANQUE`) e confere os três papéis — ver
 *    `packages/database/src/arranque.ts`.
 * 2. Se `PRIMEIRO_ADMIN_EMAIL` estiver no ambiente, cria a primeira
 *    administração pela credencial `sc_admin`, com a senha de
 *    `PRIMEIRO_ADMIN_SENHA` e o aplicativo autenticador confirmado aqui, no
 *    terminal. A chave e os códigos de recuperação aparecem só nesta saída.
 *
 * Nada de segredo no código, e a senha nunca é escrita. Saída: 0 pronto,
 * 1 recusa ou conferência reprovada, 2 ambiente incompleto.
 */

import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  arrancarBanco,
  type AmbienteDoArranque,
  type Conectar,
  conferirAmbienteDoArranque,
  ErroDeArranque,
} from "@simpleclick/database/arranque";
import { derivarUrlDePapel } from "@simpleclick/database";
import pg from "pg";

import {
  CONTEXTO_DO_TOTP,
  criarCifradorDeSegredos,
  problemaDaChaveDeCifra,
  VARIAVEL_DA_CHAVE_DO_TOTP,
} from "./core/cifra.ts";
import {
  conferirPedidoDaAdministracao,
  type ConviteDoAplicativo,
  criarPrimeiraAdministracao,
  ErroDaPrimeiraAdministracao,
} from "./modules/auth/primeira-administracao.ts";

export interface OpcoesDaExecucao {
  readonly ambiente: AmbienteDoArranque;
  /** Uma linha da saída de quem opera. */
  readonly escrever: (linha: string) => void;
  /** Mostra o convite do aplicativo e devolve o código digitado. */
  readonly lerCodigoDoAplicativo: (
    convite: ConviteDoAplicativo,
  ) => Promise<string>;
  readonly conectar?: Conectar;
}

/** Abre um `pg.Client` direto (sem agrupador) e devolve já conectado. */
const conectarDireto: Conectar = async (url) => {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente;
};

/** Valor da variável sem espaços, ou `undefined` quando vazia. */
function valorDe(ambiente: AmbienteDoArranque, nome: string) {
  const valor = ambiente[nome]?.trim();
  return valor === undefined || valor === "" ? undefined : valor;
}

/** Os dados da administração pedida, já conferidos, ou `undefined`. */
function pedidoDaAdministracao(ambiente: AmbienteDoArranque) {
  const email = valorDe(ambiente, "PRIMEIRO_ADMIN_EMAIL");
  if (email === undefined) return undefined;

  const senha = ambiente.PRIMEIRO_ADMIN_SENHA ?? "";
  if (senha === "") {
    throw new ErroDeArranque(
      "PRIMEIRO_ADMIN_EMAIL está definido e PRIMEIRO_ADMIN_SENHA não.",
      2,
    );
  }
  const chave = valorDe(ambiente, VARIAVEL_DA_CHAVE_DO_TOTP) ?? "";
  const problema = problemaDaChaveDeCifra(chave);
  if (problema !== undefined) {
    throw new ErroDeArranque(
      `${VARIAVEL_DA_CHAVE_DO_TOTP} ${problema}. Use a MESMA chave do serviço da API: sem ela o aplicativo da administração não confere.`,
      2,
    );
  }
  return {
    email: conferirPedidoDaAdministracao(email, senha),
    senha,
    nome: valorDe(ambiente, "PRIMEIRO_ADMIN_NOME"),
    cifrador: criarCifradorDeSegredos(chave, CONTEXTO_DO_TOTP),
  };
}

/** Roda o arranque inteiro e devolve o código de saída. */
export async function executarArranque(
  opcoes: OpcoesDaExecucao,
): Promise<number> {
  const { ambiente, escrever, conectar = conectarDireto } = opcoes;

  try {
    // Tudo o que pode ser recusado sem banco é recusado antes de tocá-lo.
    const url = conferirAmbienteDoArranque(ambiente);
    const administracao = pedidoDaAdministracao(ambiente);

    const banco = await arrancarBanco({
      ambiente,
      conectar,
      relatar: (linha) => escrever(`  ${linha}`),
    });
    escrever(
      `✔ banco em dia: ${banco.aplicadas.length} migração(ões) aplicada(s) agora, ${banco.jaAplicadas} já estavam`,
    );

    if (administracao === undefined) {
      escrever("  PRIMEIRO_ADMIN_EMAIL ausente: nenhuma administração criada");
      return 0;
    }

    const urlDaAdministracao = derivarUrlDePapel(
      url,
      "sc_admin",
      valorDe(ambiente, "SENHA_BANCO_ADMINISTRACAO") as string,
    );
    const conexao = await conectar(urlDaAdministracao);
    try {
      const resultado = await criarPrimeiraAdministracao({
        conexao,
        ...administracao,
        lerCodigoDoAplicativo: opcoes.lerCodigoDoAplicativo,
      });
      if (resultado.situacao === "ja_existia") {
        escrever(
          "✔ a primeira administração já existe com este e-mail; nada foi alterado",
        );
        return 0;
      }
      escrever("✔ primeira administração criada, com o aplicativo confirmado");
      escrever(
        "  Códigos de recuperação (aparecem só agora; guarde fora deste computador):",
      );
      for (const codigo of resultado.codigosDeRecuperacao) {
        escrever(`    ${codigo}`);
      }
      return 0;
    } finally {
      await conexao.end();
    }
  } catch (erro) {
    if (erro instanceof ErroDeArranque) {
      escrever(`✘ ${erro.message}`);
      return erro.codigoDeSaida;
    }
    if (erro instanceof ErroDaPrimeiraAdministracao) {
      escrever(`✘ ${erro.message}`);
      return 1;
    }
    escrever(`✘ ${erro instanceof Error ? erro.message : String(erro)}`);
    return 1;
  }
}

/** Pergunta o código no terminal, depois de mostrar a chave. */
async function perguntarNoTerminal(
  convite: ConviteDoAplicativo,
): Promise<string> {
  const chaveAgrupada = convite.chave.match(/.{1,4}/g)?.join(" ") ?? "";
  process.stdout.write(
    [
      "",
      "Cadastre a administração no aplicativo autenticador:",
      `  chave: ${chaveAgrupada}`,
      `  link:  ${convite.uri}`,
      "",
    ].join("\n"),
  );
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await terminal.question("Código de 6 dígitos do aplicativo: ");
  } finally {
    terminal.close();
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await executarArranque({
    ambiente: process.env,
    escrever: (linha) => process.stdout.write(`${linha}\n`),
    lerCodigoDoAplicativo: perguntarNoTerminal,
  });
}
