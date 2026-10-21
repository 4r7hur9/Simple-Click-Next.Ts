/**
 * Cadastro de cliente final (AC-100, AC-102), sem confirmação de e-mail.
 *
 * A mesma conta serve a cliente, dono, equipe e administração; quem se
 * cadastra aqui é cliente. A conta nasce com o e-mail marcado como verificado
 * (organização, não segurança) e quem chama abre a sessão logo em seguida —
 * por isso o caso de uso devolve o id da conta criada. Dono continua entrando
 * pelo convite da administração, que tem fluxo próprio.
 */
import {
  avaliarPoliticaDeSenha,
  derivarSenha,
  type ProblemaNaSenha,
} from "./senha.ts";

/**
 * Espelho local de `packages/contracts/src/auth.ts` até o barril público do
 * pacote expor o contrato. Importar o arquivo-fonte de outro pacote faria o
 * compilador da API tentar emiti-lo fora do seu diretório de saída.
 */
export interface CadastroDeClienteFinal {
  readonly nome: string;
  readonly email: string;
  /** Opcional: o pedido pede o telefone quando a conta não tem. */
  readonly telefone?: string | undefined;
  readonly senha: string;
}

/** Registro criado no repositório, já com o e-mail verificado. */
export interface NovaIdentidade {
  readonly nome: string;
  readonly emailNormalizado: string;
  readonly telefoneE164: string | null;
  readonly senhaDerivada: string;
}

/**
 * O adaptador executa o teste de unicidade e a inserção na mesma operação.
 * Assim dois pedidos simultâneos não conseguem criar a mesma conta. Devolve o
 * id da conta criada, ou `null` quando o e-mail já tem conta.
 */
export interface RepositorioDeIdentidades {
  criarVerificadaSeAusente(
    identidade: NovaIdentidade,
  ): Promise<{ readonly identidadeId: string } | null>;
}

export type ResultadoDoCadastro =
  | { readonly status: "CRIADA"; readonly identidadeId: string }
  | { readonly status: "EMAIL_EM_USO" }
  | {
      readonly status: "SENHA_FRACA";
      readonly campos: readonly {
        readonly campo: "senha";
        readonly problema: ProblemaNaSenha;
      }[];
    };

/** Cria a conta já verificada, ou diz que o e-mail já tem conta. */
export async function cadastrarClienteFinal(
  dados: CadastroDeClienteFinal,
  dependencias: { readonly identidades: RepositorioDeIdentidades },
): Promise<ResultadoDoCadastro> {
  const politica = avaliarPoliticaDeSenha(dados.senha);
  if (!politica.valida) {
    return {
      status: "SENHA_FRACA",
      campos: politica.problemas.map((problema) => ({
        campo: "senha" as const,
        problema,
      })),
    };
  }

  const senhaDerivada = await derivarSenha(dados.senha);
  const criada = await dependencias.identidades.criarVerificadaSeAusente({
    nome: dados.nome,
    emailNormalizado: dados.email.trim().toLocaleLowerCase("en"),
    telefoneE164: dados.telefone?.trim() || null,
    senhaDerivada,
  });

  return criada === null
    ? { status: "EMAIL_EM_USO" }
    : { status: "CRIADA", identidadeId: criada.identidadeId };
}
