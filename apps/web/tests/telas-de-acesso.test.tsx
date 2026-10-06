// @vitest-environment jsdom
/**
 * Prova das telas de acesso ligadas à API real (T-113): cadastro, login,
 * segundo fator, código de recuperação, aplicativo autenticador, confirmação
 * de e-mail, recuperação e definição de senha e a tela de segurança.
 *
 * A ponte do site (`/api/auth/...`) responde por `simularApi`, no formato
 * que ela devolve de verdade (ver `ponte-de-identidade.test.ts`). As telas
 * renderizadas no servidor são desenhadas em texto, como o navegador sem
 * script as receberia.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const navegacao = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  parametros: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navegacao.push, replace: navegacao.replace }),
  useSearchParams: () => navegacao.parametros,
  redirect: vi.fn(),
}));

vi.mock("../src/server/actions/auth.ts", () => ({
  sairDaConta: vi.fn(),
  encerrarTodasAsSessoes: vi.fn(),
}));

import PaginaDeCadastro from "../src/app/(conta)/cadastrar/page.tsx";
import PaginaDeDefinicaoDeSenha from "../src/app/(conta)/definir-senha/page.tsx";
import PaginaDeEntrar from "../src/app/(conta)/entrar/page.tsx";
import PaginaDeVerificacao from "../src/app/(conta)/entrar/verificacao/page.tsx";
import PaginaDeSeguranca from "../src/app/(conta)/minha-conta/seguranca/page.tsx";
import PaginaDeRecuperacaoDeSenha from "../src/app/(conta)/recuperar-senha/page.tsx";
import PaginaDeVerificacaoDeEmail from "../src/app/(conta)/verificar-email/page.tsx";
import { TotpForm } from "../src/features/auth/TotpForm.tsx";

beforeEach(() => {
  navegacao.push.mockReset();
  navegacao.replace.mockReset();
  navegacao.parametros = new URLSearchParams();
});
afterEach(desmontar);

/** Tela do servidor desenhada em texto, com os parâmetros do endereço. */
async function noServidor(
  pagina: (props: {
    searchParams: Promise<Record<string, string>>;
  }) => Promise<React.ReactElement>,
  parametros: Record<string, string> = {},
): Promise<string> {
  return renderToStaticMarkup(
    await pagina({ searchParams: Promise.resolve(parametros) }),
  );
}

function formulario(tela: HTMLElement): HTMLFormElement {
  return exigir<HTMLFormElement>(tela, "form");
}

describe("cadastro", () => {
  async function preencherEEnviar(tela: HTMLElement, senha: string) {
    digitar(exigir(tela, "#cadastro-nome"), "Ana Souza");
    digitar(exigir(tela, "#cadastro-email"), "ana@exemplo.com");
    digitar(exigir(tela, "#cadastro-telefone"), "11 91234-5678");
    digitar(exigir(tela, "#cadastro-senha"), senha);
    await enviar(formulario(tela));
  }

  it("@spec:AC-100 cadastro válido confirma a conta e avisa que falta confirmar o e-mail", async () => {
    const chamadas = simularApi(() => ({
      status: 201,
      corpo: {
        cadastrado: true,
        mensagem:
          "Seus dados foram recebidos. Enviamos instruções para confirmar seu e-mail.",
        verificacaoDeEmailPendente: true,
      },
    }));
    const tela = montar(<PaginaDeCadastro />);
    await preencherEEnviar(tela, "Cacto azul sob a lua 2026!");

    expect(chamadas[0]?.url).toBe("/api/auth/cadastro");
    expect(chamadas[0]?.corpo).toMatchObject({
      email: "ana@exemplo.com",
      telefone: "+5511912345678",
    });
    expect(tela.textContent).toContain(
      "Conta criada. Falta confirmar o e-mail.",
    );
    expect(tela.textContent).toContain("Enviamos instruções para confirmar");
  });

  it("@spec:AC-102 senha fraca mostra o motivo no campo e não apaga os outros dados", async () => {
    simularApi(() => ({
      status: 422,
      corpo: {
        erro: "senha_fraca",
        mensagem:
          "Use pelo menos 12 caracteres. Esta senha aparece em vazamentos conhecidos. Escolha outra senha.",
      },
    }));
    const tela = montar(<PaginaDeCadastro />);
    await preencherEEnviar(tela, "123456");

    expect(tela.textContent).toContain("Use pelo menos 12 caracteres");
    expect(tela.textContent).toContain("vazamentos conhecidos");
    expect(exigir<HTMLInputElement>(tela, "#cadastro-nome").value).toBe(
      "Ana Souza",
    );
    expect(exigir<HTMLInputElement>(tela, "#cadastro-email").value).toBe(
      "ana@exemplo.com",
    );
  });
});

describe("login e segundo fator", () => {
  async function entrarCom(resposta: { status: number; corpo: unknown }) {
    simularApi(() => resposta);
    const tela = montar(<PaginaDeEntrar />);
    digitar(exigir(tela, "#entrar-email"), "dona@exemplo.test");
    digitar(exigir(tela, "#entrar-senha"), "uma frase longa da dona");
    await enviar(formulario(tela));
    return tela;
  }

  it("@spec:AC-105 senha correta leva ao código, sem sessão nenhuma ainda", async () => {
    await entrarCom({
      status: 200,
      corpo: {
        status: "DESAFIO_DE_SEGUNDO_FATOR",
        desafioId: "desafio-1",
        canal: "EMAIL",
      },
    });
    expect(navegacao.push).toHaveBeenCalledWith(
      "/entrar/verificacao?desafio=desafio-1&canal=EMAIL",
    );
    expect(navegacao.replace).not.toHaveBeenCalled();
  });

  it("@spec:AC-108 cliente sem segundo fator entra direto na conta", async () => {
    await entrarCom({
      status: 200,
      corpo: {
        autenticado: true,
        status: "SESSAO_CRIADA",
        redirecionarPara: "/minha-conta",
      },
    });
    expect(navegacao.replace).toHaveBeenCalledWith("/minha-conta");
  });

  it("@spec:AC-105 e-mail ou senha errados não dizem qual dos dois falhou", async () => {
    const tela = await entrarCom({
      status: 401,
      corpo: { erro: "credenciais_invalidas" },
    });
    expect(tela.textContent).toContain("E-mail ou senha incorretos.");
  });

  it("@spec:AC-106 @spec:AC-107 o código certo entra; o errado mostra as tentativas e o bloqueio manda recomeçar", async () => {
    navegacao.parametros = new URLSearchParams("desafio=desafio-1&canal=EMAIL");
    const respostas = [
      {
        status: 200,
        corpo: { status: "CODIGO_INCORRETO", tentativasRestantes: 4 },
      },
      { status: 200, corpo: { status: "BLOQUEADO", mensagem: "x" } },
    ];
    simularApi(() => respostas.shift() ?? { status: 500 });
    const tela = montar(<PaginaDeVerificacao />);
    await esperar();
    digitar(exigir(tela, "#segundo-fator-codigo"), "111111");

    await enviar(formulario(tela));
    expect(tela.textContent).toContain(
      "Código incorreto. 4 tentativas restantes.",
    );
    await enviar(formulario(tela));
    expect(tela.textContent).toContain("A tentativa foi bloqueada.");
    clicar(botao(tela, "Voltar ao login"));
    expect(navegacao.replace).toHaveBeenCalledWith("/entrar");
  });

  it("@spec:AC-106 o código aceito abre a sessão e leva ao painel", async () => {
    navegacao.parametros = new URLSearchParams("desafio=desafio-1&canal=EMAIL");
    const chamadas = simularApi(() => ({
      status: 200,
      corpo: { status: "SESSAO_CRIADA", redirecionarPara: "/painel" },
    }));
    const tela = montar(<PaginaDeVerificacao />);
    await esperar();
    digitar(exigir(tela, "#segundo-fator-codigo"), "123456");
    await enviar(formulario(tela));

    expect(chamadas[0]).toMatchObject({
      url: "/api/auth/segundo-fator",
      corpo: { desafioId: "desafio-1", codigo: "123456" },
    });
    expect(navegacao.replace).toHaveBeenCalledWith("/painel");
  });

  it("@spec:AC-123 quem perdeu o celular entra com código de recuperação e é levado a configurar o aplicativo", async () => {
    navegacao.parametros = new URLSearchParams("desafio=desafio-2&canal=TOTP");
    const chamadas = simularApi(() => ({
      status: 200,
      corpo: {
        status: "SESSAO_CRIADA",
        redirecionarPara: "/minha-conta",
        orientarPara: "/minha-conta/seguranca/aplicativo",
      },
    }));
    const tela = montar(<PaginaDeVerificacao />);
    await esperar();
    clicar(botao(tela, "usar um código de recuperação"));
    digitar(exigir(tela, "#codigo-de-recuperacao"), "abcd-efgh");
    await enviar(formulario(tela));

    expect(chamadas[0]).toMatchObject({
      url: "/api/auth/segundo-fator/recuperacao",
      corpo: { desafioId: "desafio-2", codigo: "ABCD-EFGH" },
    });
    expect(navegacao.replace).toHaveBeenCalledWith(
      "/minha-conta/seguranca/aplicativo",
    );
  });
});

describe("aplicativo autenticador", () => {
  it("@spec:AC-121 a chave aparece para cadastrar, o código errado é recusado e o certo mostra os códigos de recuperação", async () => {
    const respostas = [
      { status: "CODIGO_INVALIDO" as const },
      {
        status: "ATIVADO" as const,
        codigosDeRecuperacao: ["AAAA-BBBB", "CCCC-DDDD"],
      },
    ];
    const tela = montar(
      <TotpForm
        aoPreparar={async () => ({
          segredo: "JBSWY3DPEHPK3PXP",
          uriDoAplicativo: "otpauth://totp/SimpleClick:ana",
        })}
        aoConfirmar={async () =>
          respostas.shift() ?? { status: "CODIGO_INVALIDO" }
        }
      />,
    );
    await esperar();
    expect(exigir(tela, "[data-chave]").textContent).toBe(
      "JBSW Y3DP EHPK 3PXP",
    );
    expect(exigir<HTMLAnchorElement>(tela, "a").href).toContain("otpauth://");

    digitar(exigir(tela, "#codigo-aplicativo"), "000000");
    await enviar(formulario(tela));
    expect(tela.textContent).toContain("Código não confere");
    await enviar(formulario(tela));
    expect(tela.textContent).toContain("Aplicativo autenticador ativado.");
    expect(exigir(tela, "[data-codigos]").textContent).toContain("AAAA-BBBB");
  });
});

describe("telas sem script: e-mail, senha e segurança", () => {
  it("@spec:AC-103 abrir o link não confirma sozinho: a pessoa confirma com um botão, e o verificado libera a entrada", async () => {
    const aberto = await noServidor(PaginaDeVerificacaoDeEmail, {
      token: "token-do-link",
    });
    expect(aberto).toContain('action="/api/auth/verificar-email"');
    expect(aberto).toContain('value="token-do-link"');
    expect(aberto).toContain("Confirmar meu e-mail");

    const verificado = await noServidor(PaginaDeVerificacaoDeEmail, {
      estado: "verificado",
    });
    expect(verificado).toContain("E-mail verificado.");
  });

  it("@spec:AC-104 link expirado oferece reenvio, e o limite do período é explicado", async () => {
    const expirado = await noServidor(PaginaDeVerificacaoDeEmail, {
      estado: "expirado",
      token: "token-vencido",
    });
    expect(expirado).toContain("Este link expirou");
    expect(expirado).toContain('action="/api/auth/verificar-email/reenviar"');

    const limite = await noServidor(PaginaDeVerificacaoDeEmail, {
      estado: "limite",
      token: "token-vencido",
    });
    expect(limite).toContain("vários links nesta última hora");
  });

  it("@spec:AC-114 o pedido de recuperação mostra a mesma confirmação, sem dizer se a conta existe", async () => {
    const inicial = await noServidor(PaginaDeRecuperacaoDeSenha);
    expect(inicial).toContain('action="/api/auth/recuperar-senha"');
    expect(inicial).toContain('name="email"');

    const enviado = await noServidor(PaginaDeRecuperacaoDeSenha, {
      estado: "enviado",
    });
    expect(enviado).toContain(
      "Se existir uma conta para este e-mail, enviaremos as instruções",
    );
  });

  it("@spec:AC-115 a nova senha vai pelo link, a senha fraca é explicada e o fim avisa que as sessões antigas caíram", async () => {
    const formularioDaSenha = await noServidor(PaginaDeDefinicaoDeSenha, {
      token: "token-de-recuperacao",
    });
    expect(formularioDaSenha).toContain('action="/api/auth/definir-senha"');
    expect(formularioDaSenha).toContain('value="token-de-recuperacao"');

    const fraca = await noServidor(PaginaDeDefinicaoDeSenha, {
      token: "token-de-recuperacao",
      estado: "senha_fraca",
    });
    expect(fraca).toContain("Use pelo menos 12 caracteres");

    const concluido = await noServidor(PaginaDeDefinicaoDeSenha, {
      estado: "concluido",
    });
    expect(concluido).toContain("Senha nova salva.");
    expect(concluido).toContain("encerramos as sessões abertas");
  });

  it("@spec:AC-112 @spec:AC-113 @spec:AC-108 a segurança separa sair deste dispositivo de encerrar todas, e oferece o segundo fator", async () => {
    const tela = await noServidor(PaginaDeSeguranca);
    expect(tela).toContain("Sair deste dispositivo");
    expect(tela).toContain("Encerrar todas as sessões");
    expect(tela).toContain('href="/minha-conta/seguranca/aplicativo"');

    const comErro = await noServidor(PaginaDeSeguranca, { estado: "erro" });
    expect(comErro).toContain("Não foi possível encerrar a sessão.");
  });
});
