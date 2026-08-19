/**
 * Prova de que a vitrine não vaza (AC-402, AC-904, P-009), contra PostgreSQL.
 *
 * A projeção em memória já está provada em `dto-publico.test.ts`. O que só o
 * banco prova é o caminho INTEIRO: uma loja de verdade, com chave PIX de
 * verdade guardada na configuração, resolvida pelo endereço público como um
 * visitante anônimo. É onde o vazamento aconteceria de fato — na serialização
 * do que veio do banco, que é exatamente como um concorrente expôs chave PIX,
 * nome do titular, telefone e coordenadas num endereço público.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bancoDoArquivo,
  conectarNoBancoDoArquivo,
  criarLoja,
} from "@simpleclick/testing";
import type { LojaDeTeste } from "@simpleclick/testing";

import {
  abrirAcessoDaAplicacao,
  comoRequisicao,
  ESPERA_LONGA,
} from "./apoio-de-isolamento.ts";
import {
  identificarLoja,
  lojaDaVitrine,
} from "../src/modules/storefront/resolver-loja.usecase.ts";
import type {
  IdentificacaoDaLoja,
  LojaPublica,
} from "../src/modules/storefront/resolver-loja.usecase.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let ativa: LojaDeTeste;
let suspensa: LojaDeTeste;

const CHAVE_PIX = "loja-do-teste@pix.exemplo.test";
const DOCUMENTO = "12345678000199";
const WHATSAPP_DO_DONO = "5511900001111";

beforeAll(async () => {
  migrador = await conectarNoBancoDoArquivo();
  acesso = abrirAcessoDaAplicacao(bancoDoArquivo().url, { maxDeConexoes: 4 });

  ativa = await criarLoja({ nome: "Sabor da Esquina" });
  suspensa = await criarLoja({ nome: "Loja Suspensa", status: "SUSPENDED" });

  // Enche a loja com TUDO o que é sensível. Uma loja com os campos vazios
  // provaria só que campo ausente não aparece, que ninguém está em dúvida.
  await migrador.query(
    `UPDATE app.stores
        SET legal_name = $2, doc_number = $3, doc_type = 'CNPJ',
            whatsapp_e164 = $4, phone1 = '1133334444',
            email = 'dono@exemplo.test',
            street = 'Rua das Flores', number = '123',
            neighborhood = 'Centro', city = 'São Paulo', uf = 'SP',
            zip = '01000000', lat = -23.55, lng = -46.63
      WHERE id = $1`,
    [ativa.id, "Sabor da Esquina Alimentos LTDA", DOCUMENTO, WHATSAPP_DO_DONO],
  );

  await migrador.query(
    `INSERT INTO app.store_settings (store_id, landing, theme, payment, whatsapp, printing)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (store_id) DO UPDATE
       SET landing = EXCLUDED.landing, theme = EXCLUDED.theme,
           payment = EXCLUDED.payment, whatsapp = EXCLUDED.whatsapp,
           printing = EXCLUDED.printing`,
    [
      ativa.id,
      JSON.stringify({ boasVindas: "Comida caseira todo dia" }),
      JSON.stringify({ primaria: "#0f6e5c" }),
      JSON.stringify({ chavePix: CHAVE_PIX, nomeDoRecebedor: "Sabor LTDA" }),
      JSON.stringify({ numero: WHATSAPP_DO_DONO }),
      JSON.stringify({ chaveDoAgente: "segredo-da-impressora" }),
    ],
  );
}, ESPERA_LONGA);

afterAll(async () => {
  await acesso?.encerrar();
  await migrador?.end();
}, ESPERA_LONGA);

/**
 * O caminho inteiro de um visitante anônimo, como a borda o percorre.
 *
 * PASSO 1 sem loja no contexto — é assim que a requisição de verdade chega, e é
 * o que torna a resolução necessária. PASSO 2 numa transação NOVA, declarando a
 * loja descoberta: o contexto é definido uma vez, no início, e não muda mais.
 */
async function visitaAnonima(apelido: string): Promise<{
  identificacao: IdentificacaoDaLoja;
  publica: LojaPublica | null;
}> {
  const identificacao = await comoRequisicao(acesso, { papel: "PUBLIC" }, () =>
    identificarLoja({ apelido }),
  );

  if (!identificacao.encontrada) return { identificacao, publica: null };

  const publica = await comoRequisicao(
    acesso,
    { papel: "PUBLIC", lojaId: identificacao.id },
    () => lojaDaVitrine(),
  );

  return { identificacao, publica };
}

describe("a página da loja mostra o negócio (AC-400)", () => {
  it(
    "@spec:AC-400 nome, ramo e boas-vindas chegam à vitrine",
    async () => {
      const visita = await visitaAnonima(ativa.apelido);

      expect(visita.identificacao.encontrada).toBe(true);
      if (visita.publica === null) return;
      expect(visita.publica.nome).toBe("Sabor da Esquina");
      expect(visita.publica.boasVindas).toBe("Comida caseira todo dia");
      expect(visita.publica.cores).toEqual({ primaria: "#0f6e5c" });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-400 o endereço para quem vai retirar chega, sem CEP nem coordenada",
    async () => {
      const visita = await visitaAnonima(ativa.apelido);
      expect(visita.identificacao.encontrada).toBe(true);
      if (visita.publica === null) return;

      expect(visita.publica.enderecoParaRetirada?.logradouro).toBe(
        "Rua das Flores",
      );
      const comoTexto = JSON.stringify(visita);
      expect(comoTexto).not.toContain("01000000");
      expect(comoTexto).not.toContain("23.55");
    },
    ESPERA_LONGA,
  );
});

describe("loja suspensa e inexistente respondem igual (AC-402)", () => {
  it(
    "@spec:AC-402 endereço que nunca existiu diz apenas que a loja não está disponível",
    async () => {
      const visita = await visitaAnonima("loja-que-nunca-existiu");

      expect(visita.identificacao.encontrada).toBe(false);
      if (visita.identificacao.encontrada) return;
      expect(visita.identificacao.explicacao).toBe(
        "Esta loja não está disponível.",
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-402 loja suspensa responde EXATAMENTE a mesma coisa",
    async () => {
      // A diferença entre as duas respostas é o vazamento: ela contaria a quem
      // perguntasse que aquele endereço já existiu e foi suspenso, que é o que
      // serve para mapear concorrentes.
      const inexistente = await visitaAnonima("outra-que-nao-existe");
      const daSuspensa = await visitaAnonima(suspensa.apelido);

      expect(JSON.stringify(daSuspensa)).toBe(JSON.stringify(inexistente));
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-402 nada da loja suspensa aparece na resposta",
    async () => {
      const visita = await visitaAnonima(suspensa.apelido);

      const comoTexto = JSON.stringify(visita);
      expect(comoTexto).not.toContain(suspensa.nome);
      expect(comoTexto).not.toContain(suspensa.id);
      expect(comoTexto).not.toContain("SUSPENDED");
    },
    ESPERA_LONGA,
  );
});

describe("o que é do dono não sai na vitrine (AC-904, P-009)", () => {
  it(
    "@spec:AC-904 @principle:P-009 a CHAVE PIX não sai, mesmo estando na mesma linha do banco",
    async () => {
      // É o vazamento que um concorrente teve. A chave está guardada na
      // configuração da loja, ao lado das boas-vindas que a vitrine MOSTRA — e
      // é essa proximidade que faz um `SELECT *` derrubar tudo de uma vez.
      const visita = await visitaAnonima(ativa.apelido);

      const comoTexto = JSON.stringify(visita);
      expect(comoTexto).not.toContain(CHAVE_PIX);
      expect(comoTexto).not.toContain("chavePix");
      expect(comoTexto).not.toContain("segredo-da-impressora");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-904 @principle:P-009 documento, telefone e e-mail do dono não saem",
    async () => {
      const comoTexto = JSON.stringify(await visitaAnonima(ativa.apelido));

      expect(comoTexto).not.toContain(DOCUMENTO);
      expect(comoTexto).not.toContain(WHATSAPP_DO_DONO);
      expect(comoTexto).not.toContain("1133334444");
      expect(comoTexto).not.toContain("dono@exemplo.test");
      expect(comoTexto).not.toContain("Alimentos LTDA");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-904 @principle:P-009 a chave PIX é INALCANÇÁVEL pelo caminho público, e não apenas não pedida",
    async () => {
      // A trava de código já está provada acima. Esta é a do banco, e é a que
      // continua valendo quando alguém escrever um caso de uso novo sem ler o
      // anterior: com a loja no contexto e papel público, a linha de
      // configuração simplesmente não existe.
      const lido = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: ativa.id },
        (tx) => tx.storeSettings.findFirst({ select: { payment: true } }),
      );

      expect(lido).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-904 a função da vitrine devolve a apresentação e NADA da configuração",
    async () => {
      // O outro lado: a função existe e funciona, mas o que ela devolve tem
      // duas colunas. Se alguém acrescentar uma terceira sem pensar, esta
      // asserção reprova.
      const linhas = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: ativa.id },
        (tx) =>
          tx.$queryRaw<
            Record<string, unknown>[]
          >`SELECT * FROM app.storefront_settings()`,
      );

      expect(Object.keys(linhas[0] ?? {}).sort()).toEqual(["landing", "theme"]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-904 a resposta inteira cabe nos campos que a lista permite",
    async () => {
      // Conta as chaves em vez de procurar valores conhecidos: um campo novo
      // que vazasse com valor imprevisto passaria por uma busca por texto, e
      // não passa por esta.
      const visita = await visitaAnonima(ativa.apelido);
      expect(visita.identificacao.encontrada).toBe(true);
      if (visita.publica === null) return;

      expect(Object.keys(visita.publica).sort()).toEqual([
        "apelido",
        "boasVindas",
        "capa",
        "cores",
        "enderecoParaRetirada",
        "formasDeEntrega",
        "fusoHorario",
        "logo",
        "moeda",
        "nome",
        "ramo",
      ]);
    },
    ESPERA_LONGA,
  );
});
