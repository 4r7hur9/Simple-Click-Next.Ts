/**
 * O que a vitrine pública pode mostrar (AC-904, P-009).
 *
 * A REGRA É LISTA DE PERMITIDOS, NUNCA DE PROIBIDOS. A diferença decide o
 * futuro: com lista de proibidos, toda coluna nova nasce pública, e o vazamento
 * acontece na migração em que alguém acrescenta um campo sem lembrar de proibi-lo
 * — meses depois, sem revisão nenhuma reclamar. Com lista de permitidos, a
 * coluna nova nasce invisível e alguém precisa decidir mostrá-la.
 *
 * O QUE ISTO PROTEGE, concretamente. A tabela `stores` guarda, na mesma linha
 * que o nome e o apelido da loja: CNPJ, razão social, telefones do dono,
 * e-mail, e a configuração inteira em `store_settings` — que inclui a CHAVE
 * PIX. Uma resposta pública montada com `SELECT *` entregaria tudo isso para
 * qualquer pessoa que abrisse o endereço da loja. O crítico de completude
 * apontou esse risco, e ele foi observado num concorrente.
 *
 * A chave PIX aparece em UM lugar só: no fechamento de um pedido daquela loja,
 * e nunca em registro de sistema (AC-904).
 */

/**
 * As palavras que o RAMO da loja usa.
 *
 * LOJA DE ROUPA NÃO TEM CARDÁPIO. A tela que escreve "Cardápio" para todo mundo
 * está certa na lanchonete e errada na loja de roupas, na autopeça e na de
 * eletrônicos — e o dono percebe isso no primeiro minuto, porque é a palavra
 * que ele usa o dia inteiro.
 *
 * O vocabulário mora no banco desde a migração 0003, um conjunto por ramo, e é
 * de lá que ele vem — não de um `if` na tela. É o que permite acrescentar um
 * ramo novo sem tocar em componente nenhum.
 */
export interface RotulosDoRamo {
  /** "Cardápio" na lanchonete, "Catálogo" na loja de roupas. */
  readonly catalogo: string;
  /** "Sabor", "Tamanho", "Aplicação", "Modelo", "Volume". */
  readonly variacao: string;
  /** "Ingredientes", "Acompanhamentos", "Especificações", "Opções". */
  readonly grupoOpcao: string;
  /** "O que você gostaria de comer?", "Peça, código ou aplicação". */
  readonly buscaPlaceholder: string;
}

/**
 * O que vale quando o ramo não diz.
 *
 * GENÉRICO DE PROPÓSITO. Chamar de "Catálogo" a página de uma lanchonete é
 * impreciso; chamar de "Cardápio" a de uma autopeça é errado. Na dúvida, o
 * padrão é o que não erra em ramo nenhum.
 */
export const ROTULOS_PADRAO: RotulosDoRamo = {
  catalogo: "Catálogo",
  variacao: "Variação",
  grupoOpcao: "Opções",
  buscaPlaceholder: "O que você procura?",
};

/** Como a loja aparece para quem chega pelo endereço público. */
export interface LojaPublica {
  readonly apelido: string;
  readonly nome: string;
  readonly ramo: string;
  /** Se o ramo serve comida. Decide o vocabulário do buscador (AC-403). */
  readonly alimentacao: boolean;
  /** As palavras do ramo. Nunca nulo: sem preset, valem as genéricas. */
  readonly rotulos: RotulosDoRamo;
  readonly fusoHorario: string;
  readonly moeda: string;
  readonly formasDeEntrega: readonly string[];
  /** Nulo quando o dono não preencheu — a tela decide o que mostrar. */
  readonly boasVindas: string | null;
  /** Texto institucional escrito pelo dono, quando publicado. */
  readonly sobre: string | null;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly cores: Readonly<Record<string, string>> | null;
  /** Só existe quando o dono marcou explicitamente o número como público. */
  readonly whatsappPublico: string | null;
  /** Endereço da loja, para quem vai retirar. Sem coordenadas nem documento. */
  readonly enderecoParaRetirada: EnderecoPublicoDaLoja | null;
}

/** O endereço que a pessoa usa para chegar até a loja. */
export interface EnderecoPublicoDaLoja {
  readonly logradouro: string | null;
  readonly numero: string | null;
  readonly complemento: string | null;
  readonly bairro: string | null;
  readonly cidade: string | null;
  readonly uf: string | null;
}

/**
 * Os campos de `stores` que podem sair na resposta pública.
 *
 * Escrita como CONJUNTO e não só como código porque o teste a percorre: é o que
 * permite provar que nenhuma coluna nova entrou na saída sem alguém decidir.
 */
export const CAMPOS_PUBLICOS_DA_LOJA: ReadonlySet<string> = new Set([
  "slug",
  "name",
  "verticalCode",
  "ramo",
  "timezone",
  "currency",
  "fulfillmentModes",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "uf",
]);

/**
 * Os campos de `stores` que NUNCA saem, e o motivo de cada um.
 *
 * Esta lista não decide nada — quem decide é a de permitidos. Ela existe para
 * o teste conseguir afirmar que estes valores não aparecem em lugar nenhum da
 * resposta, e para quem ler o código entender o que está em jogo.
 */
export const NUNCA_SAEM: Readonly<Record<string, string>> = {
  id: "identificador interno; a vitrine usa o apelido",
  code: "código administrativo da loja na plataforma",
  legalName: "razão social é dado cadastral do dono",
  docNumber: "CNPJ ou CPF do dono",
  docType: "tipo de documento do dono",
  status: "estado administrativo; revelaria loja suspensa (AC-402)",
  whatsappE164: "número do dono; alvo de mensagem em massa",
  phone1: "telefone do dono",
  phone2: "telefone do dono",
  email: "e-mail do dono",
  zip: "CEP exato da loja, junto com o número, é dado de localização",
  lat: "coordenada exata",
  lng: "coordenada exata",
  catalogVersion: "número interno de cache",
  createdBy: "quem criou a loja, identidade da plataforma",
  deletedAt: "estado interno",
  purgeAfter: "estado interno",
};

/** A loja como o banco a devolve. Aceita campos a mais sem se importar. */
export interface LojaDoBanco {
  readonly slug: string;
  readonly name: string;
  readonly verticalCode: string;
  /** O preset do ramo, quando a consulta o trouxe junto. */
  readonly ramo?: {
    readonly labels?: unknown;
    readonly isFood?: boolean;
  } | null;
  readonly timezone: string;
  readonly currency: string;
  readonly fulfillmentModes: readonly string[];
  readonly street?: string | null;
  readonly number?: string | null;
  readonly complement?: string | null;
  readonly neighborhood?: string | null;
  readonly city?: string | null;
  readonly uf?: string | null;
}

/** O pedaço da configuração que a vitrine mostra. */
export interface ConfiguracaoDoBanco {
  readonly landing?: unknown;
  readonly theme?: unknown;
  readonly whatsapp?: unknown;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/**
 * As cores que o dono escolheu, e só elas.
 *
 * `theme` é um documento livre: o dono pode ter guardado ali qualquer coisa, e
 * uma versão futura do painel pode guardar mais. Copiar o documento inteiro
 * faria a vitrine publicar o que ninguém revisou.
 */
function coresPermitidas(tema: unknown): Record<string, string> | null {
  const bruto = objeto(tema);
  const permitidas = ["primaria", "fundo", "texto", "destaque"];
  const cores: Record<string, string> = {};

  for (const nome of permitidas) {
    const valor = bruto[nome];
    // Só cor em notação hexadecimal: o valor vai para dentro de uma folha de
    // estilo, e texto livre ali é caminho para injetar regra de CSS.
    if (typeof valor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(valor)) {
      cores[nome] = valor;
    }
  }

  return Object.keys(cores).length > 0 ? cores : null;
}

/** Monta o endereço de retirada, ou nulo quando a loja não o preencheu. */
function enderecoDeRetirada(loja: LojaDoBanco): EnderecoPublicoDaLoja | null {
  const partes = {
    logradouro: texto(loja.street),
    numero: texto(loja.number),
    complemento: texto(loja.complement),
    bairro: texto(loja.neighborhood),
    cidade: texto(loja.city),
    uf: texto(loja.uf),
  };
  const temAlgo = Object.values(partes).some((parte) => parte !== null);
  return temAlgo ? partes : null;
}

/**
 * Projeta a loja para a vitrine pública.
 *
 * A função CONSTRÓI o objeto campo a campo, em vez de copiar e apagar. Copiar e
 * apagar deixa o dado sensível passar por dentro da função — e basta um retorno
 * antecipado, um registro de depuração ou um `JSON.stringify` no meio para ele
 * escapar.
 */
export function lojaParaVitrine(
  loja: LojaDoBanco,
  configuracao: ConfiguracaoDoBanco = {},
): LojaPublica {
  // (a montagem dos rótulos fica logo abaixo, em `rotulosDoRamo`)
  const landing = objeto(configuracao.landing);
  const whatsapp = objeto(configuracao.whatsapp);
  const publico = whatsapp.publico === true;

  return {
    apelido: loja.slug,
    nome: loja.name,
    ramo: loja.verticalCode,
    // Ausente vale FALSO: o padrão seguro é "não é comida". Um ramo lido pela
    // metade que virasse `Restaurant` mandaria ao buscador um cardápio que a
    // loja de roupa não tem — e é o erro que este campo existe para não repetir.
    alimentacao: loja.ramo?.isFood === true,
    rotulos: rotulosDoRamo(loja.ramo?.labels),
    fusoHorario: loja.timezone,
    moeda: loja.currency,
    formasDeEntrega: [...loja.fulfillmentModes],
    boasVindas: texto(landing["boasVindas"]),
    sobre: texto(landing["sobre"]),
    logo: texto(landing["logo"]),
    capa: texto(landing["capa"]),
    cores: coresPermitidas(configuracao.theme),
    whatsappPublico: publico ? texto(whatsapp.numero) : null,
    enderecoParaRetirada: enderecoDeRetirada(loja),
  };
}

/**
 * Lê o vocabulário do ramo, campo a campo, com padrão genérico.
 *
 * A LEITURA É DEFENSIVA porque a coluna é JSON: ela aceita qualquer forma, e
 * uma chave renomeada por engano na migração viraria `undefined` na tela — o
 * título da página sumiria em vez de ficar impreciso. Campo a campo, o pior
 * caso é uma palavra genérica no lugar da específica.
 *
 * As chaves do banco são em caixa baixa com sublinhado (`grupo_opcao`), porque
 * é a convenção do SQL; aqui viram o que o resto do código usa.
 */
export function rotulosDoRamo(bruto: unknown): RotulosDoRamo {
  const labels = objeto(bruto);
  return {
    catalogo: texto(labels["catalogo"]) ?? ROTULOS_PADRAO.catalogo,
    variacao: texto(labels["variacao"]) ?? ROTULOS_PADRAO.variacao,
    grupoOpcao: texto(labels["grupo_opcao"]) ?? ROTULOS_PADRAO.grupoOpcao,
    buscaPlaceholder:
      texto(labels["busca_placeholder"]) ?? ROTULOS_PADRAO.buscaPlaceholder,
  };
}
