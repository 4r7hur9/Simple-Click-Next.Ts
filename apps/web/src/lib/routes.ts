/**
 * O mapa de rotas do site: o inventário de telas, em código (AC-016). UMA ROTA
 * PARA CADA TELA, em português, curta e previsível:
 *
 *   /                      landing de venda do SimpleClick (só ela)
 *   /explorar              feed dos clientes (/produtos é a aba padrão, /lojas)
 *   /loja/{slug}           a loja pública; /cardapio /carrinho /checkout
 *                          /produto/{id} /sobre /pedido/{token} /tv
 *   /conta                 a conta do cliente; /pedidos /pedidos/{id} /dados
 *                          /enderecos /seguranca /favoritos
 *   /entrar /cadastrar /recuperar-senha ...   acesso
 *   /painel                o painel do dono; /pedidos /produtos /categorias
 *                          /estoque /variacoes /opcoes
 *                          /clientes /metricas /equipe /feed /aparencia /ajuda /config/*
 *   /admin                 a administração; /lojas /lojas/{id} /lojas/nova
 *                          /contas /auditoria
 *
 * A loja é SEMPRE `/loja/{slug}`: não existe subdomínio nem domínio próprio.
 * Carrinho, checkout, produto e sobre abrem por cima do cardápio/da loja, mas
 * têm rota direta. As rotas antigas (`/l/...`, `/minha-conta/...`,
 * `/painel/config/aparencia`) redirecionam de forma permanente em
 * `next.config.ts`.
 *
 * Duas verificações usam este arquivo em direções opostas: tela que existe no
 * código e NÃO está aqui reprova (`manifesto-cobre-arquivos`); tela que está
 * aqui sem `arquivo` é trabalho planejado e só entra na contagem.
 *
 * A ROTA É ESCRITA COMO O MAPA A ESCREVE (`{slug}`, `{id}`), e não como o Next
 * (`[slug]`, `[id]`): a tradução mora em `rotaDoArquivo`, uma regra só, para o
 * manifesto não envelhecer junto com a convenção do framework.
 */

/** Quem alcança a tela. */
export type AcessoDaTela = "PUBLICO" | "CLIENTE" | "DONO" | "ADMIN";

/** Uma linha do inventário. */
export interface TelaDoManifesto {
  /** No formato do mapa: `/loja/{slug}/produto/{id}`. */
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

/** Onde moram as páginas do Next; o `arquivo` de cada linha é escrito a partir daqui. */
const PASTA_DAS_PAGINAS = "apps/web/src/app/";

/** Uma linha como o mapa a escreve, coluna a coluna; o `arquivo` é relativo a `src/app/`. */
type LinhaDoMapa = readonly [
  rota: string,
  tela: string,
  acesso: AcessoDaTela,
  quatroEstados: boolean,
  criterios: string,
  arquivo?: string,
];

/** Monta a tela do manifesto a partir da linha, com o `arquivo` completo que as verificações leem. */
function tela([
  rota,
  nome,
  acesso,
  quatroEstados,
  criterios,
  arquivo,
]: LinhaDoMapa): TelaDoManifesto {
  return {
    rota,
    tela: nome,
    acesso,
    quatroEstados,
    criterios,
    ...(arquivo === undefined ? {} : { arquivo: PASTA_DAS_PAGINAS + arquivo }),
  };
}

// Uma linha por tela: o formatador quebraria cada linha em sete, e a tabela
// deixaria de se ler como a tabela do mapa.

/** A loja do cliente final: apresentação, vitrine, TV, compra e acompanhamento. */
// prettier-ignore
const TELAS_DA_LOJA: readonly LinhaDoMapa[] = [
  ["/loja/{slug}", "Página de apresentação da loja", "PUBLICO", true, "AC-400, AC-401, AC-402, AC-403, AC-916", "(loja)/loja/[slug]/page.tsx"],
  ["/loja/{slug}/sobre", "Página institucional da loja", "PUBLICO", true, "AC-421..AC-423", "(loja)/loja/[slug]/sobre/page.tsx"],
  ["/loja/{slug}/cardapio", "Vitrine / cardápio / catálogo", "PUBLICO", true, "AC-404..AC-409, AC-415..AC-417, AC-420", "(loja)/loja/[slug]/cardapio/page.tsx"],
  ["/loja/{slug}/previa/{parte}", "Prévia da Aparência: a loja de verdade com o rascunho do dono", "PUBLICO", false, "AC-916", "(loja)/loja/[slug]/previa/[parte]/page.tsx"],
  ["/loja/{slug}/tv", "Cardápio na TV da loja", "PUBLICO", true, "AC-925..AC-931", "(loja)/loja/[slug]/tv/page.tsx"],
  ["/loja/{slug}/produto/{id}", "Detalhe do produto", "PUBLICO", true, "AC-410..AC-414, AC-328", "(loja)/loja/[slug]/produto/[id]/page.tsx"],
  ["/loja/{slug}/carrinho", "Carrinho", "PUBLICO", true, "AC-500..AC-503", "(loja)/loja/[slug]/carrinho/page.tsx"],
  ["/loja/{slug}/checkout", "Fechamento do pedido", "PUBLICO", true, "AC-504..AC-513, AC-905..AC-908", "(loja)/loja/[slug]/checkout/page.tsx"],
  ["/loja/{slug}/pedido/{token}", "Acompanhamento do pedido", "PUBLICO", true, "AC-612..AC-615, AC-610", "(loja)/loja/[slug]/pedido/[token]/page.tsx"],
  ["/loja/{slug}/indisponivel", "Loja fechada ou suspensa", "PUBLICO", false, "AC-402, AC-209"],
];

/** A plataforma e a conta: página inicial, acesso, páginas legais e minha conta. */
// prettier-ignore
const TELAS_DA_PLATAFORMA_E_DA_CONTA: readonly LinhaDoMapa[] = [
  ["/", "Página inicial da plataforma (landing de venda)", "PUBLICO", false, "—", "page.tsx"],
  ["/explorar", "Feed dos clientes (leva à aba de produtos)", "PUBLICO", false, "—", "(explorar)/explorar/page.tsx"],
  ["/explorar/produtos", "Feed dos clientes: produtos", "PUBLICO", false, "—", "(explorar)/explorar/produtos/page.tsx"],
  ["/explorar/lojas", "Feed dos clientes: lojas", "PUBLICO", false, "—", "(explorar)/explorar/lojas/page.tsx"],
  ["/entrar", "Login (e-mail e senha)", "PUBLICO", true, "AC-105, AC-108, AC-119, AC-120", "(conta)/entrar/page.tsx"],
  ["/entrar/verificacao", "Segundo fator (código ou aplicativo)", "PUBLICO", true, "AC-105..AC-107, AC-121..AC-124", "(conta)/entrar/verificacao/page.tsx"],
  ["/cadastrar", "Cadastro de cliente final", "PUBLICO", true, "AC-100..AC-102", "(conta)/cadastrar/page.tsx"],
  ["/verificar-email", "Confirmação de e-mail por link", "PUBLICO", true, "AC-103, AC-104", "(conta)/verificar-email/page.tsx"],
  ["/recuperar-senha", "Pedido de recuperação", "PUBLICO", true, "AC-114", "(conta)/recuperar-senha/page.tsx"],
  ["/definir-senha", "Nova senha (recuperação e convite)", "PUBLICO", true, "AC-115, AC-200", "(conta)/definir-senha/page.tsx"],
  ["/termos-de-uso", "Termos de Uso", "PUBLICO", false, "ASM-704", "(site)/termos-de-uso/page.tsx"],
  ["/politica-de-privacidade", "Política de Privacidade (LGPD)", "PUBLICO", false, "ASM-704", "(site)/politica-de-privacidade/page.tsx"],
  ["/cookies", "Política de Cookies", "PUBLICO", false, "—", "(site)/cookies/page.tsx"],
  ["/lgpd", "Direitos do titular (LGPD) e encarregado", "PUBLICO", false, "—", "(site)/lgpd/page.tsx"],
  ["/nao-encontrado", "Página de erro e não encontrado", "PUBLICO", false, "AC-024"],
  ["/erro", "Página de erro e não encontrado", "PUBLICO", false, "AC-024"],
  ["/conta", "Minha conta (leva aos pedidos)", "PUBLICO", true, "AC-509", "(conta)/conta/page.tsx"],
  ["/conta/dados", "Meus dados", "PUBLICO", false, "AC-509", "(conta)/conta/dados/page.tsx"],
  ["/conta/favoritos", "Favoritos", "PUBLICO", false, "—", "(conta)/conta/favoritos/page.tsx"],
  ["/conta/pedidos", "Meus pedidos (todas as lojas)", "PUBLICO", true, "AC-616", "(conta)/conta/pedidos/page.tsx"],
  ["/conta/pedidos/{id}", "Detalhe do meu pedido", "PUBLICO", true, "AC-616, AC-713", "(conta)/conta/pedidos/[id]/page.tsx"],
  ["/conta/enderecos", "Meus endereços", "PUBLICO", true, "AC-509", "(conta)/conta/enderecos/page.tsx"],
  ["/conta/seguranca", "Senha, segundo fator e sessões", "PUBLICO", true, "AC-108, AC-112, AC-113", "(conta)/conta/seguranca/page.tsx"],
  ["/conta/seguranca/aplicativo", "Ativar o aplicativo autenticador", "CLIENTE", true, "AC-121, AC-123", "(conta)/conta/seguranca/aplicativo/page.tsx"],
  ["/vender", "Como vender com o SimpleClick", "PUBLICO", false, "—", "(conta)/vender/page.tsx"],
  ["/escolher-loja", "Escolha da loja do painel", "DONO", true, "AC-135, AC-136", "(conta)/escolher-loja/page.tsx"],
  ["/escolher-loja/nova", "Abrir outra loja (dono)", "DONO", true, "card #32", "(conta)/escolher-loja/nova/page.tsx"],
];

/** O painel do dono: métricas, pedidos, catálogo, clientes e configuração. */
// prettier-ignore
const TELAS_DO_PAINEL: readonly LinhaDoMapa[] = [
  ["/painel", "Painel com métricas do dia", "PUBLICO", true, "AC-800..AC-802, AC-814", "(painel)/painel/page.tsx"],
  ["/painel/metricas", "Métricas por período", "PUBLICO", true, "AC-803..AC-813, AC-815, AC-816", "(painel)/painel/metricas/page.tsx"],
  ["/painel/pedidos", "Fila de pedidos ao vivo", "PUBLICO", true, "AC-600..AC-603, AC-609, AC-611", "(painel)/painel/pedidos/page.tsx"],
  ["/painel/pedidos/{id}", "Detalhe do pedido e mudança de status", "PUBLICO", true, "AC-604..AC-608, AC-617..AC-621", "(painel)/painel/pedidos/[id]/page.tsx"],
  ["/painel/pedidos/novo", "Lançar pedido manual", "PUBLICO", true, "AC-707..AC-710", "(painel)/painel/pedidos/novo/page.tsx"],
  ["/painel/categorias", "Categorias (lista e ordenação)", "PUBLICO", true, "AC-300..AC-303", "(painel)/painel/categorias/page.tsx"],
  ["/painel/categorias/{id}/especificacoes", "Criador de especificações da categoria", "PUBLICO", true, "AC-325..AC-330", "(painel)/painel/categorias/[id]/especificacoes/page.tsx"],
  ["/painel/produtos", "Produtos (lista, busca, estoque baixo)", "PUBLICO", true, "AC-307, AC-308, AC-321, AC-336", "(painel)/painel/produtos/page.tsx"],
  ["/painel/produtos/novo", "Cadastro e edição de produto", "PUBLICO", true, "AC-304..AC-306, AC-309..AC-312, AC-318, AC-319, AC-322, AC-324, AC-326, AC-327", "(painel)/painel/produtos/novo/page.tsx"],
  ["/painel/produtos/{id}", "Cadastro e edição de produto", "PUBLICO", true, "AC-304..AC-306, AC-309..AC-312, AC-318, AC-319, AC-322, AC-324, AC-326, AC-327", "(painel)/painel/produtos/[id]/page.tsx"],
  ["/painel/produtos/{id}/opcoes", "Grupos de escolha do produto", "PUBLICO", true, "AC-313..AC-317", "(painel)/painel/produtos/[id]/opcoes/page.tsx"],
  ["/painel/produtos/{id}/variacoes", "Grade de variações do produto", "PUBLICO", true, "AC-316", "(painel)/painel/produtos/[id]/variacoes/page.tsx"],
  ["/painel/produtos/{id}/estoque", "Estoque e movimentos da variação", "PUBLICO", true, "AC-331..AC-337", "(painel)/painel/produtos/[id]/estoque/page.tsx"],
  ["/painel/estoque", "Estoque de todos os produtos e variações", "PUBLICO", true, "—", "(painel)/painel/estoque/page.tsx"],
  ["/painel/variacoes", "Variações de todos os produtos", "PUBLICO", true, "—", "(painel)/painel/variacoes/page.tsx"],
  ["/painel/opcoes", "Opções e adicionais de todos os produtos", "PUBLICO", true, "—", "(painel)/painel/opcoes/page.tsx"],
  ["/painel/clientes", "Clientes da loja", "PUBLICO", true, "AC-700..AC-702", "(painel)/painel/clientes/page.tsx"],
  ["/painel/clientes/importar", "Importar clientes de planilha", "PUBLICO", true, "—", "(painel)/painel/clientes/importar/page.tsx"],
  ["/painel/clientes/{id}", "Ficha e histórico do cliente", "PUBLICO", true, "AC-703..AC-706, AC-711..AC-713", "(painel)/painel/clientes/[id]/page.tsx"],
  ["/painel/aparencia", "Apresentação, logo, capa e cor", "PUBLICO", true, "AC-916..AC-918, AC-015", "(painel)/painel/aparencia/page.tsx"],
  ["/painel/equipe", "Equipe da loja", "PUBLICO", false, "—", "(painel)/painel/equipe/page.tsx"],
  ["/painel/feed", "Feed da loja", "PUBLICO", false, "—", "(painel)/painel/feed/page.tsx"],
  ["/painel/stories", "Stories de 24h da loja", "PUBLICO", false, "—", "(painel)/painel/stories/page.tsx"],
  ["/painel/comentarios", "Moderação de comentários", "PUBLICO", false, "—", "(painel)/painel/comentarios/page.tsx"],
  ["/painel/ajuda", "Ajuda e tutorial do painel", "DONO", false, "—", "(painel)/painel/ajuda/page.tsx"],
  ["/painel/config/pagamento", "Chave PIX e formas de pagamento", "PUBLICO", true, "AC-900..AC-904, AC-512", "(painel)/painel/config/pagamento/page.tsx"],
  ["/painel/config/entrega", "Entrega, retirada, taxa e mínimo", "PUBLICO", true, "AC-905..AC-908", "(painel)/painel/config/entrega/page.tsx"],
  ["/painel/config/horarios", "Horário, fechar agora e exceções", "PUBLICO", true, "AC-909..AC-912", "(painel)/painel/config/horarios/page.tsx"],
  ["/painel/config/contato", "WhatsApp e texto da mensagem", "PUBLICO", true, "AC-913..AC-915", "(painel)/painel/config/contato/page.tsx"],
  ["/painel/config/impressao", "Papel, conteúdo do cupom e modo automático", "PUBLICO", true, "AC-622, AC-626, AC-919, AC-920", "(painel)/painel/config/impressao/page.tsx"],
];

/** A administração da plataforma. */
// prettier-ignore
const TELAS_DA_ADMINISTRACAO: readonly LinhaDoMapa[] = [
  ["/admin", "Visão geral da plataforma (leva às lojas)", "PUBLICO", true, "Q-802", "(admin)/admin/page.tsx"],
  ["/admin/lojas", "Lojas (lista, busca, filtros e aprovação)", "PUBLICO", true, "AC-206", "(admin)/admin/lojas/page.tsx"],
  ["/admin/lojas/nova", "Cadastro de loja", "PUBLICO", true, "AC-200..AC-202", "(admin)/admin/lojas/nova/page.tsx"],
  ["/admin/lojas/{id}", "Ficha da loja: resumo, números, equipe e limites", "PUBLICO", true, "AC-207..AC-211, AC-214", "(admin)/admin/lojas/[id]/page.tsx"],
  ["/admin/lojas/{id}/cadastro", "Cadastro, endereço na web, tipo de negócio e exclusão", "PUBLICO", true, "AC-207, AC-208, AC-211, AC-214", "(admin)/admin/lojas/[id]/cadastro/page.tsx"],
  ["/admin/lojas/{id}/historico", "Histórico de alterações da loja", "PUBLICO", true, "AC-207, AC-118", "(admin)/admin/lojas/[id]/historico/page.tsx"],
  ["/admin/lojas/{id}/documentos", "Contrato e documentos", "PUBLICO", true, "AC-203..AC-205", "(admin)/admin/lojas/[id]/documentos/page.tsx"],
  ["/admin/lojas/{id}/funcionalidades", "Funcionalidades liberadas", "PUBLICO", true, "AC-212, AC-213", "(admin)/admin/lojas/[id]/funcionalidades/page.tsx"],
  ["/admin/contas", "Contas da plataforma: donos e equipe", "PUBLICO", true, "—", "(admin)/admin/contas/page.tsx"],
  ["/admin/contas/{id}", "Conta: lojas e limite de lojas do dono", "PUBLICO", true, "—", "(admin)/admin/contas/[id]/page.tsx"],
  ["/admin/auditoria", "Histórico de auditoria", "PUBLICO", true, "AC-118, AC-922, AC-215", "(admin)/admin/auditoria/page.tsx"],
];

/** O cupom para impressão por clique, fora da moldura do painel. */
// prettier-ignore
const TELAS_DE_IMPRESSAO: readonly LinhaDoMapa[] = [
  ["/imprimir/{id}", "Cupom do pedido para impressão por clique", "DONO", true, "AC-617, AC-618, AC-621", "imprimir/[id]/page.tsx"],
];

/**
 * O inventário inteiro, na ordem do mapa de telas. As linhas do mapa que
 * declaram DUAS rotas (`/termos e /privacidade`, `/nao-encontrado e erro`,
 * `/painel/produtos/novo e /{id}`) viram aqui entradas separadas.
 */
export const MANIFESTO_DE_ROTAS: readonly TelaDoManifesto[] = [
  ...TELAS_DA_LOJA,
  ...TELAS_DA_PLATAFORMA_E_DA_CONTA,
  ...TELAS_DO_PAINEL,
  ...TELAS_DA_ADMINISTRACAO,
  ...TELAS_DE_IMPRESSAO,
].map(tela);

/**
 * Traduz o caminho de um arquivo do Next para a rota do MAPA.
 *
 * `app/(loja)/loja/[slug]/produto/[id]/page.tsx` vira `/loja/{slug}/produto/{id}`:
 * os grupos entre parênteses somem (eles organizam pastas, não endereços), os
 * colchetes viram chaves, e `page.tsx` sai do fim. Uma regra só, em vez de uma
 * tradução escrita à mão em cada linha.
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
