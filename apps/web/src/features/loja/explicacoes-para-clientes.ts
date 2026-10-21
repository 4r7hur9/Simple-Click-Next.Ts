/**
 * Os textos do "i" que clientes e quem cria conta ou loja leem (card #70).
 *
 * Um arquivo só, para o inventário em `docs/campos-explicados/loja-conta.md`
 * e as telas dizerem a mesma coisa. Regra em `apps/web/AGENTS.md` ("Campos
 * explicados"): frase simples, sem termo técnico, e um exemplo (o componente
 * escreve o "Ex.:"). O "i" só entra onde o rótulo e a dica visível não bastam.
 */
export interface ExplicacaoNaTela {
  readonly titulo?: string;
  readonly texto: string;
  readonly exemplo?: string;
}

export const EXPLICACOES_PARA_CLIENTES = {
  atacado: {
    texto:
      "Levando mais unidades do mesmo item, cada uma sai mais barata. O desconto entra sozinho no carrinho quando você chega na quantidade da faixa.",
    exemplo: "a partir de 10 un., R$ 9,50 cada em vez de R$ 10,00.",
  },
  cpf: {
    texto:
      "Serve só para a nota fiscal sair no seu CPF. Se não precisar de nota, deixe em branco; dá para apagar quando quiser.",
    exemplo: "123.456.789-09.",
  },
  linkDaLoja: {
    texto:
      "É o endereço da sua loja na internet: o link que você manda para os clientes. Prefira curto e fácil de digitar, porque depois da aprovação só o suporte troca.",
    exemplo: "pastelaria-da-vila vira …/loja/pastelaria-da-vila.",
  },
  tipoDeNegocio: {
    texto:
      "O que a sua loja vende. Usamos para mostrar a loja na categoria certa do Explorar e para escolher a capa padrão.",
    exemplo: "Pastelaria, Mercadinho ou Pet shop.",
  },
  chaveDoAutenticador: {
    texto:
      "O aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou Authy) gera um código novo a cada 30 segundos. Esta chave liga o aplicativo à sua conta; você digita uma vez só.",
    exemplo: "ABCD EFGH IJKL MNOP.",
  },
  codigoDeRecuperacao: {
    texto:
      "Ao ativar o aplicativo autenticador, mostramos uma lista de códigos para guardar. Cada um serve uma vez, no lugar do código do aplicativo, se você perder o celular.",
    exemplo: "ABCD-EFGH.",
  },
} as const satisfies Record<string, ExplicacaoNaTela>;

export type ExplicacaoParaClientes = keyof typeof EXPLICACOES_PARA_CLIENTES;
