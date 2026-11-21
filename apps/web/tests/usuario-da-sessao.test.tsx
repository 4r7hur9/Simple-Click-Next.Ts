import { existsSync, readFileSync } from "node:fs";
/**
 * Quem está logado e o que cada papel vê (cards #22, #105 e #135): os cinco
 * papéis (visitante, cliente, dono, equipe, administração) no menu da conta do
 * topo, que ficou no lugar da lateral flutuante; o item ativo pela rota; o
 * caminho de volta do "Entrar"; o bloco da pessoa no menu lateral do painel; e
 * a API fora do ar mostrando visitante sem quebrar a página.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const rota = vi.hoisted(() => ({ caminho: "/loja/pastelaria/cardapio" }));
vi.mock("next/navigation", () => ({
  usePathname: () => rota.caminho,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
}));

import { MenuDaConta } from "../src/features/usuario/MenuDaConta.tsx";
import { TopoDoCliente } from "../src/features/usuario/TopoDoCliente.tsx";
import { UsuarioNoMenu } from "../src/features/usuario/UsuarioNoMenu.tsx";
import {
  caminhoSemBarra,
  destinoDepoisDeSair,
  enderecoComRetorno,
  iniciaisDe,
  itemAtivo,
  nomeLegivel,
  itensDoUsuario,
  usuarioDoEu,
  VISITANTE,
  type UsuarioDaBarra,
} from "../src/lib/quem-esta-logado.ts";
import { usuarioDosCookies } from "../src/server/usuario-da-sessao.ts";

const PASTELARIA = { apelido: "pastelaria", nome: "Pastelaria da Vila" };
const MODA = { apelido: "moda", nome: "Moda Boa Vista" };
const sair = async () => undefined;

function eu(
  papel: string,
  lojas: { apelido: string; nome: string; papel: string }[] = [],
  nome: string | null = "Ana Ribeiro",
) {
  return {
    identidade: {
      id: "d1aad681-e41b-5af4-ad9a-d2dc1d87377d",
      email: "ana@cliente.test",
      nome,
      papel,
    },
    lojas: lojas.map((loja) => ({ ...loja, situacao: "ACTIVE" })),
  };
}

const CLIENTE = usuarioDoEu(eu("CUSTOMER"));
const DONO = usuarioDoEu(
  eu("OWNER", [
    { ...PASTELARIA, papel: "OWNER" },
    { ...MODA, papel: "OWNER" },
  ]),
  "pastelaria",
);
const EQUIPE = usuarioDoEu(eu("OWNER", [{ ...PASTELARIA, papel: "STAFF" }]));
const ADMIN = usuarioDoEu(eu("ADMIN"));

function desenhar(usuario: UsuarioDaBarra): string {
  return renderToStaticMarkup(
    <MenuDaConta usuario={usuario} loja={PASTELARIA} sair={sair} />,
  );
}

/** O texto dos itens marcados como a página atual. */
function atuais(html: string): string[] {
  return [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map(
    (m) => (m[1] ?? "").replace(/<[^>]+>/g, "").trim(),
  );
}

function rotulos(usuario: UsuarioDaBarra): string[] {
  return itensDoUsuario(usuario, rota.caminho, PASTELARIA).map(
    (item) => item.rotulo,
  );
}

describe("o papel vem de /v1/eu", () => {
  it("deduz cliente, dono, equipe e administração", () => {
    expect(CLIENTE.papel).toBe("cliente");
    expect(DONO.papel).toBe("dono");
    expect(EQUIPE.papel).toBe("equipe");
    expect(ADMIN.papel).toBe("admin");
  });

  it("usa o contrato do #21: papelEfetivo, adminDaPlataforma e lojasDaConta", () => {
    expect(
      usuarioDoEu({
        ...eu("CUSTOMER"),
        papelEfetivo: "DONO",
        lojasDaConta: [{ ...PASTELARIA, papel: "OWNER", situacao: "ACTIVE" }],
      }),
    ).toMatchObject({ papel: "dono", loja: PASTELARIA });
    expect(
      usuarioDoEu({ ...eu("CUSTOMER"), adminDaPlataforma: true }).papel,
    ).toBe("admin");
  });

  it("aceita campo novo na resposta, e corpo estranho vira visitante", () => {
    expect(usuarioDoEu({ ...eu("CUSTOMER"), outroCampo: 1 }).papel).toBe(
      "cliente",
    );
    expect(usuarioDoEu({ erro: "x" })).toEqual(VISITANTE);
    expect(usuarioDoEu(null)).toEqual(VISITANTE);
  });

  it("monta nome, iniciais e a loja em uso", () => {
    expect(DONO).toMatchObject({
      primeiroNome: "Ana",
      iniciais: "AR",
      loja: PASTELARIA,
      temOutrasLojas: true,
    });
    expect(EQUIPE).toMatchObject({ loja: PASTELARIA, temOutrasLojas: false });
    expect(usuarioDoEu(eu("CUSTOMER", [], null))).toMatchObject({
      nome: "ana",
      iniciais: "A",
    });
    expect(iniciaisDe("maria  da silva")).toBe("MS");
  });
});

describe("os cinco papéis no menu da conta", () => {
  it("visitante: marca no topo, Entrar e Criar conta (em destaque) com volta", () => {
    rota.caminho = "/loja/pastelaria/cardapio";
    const html = desenhar(VISITANTE);
    expect(rotulos(VISITANTE)).toEqual(["Explorar", "Entrar", "Criar conta"]);
    expect(html).toContain(
      'href="/entrar?proximo=%2Floja%2Fpastelaria%2Fcardapio"',
    );
    const destacado = /<a[^>]*data-destaque[^>]*>/.exec(html)?.[0] ?? "";
    expect(destacado).toContain("/cadastrar?proximo=");
    // Na loja, os dois abrem a janela de acesso sem sair da página.
    expect(destacado).toContain('data-abre-acesso="criar"');
    expect(html).toContain('data-abre-acesso="entrar"');
    expect(html).not.toContain("Sair");
    expect(html).not.toContain("sc-menu-conta__selo");
  });

  it("a lateral flutuante saiu: nem o componente nem o estilo dela existem", () => {
    expect(
      existsSync(new URL("../src/features/usuario/LateralDoUsuario.tsx", import.meta.url)),
    ).toBe(false);
    const css = readFileSync(
      new URL("../../../packages/ui/styles/usuario.css", import.meta.url),
      "utf8",
    );
    expect(css).not.toContain("sc-usuario-lateral");
    // O que ficou na folha é só a pessoa no menu lateral do painel.
    expect(css).toContain(".sc-usuario-menu__avatar");
    expect(css).toContain(".sc-usuario-menu__selo");
  });

  it("cliente: iniciais, selo Cliente, a loja, a conta e Sair no rodapé", () => {
    const html = desenhar(CLIENTE);
    expect(html).toContain(">AR<");
    expect(html).toContain(">Cliente<");
    // Explorar, Pedidos e Favoritos já estão no topo; Dados, Endereços e
    // Segurança, no modal que "Minha conta" abre (card #151).
    expect(rotulos(CLIENTE)).toEqual(["Voltar à loja", "Minha conta"]);
    expect(html).toContain("Ver tutorial");
    expect(html).toContain("sc-menu-conta__rodape");
    expect(html).toContain("Sair");
  });

  it("[CA-6] 'Minha conta' abre o modal: link com data-abre-conta, href de reserva e sem os itens repetidos", () => {
    const html = desenhar(CLIENTE);
    expect(html).toMatch(/<a[^>]*href="\/conta\/dados"[^>]*data-abre-conta="dados"/);
    expect(html).toContain('aria-haspopup="dialog"');
    for (const repetido of ["Visão geral", "Endereços", "Segurança", "Favoritos", "Explorar"]) {
      expect(rotulos(CLIENTE)).not.toContain(repetido);
    }
    // Dono, equipe e administração também abrem o modal; o visitante nunca.
    for (const papel of [DONO, EQUIPE, ADMIN]) {
      expect(desenhar(papel)).toContain('data-abre-conta="dados"');
    }
    expect(desenhar(VISITANTE)).not.toContain("data-abre-conta");
  });

  it("dono: selo Dono, painel, loja, conta e troca de loja", () => {
    expect(desenhar(DONO)).toContain(">Dono<");
    expect(rotulos(DONO)).toEqual([
      "Painel da loja",
      "Ver minha loja",
      "Explorar",
      "Minha conta",
      "Trocar de loja",
    ]);
  });

  it("equipe: selo Equipe e sem troca de loja com uma loja só", () => {
    expect(desenhar(EQUIPE)).toContain(">Equipe<");
    expect(rotulos(EQUIPE)).toEqual([
      "Painel da loja",
      "Ver minha loja",
      "Explorar",
      "Minha conta",
    ]);
  });

  it("administração: selo Admin, administração, auditoria e conta", () => {
    expect(desenhar(ADMIN)).toContain(">Admin<");
    expect(rotulos(ADMIN)).toEqual([
      "Administração",
      "Auditoria",
      "Minha conta",
    ]);
  });

  it("cada item tem o nome escrito nele e o atual é marcado pela rota", () => {
    // O modal abre sobre qualquer página: "Minha conta" nunca fica marcada.
    rota.caminho = "/conta/pedidos";
    expect(atuais(desenhar(CLIENTE))).toEqual([]);
    expect(atuais(desenhar(DONO))).toEqual([]);
    expect(itemAtivo("/loja/pastelaria/cardapio", "/loja/pastelaria")).toBe(true);
    expect(itemAtivo("/loja/pastelaria-2", "/loja/pastelaria")).toBe(false);
    rota.caminho = "/loja/pastelaria/cardapio";
  });

  it("o topo (e com ele o menu) some no cardápio da TV", () => {
    rota.caminho = "/loja/pastelaria/tv";
    expect(
      renderToStaticMarkup(
        <TopoDoCliente usuario={CLIENTE} loja={PASTELARIA} sair={sair} />,
      ),
    ).toBe("");
    rota.caminho = "/loja/pastelaria/cardapio";
    expect(caminhoSemBarra("/tv")).toBe(true);
    expect(caminhoSemBarra("/loja/pastelaria/tvs")).toBe(false);
  });
});

describe("no menu lateral do painel e da administração", () => {
  it("mostra a pessoa, o selo, Minha conta e Sair, sem repetir o menu", () => {
    rota.caminho = "/painel";
    const html = renderToStaticMarkup(
      <UsuarioNoMenu usuario={DONO} sair={sair} />,
    );
    expect(html).toContain("Ana Ribeiro");
    expect(html).toContain(">Dono<");
    // "Minha conta" leva a /conta/dados, que abre o modal da conta (card #151).
    expect(html).toContain('href="/conta/dados"');
    // O feed é público: dono, equipe e admin também chegam a ele (card #37).
    expect(html).toContain('href="/explorar"');
    expect(html).toContain("Sair");
    expect(html).not.toContain("Painel da loja");
    rota.caminho = "/loja/pastelaria/cardapio";
  });

  it("sem sessão não mostra nada", () => {
    expect(
      renderToStaticMarkup(<UsuarioNoMenu usuario={VISITANTE} sair={sair} />),
    ).toBe("");
  });
});

describe("sessão e API", () => {
  const ACESSO = "sc_access=token-de-acesso";

  it("sem cookie de acesso não chama a API", async () => {
    const buscar = vi.fn<typeof fetch>();
    expect(await usuarioDosCookies(null, buscar)).toEqual(VISITANTE);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("API fora do ar ou token vencido: visitante, sem erro", async () => {
    const caiu = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await usuarioDosCookies(ACESSO, caiu)).toEqual(VISITANTE);
    const vencido = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ erro: "x" }, { status: 401 }));
    expect(await usuarioDosCookies(ACESSO, vencido)).toEqual(VISITANTE);
  });

  it("com sessão, pergunta à API com o token e usa a loja do cookie", async () => {
    const buscar = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        eu("OWNER", [
          { ...PASTELARIA, papel: "OWNER" },
          { ...MODA, papel: "OWNER" },
        ]),
      ),
    );
    const usuario = await usuarioDosCookies(`${ACESSO}; sc_loja=moda`, buscar);
    expect(usuario).toMatchObject({ papel: "dono", loja: MODA });
    const [endereco, opcoes] = buscar.mock.calls[0] ?? [];
    expect(String(endereco)).toMatch(/\/v1\/eu$/);
    expect(new Headers(opcoes?.headers).get("authorization")).toBe(
      "Bearer token-de-acesso",
    );
  });
});

describe("caminhos", () => {
  it("sair volta para a página da loja; o resto vai ao início", () => {
    expect(destinoDepoisDeSair("/loja/pastelaria/cardapio")).toBe(
      "/loja/pastelaria/cardapio",
    );
    expect(destinoDepoisDeSair("/painel/pedidos")).toBe("/");
    expect(destinoDepoisDeSair("//golpe.example")).toBe("/");
    expect(destinoDepoisDeSair("https://golpe.example")).toBe("/");
    expect(destinoDepoisDeSair(undefined)).toBe("/");
  });

  it("entrar a partir do início ou de outro site não leva retorno", () => {
    expect(enderecoComRetorno("/entrar", "/")).toBe("/entrar");
    expect(enderecoComRetorno("/entrar", null)).toBe("/entrar");
    expect(enderecoComRetorno("/entrar", "//golpe.example")).toBe("/entrar");
  });

  it("nome todo em maiúsculas vira capitalização normal", () => {
    expect(nomeLegivel("ARTHUR BRUNO")).toBe("Arthur Bruno");
    expect(nomeLegivel("MARIA DA SILVA")).toBe("Maria da Silva");
    expect(nomeLegivel("Ana Ribeiro")).toBe("Ana Ribeiro");
  });
});
