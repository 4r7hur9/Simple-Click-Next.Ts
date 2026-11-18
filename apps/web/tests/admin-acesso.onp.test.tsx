// @vitest-environment jsdom
/**
 * Quem não é da administração continua recusado, com o mesmo texto de hoje,
 * em toda tela de /admin (card #113, T-11301). Prova de REGRESSÃO, verde
 * contra o código atual.
 *
 * Importante: a web NÃO autoriza nada. Quem barra quem não é administrador é
 * a API (duas travas), provado em `apps/api/tests/admin-*.test.ts`. O que se
 * prova aqui é o que a tela faz quando a API recusa: o texto da mensagem, a
 * ausência de dado de loja ou de conta, e a recusa igual para loja que existe
 * e para a que não existe. O contador do menu também fica a zero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardDoAdmin } from "../src/features/admin-dashboard/DashboardDoAdmin.tsx";
import { MENSAGEM_DE_SESSAO as MENSAGEM_DO_INICIO } from "../src/features/admin-dashboard/useMetricasDoAdmin.ts";
import { AbasDaLoja } from "../src/features/admin/AbasDaLoja.tsx";
import { AcoesLoja } from "../src/features/admin/AcoesLoja.tsx";
import { MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO } from "../src/features/admin/apresentacao.ts";
import { AtosDeAprovacao } from "../src/features/admin/AtosDeAprovacao.tsx";
import { CabecalhoDaFicha } from "../src/features/admin/CabecalhoDaFicha.tsx";
import {
  DocumentosDaLoja,
  MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS,
} from "../src/features/admin/DocumentosDaLoja.tsx";
import { MENSAGEM_DE_SESSAO_DA_FICHA } from "../src/features/admin/FichaLoja.tsx";
import {
  FuncionalidadesDaLoja,
  MENSAGEM_DE_SESSAO_DAS_FUNCIONALIDADES,
} from "../src/features/admin/FuncionalidadesDaLoja.tsx";
import {
  HistoricoDeAuditoria,
  MENSAGEM_DE_SESSAO as MENSAGEM_DA_AUDITORIA,
} from "../src/features/admin/HistoricoDeAuditoria.tsx";
import {
  ListaLojas,
  MENSAGEM_DE_SESSAO as MENSAGEM_DAS_LOJAS,
} from "../src/features/admin/ListaLojas.tsx";
import { ListaDeContas } from "../src/features/admin/ListaDeContas.tsx";
import { ProvedorDaFicha } from "../src/features/admin/ProvedorDaFicha.tsx";
import {
  botao,
  clicar,
  desmontar,
  digitar,
  enviar,
  esperar,
  exigir,
  montar,
  simularApi,
} from "./apoio-config.tsx";

const { cookieDoPedido, parametrosDaUrl } = vi.hoisted(() => ({
  cookieDoPedido: { valor: null as string | null },
  parametrosDaUrl: { valor: "" },
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      cookieDoPedido.valor === null ? {} : { cookie: cookieDoPedido.valor },
    ),
}));

vi.mock("next/navigation", () => {
  let busca = "";
  let objeto = new URLSearchParams();
  return {
    useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/admin/lojas",
    useSearchParams: () => {
      if (busca !== parametrosDaUrl.valor) {
        busca = parametrosDaUrl.valor;
        objeto = new URLSearchParams(busca);
      }
      return objeto;
    },
  };
});

import { lojasPendentesDeAprovacao } from "../src/server/pendentes-da-administracao.ts";

const TEXTO_DA_RECUSA =
  "Sua sessão não tem acesso à administração. Entre de novo.";
const ID_QUE_EXISTE = "5c1d0e2f-0000-4000-8000-000000000001";
const ID_QUE_NAO_EXISTE = "5c1d0e2f-0000-4000-8000-0000000000ff";

beforeEach(() => {
  parametrosDaUrl.valor = "";
  cookieDoPedido.valor = null;
});

afterEach(() => {
  desmontar();
  document.body.innerHTML = "";
});

function recusar(status: 401 | 403) {
  return simularApi(() => ({ status, corpo: { erro: "recusado" } }));
}

describe("as sete mensagens de sessão da administração não mudam", () => {
  it("[CA-1] @spec:AC-11301 o texto de cada constante é o de hoje", () => {
    for (const mensagem of [
      MENSAGEM_DAS_LOJAS,
      MENSAGEM_DA_AUDITORIA,
      MENSAGEM_DO_INICIO,
      MENSAGEM_DE_SESSAO_DA_FICHA,
      MENSAGEM_DE_SESSAO_DA_ADMINISTRACAO,
      MENSAGEM_DE_SESSAO_DOS_DOCUMENTOS,
      MENSAGEM_DE_SESSAO_DAS_FUNCIONALIDADES,
    ]) {
      expect(mensagem).toBe(TEXTO_DA_RECUSA);
    }
  });
});

describe("telas de leitura: 401 e 403 mostram a recusa e nenhum dado", () => {
  const TELAS: readonly (readonly [string, () => ReturnType<typeof montar>])[] =
    [
      ["lista de lojas", () => montar(<ListaLojas />)],
      ["lista de contas", () => montar(<ListaDeContas />)],
      ["auditoria", () => montar(<HistoricoDeAuditoria />)],
      ["início", () => montar(<DashboardDoAdmin />)],
      ["documentos", () => montar(<DocumentosDaLoja lojaId={ID_QUE_EXISTE} />)],
      [
        "funcionalidades",
        () => montar(<FuncionalidadesDaLoja lojaId={ID_QUE_EXISTE} />),
      ],
      [
        "ficha da loja",
        () =>
          montar(
            <ProvedorDaFicha lojaId={ID_QUE_EXISTE}>
              <CabecalhoDaFicha />
            </ProvedorDaFicha>,
          ),
      ],
    ];

  for (const status of [401, 403] as const) {
    it.each(TELAS)(
      `[CA-1] @spec:AC-11301 %s com ${status}: o texto de recusa de hoje e nenhum dado`,
      async (_nome, abrir) => {
        const chamadas = recusar(status);
        const tela = abrir();
        await esperar();
        expect(chamadas.length).toBeGreaterThan(0);
        expect(tela.textContent).toContain(TEXTO_DA_RECUSA);
        // Nenhuma linha de dado: nem tabela com linhas, nem número.
        expect(tela.querySelectorAll("tbody tr")).toHaveLength(0);
        expect(tela.textContent).not.toMatch(/Pastel|@|CNPJ \d|R\$/);
      },
    );
  }
});

describe("atos e salvamentos: 401 e 403 voltam com a mesma frase e nada muda", () => {
  const FICHA_MINIMA = {
    id: ID_QUE_EXISTE,
    nome: "Pastel da Joi",
  } as const;

  for (const status of [401, 403] as const) {
    it(`[CA-1] @spec:AC-11301 aprovar com ${status} mostra a recusa de sessão`, async () => {
      HTMLDialogElement.prototype.showModal = function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute("open", "");
      };
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      };
      recusar(status);
      const aoMudar = vi.fn();
      const tela = montar(
        <AtosDeAprovacao
          loja={{ ...FICHA_MINIMA, status: "PENDING_APPROVAL" }}
          aoMudar={aoMudar}
        />,
      );
      clicar(botao(tela, "Aprovar"));
      await esperar();
      clicar(botao(tela, "Confirmar aprovação"));
      await esperar();
      expect(tela.textContent).toContain(TEXTO_DA_RECUSA);
      expect(aoMudar).not.toHaveBeenCalled();
    });

    it(`[CA-1] @spec:AC-11301 suspender com ${status} mostra a recusa de sessão`, async () => {
      recusar(status);
      const aoMudar = vi.fn();
      const tela = montar(
        <AcoesLoja
          ficha={
            {
              ...FICHA_MINIMA,
              codigo: "0007",
              status: "ACTIVE",
              suspensao: null,
              retencao: null,
            } as never
          }
          aoMudar={aoMudar}
        />,
      );
      digitar(exigir<HTMLTextAreaElement>(tela, "textarea"), "Mensalidade");
      await enviar(exigir<HTMLFormElement>(tela, "form"));
      clicar(botao(tela, "Confirmar a suspensão"));
      await esperar();
      expect(tela.textContent).toContain(TEXTO_DA_RECUSA);
      expect(aoMudar).not.toHaveBeenCalled();
    });
  }
});

describe("a recusa não revela o que existe (AC-11303)", () => {
  function moldura(id: string) {
    return montar(
      <ProvedorDaFicha lojaId={id}>
        <CabecalhoDaFicha />
        <AbasDaLoja lojaId={id} />
      </ProvedorDaFicha>,
    );
  }

  it("[CA-1] @spec:AC-11303 a ficha da loja que existe e a da que não existe, recusadas, são iguais e sem dado", async () => {
    recusar(403);
    const existente = moldura(ID_QUE_EXISTE);
    await esperar();
    const htmlExistente = existente.innerHTML;
    const textoExistente = existente.textContent ?? "";
    desmontar();
    document.body.innerHTML = "";

    recusar(403);
    const inexistente = moldura(ID_QUE_NAO_EXISTE);
    await esperar();

    // Só o segmento do endereço (o id da rota) pode diferir.
    expect(htmlExistente.replaceAll(ID_QUE_EXISTE, "ID")).toBe(
      inexistente.innerHTML.replaceAll(ID_QUE_NAO_EXISTE, "ID"),
    );
    for (const texto of [textoExistente, inexistente.textContent ?? ""]) {
      expect(texto).toContain(TEXTO_DA_RECUSA);
      expect(texto).not.toContain(ID_QUE_EXISTE);
      expect(texto).not.toContain(ID_QUE_NAO_EXISTE);
      expect(texto).not.toMatch(/não encontrada|Código \d|403|401/);
    }
  });

  it("[CA-1] @spec:AC-11303 a lista recusada não repete o termo buscado na mensagem", async () => {
    parametrosDaUrl.valor = "busca=marina%40exemplo.com";
    recusar(403);
    const tela = montar(<ListaLojas />);
    await esperar();
    const alerta = exigir(tela, '[role="alert"]');
    expect(alerta.textContent).toContain(TEXTO_DA_RECUSA);
    expect(alerta.textContent).not.toContain("marina");
    expect(document.title).not.toContain("marina");
  });
});

describe("o contador de pendentes do menu não vaza (AC-11302)", () => {
  const COM_SESSAO = "sc_access=abc.def.ghi";

  function buscarCom(status: number, corpo: unknown = { total: 5 }) {
    return vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(corpo), { status }),
    );
  }

  it("[CA-2] @spec:AC-11302 sem cookie de acesso dá zero e nem chama a API", async () => {
    const buscar = buscarCom(200);
    for (const cookie of [null, "outro=1", "sc_access="]) {
      cookieDoPedido.valor = cookie;
      expect(await lojasPendentesDeAprovacao(buscar)).toBe(0);
    }
    expect(buscar).not.toHaveBeenCalled();
  });

  it("[CA-2] @spec:AC-11302 com 401, 403, falha da API ou rede caída o número é zero", async () => {
    cookieDoPedido.valor = COM_SESSAO;
    for (const status of [401, 403, 500]) {
      expect(await lojasPendentesDeAprovacao(buscarCom(status))).toBe(0);
    }
    const caida = vi.fn<typeof fetch>(async () => {
      throw new Error("sem rede");
    });
    expect(await lojasPendentesDeAprovacao(caida)).toBe(0);
    expect(
      await lojasPendentesDeAprovacao(buscarCom(200, { total: "5" })),
    ).toBe(0);
    expect(await lojasPendentesDeAprovacao(buscarCom(200, { total: -3 }))).toBe(
      0,
    );
  });

  it("[CA-2] @spec:AC-11302 com sucesso o número vem da API, a cada chamada e sem cache", async () => {
    cookieDoPedido.valor = COM_SESSAO;
    const buscar = buscarCom(200, { total: 5 });
    expect(await lojasPendentesDeAprovacao(buscar)).toBe(5);
    expect(await lojasPendentesDeAprovacao(buscar)).toBe(5);
    expect(buscar).toHaveBeenCalledTimes(2);
    const [endereco, init] = buscar.mock.calls[0] ?? [];
    expect(String(endereco)).toContain("situacao=PENDING_APPROVAL");
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer abc.def.ghi",
    );
  });
});
