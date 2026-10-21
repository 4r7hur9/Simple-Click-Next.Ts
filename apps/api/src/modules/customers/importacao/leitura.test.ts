/**
 * Prova dos leitores do importador de clientes (card #60), sem banco: cada
 * formato, cada separador, as codificações, os tetos de tamanho e de linhas,
 * a sugestão de mapeamento e a conferência de cada linha.
 */
import { deflateRawSync } from "node:zlib";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  MAXIMO_DE_LINHAS_DA_IMPORTACAO,
  TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES,
  mapeamentoDaConsulta,
} from "@simpleclick/contracts";

import { analisarLinhas, classificar } from "./analisar.ts";
import { lerArquivoDeClientes } from "./ler-arquivo.ts";
import { detectarSeparador } from "./ler-csv.ts";
import { aplicarMapeamento, campoPeloNome } from "./mapeamento.ts";
import { nomeDoRelatorio, relatorioEmCsv } from "./relatorio.ts";
import { ErroDaLeitura } from "./tabela.ts";

const utf8 = (texto: string): Uint8Array => Buffer.from(texto, "utf-8");

/** Um ZIP mínimo (deflate), como o Excel grava. */
function zip(partes: Record<string, string>): Uint8Array {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const [nome, conteudo] of Object.entries(partes)) {
    const cru = Buffer.from(conteudo, "utf-8");
    const comprimido = deflateRawSync(cru);
    const nomeEmBytes = Buffer.from(nome, "utf-8");
    const crc = crc32(cru);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(cru.length, 22);
    local.writeUInt16LE(nomeEmBytes.length, 26);
    locais.push(local, nomeEmBytes, comprimido);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nomeEmBytes.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nomeEmBytes);
    deslocamento += 30 + nomeEmBytes.length + comprimido.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(partes).length, 8);
  fim.writeUInt16LE(Object.keys(partes).length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

/** Uma planilha .xlsx com duas abas; a primeira é a que vale. */
function planilha(): Uint8Array {
  return zip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml":
      '<workbook xmlns:r="r"><sheets><sheet name="Clientes" sheetId="1" r:id="rId7"/><sheet name="Outra" sheetId="2" r:id="rId8"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId8" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      "<sst><si><t>Nome Completo</t></si><si><t>Celular</t></si><si><r><t>Jo</t></r><r><t>ão &amp; Cia</t></r></si><si><t>E-mail</t></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Aba errada</t></is></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet2.xml": [
      "<worksheet><sheetData>",
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>3</v></c></row>',
      '<row r="2"/>',
      '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>85988887777</v></c><c r="D3" t="inlineStr"><is><t>joao@exemplo.test</t></is></c></row>',
      '<row r="4"><c r="A4" t="str"><f>CONCAT("Ma","ria")</f><v>Maria</v></c><c r="B4"><v>5.5859777766E10</v></c></row>',
      "</sheetData></worksheet>",
    ].join(""),
  });
}

describe("CSV: separador descoberto e campos entre aspas", () => {
  it.each([
    [",", "nome,telefone\nAna,85988887777\n"],
    [";", "nome;telefone\r\nAna;85988887777\r\n"],
    ["tab", "nome\ttelefone\nAna\t85988887777\n"],
    ["|", "nome|telefone\nAna|85988887777\n"],
  ] as const)("separador %s", (separador, texto) => {
    const tabela = lerArquivoDeClientes(utf8(texto), {
      nomeDoArquivo: "x.csv",
    });
    expect(tabela.separador).toBe(separador);
    expect(tabela.colunas).toEqual(["nome", "telefone"]);
    expect(tabela.linhas).toEqual([
      { numero: 2, valores: ["Ana", "85988887777"] },
    ]);
  });

  it("o ';' do Excel brasileiro ganha da vírgula dentro do nome", () => {
    expect(
      detectarSeparador(
        'Nome;Telefone\n"Silva, Ana";85988887777\nBruno;85977776666\n',
      ),
    ).toBe(";");
  });

  it("aspas com separador, aspas dobradas e quebra de linha; a numeração é a da planilha", () => {
    const tabela = lerArquivoDeClientes(
      utf8(
        'nome,obs,telefone\n"Ana, a ""Rainha""","linha 1\nlinha 2",85988887777\n\n"Bia",,85977776666\n',
      ),
    );
    expect(tabela.linhas[0]).toEqual({
      numero: 2,
      valores: ['Ana, a "Rainha"', "linha 1\nlinha 2", "85988887777"],
    });
    // A linha vazia conta (é a linha 3 da planilha) mas não vira cliente.
    expect(tabela.linhas[1]?.numero).toBe(4);
  });

  it("TSV pela extensão força a tabulação", () => {
    const tabela = lerArquivoDeClientes(
      utf8("nome\ttelefone,fixo\nAna\t85988887777\n"),
      {
        nomeDoArquivo: "leads.tsv",
      },
    );
    expect(tabela.formato).toBe("tsv");
    expect(tabela.colunas).toEqual(["nome", "telefone,fixo"]);
  });

  it("cabeçalho vazio e repetido ganham nome único", () => {
    const tabela = lerArquivoDeClientes(utf8("Nome,,nome\na,b,c\n"));
    expect(tabela.colunas).toEqual(["Nome", "Coluna 2", "nome (2)"]);
  });
});

describe("codificação: UTF-8, UTF-8 com marca, Latin-1 e UTF-16", () => {
  const texto = "nome;cidade\nJoão Conceição;São Luís\n";

  it("UTF-8 sem marca", () => {
    const tabela = lerArquivoDeClientes(utf8(texto));
    expect(tabela.codificacao).toBe("utf-8");
    expect(tabela.linhas[0]?.valores).toEqual(["João Conceição", "São Luís"]);
  });

  it("UTF-8 com marca (a marca não vira parte do primeiro cabeçalho)", () => {
    const tabela = lerArquivoDeClientes(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8(texto)]),
    );
    expect(tabela.colunas[0]).toBe("nome");
  });

  it("Latin-1 (Windows-1252) do Excel antigo é descoberto sozinho", () => {
    const tabela = lerArquivoDeClientes(Buffer.from(texto, "latin1"));
    expect(tabela.codificacao).toBe("latin1");
    expect(tabela.linhas[0]?.valores).toEqual(["João Conceição", "São Luís"]);
  });

  it("UTF-16 com marca (Texto Unicode do Excel, com tabulação)", () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("nome\ttelefone\nJoão\t85988887777\n", "utf16le"),
    ]);
    const tabela = lerArquivoDeClientes(bytes, {
      nomeDoArquivo: "unicode.txt",
    });
    expect(tabela.codificacao).toBe("utf-16");
    expect(tabela.separador).toBe("tab");
    expect(tabela.linhas[0]?.valores).toEqual(["João", "85988887777"]);
  });

  it("codificação forçada pelo painel vence a descoberta", () => {
    const tabela = lerArquivoDeClientes(utf8(texto), { codificacao: "latin1" });
    expect(tabela.linhas[0]?.valores[0]).toBe("JoÃ£o ConceiÃ§Ã£o");
  });
});

describe("JSON e JSON Lines", () => {
  it("lista de objetos, com objeto dentro virando coluna com ponto", () => {
    const tabela = lerArquivoDeClientes(
      utf8(
        JSON.stringify([
          {
            nome: "Ana",
            telefone: 85988887777,
            endereco: { cidade: "Fortaleza" },
          },
          { nome: "Bia", email: "bia@exemplo.test" },
        ]),
      ),
    );
    expect(tabela.formato).toBe("json");
    expect(tabela.colunas).toEqual([
      "nome",
      "telefone",
      "endereco.cidade",
      "email",
    ]);
    expect(tabela.linhas[0]).toEqual({
      numero: 1,
      valores: ["Ana", "85988887777", "Fortaleza", ""],
    });
  });

  it("objeto com a lista dentro", () => {
    const tabela = lerArquivoDeClientes(
      utf8(
        JSON.stringify({
          total: 1,
          clientes: [{ nome: "Ana", celular: "85988887777" }],
        }),
      ),
    );
    expect(tabela.linhas).toHaveLength(1);
    expect(tabela.colunas).toEqual(["nome", "celular"]);
  });

  it("lista de listas: a primeira é o cabeçalho", () => {
    const tabela = lerArquivoDeClientes(
      utf8(
        JSON.stringify([
          ["Nome", "Fone"],
          ["Ana", "85988887777"],
        ]),
      ),
    );
    expect(tabela.colunas).toEqual(["Nome", "Fone"]);
    expect(tabela.linhas[0]?.numero).toBe(2);
  });

  it("JSON Lines: um objeto por linha, numerado pela linha do texto", () => {
    const tabela = lerArquivoDeClientes(
      utf8(
        '{"nome":"Ana","telefone":"85988887777"}\n\n{"nome":"Bia","telefone":"85977776666"}\n',
      ),
    );
    expect(tabela.formato).toBe("jsonl");
    expect(tabela.linhas.map((l) => l.numero)).toEqual([1, 3]);
  });

  it("JSON quebrado é recusado com motivo", () => {
    expect(() => lerArquivoDeClientes(utf8('[{"nome": "Ana",]'))).toThrow(
      expect.objectContaining({ codigo: "arquivo_ilegivel" }),
    );
  });
});

describe("XLSX: primeira aba, textos compartilhados e números", () => {
  it("lê a primeira aba pela ordem do livro, não pelo nome do arquivo", () => {
    const tabela = lerArquivoDeClientes(planilha(), {
      nomeDoArquivo: "clientes.xlsx",
    });
    expect(tabela.formato).toBe("xlsx");
    expect(tabela.colunas).toEqual([
      "Nome Completo",
      "Celular",
      "Coluna 3",
      "E-mail",
    ]);
    expect(tabela.linhas).toEqual([
      {
        numero: 3,
        valores: ["João & Cia", "85988887777", "", "joao@exemplo.test"],
      },
      { numero: 4, valores: ["Maria", "55859777766", "", ""] },
    ]);
  });

  it("descobre o XLSX pelos bytes, sem nome", () => {
    expect(lerArquivoDeClientes(planilha()).formato).toBe("xlsx");
  });

  it(".xls antigo é recusado com a orientação de salvar como .xlsx", () => {
    const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => lerArquivoDeClientes(xls)).toThrow(
      expect.objectContaining({ codigo: "formato_nao_suportado" }),
    );
  });

  it("ZIP que não é planilha é recusado", () => {
    expect(() => lerArquivoDeClientes(zip({ "leia.txt": "oi" }))).toThrow(
      ErroDaLeitura,
    );
  });
});

describe("tetos do servidor", () => {
  it("arquivo gigante (mais de 5 MB) é recusado antes de ler", () => {
    const gigante = Buffer.alloc(
      TAMANHO_MAXIMO_DA_IMPORTACAO_EM_BYTES + 1,
      0x61,
    );
    expect(() => lerArquivoDeClientes(gigante)).toThrow(
      expect.objectContaining({ codigo: "arquivo_grande_demais" }),
    );
  });

  it("mais de 5 mil linhas é recusado", () => {
    const linhas = Array.from(
      { length: MAXIMO_DE_LINHAS_DA_IMPORTACAO + 1 },
      (_, i) => `Pessoa ${i},8598${String(i).padStart(7, "0")}`,
    );
    expect(() =>
      lerArquivoDeClientes(utf8(`nome,telefone\n${linhas.join("\n")}`)),
    ).toThrow(expect.objectContaining({ codigo: "linhas_demais" }));
  });

  it("exatamente 5 mil linhas passa", () => {
    const linhas = Array.from(
      { length: MAXIMO_DE_LINHAS_DA_IMPORTACAO },
      (_, i) => `Pessoa ${i},8598${String(i).padStart(7, "0")}`,
    );
    expect(
      lerArquivoDeClientes(utf8(`nome,telefone\n${linhas.join("\n")}`)).linhas,
    ).toHaveLength(MAXIMO_DE_LINHAS_DA_IMPORTACAO);
  });

  it("vazio e só cabeçalho são recusados", () => {
    expect(() => lerArquivoDeClientes(new Uint8Array())).toThrow(
      expect.objectContaining({ codigo: "arquivo_vazio" }),
    );
    expect(() => lerArquivoDeClientes(utf8("nome,telefone\n"))).toThrow(
      expect.objectContaining({ codigo: "arquivo_vazio" }),
    );
  });
});

describe("mapeamento sugerido e manual", () => {
  it.each([
    ["Nome completo", "nome"],
    ["Cliente", "nome"],
    ["Celular", "telefone"],
    ["WhatsApp", "telefone"],
    ["Telefone/Celular", "telefone"],
    ["Número do telefone", "telefone"],
    ["E-mail", "email"],
    ["Obs.", "observacao"],
    ["Endereço", "logradouro"],
    ["Nome da rua", "logradouro"],
    ["Nº", "numero"],
    ["UF", "estado"],
    ["CEP", "cep"],
    ["Data de nascimento", null],
  ] as const)("%s → %s", (coluna, campo) => {
    expect(campoPeloNome(coluna)).toBe(campo);
  });

  it("sem nome de telefone, acha a coluna pelo conteúdo", () => {
    const tabela = lerArquivoDeClientes(
      utf8("Quem,Contato\nAna,(85) 98888-7777\nBia,85 97777-6666\n"),
    );
    const { porNome } = aplicarMapeamento(tabela, {});
    expect(porNome.telefone).toBe("Contato");
  });

  it("o manual vence a sugestão; nulo tira o campo; coluna inexistente é avisada", () => {
    const tabela = lerArquivoDeClientes(
      utf8("Nome,Celular,Fixo,Obs\nAna,85988887777,8533334444,vip\n"),
    );
    const manual = mapeamentoDaConsulta({
      "mapa.telefone": "fixo",
      "mapa.observacao": "",
      "mapa.email": "Correio",
      "mapa.inexistente": "x",
    });
    const aplicado = aplicarMapeamento(tabela, manual);
    expect(aplicado.porNome.telefone).toBe("Fixo");
    expect(aplicado.porNome.observacao).toBeNull();
    expect(aplicado.porNome.email).toBeNull();
    expect(aplicado.desconhecidas).toEqual(["Correio"]);
  });
});

describe("conferência de cada linha e repetidos", () => {
  const tabela = lerArquivoDeClientes(
    utf8(
      [
        "Nome,Celular,E-mail,Endereço,UF",
        "Ana,(85) 98888-7777,ana@exemplo.test,Rua A,ce",
        "Bia,123,,,",
        ",85977776666,,,",
        "Ana de novo,+55 85 98888-7777,,,",
        "Carla,85966665555,ANA@exemplo.test,,",
        "Duda,85955554444,email-quebrado,,",
        "Eva,85944443333,,Rua B,Ceará",
        "Fabi,85933332222,,,",
        "Gil,85922221111,gil@exemplo.test,,",
      ].join("\n"),
    ),
  );
  const { indices } = aplicarMapeamento(tabela, {});
  const linhas = analisarLinhas(tabela, indices);

  it("telefone inválido, sem nome, e-mail e UF que não fecham viram inválidos com linha e motivo", () => {
    const invalidas = linhas.filter((l) => l.tipo === "invalida");
    expect(invalidas.map((l) => [l.linha, l.problema.campo])).toEqual([
      [3, "telefone"],
      [4, "nome"],
      [7, "email"],
      [8, "estado"],
    ]);
    for (const invalida of invalidas) {
      if (invalida.tipo === "invalida")
        expect(invalida.problema.motivo).not.toBe("");
    }
  });

  it("a linha válida sai normalizada como o cadastro manual", () => {
    const ana = linhas[0];
    expect(ana?.tipo).toBe("valida");
    if (ana?.tipo !== "valida") return;
    expect(ana.chave).toBe("85988887777");
    expect(ana.dados.endereco).toMatchObject({
      logradouro: "Rua A",
      estado: "CE",
    });
  });

  it("repetido no arquivo (telefone e e-mail) e na loja", () => {
    const classificacao = classificar(linhas, {
      porTelefone: new Map([
        [
          "85933332222",
          {
            clienteId: "00000000-0000-4000-8000-000000000001",
            nome: "Fabi",
            comConta: false,
          },
        ],
      ]),
      porEmail: new Map([
        [
          "gil@exemplo.test",
          {
            clienteId: "00000000-0000-4000-8000-000000000002",
            nome: "Gil",
            comConta: true,
          },
        ],
      ]),
    });
    expect(classificacao.novos.map((l) => l.linha)).toEqual([2]);
    expect(
      classificacao.repetidosNoArquivo.map((r) => [
        r.linha,
        r.motivo,
        r.linhaOriginal,
      ]),
    ).toEqual([
      [5, "TELEFONE", 2],
      [6, "EMAIL", 2],
    ]);
    expect(
      classificacao.repetidosNaLoja.map((r) => [r.lead.linha, r.motivo]),
    ).toEqual([
      [9, "TELEFONE"],
      [10, "EMAIL"],
    ]);
    expect(classificacao.invalidos).toHaveLength(4);
  });
});

describe("relatório de erros em CSV", () => {
  it("abre no Excel: marca UTF-8, ';' e fórmula neutralizada", () => {
    const csv = relatorioEmCsv([
      {
        linha: 3,
        situacao: "invalido",
        motivo: "Sem nome; confira",
        nome: "=HYPERLINK(1)",
        telefone: "+55 85 98888-7777",
        email: null,
      },
      {
        linha: 2,
        situacao: "fora_do_limite",
        motivo: "Limite",
        nome: "Ana",
        telefone: null,
        email: null,
      },
    ]);
    expect(
      csv.startsWith("﻿linha;situacao;motivo;nome;telefone;email\r\n"),
    ).toBe(true);
    const [, primeira, segunda] = csv.split("\r\n");
    expect(primeira).toBe("2;fora do limite;Limite;Ana;;");
    expect(segunda).toBe(
      `3;inválido;"Sem nome; confira";'=HYPERLINK(1);+55 85 98888-7777;`,
    );
  });

  it("nome do relatório só com ASCII", () => {
    expect(nomeDoRelatorio("Clientes São João.xlsx")).toBe(
      "Clientes-Sao-Joao-erros.csv",
    );
    expect(nomeDoRelatorio(null)).toBe("importacao-erros.csv");
  });
});
