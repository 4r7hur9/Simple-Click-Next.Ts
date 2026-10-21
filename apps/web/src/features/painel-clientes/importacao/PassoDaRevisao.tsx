"use client";

/**
 * Passo 3 do importador: o que vai acontecer, antes de gravar (card #61).
 *
 * A contagem é a da prévia da API, sobre o arquivo INTEIRO; a lista de
 * problemas é uma amostra (as primeiras linhas). Aqui o dono decide o que
 * fazer com quem já é cliente: ignorar ou completar os campos vazios da ficha.
 */
import { useId } from "react";
import { Aviso, Botao, Info, type ConteudoDoInfo } from "@simpleclick/ui";

import type {
  PreviaDaImportacao,
  RegraDeRepetidos,
} from "../../../lib/importacao-de-clientes.ts";

/** Quantas linhas com problema a tela mostra. */
const AMOSTRA = 10;

/**
 * Os campos do endereço além da rua. A API só guarda o endereço quando há
 * rua (`logradouro`); sem ela, o resto do endereço é descartado (card #62).
 */
const CAMPOS_DO_ENDERECO_SEM_RUA = [
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "cep",
  "pontoDeReferencia",
] as const;

export interface PassoDaRevisaoProps {
  readonly previa: PreviaDaImportacao;
  readonly regra: RegraDeRepetidos;
  readonly aoTrocarRegra: (regra: RegraDeRepetidos) => void;
  readonly importando: boolean;
  readonly erro: string | null;
  readonly aoVoltar: () => void;
  readonly aoImportar: () => void;
}

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

/** Um número grande com o que ele conta embaixo. */
export function Contagem({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
  info,
}: {
  readonly rotulo: string;
  readonly valor: number;
  readonly detalhe?: string | undefined;
  /** O "i" ao lado do rótulo, quando o nome da contagem não basta. */
  readonly info?: ConteudoDoInfo | undefined;
  readonly tom?: "neutro" | "sucesso" | "atencao" | "erro";
}) {
  const cor =
    tom === "sucesso"
      ? "text-[var(--cor-sucesso)]"
      : tom === "atencao"
        ? "text-[var(--cor-atencao)]"
        : tom === "erro"
          ? "text-[var(--cor-erro)]"
          : "text-[var(--cor-tinta)]";
  return (
    <div
      data-contagem={rotulo}
      className="grid gap-1 rounded-[var(--raio-janela)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] p-4"
    >
      <dt className="inline-flex items-center gap-1 text-sm text-[var(--cor-tinta-suave)]">
        {rotulo}
        {info === undefined ? null : (
          <Info rotulo={rotulo} conteudo={info} />
        )}
      </dt>
      <dd className={`m-0 text-3xl font-bold tabular-nums ${cor}`}>
        {numero(valor)}
      </dd>
      {detalhe === undefined ? null : (
        <dd className="m-0 text-xs text-[var(--cor-tinta-suave)]">{detalhe}</dd>
      )}
    </div>
  );
}

export function PassoDaRevisao({
  previa,
  regra,
  aoTrocarRegra,
  importando,
  erro,
  aoVoltar,
  aoImportar,
}: PassoDaRevisaoProps) {
  const idDaRegra = useId();
  const { previsao, limite } = previa;
  const rotuloDoCampo = new Map(
    previa.campos.map((campo) => [campo.campo, campo.rotulo]),
  );
  const repetidosNaAmostra = previa.primeirasLinhas.filter(
    (linha) => linha.situacao === "repetido",
  );
  const amostra = [
    ...previa.problemas.map((problema) => ({
      linha: problema.linha,
      situacao: "Inválida",
      motivo:
        problema.campo === null
          ? problema.motivo
          : `${rotuloDoCampo.get(problema.campo) ?? problema.campo}: ${problema.motivo}`,
    })),
    ...repetidosNaAmostra.map((linha) => ({
      linha: linha.linha,
      situacao: "Repetida",
      motivo:
        linha.motivo ?? "Já existe um cliente com esse telefone ou e-mail.",
    })),
  ]
    .sort((a, b) => a.linha - b.linha)
    .slice(0, AMOSTRA);

  const enderecoSemRua =
    (previa.mapeamento.logradouro ?? null) === null
      ? CAMPOS_DO_ENDERECO_SEM_RUA.filter(
          (campo) => (previa.mapeamento[campo] ?? null) !== null,
        ).map((campo) => rotuloDoCampo.get(campo) ?? campo)
      : [];

  const vaoEntrar = Math.max(0, previsao.novos - limite.excedentes);
  const temOQueFazer =
    vaoEntrar > 0 || (regra === "completar" && previsao.repetidosNaLoja > 0);

  return (
    <div className="grid gap-5">
      <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Contagem rotulo="Linhas no arquivo" valor={previsao.total} />
        <Contagem
          rotulo="Novos clientes"
          valor={previsao.novos}
          tom="sucesso"
        />
        <Contagem
          rotulo="Repetidos"
          valor={previsao.repetidos}
          tom={previsao.repetidos > 0 ? "atencao" : "neutro"}
          detalhe={`${numero(previsao.repetidosNaLoja)} já na loja · ${numero(previsao.repetidosNoArquivo)} no próprio arquivo`}
          info="Linhas com o telefone ou o e-mail de alguém que já está na sua lista, ou que aparece duas vezes no arquivo. Não viram cliente novo."
        />
        <Contagem
          rotulo="Inválidos"
          valor={previsao.invalidos}
          tom={previsao.invalidos > 0 ? "erro" : "neutro"}
          detalhe="ficam de fora"
          info="Linhas sem nome, ou com telefone ou e-mail que não dá para usar. Ficam de fora e vão para o relatório de erros."
        />
      </dl>

      {limite.excedentes > 0 ? (
        <Aviso tom="atencao" titulo="Limite de clientes da loja">
          Sua loja pode ter mais {numero(limite.restante)} cliente
          {limite.restante === 1 ? "" : "s"}. {numero(limite.excedentes)} dos
          novos ficam de fora e entram no relatório de erros.
        </Aviso>
      ) : null}

      {enderecoSemRua.length === 0 ? null : (
        <Aviso tom="atencao" titulo="Sem rua, o endereço não será salvo">
          Nenhuma coluna foi ligada ao campo “Endereço (rua)”, então{" "}
          {enderecoSemRua.join(", ")} não{" "}
          {enderecoSemRua.length === 1 ? "entra" : "entram"} na ficha. Para
          guardar o endereço, volte ao mapeamento e escolha a coluna da rua.
        </Aviso>
      )}

      {previa.avisos.map((aviso) => (
        <Aviso key={aviso} tom="info" aoVivo={false}>
          {aviso}
        </Aviso>
      ))}

      {amostra.length === 0 ? null : (
        <section
          aria-labelledby="titulo-linhas-com-problema"
          className="grid gap-2"
        >
          <h3
            id="titulo-linhas-com-problema"
            className="m-0 text-base font-semibold"
          >
            Linhas com problema
          </h3>
          <div className="overflow-x-auto rounded-[var(--raio-janela)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)]">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Amostra das linhas que não entram como cliente novo
              </caption>
              <thead>
                <tr className="border-b border-[var(--cor-borda)]">
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Linha
                  </th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Situação
                  </th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody>
                {amostra.map((item) => (
                  <tr
                    key={`${item.situacao}-${item.linha}`}
                    data-linha-com-problema={item.linha}
                    className="border-b border-[var(--cor-borda)] last:border-b-0"
                  >
                    <td className="px-4 py-2 tabular-nums">{item.linha}</td>
                    <td className="px-4 py-2">{item.situacao}</td>
                    <td className="px-4 py-2">{item.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previsao.invalidos + previsao.repetidos > amostra.length ? (
            <p className="m-0 text-xs text-[var(--cor-tinta-suave)]">
              Mostrando {amostra.length} de{" "}
              {numero(previsao.invalidos + previsao.repetidos)}. A lista
              completa vem no relatório de erros, depois de importar.
            </p>
          ) : null}
        </section>
      )}

      {previsao.repetidosNaLoja > 0 ? (
        <fieldset
          className="m-0 grid gap-3 rounded-[var(--raio-janela)] border border-[var(--cor-borda)] p-4"
          aria-describedby={idDaRegra}
        >
          <legend className="inline-flex items-center gap-1 px-1 font-semibold">
            O que fazer com quem já é cliente?
            <Info
              rotulo="o que fazer com quem já é cliente"
              conteudo={{
                texto:
                  "Ignorar: a ficha de quem já é cliente fica exatamente como está. Completar campos vazios: preenche só o que está em branco na ficha (e-mail, endereço, observação); nada que você já anotou é trocado.",
                exemplo:
                  "a ficha da Ana não tem e-mail e a planilha tem: com “Completar”, o e-mail entra.",
              }}
            />
          </legend>
          <p
            id={idDaRegra}
            className="m-0 text-sm text-[var(--cor-tinta-suave)]"
          >
            {numero(previsao.repetidosNaLoja)} linha
            {previsao.repetidosNaLoja === 1 ? " tem" : "s têm"} o telefone ou o
            e-mail de alguém que já está na sua lista.
          </p>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="regra-de-repetidos"
              value="ignorar"
              className="mt-1 size-4"
              checked={regra === "ignorar"}
              onChange={() => aoTrocarRegra("ignorar")}
            />
            <span>
              <strong>Ignorar repetidos</strong>
              <span className="block text-sm text-[var(--cor-tinta-suave)]">
                A ficha de quem já é cliente fica como está.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="regra-de-repetidos"
              value="completar"
              className="mt-1 size-4"
              checked={regra === "completar"}
              onChange={() => aoTrocarRegra("completar")}
            />
            <span>
              <strong>Completar campos vazios</strong>
              <span className="block text-sm text-[var(--cor-tinta-suave)]">
                Preenche só o que está em branco na ficha. O que você já anotou
                nunca é trocado.
              </span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {temOQueFazer ? null : (
        <Aviso tom="atencao" titulo="Nada para importar">
          Nenhuma linha vira cliente novo. Confira o mapeamento das colunas ou
          envie outro arquivo.
        </Aviso>
      )}

      {erro === null ? null : (
        <Aviso tom="erro" titulo="A importação não foi concluída">
          {erro} Pode tentar de novo: quem já tiver entrado aparece como
          repetido e não é cadastrado duas vezes.
        </Aviso>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <Botao
          variante="secundaria"
          onClick={aoVoltar}
          desabilitado={importando}
        >
          Voltar ao mapeamento
        </Botao>
        <Botao
          desabilitado={!temOQueFazer}
          carregando={importando}
          rotuloDeEspera="Importando clientes…"
          onClick={aoImportar}
        >
          {vaoEntrar > 0
            ? `Importar ${numero(vaoEntrar)} cliente${vaoEntrar === 1 ? "" : "s"}`
            : "Importar"}
        </Botao>
      </div>
    </div>
  );
}
