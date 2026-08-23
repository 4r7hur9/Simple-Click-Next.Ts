/** Cadastro de cliente final (AC-100, AC-101, AC-102). */
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
  readonly telefone: string;
  readonly senha: string;
}

export interface ConfirmacaoDeCadastro {
  readonly cadastrado: true;
  readonly mensagem: string;
  readonly verificacaoDeEmailPendente: true;
}

const CONFIRMACAO_DE_CADASTRO: ConfirmacaoDeCadastro = {
  cadastrado: true,
  mensagem:
    "Seus dados foram recebidos. Enviamos instruções para confirmar seu e-mail.",
  verificacaoDeEmailPendente: true,
};

/** Registro criado no repositório; `null` mantém a conta pendente de e-mail. */
export interface NovaIdentidade {
  readonly nome: string;
  readonly emailNormalizado: string;
  readonly telefoneE164: string;
  readonly senhaDerivada: string;
  readonly emailVerificadoEm: null;
}

/**
 * O adaptador executa o teste de unicidade e a inserção na mesma operação.
 * Assim dois pedidos simultâneos não conseguem criar a mesma conta.
 */
export interface RepositorioDeIdentidades {
  criarSeAusente(
    identidade: NovaIdentidade,
  ): Promise<{ readonly criada: boolean }>;
}

/** E-mails diferentes para os dois casos, sem mudar a resposta HTTP. */
export interface AvisosDeCadastro {
  enviarVerificacao(dados: {
    readonly email: string;
    readonly nome: string;
  }): Promise<void>;
  enviarAvisoDeCadastroExistente(dados: {
    readonly email: string;
    readonly nome: string;
  }): Promise<void>;
}

export type ResultadoDoCadastro =
  | ConfirmacaoDeCadastro
  | {
      readonly cadastrado: false;
      readonly campos: readonly {
        readonly campo: "senha";
        readonly problema: ProblemaNaSenha;
      }[];
    };

/**
 * Cria a conta sem revelar se o e-mail já era conhecido.
 *
 * A mensagem de sucesso é retornada nos dois caminhos. O aviso específico vai
 * para o dono do endereço, e não para quem submeteu a tentativa.
 */
export async function cadastrarClienteFinal(
  dados: CadastroDeClienteFinal,
  dependencias: {
    readonly identidades: RepositorioDeIdentidades;
    readonly avisos: AvisosDeCadastro;
  },
): Promise<ResultadoDoCadastro> {
  const politica = avaliarPoliticaDeSenha(dados.senha);
  if (!politica.valida) {
    return {
      cadastrado: false,
      campos: politica.problemas.map((problema) => ({
        campo: "senha" as const,
        problema,
      })),
    };
  }

  const senhaDerivada = await derivarSenha(dados.senha);
  const resultado = await dependencias.identidades.criarSeAusente({
    nome: dados.nome,
    emailNormalizado: dados.email.trim().toLocaleLowerCase("en"),
    telefoneE164: dados.telefone,
    senhaDerivada,
    emailVerificadoEm: null,
  });

  if (resultado.criada) {
    await dependencias.avisos.enviarVerificacao({
      email: dados.email,
      nome: dados.nome,
    });
  } else {
    await dependencias.avisos.enviarAvisoDeCadastroExistente({
      email: dados.email,
      nome: dados.nome,
    });
  }

  return CONFIRMACAO_DE_CADASTRO;
}
