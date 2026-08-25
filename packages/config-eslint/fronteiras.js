/**
 * Regras de fronteira entre camadas — a tabela de `.spec/design/arquitetura.md`
 * expressa como verificação executável.
 *
 * A regra vale para todos: quem não está explicitamente autorizado, é barrado.
 * Módulo fala com módulo pelo caso de uso, nunca importando o repositório do
 * vizinho; quando dois módulos precisam da mesma regra, ela sobe para
 * `packages/core`.
 *
 * Satisfaz AC-005 e é provado por `tests/fronteiras.test.js`.
 */

/**
 * Camadas do monorepo. O padrão é comparado com a pasta que contém o arquivo,
 * então `packages/core/**` cobre qualquer profundidade dentro do pacote.
 */
export const camadas = [
  // --- pacotes compartilhados ---
  { type: "pkg-core", pattern: "packages/core/**" },
  { type: "pkg-contracts", pattern: "packages/contracts/**" },
  { type: "pkg-database", pattern: "packages/database/**" },
  { type: "pkg-ui", pattern: "packages/ui/**" },
  { type: "pkg-testing", pattern: "packages/testing/**" },

  // --- API ---
  { type: "api-core", pattern: "apps/api/src/core/**" },
  {
    type: "api-module",
    pattern: "apps/api/src/modules/*/**",
    capture: ["modulo"],
  },
  { type: "api-jobs", pattern: "apps/api/src/jobs/**" },
  { type: "api-contracts", pattern: "apps/api/src/contracts/**" },

  // --- site ---
  { type: "web-app", pattern: "apps/web/src/app/**" },
  { type: "web-features", pattern: "apps/web/src/features/**" },
  { type: "web-server", pattern: "apps/web/src/server/**" },
  { type: "web-lib", pattern: "apps/web/src/lib/**" },
];

/** Atalho para declarar "esta camada pode importar estas". */
const permite = (de, para) => ({
  from: { element: { type: de } },
  allow: { to: { element: { types: para } } },
});

/**
 * Quem pode importar quem. O que não está aqui é proibido, porque o padrão da
 * regra é negar.
 */
export const politicas = [
  // A camada de dados conhece o contrato, e nada de aplicação.
  permite("pkg-database", ["pkg-contracts"]),

  // Construtores de dados de teste montam cenário: precisam do banco e do
  // contrato, mas nenhuma aplicação depende deles em execução.
  permite("pkg-testing", ["pkg-database", "pkg-contracts", "pkg-core"]),

  // Preocupações transversais da API. `pkg-database` entra porque `core/db.ts`
  // É a camada de dados da API: o cliente tipado nasce do esquema declarado e
  // mora em `packages/database`, e é de lá que ele é importado. A autorização
  // para aqui e só aqui — nenhum módulo de domínio recebe a mesma, que é
  // exatamente o que P-004 exige.
  permite("api-core", ["pkg-core", "pkg-contracts", "pkg-database"]),

  // Módulo de domínio: regras puras, contrato e transversais.
  permite("api-module", ["pkg-core", "pkg-contracts", "api-core"]),

  // ...e o próprio módulo, nunca o vizinho. É o que impede o domínio de virar
  // uma teia em que tudo importa tudo.
  {
    from: { element: { type: "api-module" } },
    allow: {
      to: {
        element: {
          type: "api-module",
          captured: { modulo: "{{ from.element.captured.modulo }}" },
        },
      },
    },
  },

  permite("api-jobs", ["pkg-core", "pkg-contracts", "api-core"]),

  // A geração do documento publicado lê os esquemas e mais nada. Ela descreve
  // o CONTRATO, não a implementação: se pudesse alcançar módulo de domínio ou
  // banco, o documento passaria a depender de detalhe interno e mudaria por
  // motivo que o cliente do aplicativo nativo não deveria nem enxergar.
  permite("api-contracts", ["pkg-contracts"]),

  // Rotas do site compõem: usam interface, dados do servidor e componentes.
  permite("web-app", [
    "web-features",
    "web-server",
    "web-lib",
    "pkg-ui",
    "pkg-contracts",
  ]),

  // Componentes de interface não alcançam o servidor nem a API: recebem dados
  // por propriedade. É o que os mantém testáveis isoladamente.
  permite("web-features", ["pkg-ui", "pkg-contracts", "web-lib"]),

  // A camada de servidor do site é a única que fala com a API.
  permite("web-server", ["pkg-contracts", "pkg-core", "web-lib"]),

  // `pkg-core` entrou aqui pela T-405, e a razão é o AC-411: o total do item
  // precisa mudar NA HORA enquanto a pessoa marca as opções, e ser idêntico ao
  // que o servidor cobra ao adicionar. Perguntar ao servidor a cada caixinha
  // marcada é uma ida à rede por clique, numa tela feita para rede ruim;
  // reescrever a conta na tela é a segunda implementação que o P-006 proíbe.
  //
  // Então a REGRA continua sendo uma só, em `packages/core`, e a tela a chama.
  // É `web-lib` que recebe a autorização, e não `web-features`: assim o
  // componente continua recebendo tudo por propriedade, e o único jeito de a
  // tela alcançar o cálculo é pelo vocabulário compartilhado.
  permite("web-lib", ["pkg-contracts", "pkg-core"]),

  // Regras puras não conhecem nada do projeto — é o que as mantém testáveis
  // sem banco, sem HTTP e sem framework. Nenhuma política as autoriza a nada.
];

/** Configuração do plugin de fronteiras, pronta para compor. */
export function configFronteiras() {
  return {
    settings: {
      "boundaries/elements": camadas,
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
        node: { extensions: [".ts", ".tsx", ".js", ".jsx"] },
      },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "Fronteira violada: {{ from.element.type }} não pode importar {{ to.element.type }}. A tabela de fronteiras está em .spec/design/arquitetura.md",
          policies: politicas,
        },
      ],
    },
  };
}
