/**
 * A loja da página Sobre, montada pelo próprio ponta a ponta (T-410).
 *
 * POR QUE UMA LOJA SÓ DELA. A página Sobre precisa de história, logo, capa,
 * endereço de retirada e — principalmente — de um WhatsApp MARCADO COMO
 * PÚBLICO. A loja de `loja-de-teste.ts` é regravada por todo cenário que
 * compra, e o WhatsApp dela é o do fechamento, sem a marca; mexer nele daqui
 * criaria uma corrida entre arquivos que rodam em paralelo.
 *
 * O CADASTRO VEM CHEIO DE PROPÓSITO. Telefone, e-mail, documento e o WhatsApp
 * do cadastro estão preenchidos para que o cenário possa afirmar que NENHUM
 * deles aparece. Uma loja com esses campos vazios provaria só que campo vazio
 * não aparece.
 *
 * ELA É IDEMPOTENTE, como a outra: tudo é escrito pelo apelido, e rodar dez
 * vezes deixa uma loja só.
 */
import { Client } from "pg";

/** O apelido diz de onde a loja saiu. */
export const APELIDO_DA_LOJA_COM_SOBRE = "e2e-sobre";

/** O que a página Sobre deve mostrar, e o que ela nunca pode mostrar. */
export const LOJA_COM_SOBRE = {
  apelido: APELIDO_DA_LOJA_COM_SOBRE,
  nome: "Casa do Sobre E2E",
  historia: "Começamos numa garagem, com a receita da avó e duas panelas.",
  endereco: {
    logradouro: "Avenida Beira-Mar",
    numero: "500",
    bairro: "Gonzaga",
    cidade: "Santos",
    uf: "SP",
  },
  whatsappPublico: "5513988887777",
  /** Tudo o que é do cadastro do dono e NÃO pode sair. */
  cadastro: {
    whatsapp: "5513977776666",
    telefone: "1333334444",
    email: "dona-do-sobre@e2e.test",
    documento: "11222333000181",
    razaoSocial: "Casa do Sobre Comércio de Alimentos LTDA",
    cep: "11060000",
  },
} as const;

function conectar(): Client {
  const url = process.env["DATABASE_URL_DIRETA"];
  if (url === undefined || url === "") {
    throw new Error(
      "o ponta a ponta precisa de DATABASE_URL_DIRETA para montar a loja da página Sobre",
    );
  }
  return new Client({ connectionString: url });
}

/**
 * A chave da trava que serializa a montagem desta loja.
 *
 * Os dois projetos do Playwright (tela larga e celular) chamam esta função ao
 * mesmo tempo; sem a trava, os dois procuram, não acham e tentam criar.
 */
const TRAVA_DA_MONTAGEM = 8_141_410;

/**
 * Garante a loja com a apresentação completa.
 *
 * `logo` e `capa` são endereços ABSOLUTOS do próprio site de teste: a
 * configuração da aparência só aceita endereço absoluto, e apontar para uma
 * imagem que existe deixa o cenário conferir que ela de fato carregou.
 */
export async function garantirLojaComSobre(enderecoDoSite: string): Promise<{
  readonly id: string;
  readonly logo: string;
  readonly capa: string;
}> {
  const cliente = conectar();
  await cliente.connect();

  const logo = `${enderecoDoSite}/brand/app-icon-light.svg`;
  const capa = `${enderecoDoSite}/brand/logo-primary.svg`;

  try {
    await cliente.query("SELECT pg_advisory_lock($1)", [TRAVA_DA_MONTAGEM]);

    const achada = await cliente.query<{ id: string }>(
      `SELECT id FROM app.stores WHERE lower(slug) = lower($1) AND deleted_at IS NULL`,
      [APELIDO_DA_LOJA_COM_SOBRE],
    );
    let lojaId = achada.rows[0]?.id;
    if (lojaId === undefined) {
      const criada = await cliente.query<{ id: string }>(
        `INSERT INTO app.stores (code, name, slug, status, vertical_code, fulfillment_modes)
         VALUES ('E2E-SOBRE', $2, $1, 'ACTIVE', 'FOOD_SNACK', ARRAY['PICKUP'])
         RETURNING id`,
        [APELIDO_DA_LOJA_COM_SOBRE, LOJA_COM_SOBRE.nome],
      );
      lojaId = criada.rows[0]?.id;
      if (lojaId === undefined) {
        throw new Error("não consegui criar a loja da página Sobre");
      }
    }

    const { endereco, cadastro } = LOJA_COM_SOBRE;
    await cliente.query(
      `UPDATE app.stores
          SET name = $2, status = 'ACTIVE', deleted_at = NULL,
              legal_name = $3, doc_type = 'CNPJ', doc_number = $4,
              whatsapp_e164 = $5, phone1 = $6, email = $7,
              street = $8, number = $9, complement = NULL,
              neighborhood = $10, city = $11, uf = $12, zip = $13,
              lat = -23.967, lng = -46.333
        WHERE id = $1`,
      [
        lojaId,
        LOJA_COM_SOBRE.nome,
        cadastro.razaoSocial,
        cadastro.documento,
        cadastro.whatsapp,
        cadastro.telefone,
        cadastro.email,
        endereco.logradouro,
        endereco.numero,
        endereco.bairro,
        endereco.cidade,
        endereco.uf,
        cadastro.cep,
      ],
    );

    await cliente.query(
      `INSERT INTO app.store_settings (store_id, landing, theme, whatsapp)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (store_id) DO UPDATE
         SET landing = EXCLUDED.landing, theme = EXCLUDED.theme,
             whatsapp = EXCLUDED.whatsapp`,
      [
        lojaId,
        JSON.stringify({
          boasVindas: "Comida de casa, feita devagar.",
          sobre: LOJA_COM_SOBRE.historia,
          logo,
          capa,
        }),
        JSON.stringify({ primaria: "#0f6e5c" }),
        JSON.stringify({
          numero: LOJA_COM_SOBRE.whatsappPublico,
          saudacao: "Olá!",
          publico: true,
        }),
      ],
    );

    return { id: lojaId, logo, capa };
  } finally {
    await cliente
      .query("SELECT pg_advisory_unlock($1)", [TRAVA_DA_MONTAGEM])
      .catch(() => undefined);
    await cliente.end();
  }
}
