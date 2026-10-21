"use client";

/**
 * Onde entregar: os endereços salvos da conta, e o novo.
 *
 * QUEM JÁ PEDIU NÃO DIGITA DE NOVO. Os endereços da conta aparecem como
 * cartões de escolha única, o padrão já marcado; tocar em outro troca a
 * entrega. "Adicionar novo endereço" abre os campos ali mesmo, e "Salvar"
 * guarda na conta e já deixa o novo escolhido.
 *
 * Conta sem endereço nenhum abre direto nos campos: mostrar uma lista vazia e
 * um botão para abrir o formulário seria um toque a mais para chegar no único
 * caminho possível.
 *
 * O componente só desenha. Quem guarda a escolha, o rascunho do novo e fala
 * com a conta é o fechamento — é ele que precisa disso tudo na hora de enviar.
 */
import { Botao } from "@simpleclick/ui";

import {
  enderecoEmUmaLinha,
  type EnderecoSalvo,
} from "../../lib/enderecos-da-conta.ts";

import { CamposDeEndereco, type EnderecoNaTela } from "./CamposDeEndereco.tsx";

export interface SeletorDeEnderecoProps {
  readonly enderecos: readonly EnderecoSalvo[];
  /** O id do endereço escolhido; nulo enquanto o novo está aberto. */
  readonly escolhido: string | null;
  readonly aoEscolher: (id: string) => void;
  /** Os campos do novo endereço estão abertos. */
  readonly novoAberto: boolean;
  readonly aoAbrirNovo: () => void;
  readonly aoCancelarNovo: () => void;
  readonly novo: EnderecoNaTela;
  readonly aoMudarNovo: (campo: keyof EnderecoNaTela, valor: string) => void;
  readonly aoSalvarNovo: () => void;
  readonly salvando?: boolean | undefined;
  /** Mensagem por campo do novo endereço. */
  readonly erros?: Partial<Record<keyof EnderecoNaTela, string>> | undefined;
  /** A recusa ao salvar, quando a conta não aceitou. */
  readonly erroAoSalvar?: string | null | undefined;
  /** Mensagem do grupo, quando nada foi escolhido. */
  readonly erroDoGrupo?: string | undefined;
  readonly desabilitado?: boolean | undefined;
}

/** O nome do cartão: o rótulo que a pessoa deu, ou a rua. */
function tituloDoEndereco(endereco: EnderecoSalvo): string {
  return (
    endereco.rotulo ??
    [endereco.logradouro, endereco.numero].filter(Boolean).join(", ")
  );
}

/** O resto do endereço, sem repetir o que o título já disse. */
function detalheDoEndereco(endereco: EnderecoSalvo): string {
  if (endereco.rotulo !== null) return enderecoEmUmaLinha(endereco);
  return [
    endereco.complemento,
    endereco.bairro,
    [endereco.cidade, endereco.estado].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function SeletorDeEndereco({
  enderecos,
  escolhido,
  aoEscolher,
  novoAberto,
  aoAbrirNovo,
  aoCancelarNovo,
  novo,
  aoMudarNovo,
  aoSalvarNovo,
  salvando = false,
  erros,
  erroAoSalvar,
  erroDoGrupo,
  desabilitado = false,
}: SeletorDeEnderecoProps) {
  const temSalvos = enderecos.length > 0;

  return (
    <fieldset className="sc-fechar__grupo" aria-describedby={erroDoGrupo ? "endereco-erro" : undefined}>
      <legend className="sc-fechar__titulo">Onde entregar</legend>

      {temSalvos ? (
        <div className="sc-fechar__escolhas">
          {enderecos.map((endereco) => {
            const detalhe = detalheDoEndereco(endereco);
            return (
              <label className="sc-fechar__escolha" key={endereco.id}>
                <input
                  type="radio"
                  name="endereco-salvo"
                  value={endereco.id}
                  checked={!novoAberto && escolhido === endereco.id}
                  onChange={() => aoEscolher(endereco.id)}
                  disabled={desabilitado}
                />
                <span className="sc-fechar__escolha-texto">
                  <span className="sc-fechar__escolha-nome">
                    {tituloDoEndereco(endereco)}
                    {endereco.padrao ? (
                      <span className="sc-fechar__selo">Padrão</span>
                    ) : null}
                  </span>
                  {detalhe === "" ? null : (
                    <span className="sc-fechar__escolha-detalhe">{detalhe}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {erroDoGrupo ? (
        <p className="sc-fechar__pendencia" id="endereco-erro" role="alert">
          {erroDoGrupo}
        </p>
      ) : null}

      {novoAberto ? (
        <div className="sc-fechar__novo">
          {temSalvos ? null : (
            <p className="sc-fechar__dica">
              Sua conta ainda não tem endereço. Informe onde entregar: ele fica
              salvo para os próximos pedidos.
            </p>
          )}
          <CamposDeEndereco
            valor={novo}
            aoMudar={aoMudarNovo}
            erros={erros}
            desabilitado={desabilitado || salvando}
          />
          {erroAoSalvar ? (
            <p className="sc-fechar__pendencia" role="alert">
              {erroAoSalvar}
            </p>
          ) : null}
          <div className="sc-fechar__acoes-do-novo">
            <Botao
              type="button"
              forma="pilula"
              onClick={aoSalvarNovo}
              carregando={salvando}
              rotuloDeEspera="Salvando…"
              desabilitado={desabilitado}
            >
              Salvar endereço
            </Botao>
            {temSalvos ? (
              <Botao
                type="button"
                variante="secundaria"
                forma="pilula"
                onClick={aoCancelarNovo}
                desabilitado={desabilitado || salvando}
              >
                Cancelar
              </Botao>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="sc-fechar__adicionar"
          onClick={aoAbrirNovo}
          disabled={desabilitado}
        >
          <span aria-hidden="true">+</span> Adicionar novo endereço
        </button>
      )}
    </fieldset>
  );
}
