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
import { fechamentoDaLoja } from "../src/modules/storefront/fechamento.usecase.ts";
import { horarioDaLoja } from "../src/modules/stores/horarios.usecase.ts";
import type {
  IdentificacaoDaLoja,
  VitrineDaLoja,
} from "../src/modules/storefront/resolver-loja.usecase.ts";
import type { AcessoAoBanco } from "../src/core/db.ts";

let migrador: pg.Client;
let acesso: AcessoAoBanco;
let ativa: LojaDeTeste;
let suspensa: LojaDeTeste;

/** Instante fixo: segunda, 17 de agosto de 2026, meio-dia em São Paulo. */
const AGORA = new Date(Date.UTC(2026, 7, 17, 15, 0));

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
      // A FORMA É A DA CARGA DE EXEMPLO (`packages/database/seed/`), que nasce
      // do modelo de dados. Este teste usava `{ chavePix, nomeDoRecebedor }`,
      // inventado quando ele só precisava de "algo com cara de PIX" para provar
      // que não vazava — e qualquer forma servia para isso. A T-513 passou a
      // LER o campo, e aí a forma passou a importar.
      JSON.stringify({
        formas: ["PIX", "CASH"],
        pix: { chave: CHAVE_PIX, tipo: "EMAIL", titular: "Marina Souza" },
      }),
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
  vitrine: VitrineDaLoja | null;
}> {
  const identificacao = await comoRequisicao(acesso, { papel: "PUBLIC" }, () =>
    identificarLoja({ apelido }),
  );

  if (!identificacao.encontrada) return { identificacao, vitrine: null };

  const vitrine = await comoRequisicao(
    acesso,
    { papel: "PUBLIC", lojaId: identificacao.id },
    async () => lojaDaVitrine(AGORA, await horarioDaLoja(AGORA)),
  );

  return { identificacao, vitrine };
}

describe("a página da loja mostra o negócio (AC-400)", () => {
  it(
    "@spec:AC-400 nome, ramo e boas-vindas chegam à vitrine",
    async () => {
      const visita = await visitaAnonima(ativa.apelido);

      expect(visita.identificacao.encontrada).toBe(true);
      if (visita.vitrine === null) return;
      expect(visita.vitrine?.publica.nome).toBe("Sabor da Esquina");
      expect(visita.vitrine?.publica.boasVindas).toBe(
        "Comida caseira todo dia",
      );
      expect(visita.vitrine?.publica.cores).toEqual({ primaria: "#0f6e5c" });
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-400 o endereço para quem vai retirar chega, sem CEP nem coordenada",
    async () => {
      const visita = await visitaAnonima(ativa.apelido);
      expect(visita.identificacao.encontrada).toBe(true);
      if (visita.vitrine === null) return;

      expect(visita.vitrine?.publica.enderecoParaRetirada?.logradouro).toBe(
        "Rua das Flores",
      );
      const comoTexto = JSON.stringify(visita);
      expect(comoTexto).not.toContain("01000000");
      expect(comoTexto).not.toContain("23.55");
    },
    ESPERA_LONGA,
  );
});

describe("a vitrine diz se a loja está aberta agora (AC-401)", () => {
  it(
    "@spec:AC-401 dentro do horário a loja aparece aberta",
    async () => {
      // Segunda ao meio-dia, com a grade cadastrada no banco.
      await migrador.query(
        `INSERT INTO app.store_hours (store_id, weekday, opens_at, closes_at)
         VALUES ($1, 1, '11:00', '15:00'), ($1, 1, '18:00', '23:00')`,
        [ativa.id],
      );

      const visita = await visitaAnonima(ativa.apelido);

      expect(visita.vitrine?.abertura.aberta).toBe(true);
      expect(visita.vitrine?.abertura.motivo).toBe("ABERTA");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-401 fora do horário a loja avisa, e diz quando abre",
    async () => {
      // Segunda às 16h: passou do almoço, o jantar ainda não começou.
      const dezesseisHoras = new Date(Date.UTC(2026, 7, 17, 19, 0));
      const identificacao = await comoRequisicao(
        acesso,
        { papel: "PUBLIC" },
        () => identificarLoja({ apelido: ativa.apelido }),
      );
      expect(identificacao.encontrada).toBe(true);
      if (!identificacao.encontrada) return;

      const vitrine = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: identificacao.id },
        async () =>
          lojaDaVitrine(dezesseisHoras, await horarioDaLoja(dezesseisHoras)),
      );

      expect(vitrine?.abertura.aberta).toBe(false);
      expect(vitrine?.abertura.proximaAbertura).toBe("abre hoje às 18h");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-401 @spec:AC-912 exceção datada fecha a loja mesmo dentro do horário",
    async () => {
      // O feriado é cadastrado, a grade continua intacta, e a vitrine fecha.
      await migrador.query(
        `INSERT INTO app.store_hour_exceptions (store_id, on_date, is_closed, reason)
         VALUES ($1, DATE '2026-08-17', true, 'Feriado municipal')
         ON CONFLICT (store_id, on_date) DO UPDATE SET reason = EXCLUDED.reason`,
        [ativa.id],
      );

      const visita = await visitaAnonima(ativa.apelido);

      expect(visita.vitrine?.abertura.aberta).toBe(false);
      expect(visita.vitrine?.abertura.motivo).toBe("EXCECAO");
      expect(visita.vitrine?.abertura.explicacaoDaExcecao).toBe(
        "Feriado municipal",
      );

      // E a grade semanal continua onde estava: o dono não a desconfigurou.
      const grade = await migrador.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM app.store_hours WHERE store_id = $1`,
        [ativa.id],
      );
      expect(Number(grade.rows[0]?.n)).toBe(2);

      await migrador.query(
        `DELETE FROM app.store_hour_exceptions WHERE store_id = $1`,
        [ativa.id],
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-401 @spec:AC-911 o fechamento temporário fecha a vitrine sem tocar na grade",
    async () => {
      await migrador.query(
        `UPDATE app.stores
            SET open_state = 'TEMPORARILY_CLOSED',
                temporarily_closed_until = TIMESTAMPTZ '2026-08-17 23:00-03'
          WHERE id = $1`,
        [ativa.id],
      );

      const visita = await visitaAnonima(ativa.apelido);
      expect(visita.vitrine?.abertura.aberta).toBe(false);
      expect(visita.vitrine?.abertura.motivo).toBe("PAUSA");

      // Desligado o fechamento, a loja volta a receber — e ninguém redigitou
      // horário nenhum, que é o que o critério promete a quem atolou na cozinha.
      await migrador.query(
        `UPDATE app.stores SET open_state = 'SCHEDULE',
                temporarily_closed_until = NULL WHERE id = $1`,
        [ativa.id],
      );
      const depois = await visitaAnonima(ativa.apelido);
      expect(depois.vitrine?.abertura.aberta).toBe(true);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-401 loja sem horário cadastrado fica fechada, sem prometer abertura",
    async () => {
      // Prometer "abre segunda" sem faixa cadastrada seria inventar informação
      // que o dono nunca deu.
      const semGrade = await criarLoja({ nome: "Loja Sem Horario" });
      const identificacao = await comoRequisicao(
        acesso,
        { papel: "PUBLIC" },
        () => identificarLoja({ apelido: semGrade.apelido }),
      );
      expect(identificacao.encontrada).toBe(true);
      if (!identificacao.encontrada) return;

      const vitrine = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: identificacao.id },
        async () => lojaDaVitrine(AGORA, await horarioDaLoja(AGORA)),
      );

      expect(vitrine?.abertura.aberta).toBe(false);
      expect(vitrine?.abertura.proximaAbertura).toBeNull();
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
      if (visita.vitrine === null) return;

      expect(Object.keys(visita.vitrine?.publica).sort()).toEqual([
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
        // `rotulos` entrou na T-403/T-405 e é DECISÃO, não descuido: são as
        // palavras do RAMO — "Cardápio" ou "Catálogo", "Sabor" ou "Tamanho".
        // Vêm de `app.vertical_presets`, que é catálogo de PLATAFORMA: o mesmo
        // conjunto para toda loja do ramo, sem nada do dono desta.
        "rotulos",
      ]);
    },
    ESPERA_LONGA,
  );
});

describe("a vitrine fala a língua do RAMO (AC-400)", () => {
  it(
    "@spec:AC-400 lanchonete recebe cardápio; loja de roupa recebe catálogo",
    async () => {
      // LOJA DE ROUPA NÃO TEM CARDÁPIO. O vocabulário mora no banco, um
      // conjunto por ramo (migração 0003), e vem por aqui — não de um `if` na
      // tela. É o que permite acrescentar um ramo novo sem tocar em componente
      // nenhum, inclusive nos aplicativos nativos, que leem o mesmo contrato.
      const lanchonete = await criarLoja({
        nome: "Pastel Bom",
        ramo: "lanchonete",
      });
      const roupas = await criarLoja({ nome: "Moda Boa", ramo: "roupas" });

      const daLanchonete = await visitaAnonima(lanchonete.apelido);
      const dasRoupas = await visitaAnonima(roupas.apelido);

      expect(daLanchonete.vitrine?.publica.rotulos.catalogo).toBe("Cardápio");
      expect(dasRoupas.vitrine?.publica.rotulos.catalogo).toBe("Catálogo");

      // E não é só o título: a lanchonete escolhe SABOR, a loja de roupa
      // escolhe TAMANHO — a mesma variante no banco, duas palavras na boca de
      // quem vende.
      expect(daLanchonete.vitrine?.publica.rotulos.variacao).toBe("Sabor");
      expect(dasRoupas.vitrine?.publica.rotulos.variacao).toBe("Tamanho");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-400 a autopeça pede peça por APLICAÇÃO, e a busca fala a língua dela",
    async () => {
      const autopecas = await criarLoja({
        nome: "Peças Já",
        ramo: "autopeças",
      });

      const visto = await visitaAnonima(autopecas.apelido);

      expect(visto.vitrine?.publica.rotulos.variacao).toBe("Aplicação");
      expect(visto.vitrine?.publica.rotulos.buscaPlaceholder).toContain("Peça");
    },
    ESPERA_LONGA,
  );
});

describe("o fechamento vê a chave PIX, e só ele (AC-510, AC-904)", () => {
  it(
    "@spec:AC-510 a chave PIX, o tipo e o titular chegam ao fechamento",
    async () => {
      // O AC-510 pede que o cliente veja a chave COM o nome do recebedor: é o
      // que ele confere antes de mandar dinheiro para um desconhecido.
      const visto = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: ativa.id },
        () => fechamentoDaLoja(["DELIVERY", "PICKUP"]),
      );

      expect(visto?.pix?.chave).toBe(CHAVE_PIX);
      expect(visto?.pix?.titular).toBe("Marina Souza");
      expect(visto?.formasDePagamento).toContain("PIX");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-904 a MESMA chave não aparece em nada da vitrine",
    async () => {
      // É a outra metade do critério, e as duas provas moram lado a lado de
      // propósito: separar faria uma envelhecer sem a outra notar.
      const visita = await visitaAnonima(ativa.apelido);

      expect(JSON.stringify(visita.vitrine?.publica)).not.toContain(CHAVE_PIX);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-904 o fechamento não devolve impressão, avisos nem o WhatsApp do dono",
    async () => {
      // A linha de configuração guarda tudo isso lado a lado. A função da
      // migração 0019 devolve TRÊS colunas, e é o esquema quem garante.
      const visto = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: ativa.id },
        () => fechamentoDaLoja(["DELIVERY"]),
      );

      const serializado = JSON.stringify(visto);
      expect(serializado).not.toContain(WHATSAPP_DO_DONO);
      expect(serializado).not.toContain("printing");
      expect(serializado).not.toContain("notifications");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-510 loja que não aceita PIX não devolve a chave, mesmo cadastrada",
    async () => {
      // O dono desligou o PIX; devolver a chave assim mesmo é entregar um dado
      // que ele decidiu não usar.
      const semPix = await criarLoja({ nome: "Só Dinheiro" });
      await migrador.query(
        `INSERT INTO app.store_settings (store_id, payment)
         VALUES ($1, $2)
         ON CONFLICT (store_id) DO UPDATE SET payment = EXCLUDED.payment`,
        [
          semPix.id,
          JSON.stringify({
            formas: ["CASH"],
            pix: { chave: "nao-deveria-sair@pix.test", titular: "Alguém" },
          }),
        ],
      );

      const visto = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: semPix.id },
        () => fechamentoDaLoja(["PICKUP"]),
      );

      expect(visto?.pix).toBeNull();
      expect(JSON.stringify(visto)).not.toContain("nao-deveria-sair");
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-507 a taxa NULA é 'a combinar', e não taxa zero",
    async () => {
      // Ler `?? 0` transformaria uma na outra, e a loja passaria a entregar de
      // graça sem ter decidido isso.
      const semTaxa = await criarLoja({ nome: "Frete a Combinar" });
      await migrador.query(
        `INSERT INTO app.store_settings (store_id, delivery)
         VALUES ($1, '{}'::jsonb)
         ON CONFLICT (store_id) DO UPDATE SET delivery = EXCLUDED.delivery`,
        [semTaxa.id],
      );

      const visto = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: semTaxa.id },
        () => fechamentoDaLoja(["DELIVERY"]),
      );

      expect(visto?.entrega.taxaCentavos).toBeNull();
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-506 loja que só faz retirada não anuncia entrega",
    async () => {
      const visto = await comoRequisicao(
        acesso,
        { papel: "PUBLIC", lojaId: ativa.id },
        () => fechamentoDaLoja(["PICKUP"]),
      );

      expect(visto?.entrega.aceitaEntrega).toBe(false);
      expect(visto?.entrega.aceitaRetirada).toBe(true);
    },
    ESPERA_LONGA,
  );
});
