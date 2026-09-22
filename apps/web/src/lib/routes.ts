/**
 * O manifesto de rotas: o inventário de telas, em código (AC-016).
 *
 * ELE ESPELHA `.spec/design/mapa-de-telas.md`, e é isso que torna "todas as
 * telas" verificável em vez de aspiracional. Duas verificações o usam, e elas
 * apontam em direções opostas de propósito:
 *
 *   * uma tela que existe no código e NÃO está aqui reprova — é o caso que
 *     importa hoje, porque é assim que uma tela entra no produto sem ninguém
 *     ter decidido que ela existe, sem estados, sem acessibilidade e sem
 *     critério que a cubra;
 *   * uma tela que está aqui e ainda não tem arquivo é TRABALHO PLANEJADO, e
 *     apenas conta. São 45 delas hoje, e cada uma é uma tarefa por fazer.
 *
 * A ROTA É ESCRITA COMO O MAPA A ESCREVE — `{slug}`, `{id}` —, e não como o
 * Next a escreve — `[slug]`, `[id]`. A tradução acontece na verificação, uma
 * vez, e não em 50 linhas escritas à mão: escrever no formato do framework
 * faria o manifesto envelhecer junto com ele.
 */

/** Quem alcança a tela. */
export type AcessoDaTela = "PUBLICO" | "CLIENTE" | "DONO" | "ADMIN";

/** Uma linha do inventário. */
export interface TelaDoManifesto {
  /** No formato do mapa: `/l/{slug}/produto/{id}`. */
  readonly rota: string;
  readonly tela: string;
  readonly acesso: AcessoDaTela;
  /** Se ela precisa dos quatro estados (P-011). */
  readonly quatroEstados: boolean;
  /** Os critérios que ela carrega, como o mapa os lista. */
  readonly criterios: string;
  /**
   * O arquivo que a desenha, quando ela já existe.
   *
   * Ausente significa PLANEJADA, e não esquecida: o mapa a declara, a tarefa
   * dela está no plano, e o dia em que o arquivo nascer esta linha ganha o
   * caminho — senão a verificação de cobertura reprova, que é o ponto.
   */
  readonly arquivo?: string;
}

/**
 * O inventário inteiro.
 *
 * Gerado a partir do mapa de telas e conferido linha a linha. Três linhas do
 * mapa declaram DUAS rotas cada (`/termos e /privacidade`, `/nao-encontrado e
 * erro`, `/painel/produtos/novo e /{id}`), e aqui elas viram entradas
 * separadas — 47 linhas no mapa, 50 rotas no produto.
 */
export const MANIFESTO_DE_ROTAS: readonly TelaDoManifesto[] = [
  {
    rota: "/l/{slug}",
    tela: "Página de apresentação da loja",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-400, AC-401, AC-402, AC-403, AC-916",
    arquivo: "apps/web/src/app/(loja)/l/[slug]/page.tsx",
  },
  {
    rota: "/l/{slug}/sobre",
    tela: "Página institucional da loja",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-421..AC-423",
    arquivo: "apps/web/src/app/(loja)/l/[slug]/sobre/page.tsx",
  },
  {
    rota: "/l/{slug}/catalogo",
    tela: "Vitrine / cardápio / catálogo",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-404..AC-409, AC-415..AC-417, AC-420",
    arquivo: "apps/web/src/app/(loja)/l/[slug]/catalogo/page.tsx",
  },
  {
    rota: "/l/{slug}/produto/{id}",
    tela: "Detalhe do produto",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-410..AC-414, AC-328",
    arquivo: "apps/web/src/app/(loja)/l/[slug]/produto/[id]/page.tsx",
  },
  {
    rota: "/l/{slug}/carrinho",
    tela: "Carrinho",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-500..AC-503",
  },
  {
    rota: "/l/{slug}/checkout",
    tela: "Fechamento do pedido",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-504..AC-513, AC-905..AC-908",
    arquivo: "apps/web/src/app/(loja)/l/[slug]/checkout/page.tsx",
  },
  {
    rota: "/l/{slug}/pedido/{token}",
    tela: "Acompanhamento do pedido",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-612..AC-615, AC-610",
  },
  {
    rota: "/l/{slug}/indisponivel",
    tela: "Loja fechada ou suspensa",
    acesso: "PUBLICO",
    quatroEstados: false,
    criterios: "AC-402, AC-209",
  },
  {
    rota: "/",
    tela: "Página inicial da plataforma",
    acesso: "PUBLICO",
    quatroEstados: false,
    criterios: "—",
    arquivo: "apps/web/src/app/page.tsx",
  },
  {
    rota: "/entrar",
    tela: "Login (e-mail e senha)",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-105, AC-108, AC-119, AC-120",
    arquivo: "apps/web/src/app/(conta)/entrar/page.tsx",
  },
  {
    rota: "/entrar/verificacao",
    tela: "Segundo fator (código ou aplicativo)",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-105..AC-107, AC-121..AC-124",
  },
  {
    rota: "/cadastrar",
    tela: "Cadastro de cliente final",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-100..AC-102",
  },
  {
    rota: "/verificar-email",
    tela: "Confirmação de e-mail por link",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-103, AC-104",
  },
  {
    rota: "/recuperar-senha",
    tela: "Pedido de recuperação",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-114",
  },
  {
    rota: "/definir-senha",
    tela: "Nova senha (recuperação e convite)",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-115, AC-200",
  },
  {
    rota: "/termos",
    tela: "Termos de uso e política de privacidade",
    acesso: "PUBLICO",
    quatroEstados: false,
    criterios: "ASM-704",
  },
  {
    rota: "/privacidade",
    tela: "Termos de uso e política de privacidade",
    acesso: "PUBLICO",
    quatroEstados: false,
    criterios: "ASM-704",
  },
  {
    rota: "/nao-encontrado",
    tela: "Página de erro e não encontrado",
    acesso: "PUBLICO",
    quatroEstados: false,
    criterios: "AC-024",
  },
  {
    rota: "/erro",
    tela: "Página de erro e não encontrado",
    acesso: "PUBLICO",
    quatroEstados: false,
    criterios: "AC-024",
  },
  {
    rota: "/minha-conta",
    tela: "Meus dados",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-509",
  },
  {
    rota: "/minha-conta/pedidos",
    tela: "Meus pedidos (todas as lojas)",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-616",
  },
  {
    rota: "/minha-conta/pedidos/{id}",
    tela: "Detalhe do meu pedido",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-616, AC-713",
  },
  {
    rota: "/minha-conta/enderecos",
    tela: "Meus endereços",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-509",
  },
  {
    rota: "/minha-conta/seguranca",
    tela: "Senha, segundo fator e sessões",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-108, AC-112, AC-113",
  },
  {
    rota: "/painel",
    tela: "Painel com métricas do dia",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-800..AC-802, AC-814",
    arquivo: "apps/web/src/app/(painel)/painel/page.tsx",
  },
  {
    rota: "/painel/metricas",
    tela: "Métricas por período",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-803..AC-813, AC-815, AC-816",
  },
  {
    rota: "/painel/pedidos",
    tela: "Fila de pedidos ao vivo",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-600..AC-603, AC-609, AC-611",
    arquivo: "apps/web/src/app/(painel)/painel/pedidos/page.tsx",
  },
  {
    rota: "/painel/pedidos/{id}",
    tela: "Detalhe do pedido e mudança de status",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-604..AC-608, AC-617..AC-621",
    arquivo: "apps/web/src/app/(painel)/painel/pedidos/[id]/page.tsx",
  },
  {
    rota: "/painel/pedidos/novo",
    tela: "Lançar pedido manual",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-707..AC-710",
  },
  {
    rota: "/painel/categorias",
    tela: "Categorias (lista e ordenação)",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-300..AC-303",
    arquivo: "apps/web/src/app/(painel)/painel/categorias/page.tsx",
  },
  {
    rota: "/painel/categorias/{id}/especificacoes",
    tela: "Criador de especificações da categoria",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-325..AC-330",
  },
  {
    rota: "/painel/produtos",
    tela: "Produtos (lista, busca, estoque baixo)",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-307, AC-308, AC-321, AC-336",
    arquivo: "apps/web/src/app/(painel)/painel/produtos/page.tsx",
  },
  {
    rota: "/painel/produtos/novo",
    tela: "Cadastro e edição de produto",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios:
      "AC-304..AC-306, AC-309..AC-312, AC-318, AC-319, AC-322, AC-324, AC-326, AC-327",
    arquivo: "apps/web/src/app/(painel)/painel/produtos/novo/page.tsx",
  },
  {
    rota: "/painel/produtos/{id}",
    tela: "Cadastro e edição de produto",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios:
      "AC-304..AC-306, AC-309..AC-312, AC-318, AC-319, AC-322, AC-324, AC-326, AC-327",
    arquivo: "apps/web/src/app/(painel)/painel/produtos/[id]/page.tsx",
  },
  {
    rota: "/painel/produtos/{id}/opcoes",
    tela: "Grupos de escolha do produto",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-313..AC-317",
    arquivo: "apps/web/src/app/(painel)/painel/produtos/[id]/opcoes/page.tsx",
  },
  {
    rota: "/painel/produtos/{id}/variacoes",
    tela: "Grade de variações do produto",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-316",
    arquivo:
      "apps/web/src/app/(painel)/painel/produtos/[id]/variacoes/page.tsx",
  },
  {
    rota: "/painel/produtos/{id}/estoque",
    tela: "Estoque e movimentos da variação",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-331..AC-337",
    arquivo: "apps/web/src/app/(painel)/painel/produtos/[id]/estoque/page.tsx",
  },
  {
    rota: "/painel/clientes",
    tela: "Clientes da loja",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-700..AC-702",
  },
  {
    rota: "/painel/clientes/{id}",
    tela: "Ficha e histórico do cliente",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-703..AC-706, AC-711..AC-713",
  },
  {
    rota: "/painel/config/pagamento",
    tela: "Chave PIX e formas de pagamento",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-900..AC-904, AC-512",
    arquivo: "apps/web/src/app/(painel)/painel/config/pagamento/page.tsx",
  },
  {
    rota: "/painel/config/entrega",
    tela: "Entrega, retirada, taxa e mínimo",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-905..AC-908",
    arquivo: "apps/web/src/app/(painel)/painel/config/entrega/page.tsx",
  },
  {
    rota: "/painel/config/horarios",
    tela: "Horário, fechar agora e exceções",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-909..AC-912",
  },
  {
    rota: "/painel/config/contato",
    tela: "WhatsApp e texto da mensagem",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-913..AC-915",
    arquivo: "apps/web/src/app/(painel)/painel/config/contato/page.tsx",
  },
  {
    rota: "/painel/config/aparencia",
    tela: "Apresentação, logo, capa e cor",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-916..AC-918, AC-015",
    arquivo: "apps/web/src/app/(painel)/painel/config/aparencia/page.tsx",
  },
  {
    rota: "/painel/config/impressao",
    tela: "Papel, conteúdo do cupom e modo automático",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-622, AC-626, AC-919, AC-920",
  },
  {
    rota: "/admin",
    tela: "Visão geral da plataforma",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "Q-802",
  },
  {
    rota: "/admin/lojas",
    tela: "Lojas (lista e busca)",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-206",
  },
  {
    rota: "/admin/lojas/nova",
    tela: "Cadastro de loja",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-200..AC-202",
  },
  {
    rota: "/admin/lojas/{id}",
    tela: "Ficha da loja, tipo de negócio e status",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-207..AC-211, AC-214",
  },
  {
    rota: "/admin/lojas/{id}/documentos",
    tela: "Contrato e documentos",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-203..AC-205",
  },
  {
    rota: "/admin/lojas/{id}/funcionalidades",
    tela: "Funcionalidades liberadas",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-212, AC-213",
  },
  {
    rota: "/admin/auditoria",
    tela: "Histórico de auditoria",
    acesso: "PUBLICO",
    quatroEstados: true,
    criterios: "AC-118, AC-922",
  },
];

/** Só as telas que já existem, com o arquivo que as desenha. */
export const TELAS_CONSTRUIDAS: readonly TelaDoManifesto[] =
  MANIFESTO_DE_ROTAS.filter((tela) => tela.arquivo !== undefined);

/**
 * Traduz o caminho de um arquivo do Next para a rota do MAPA.
 *
 * `app/(loja)/l/[slug]/produto/[id]/page.tsx` vira `/l/{slug}/produto/{id}`:
 * os grupos entre parênteses somem (eles organizam pastas, não endereços), os
 * colchetes viram chaves, e `page.tsx` sai do fim.
 *
 * A tradução mora AQUI, e não em 50 linhas escritas à mão, porque assim ela é
 * uma regra só — e o dia em que o framework mudar de convenção, muda um lugar.
 */
export function rotaDoArquivo(caminho: string): string | null {
  const dentroDeApp = caminho.split("src/app/")[1];
  if (dentroDeApp === undefined) return null;
  if (!dentroDeApp.endsWith("page.tsx")) return null;

  const partes = dentroDeApp
    .slice(0, -"page.tsx".length)
    .split("/")
    .filter((parte) => parte !== "")
    // Grupo de rota organiza a pasta e NÃO aparece no endereço.
    .filter((parte) => !(parte.startsWith("(") && parte.endsWith(")")))
    .map((parte) =>
      parte.startsWith("[") && parte.endsWith("]")
        ? `{${parte.slice(1, -1)}}`
        : parte,
    );

  return partes.length === 0 ? "/" : `/${partes.join("/")}`;
}
