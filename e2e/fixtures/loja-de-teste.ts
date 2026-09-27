/**
 * A loja que o ponta a ponta usa, montada por ele mesmo.
 *
 * POR QUE NÃO A LOJA DA CARGA DE EXEMPLO. Ela tem horário de funcionamento de
 * verdade — abre às 11h —, e cenário que só passa depois do almoço não é
 * prova, é sorte. Esta loja abre TODOS OS DIAS, o DIA INTEIRO, e por isso o
 * fluxo de fechamento é o mesmo às três da manhã e às três da tarde.
 *
 * ELA É IDEMPOTENTE. Rodar o ponta a ponta dez vezes não cria dez lojas: tudo
 * é escrito por `slug`, e a segunda execução reaproveita o que a primeira
 * deixou. Sem isso, cada execução sujaria o banco um pouco mais, e um dia
 * alguém abriria a lista de lojas e encontraria duzentas.
 *
 * ELA ESCREVE NO BANCO DE DESENVOLVIMENTO, que é o que a API do ponta a ponta
 * usa. É a dívida 85, e o desenho aqui é o que a torna suportável: loja própria,
 * apelido reconhecível, e nada tocado fora dela.
 */
import { Client } from "pg";

/** O apelido diz a que veio: quem encontrar esta loja sabe de onde ela saiu. */
export const APELIDO_DA_LOJA = "e2e-lanchonete";

/** O produto que os cenários compram. */
export const PRODUTO = {
  apelido: "e2e-pastel",
  nome: "Pastel de Teste",
  precoCentavos: 1200,
} as const;

/** O que o carrinho e o fechamento precisam saber da loja. */
export interface LojaDoTeste {
  readonly id: string;
  readonly apelido: string;
  readonly produtoId: string;
}

/**
 * Devolve o identificador da linha que já existe, ou cria e devolve.
 *
 * Existe porque `ON CONFLICT` não serve aqui: os índices únicos deste banco são
 * parciais e alguns são sobre expressão, e a cláusula só casa com um índice
 * quando a especificação bate exatamente com ele.
 */
interface LinhaDesejada {
  readonly procura: string;
  readonly parametrosDaProcura: readonly unknown[];
  readonly insercao: string;
  readonly parametrosDaInsercao: readonly unknown[];
  /** O nome do que se está criando, para a mensagem de erro dizer o quê. */
  readonly oQue: string;
}

async function garantirLinha(
  cliente: Client,
  desejada: LinhaDesejada,
): Promise<string> {
  const { procura, parametrosDaProcura, insercao, parametrosDaInsercao, oQue } =
    desejada;
  const achada = await cliente.query<{ id: string }>(procura, [
    ...parametrosDaProcura,
  ]);
  const existente = achada.rows[0]?.id;
  if (existente !== undefined) return existente;

  try {
    const criada = await cliente.query<{ id: string }>(insercao, [
      ...parametrosDaInsercao,
    ]);
    const novo = criada.rows[0]?.id;
    if (novo === undefined) throw new Error(`não consegui criar ${oQue}`);
    return novo;
  } catch (erro) {
    // CORRIDA ENTRE TRABALHADORES. O Playwright roda cenários em paralelo, e
    // dois deles podem procurar ao mesmo tempo, não achar, e tentar criar. O
    // segundo bate no índice único — e isso é o banco funcionando: a chave
    // única existe justamente para que só um crie.
    //
    // Quem perdeu a corrida procura de novo e usa o que o outro criou. Sem
    // isto, o cenário reprova por um erro de montagem que não tem nada a ver
    // com o que ele prova.
    if (!ehChaveDuplicada(erro)) throw erro;

    const outraVez = await cliente.query<{ id: string }>(procura, [
      ...parametrosDaProcura,
    ]);
    const doVizinho = outraVez.rows[0]?.id;
    if (doVizinho === undefined) throw erro;
    return doVizinho;
  }
}

/** `23505` é o código do PostgreSQL para violação de chave única. */
function ehChaveDuplicada(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    (erro as { code?: unknown }).code === "23505"
  );
}

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "o ponta a ponta precisa de DATABASE_URL_DIRETA para montar a loja de teste",
    );
  }
  return new Client({ connectionString: url });
}

/**
 * A chave da trava que serializa a montagem da loja de teste.
 *
 * É UM NÚMERO ARBITRÁRIO, e a única exigência é ser o mesmo em todo processo
 * que monte esta loja. `pg_advisory_lock` trabalha sobre um inteiro, e não
 * sobre um nome: é o preço de uma trava que não precisa de tabela.
 */
const TRAVA_DA_MONTAGEM = 8_140_620;

/**
 * Garante a loja, a categoria, o produto e o horário.
 *
 * A ORDEM IMPORTA: a loja antes de tudo, porque tudo é escopado por ela; o
 * horário antes do produto não faria diferença, mas manter a ordem do modelo
 * mental (loja → configuração → catálogo) é o que faz esta função ser lida sem
 * esforço daqui a seis meses.
 *
 * A MONTAGEM INTEIRA É SERIALIZADA, e isso não é excesso de zelo. O Playwright
 * roda os arquivos em paralelo, e cada um chama esta função no `beforeAll`: com
 * dois processos dentro dela ao mesmo tempo, o `DELETE` de horários de um cai
 * no meio dos `INSERT` do outro, e existe uma janela em que a loja fica SEM
 * HORÁRIO NENHUM. Quem carregar a página nessa janela vê "a loja está fechada"
 * — e o cenário reprova por um motivo que não é o dele, de forma intermitente.
 *
 * Aconteceu de verdade, na execução completa da T-406: cinco cenários caíram
 * ao mesmo tempo, a tabela ficou com catorze linhas de horário em vez de sete,
 * e a API respondia `aberta: true` quando perguntada depois. Intermitência que
 * some quando se investiga é a pior que existe.
 *
 * A trava é do PostgreSQL e vale por sessão: ela solta sozinha quando a
 * conexão fecha, inclusive se o processo morrer no meio.
 */
export async function garantirLojaDeTeste(): Promise<LojaDoTeste> {
  const cliente = conectar();
  await cliente.connect();

  try {
    await cliente.query("SELECT pg_advisory_lock($1)", [TRAVA_DA_MONTAGEM]);
    // PROCURA ANTES DE INSERIR, e não `ON CONFLICT`. Os índices únicos deste
    // banco são PARCIAIS (`WHERE deleted_at IS NULL`) e alguns são sobre
    // expressão (`lower(slug)`) — e `ON CONFLICT` só casa com um índice se a
    // especificação bater exatamente com ele. Procurar primeiro funciona com
    // qualquer forma de índice, e diz em SQL o que a função faz.
    const lojaId = await garantirLinha(cliente, {
      procura: `SELECT id FROM app.stores WHERE lower(slug) = lower($1) AND deleted_at IS NULL`,
      parametrosDaProcura: [APELIDO_DA_LOJA],
      insercao: `INSERT INTO app.stores (code, name, slug, status, vertical_code, fulfillment_modes)
       VALUES ('E2E1', 'Lanchonete do Ponta a Ponta', $1, 'ACTIVE', 'FOOD_SNACK',
               ARRAY['DELIVERY','PICKUP'])
       RETURNING id`,
      parametrosDaInsercao: [APELIDO_DA_LOJA],
      oQue: "loja",
    });

    // A loja pode ter sido desativada por outro cenário; garantir o estado é
    // parte de ser idempotente.
    await cliente.query(
      `UPDATE app.stores SET status = 'ACTIVE', deleted_at = NULL WHERE id = $1`,
      [lojaId],
    );

    await cliente.query(
      `INSERT INTO app.store_settings (store_id, landing, theme, delivery, payment, whatsapp)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (store_id) DO UPDATE
         SET delivery = EXCLUDED.delivery, payment = EXCLUDED.payment,
             whatsapp = EXCLUDED.whatsapp, landing = EXCLUDED.landing`,
      [
        lojaId,
        JSON.stringify({ boasVindas: "Pastel a qualquer hora." }),
        JSON.stringify({ primaria: "#0f6e5c" }),
        JSON.stringify({ taxaPadraoCents: 500, retiradaNoLocal: true }),
        JSON.stringify({
          formas: ["PIX", "CASH"],
          pix: { chave: "e2e@pix.test", tipo: "EMAIL", titular: "Loja E2E" },
        }),
        JSON.stringify({
          numero: "+5511900000000",
          saudacao: "Olá! Segue meu pedido:",
        }),
      ],
    );

    // ABERTA SEMPRE. É o que tira o relógio da equação — e o horário em si tem
    // prova própria, na T-903.
    await cliente.query(`DELETE FROM app.store_hours WHERE store_id = $1`, [
      lojaId,
    ]);
    for (let dia = 0; dia <= 6; dia += 1) {
      await cliente.query(
        `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
         VALUES ($1, $2, '00:00', '23:59')`,
        [lojaId, dia],
      );
    }

    const categoriaId = await garantirLinha(cliente, {
      procura: `SELECT id FROM app.categories
        WHERE store_id = $1 AND slug = 'e2e-salgados' AND deleted_at IS NULL`,
      parametrosDaProcura: [lojaId],
      insercao: `INSERT INTO app.categories (store_id, name, slug, is_visible, sort_order)
       VALUES ($1, 'Salgados', 'e2e-salgados', true, 1)
       RETURNING id`,
      parametrosDaInsercao: [lojaId],
      oQue: "categoria",
    });

    const produtoId = await garantirLinha(cliente, {
      procura: `SELECT id FROM app.products
        WHERE store_id = $1 AND slug = $2 AND deleted_at IS NULL`,
      parametrosDaProcura: [lojaId, PRODUTO.apelido],
      insercao: `INSERT INTO app.products
         (store_id, name, slug, description, short_description, vertical_code,
          status, is_available, is_featured, display_price_cents)
       VALUES ($1, $2, $3, 'Massa fina, recheio generoso.', 'O clássico da casa.',
               'FOOD_SNACK', 'PUBLISHED', true, true, $4)
       RETURNING id`,
      parametrosDaInsercao: [
        lojaId,
        PRODUTO.nome,
        PRODUTO.apelido,
        PRODUTO.precoCentavos,
      ],
      oQue: "produto",
    });

    await cliente.query(
      `UPDATE app.products
          SET status = 'PUBLISHED', is_available = true, is_featured = true,
              display_price_cents = $2, deleted_at = NULL
        WHERE id = $1`,
      [produtoId, PRODUTO.precoCentavos],
    );

    await cliente.query(
      `INSERT INTO app.product_categories (store_id, product_id, category_id, sort_order)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (store_id, product_id, category_id) DO NOTHING`,
      [lojaId, produtoId, categoriaId],
    );

    return { id: lojaId, apelido: APELIDO_DA_LOJA, produtoId };
  } finally {
    // `end()` solta a trava sozinho — soltá-la à mão antes é o que garante que
    // ela caia mesmo se o `end` falhar, e o `catch` vazio existe porque uma
    // trava que não estava presa não é problema de ninguém.
    await cliente
      .query("SELECT pg_advisory_unlock($1)", [TRAVA_DA_MONTAGEM])
      .catch(() => undefined);
    await cliente.end();
  }
}

/**
 * Mantém a loja semeada usada pelo cenário detalhado aberta durante o E2E.
 * A semente representa horários reais, mas isso faria a prova depender do dia
 * e da hora em que a suíte foi executada.
 */
export async function garantirPastelariaDeTesteAberta(): Promise<void> {
  const cliente = conectar();
  await cliente.connect();

  try {
    const loja = await cliente.query<{ id: string }>(
      `SELECT id FROM app.stores WHERE slug = 'pastelaria-da-vila' AND deleted_at IS NULL`,
    );
    const lojaId = loja.rows[0]?.id;
    if (lojaId === undefined) {
      throw new Error("a loja pastelaria-da-vila não existe no banco de E2E");
    }

    await cliente.query(`DELETE FROM app.store_hours WHERE store_id = $1`, [
      lojaId,
    ]);
    for (let dia = 0; dia <= 6; dia += 1) {
      await cliente.query(
        `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
         VALUES ($1, $2, '00:00', '23:59')`,
        [lojaId, dia],
      );
    }
  } finally {
    await cliente.end();
  }
}

/**
 * Apaga os pedidos que os cenários criaram.
 *
 * O CARRINHO NÃO É APAGADO, e a loja também não: carrinho abandonado é rastro
 * que o dono usa, e apagar a loja obrigaria a montá-la de novo a cada execução.
 * O que não pode acumular é PEDIDO — ele aparece na fila, e fila com pedido de
 * teste é fila em que ninguém confia.
 */
export async function limparPedidosDoTeste(lojaId: string): Promise<void> {
  const cliente = conectar();
  await cliente.connect();
  try {
    // A ordem segue as chaves estrangeiras, do mais fundo para o mais raso.
    await cliente.query(
      `DELETE FROM app.order_item_options WHERE order_item_id IN (
         SELECT oi.id FROM app.order_items oi
          JOIN app.orders o ON o.id = oi.order_id
         WHERE o.store_id = $1)`,
      [lojaId],
    );
    await cliente.query(
      `DELETE FROM app.order_items WHERE order_id IN (
         SELECT id FROM app.orders WHERE store_id = $1)`,
      [lojaId],
    );
    await cliente.query(
      `DELETE FROM app.order_status_history WHERE order_id IN (
         SELECT id FROM app.orders WHERE store_id = $1)`,
      [lojaId],
    );
    await cliente.query(
      `DELETE FROM app.order_contacts WHERE order_id IN (
         SELECT id FROM app.orders WHERE store_id = $1)`,
      [lojaId],
    );
    await cliente.query(`DELETE FROM app.orders WHERE store_id = $1`, [lojaId]);
  } finally {
    await cliente.end();
  }
}
