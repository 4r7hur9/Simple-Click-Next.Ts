/**
 * As lojas do cenário de exemplo, e quem gira em torno delas (AC-004, AC-036).
 *
 * São duas, de ramos deliberadamente opostos, porque é a diferença entre elas
 * que exercita o sistema inteiro:
 *
 * - **Pastelaria da Vila** (`FOOD_SNACK`) — comida. NÃO controla estoque: pastel
 *   não é unidade contável em prateleira, e a decisão de 17/08 já registra que
 *   estoque por variação nasce desligado para comida.
 * - **Moda Boa Vista** (`APPAREL`) — roupa. CONTROLA estoque: camiseta tamanho M
 *   pode acabar sem derrubar P e G, e é isso que a segunda loja precisa provar.
 *
 * As duas são `ACTIVE`, porque uma loja suspensa não aparece na vitrine e o
 * cenário existe para ser navegado sem cadastrar nada à mão.
 *
 * Todo dado pessoal daqui é fictício e usa o domínio reservado `.test`
 * (RFC 2606), que nunca resolve na internet: nenhuma mensagem de exemplo tem
 * como alcançar uma pessoa real.
 */

import {
  type ConjuntoDeExemplo,
  idDeExemplo,
  instanteDeExemplo,
  json,
  type LinhaDeExemplo,
} from "./deterministico.ts";

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

/** Uma identidade global de acesso do cenário. */
export interface PessoaDeExemplo {
  readonly chave: string;
  readonly id: string;
  readonly email: string;
  readonly nome: string;
  readonly telefone: string;
  /** Minutos antes da referência em que a conta foi criada. */
  readonly criadaEmMinutos: number;
}

/** Descrição de uma identidade, sem o identificador — ele é derivado. */
type DescricaoDePessoa = Omit<PessoaDeExemplo, "id">;

function pessoa(descricao: DescricaoDePessoa): PessoaDeExemplo {
  return { ...descricao, id: idDeExemplo(`identidade:${descricao.chave}`) };
}

/**
 * As seis identidades do cenário: uma administração, dois donos, uma pessoa de
 * equipe e dois compradores.
 *
 * Ana aparece nas duas lojas de propósito. É o caso que o modelo de dados
 * chama de "os dois eixos de contexto" e onde o vazamento real aconteceu na
 * validação: a mesma pessoa é cliente de duas lojas, e nenhuma das duas pode
 * enxergar a linha dela na outra.
 */
export const PESSOAS = {
  administracao: pessoa({
    chave: "administracao",
    email: "administracao@simpleclick.test",
    nome: "Administração SimpleClick",
    telefone: "+5511900000000",
    criadaEmMinutos: -100_000,
  }),
  donaDaPastelaria: pessoa({
    chave: "dona-pastelaria",
    email: "marina@pastelariadavila.test",
    nome: "Marina Souza",
    telefone: "+5511911110001",
    criadaEmMinutos: -90_000,
  }),
  equipeDaPastelaria: pessoa({
    chave: "equipe-pastelaria",
    email: "jonas@pastelariadavila.test",
    nome: "Jonas Prado",
    telefone: "+5511911110002",
    criadaEmMinutos: -60_000,
  }),
  donoDaModa: pessoa({
    chave: "dono-moda",
    email: "ricardo@modaboavista.test",
    nome: "Ricardo Lima",
    telefone: "+5511922220001",
    criadaEmMinutos: -85_000,
  }),
  compradoraAna: pessoa({
    chave: "compradora-ana",
    email: "ana.ribeiro@cliente.test",
    nome: "Ana Ribeiro",
    telefone: "+5511933330001",
    criadaEmMinutos: -40_000,
  }),
  compradorBruno: pessoa({
    chave: "comprador-bruno",
    email: "bruno.teixeira@cliente.test",
    nome: "Bruno Teixeira",
    telefone: "+5511933330002",
    criadaEmMinutos: -30_000,
  }),
} as const;

const TODAS_AS_PESSOAS: readonly PessoaDeExemplo[] = Object.values(PESSOAS);

// ---------------------------------------------------------------------------
// Clientes vistos pela loja
// ---------------------------------------------------------------------------

/**
 * O comprador na projeção de UMA loja.
 *
 * `identidade` nula é o cliente que o dono cadastrou à mão, sem conta na
 * plataforma — a maioria dos pedidos reais do público-alvo. O cenário precisa
 * dos dois casos porque as políticas de isolamento tratam cada um por um eixo
 * diferente.
 */
export interface ClienteDeExemplo {
  readonly chave: string;
  readonly id: string;
  readonly nome: string;
  readonly telefone: string;
  readonly email: string | null;
  readonly identidade: PessoaDeExemplo | null;
}

/** Descrição de um cliente da loja, sem o identificador — ele é derivado. */
type DescricaoDeCliente = Omit<ClienteDeExemplo, "id"> & {
  readonly loja: string;
};

function cliente(descricao: DescricaoDeCliente): ClienteDeExemplo {
  const { loja, ...resto } = descricao;
  return { ...resto, id: idDeExemplo(`cliente:${loja}:${descricao.chave}`) };
}

// ---------------------------------------------------------------------------
// Lojas
// ---------------------------------------------------------------------------

/** Uma loja do cenário, com o que o resto da carga precisa saber dela. */
export interface LojaDeExemplo {
  readonly chave: string;
  readonly id: string;
  readonly codigo: string;
  readonly slug: string;
  readonly nome: string;
  /** Código do ramo em `vertical_presets`, já existente desde a migração 0003. */
  readonly ramo: string;
  readonly ehComida: boolean;
  /** Estoque por variação: ligado para unidade contável, desligado para comida. */
  readonly controlaEstoque: boolean;
  readonly dona: PessoaDeExemplo;
  readonly equipe: readonly PessoaDeExemplo[];
  readonly clientes: readonly ClienteDeExemplo[];
  readonly fusoHorario: string;
  readonly whatsapp: string;
  readonly chavePix: string;
}

/** A loja de comida: cardápio, ingrediente, adicional — e nenhum estoque. */
export const PASTELARIA: LojaDeExemplo = {
  chave: "pastelaria",
  id: idDeExemplo("loja:pastelaria"),
  codigo: "SC-0001",
  slug: "pastelaria-da-vila",
  nome: "Pastelaria da Vila",
  ramo: "FOOD_SNACK",
  ehComida: true,
  controlaEstoque: false,
  dona: PESSOAS.donaDaPastelaria,
  equipe: [PESSOAS.equipeDaPastelaria],
  clientes: [
    cliente({
      loja: "pastelaria",
      chave: "ana",
      nome: "Ana Ribeiro",
      telefone: "+5511933330001",
      email: "ana.ribeiro@cliente.test",
      identidade: PESSOAS.compradoraAna,
    }),
    cliente({
      loja: "pastelaria",
      chave: "bruno",
      nome: "Bruno Teixeira",
      telefone: "+5511933330002",
      email: "bruno.teixeira@cliente.test",
      identidade: PESSOAS.compradorBruno,
    }),
    // Sem conta na plataforma: cadastrada pela dona no balcão.
    cliente({
      loja: "pastelaria",
      chave: "carla",
      nome: "Carla Menezes",
      telefone: "+5511944440003",
      email: null,
      identidade: null,
    }),
  ],
  fusoHorario: "America/Sao_Paulo",
  whatsapp: "+5511911110001",
  chavePix: "pix@pastelariadavila.test",
};

/** A loja de produto contável: catálogo, grade, variação com estoque. */
export const MODA: LojaDeExemplo = {
  chave: "moda",
  id: idDeExemplo("loja:moda"),
  codigo: "SC-0002",
  slug: "moda-boa-vista",
  nome: "Moda Boa Vista",
  ramo: "APPAREL",
  ehComida: false,
  controlaEstoque: true,
  dona: PESSOAS.donoDaModa,
  equipe: [],
  clientes: [
    cliente({
      loja: "moda",
      chave: "ana",
      nome: "Ana Ribeiro",
      telefone: "+5511933330001",
      email: "ana.ribeiro@cliente.test",
      identidade: PESSOAS.compradoraAna,
    }),
    cliente({
      loja: "moda",
      chave: "diego",
      nome: "Diego Alves",
      telefone: "+5511955550004",
      email: null,
      identidade: null,
    }),
  ],
  fusoHorario: "America/Sao_Paulo",
  whatsapp: "+5511922220001",
  chavePix: "pix@modaboavista.test",
};

/** As duas lojas, na ordem em que são plantadas. */
export const LOJAS: readonly LojaDeExemplo[] = [PASTELARIA, MODA];

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

function linhasDeIdentidades(referencia: Date): readonly LinhaDeExemplo[] {
  return TODAS_AS_PESSOAS.map((quem) => ({
    id: quem.id,
    email_norm: quem.email,
    // A carga não inventa hash de senha: entrar como estas pessoas é assunto da
    // feature de identidade, que ainda não existe. Conta sem senha é estado
    // legítimo do modelo, e não um cadastro pela metade.
    password_hash: null,
    email_verified_at: instanteDeExemplo(referencia, quem.criadaEmMinutos + 10),
    phone_e164: quem.telefone,
    display_name: quem.nome,
    locale: "pt-BR",
    failed_login_count: 0,
    locked_until: null,
    anonymized_at: null,
    created_at: instanteDeExemplo(referencia, quem.criadaEmMinutos),
    updated_at: instanteDeExemplo(referencia, quem.criadaEmMinutos),
  }));
}

function linhasDeAdministradores(referencia: Date): readonly LinhaDeExemplo[] {
  return [
    {
      identity_id: PESSOAS.administracao.id,
      granted_by: null,
      granted_at: instanteDeExemplo(
        referencia,
        PESSOAS.administracao.criadaEmMinutos,
      ),
      revoked_at: null,
    },
  ];
}

function linhaDaLoja(loja: LojaDeExemplo, referencia: Date): LinhaDeExemplo {
  const criacao = instanteDeExemplo(referencia, -50_000);
  return {
    id: loja.id,
    code: loja.codigo,
    name: loja.nome,
    legal_name: `${loja.nome} Comércio Ltda`,
    doc_number:
      loja.chave === "pastelaria" ? "11222333000181" : "44555666000172",
    doc_type: "CNPJ",
    slug: loja.slug,
    status: "ACTIVE",
    vertical_code: loja.ramo,
    vertical_schema_version: 1,
    timezone: loja.fusoHorario,
    currency: "BRL",
    open_state: "SCHEDULE",
    temporarily_closed_until: null,
    fulfillment_modes: ["DELIVERY", "PICKUP"],
    whatsapp_e164: loja.whatsapp,
    phone1: loja.whatsapp,
    phone2: null,
    email: loja.dona.email,
    street: loja.ehComida ? "Rua das Acácias" : "Avenida Boa Vista",
    number: loja.ehComida ? "120" : "980",
    complement: null,
    neighborhood: loja.ehComida ? "Vila Nova" : "Centro",
    city: "São Paulo",
    uf: "SP",
    zip: loja.ehComida ? "03110000" : "01310000",
    lat: null,
    lng: null,
    deleted_at: null,
    purge_after: null,
    created_by: PESSOAS.administracao.id,
    created_at: criacao,
    updated_at: criacao,
    // `catalog_version` fica de fora: o gatilho do catálogo a incrementa a cada
    // produto plantado. Escrevê-la aqui daria um valor que a própria carga
    // sobrescreve logo em seguida — e é justamente o tipo de campo cuja
    // previsibilidade a prova de determinismo confere no banco, não no código.
  };
}

/**
 * O horário de funcionamento de cada loja de exemplo.
 *
 * Sem ele, TODA loja da semente aparece fechada na vitrine — e quem abre a
 * página para conferir o trabalho vê o aviso de fechado em vez do que foi
 * construído. Dado de exemplo que não produz um cenário navegável não é dado de
 * exemplo (AC-004).
 *
 * A pastelaria abre em duas faixas, almoço e jantar, porque é o caso que
 * exercita mais de uma faixa no mesmo dia. A loja de roupa abre corrido, que é o
 * comum no comércio de rua.
 */
function linhasDosHorarios(
  loja: LojaDeExemplo,
  referencia: Date,
): LinhaDeExemplo[] {
  const faixas = loja.ehComida
    ? [
        { abre: "11:00", fecha: "15:00" },
        { abre: "18:00", fecha: "23:00" },
      ]
    : [{ abre: "09:00", fecha: "18:00" }];

  const linhas: LinhaDeExemplo[] = [];
  // Segunda a sábado. Domingo fica sem faixa de propósito: é o dia que mostra a
  // vitrine dizendo "abre amanhã às 11h" em vez de só "fechada".
  for (let dia = 1; dia <= 6; dia += 1) {
    faixas.forEach((faixa, ordem) => {
      linhas.push({
        store_id: loja.id,
        weekday: dia,
        opens_at: faixa.abre,
        closes_at: faixa.fecha,
        is_closed: false,
        sort_order: ordem,
        created_at: referencia,
        updated_at: referencia,
      });
    });
  }
  return linhas;
}

function linhaDasConfiguracoes(
  loja: LojaDeExemplo,
  referencia: Date,
): LinhaDeExemplo {
  return {
    store_id: loja.id,
    // As chaves são as que o MODELO DE DADOS declara, e as que a projeção
    // pública lê. Divergir aqui produziria uma semente que planta sem erro e
    // uma vitrine que não mostra nada — o pior tipo de dado de exemplo, porque
    // ele passa em todo teste e falha quando alguém abre a página.
    theme: json({
      primaria: loja.ehComida ? "#B3261E" : "#1B3A6B",
      fundo: "#FFFFFF",
    }),
    landing: json({
      boasVindas: loja.ehComida
        ? "Pastel na hora, massa fina e recheio generoso."
        : "Roupa boa, preço honesto, entrega no bairro.",
      mostrarDestaques: true,
    }),
    checkout: json({
      pedirDocumento: false,
      pedirEmail: true,
      pedidoMinimoCents: loja.ehComida ? 1500 : 0,
    }),
    delivery: json({
      taxaPadraoCents: loja.ehComida ? 700 : 1500,
      prazoMinutos: loja.ehComida ? 40 : 2880,
      retiradaNoLocal: true,
    }),
    // A chave PIX mora aqui, e é por isso que esta tabela nunca é lida pela
    // vitrine: o que o público vê sai por lista fechada de campos.
    payment: json({
      pix: {
        chave: loja.chavePix,
        tipo: "EMAIL",
        titular: loja.dona.nome,
      },
      formas: ["PIX", "CASH", "CARD_ON_DELIVERY"],
    }),
    whatsapp: json({
      numero: loja.whatsapp,
      saudacao: "Olá! Segue meu pedido:",
    }),
    printing: json({ formato: "CUPOM_80MM", automatico: false }),
    seo: json({
      titulo: `${loja.nome} — peça pelo site`,
      descricao: loja.ehComida
        ? "Cardápio da Pastelaria da Vila com entrega no bairro."
        : "Catálogo da Moda Boa Vista com grade de tamanhos.",
    }),
    notifications: json({ emailDePedidoNovo: true }),
    schema_version: 1,
    updated_at: instanteDeExemplo(referencia, -49_000),
  };
}

function linhasDosMembros(
  loja: LojaDeExemplo,
  referencia: Date,
): readonly LinhaDeExemplo[] {
  const entrada = instanteDeExemplo(referencia, -49_000);
  const dona: LinhaDeExemplo = {
    id: idDeExemplo(`membro:${loja.chave}:dona`),
    store_id: loja.id,
    identity_id: loja.dona.id,
    role: "OWNER",
    permissions: json({ tudo: true }),
    invited_by: PESSOAS.administracao.id,
    invite_accepted_at: entrada,
    revoked_at: null,
    created_at: entrada,
  };

  const equipe = loja.equipe.map((quem) => ({
    id: idDeExemplo(`membro:${loja.chave}:${quem.chave}`),
    store_id: loja.id,
    identity_id: quem.id,
    role: "STAFF",
    permissions: json({ pedidos: true, catalogo: true, configuracoes: false }),
    invited_by: loja.dona.id,
    invite_accepted_at: instanteDeExemplo(referencia, -48_000),
    revoked_at: null,
    created_at: instanteDeExemplo(referencia, -48_100),
  }));

  return [dona, ...equipe];
}

function linhasDosClientes(
  loja: LojaDeExemplo,
  referencia: Date,
): readonly LinhaDeExemplo[] {
  return loja.clientes.map((quem, indice) => ({
    id: quem.id,
    store_id: loja.id,
    identity_id: quem.identidade?.id ?? null,
    display_name: quem.nome,
    phone_e164: quem.telefone,
    phone_hmac: null,
    email: quem.email,
    doc_number: null,
    birth_date: null,
    notes: quem.identidade === null ? "Cadastrada no balcão." : null,
    // Os contadores nascem zerados: quem os move é o caso de uso de pedido, e
    // um número escrito à mão aqui viraria a segunda fonte de verdade que o
    // dashboard depois contradiria.
    orders_count: 0,
    total_spent_cents: 0,
    last_order_at: null,
    anonymized_at: null,
    created_at: instanteDeExemplo(referencia, -20_000 + indice * 100),
    updated_at: instanteDeExemplo(referencia, -20_000 + indice * 100),
    // A remoção com retenção e o endereço da ficha (0035) nascem vazios: o
    // cenário não tem cliente removido, e o endereço de quem tem conta mora
    // em `customer_addresses`, preso à identidade.
    removed_at: null,
    address: null,
  }));
}

/**
 * Os endereços salvos dos compradores com conta (0036, AC-509).
 *
 * Presos à IDENTIDADE, e não à loja: Ana compra nas duas lojas e tem um
 * endereço só, que o fechamento de qualquer uma delas pré-preenche. Um por
 * pessoa é o padrão; Bruno tem dois para a lista ter ordem a provar.
 */
function linhasDeEnderecos(referencia: Date): readonly LinhaDeExemplo[] {
  const criacao = instanteDeExemplo(referencia, -39_000);
  const endereco = (
    quem: PessoaDeExemplo,
    chave: string,
    dados: Readonly<Record<string, string | boolean | null>>,
  ): LinhaDeExemplo => ({
    id: idDeExemplo(`endereco:${quem.chave}:${chave}`),
    identity_id: quem.id,
    recipient_name: quem.nome,
    anonymized_at: null,
    created_at: criacao,
    updated_at: criacao,
    ...dados,
  });

  return [
    endereco(PESSOAS.compradoraAna, "casa", {
      label: "Casa",
      street: "Rua das Flores",
      number: "123",
      complement: "Apto 21",
      neighborhood: "Vila Mariana",
      city: "São Paulo",
      uf: "SP",
      zip: "04110000",
      reference_point: "Ao lado da padaria",
      is_default: true,
    }),
    endereco(PESSOAS.compradorBruno, "casa", {
      label: "Casa",
      street: "Avenida Paulista",
      number: "1000",
      complement: null,
      neighborhood: "Bela Vista",
      city: "São Paulo",
      uf: "SP",
      zip: "01310100",
      reference_point: null,
      is_default: true,
    }),
    endereco(PESSOAS.compradorBruno, "trabalho", {
      label: "Trabalho",
      street: "Rua Augusta",
      number: "500",
      complement: "Sala 3",
      neighborhood: "Consolação",
      city: "São Paulo",
      uf: "SP",
      zip: "01305000",
      reference_point: null,
      is_default: false,
    }),
  ];
}

/**
 * As lojas e tudo que existe antes do catálogo: identidades, administração,
 * lojas, configurações, endereços, membros e clientes.
 *
 * A ordem da lista é a ordem de inserção, e ela respeita as chaves
 * estrangeiras: identidade antes de loja (que a referencia como criadora), loja
 * antes de tudo que pende dela.
 */
export function montarLojas(referencia: Date): readonly ConjuntoDeExemplo[] {
  return [
    { tabela: "identities", linhas: linhasDeIdentidades(referencia) },
    { tabela: "platform_admins", linhas: linhasDeAdministradores(referencia) },
    {
      tabela: "stores",
      linhas: LOJAS.map((loja) => linhaDaLoja(loja, referencia)),
    },
    {
      tabela: "store_settings",
      linhas: LOJAS.map((loja) => linhaDasConfiguracoes(loja, referencia)),
    },
    {
      tabela: "store_hours",
      linhas: LOJAS.flatMap((loja) => linhasDosHorarios(loja, referencia)),
    },
    {
      tabela: "store_members",
      linhas: LOJAS.flatMap((loja) => linhasDosMembros(loja, referencia)),
    },
    {
      tabela: "store_customers",
      linhas: LOJAS.flatMap((loja) => linhasDosClientes(loja, referencia)),
    },
    { tabela: "customer_addresses", linhas: linhasDeEnderecos(referencia) },
  ];
}

/**
 * A trilha de auditoria do que a administração fez para as lojas existirem.
 *
 * Entra por último porque `audit_log` é a única tabela do cenário que não
 * aceita alteração nem remoção — nem pela credencial de migração. Plantá-la no
 * fim deixa claro que ela registra fatos já consumados, e não intenções.
 *
 * O que é registrado segue o que as decisões já exigem trilha: criação da loja,
 * definição do ramo (que só a administração altera) e troca de dado sensível
 * como a chave PIX. O conteúdo guarda identificador, nunca o dado em si (P-009).
 */
export function montarAuditoria(
  referencia: Date,
): readonly ConjuntoDeExemplo[] {
  const linhas = LOJAS.flatMap((loja, indice): readonly LinhaDeExemplo[] => {
    const base = -50_000 + indice * 10;
    return [
      {
        store_id: loja.id,
        actor_id: PESSOAS.administracao.id,
        actor_role: "ADMIN_GERAL",
        action: "STORE_CREATED",
        entity: "stores",
        entity_id: loja.id,
        before_data: null,
        after_data: json({ code: loja.codigo, status: "ACTIVE" }),
        ip_hmac: null,
        created_at: instanteDeExemplo(referencia, base),
      },
      {
        store_id: loja.id,
        actor_id: PESSOAS.administracao.id,
        actor_role: "ADMIN_GERAL",
        action: "STORE_VERTICAL_CHANGED",
        entity: "stores",
        entity_id: loja.id,
        before_data: json({ vertical_code: null }),
        after_data: json({ vertical_code: loja.ramo }),
        ip_hmac: null,
        created_at: instanteDeExemplo(referencia, base + 2),
      },
      {
        store_id: loja.id,
        actor_id: loja.dona.id,
        actor_role: "OWNER",
        action: "STORE_PAYMENT_KEY_CHANGED",
        entity: "store_settings",
        entity_id: loja.id,
        // O valor da chave PIX NÃO entra na trilha: o que se registra é que a
        // seção mudou e quem mudou (P-009).
        before_data: json({ pix: { definida: false } }),
        after_data: json({ pix: { definida: true, tipo: "EMAIL" } }),
        ip_hmac: null,
        created_at: instanteDeExemplo(referencia, base + 4),
      },
    ];
  });

  return [{ tabela: "audit_log", linhas }];
}
