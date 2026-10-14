"use client";

/**
 * Meus endereços: cadastrar uma vez e usar em qualquer loja (T-707, AC-509).
 *
 * O PADRÃO É O QUE O FECHAMENTO PREENCHE. A tela diz isso com todas as letras
 * ao lado do endereço padrão, e trocar o padrão é um toque. Apagar pede
 * confirmação na própria tela — sem janela do navegador.
 *
 * Quatro estados: carregando, erro com "tentar de novo", vazio com o convite
 * a cadastrar, e a lista.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  Erro,
  IconeAdicionar,
  IconeExcluir,
  Selo,
  Vazio,
} from "@simpleclick/ui";

import {
  apagarEnderecoDaConta,
  enderecoEmUmaLinha,
  listarEnderecosSalvos,
  paraSalvar,
  salvarEnderecoDaConta,
  trocarEnderecoDaConta,
  type EnderecoSalvo,
} from "../../lib/enderecos-da-conta.ts";

type Estado =
  | { readonly tipo: "carregando" }
  | { readonly tipo: "erro" }
  | { readonly tipo: "ok"; readonly enderecos: readonly EnderecoSalvo[] };

export interface EnderecosSalvosProps {
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: typeof fetch | undefined;
}

function NovoEndereco({
  aoSalvar,
  buscar,
}: {
  readonly aoSalvar: () => void;
  readonly buscar: typeof fetch;
}) {
  const [rotulo, setRotulo] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cep, setCep] = useState("");
  const [padrao, setPadrao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (logradouro.trim().length < 3) {
      setErro("Informe a rua do endereço.");
      return;
    }
    setErro(null);
    setEnviando(true);
    const resultado = await salvarEnderecoDaConta(
      {
        rotulo: rotulo.trim() || null,
        logradouro: logradouro.trim(),
        numero: numero.trim() || null,
        complemento: complemento.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        estado: estado.trim().toUpperCase() || null,
        cep: cep.trim() || null,
        padrao,
      },
      buscar,
    );
    setEnviando(false);
    if (resultado.estado === "salvo") aoSalvar();
    else setErro("Não foi possível salvar. Confira os campos e tente de novo.");
  }

  return (
    <form
      aria-label="Novo endereço"
      className="sc-enderecos__novo"
      noValidate
      onSubmit={(evento) => void enviar(evento)}
    >
      <Campo
        id="endereco-rotulo"
        rotulo="Nome do endereço (opcional)"
        dica="Casa, Trabalho…"
        value={rotulo}
        onChange={(e) => setRotulo(e.target.value)}
      />
      <Campo
        id="endereco-logradouro"
        rotulo="Rua"
        obrigatorio
        value={logradouro}
        onChange={(e) => setLogradouro(e.target.value)}
        erro={erro ?? undefined}
      />
      <div className="sc-enderecos__grade">
        <Campo
          id="endereco-numero"
          rotulo="Número"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />
        <Campo
          id="endereco-complemento"
          rotulo="Complemento"
          value={complemento}
          onChange={(e) => setComplemento(e.target.value)}
        />
        <Campo
          id="endereco-bairro"
          rotulo="Bairro"
          value={bairro}
          onChange={(e) => setBairro(e.target.value)}
        />
        <Campo
          id="endereco-cidade"
          rotulo="Cidade"
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
        />
        <Campo
          id="endereco-estado"
          rotulo="UF"
          maxLength={2}
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        />
        <Campo
          id="endereco-cep"
          rotulo="CEP"
          inputMode="numeric"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
        />
      </div>
      <label className="sc-enderecos__marcar">
        <input
          type="checkbox"
          checked={padrao}
          onChange={(e) => setPadrao(e.target.checked)}
        />
        Usar como endereço padrão nos pedidos
      </label>
      <div>
        <Botao type="submit" carregando={enviando} rotuloDeEspera="Salvando…">
          Salvar endereço
        </Botao>
      </div>
    </form>
  );
}

export function EnderecosSalvos({ buscar = fetch }: EnderecosSalvosProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [adicionando, setAdicionando] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(async () => {
    setEstado({ tipo: "carregando" });
    const leitura = await listarEnderecosSalvos(buscar);
    setEstado(
      leitura.estado === "ok"
        ? { tipo: "ok", enderecos: leitura.enderecos }
        : { tipo: "erro" },
    );
  }, [buscar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function tornarPadrao(endereco: EnderecoSalvo) {
    setFalhou(false);
    const resultado = await trocarEnderecoDaConta(
      endereco.id,
      paraSalvar(endereco, true),
      buscar,
    );
    if (resultado.estado === "salvo") await carregar();
    else setFalhou(true);
  }

  async function apagar(id: string) {
    setFalhou(false);
    const apagado = await apagarEnderecoDaConta(id, buscar);
    setApagando(null);
    if (apagado) await carregar();
    else setFalhou(true);
  }

  if (estado.tipo === "carregando") {
    return <Carregando rotulo="Carregando seus endereços…" />;
  }
  if (estado.tipo === "erro") {
    return (
      <Erro
        titulo="Não foi possível carregar seus endereços"
        mensagem="Confira a conexão e tente de novo."
        acao={
          <Botao variante="secundaria" onClick={() => void carregar()}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }

  const formulario = adicionando ? (
    <NovoEndereco
      buscar={buscar}
      aoSalvar={() => {
        setAdicionando(false);
        void carregar();
      }}
    />
  ) : (
    <div>
      <Botao icone={<IconeAdicionar />} onClick={() => setAdicionando(true)}>
        Cadastrar endereço
      </Botao>
    </div>
  );

  return (
    <div className="sc-enderecos">
      {falhou ? (
        <Aviso tom="erro">
          Não foi possível concluir agora. Tente de novo.
        </Aviso>
      ) : null}
      {estado.enderecos.length === 0 ? (
        <Vazio
          titulo="Nenhum endereço salvo"
          descricao="Cadastre uma vez e ele vem preenchido no fechamento de qualquer loja."
        />
      ) : (
        <ul className="sc-enderecos__lista" aria-label="Endereços salvos">
          {estado.enderecos.map((endereco) => (
            <li
              key={endereco.id}
              className={
                endereco.padrao
                  ? "sc-endereco sc-endereco--padrao"
                  : "sc-endereco"
              }
              data-endereco={endereco.id}
            >
              <p className="sc-endereco__nome">
                {endereco.rotulo ?? "Endereço"}
                {endereco.padrao ? (
                  <Selo tom="sucesso">Padrão — vem preenchido nos pedidos</Selo>
                ) : null}
              </p>
              <p className="sc-endereco__linha">
                {enderecoEmUmaLinha(endereco)}
              </p>
              <div className="sc-endereco__acoes">
                {endereco.padrao ? null : (
                  <Botao
                    variante="secundaria"
                    tamanho="pequeno"
                    onClick={() => void tornarPadrao(endereco)}
                  >
                    Usar como padrão
                  </Botao>
                )}
                {apagando === endereco.id ? (
                  <>
                    <Botao
                      variante="perigo"
                      tamanho="pequeno"
                      onClick={() => void apagar(endereco.id)}
                    >
                      Sim, apagar
                    </Botao>
                    <Botao
                      variante="discreta"
                      tamanho="pequeno"
                      onClick={() => setApagando(null)}
                    >
                      Não apagar
                    </Botao>
                  </>
                ) : (
                  <Botao
                    variante="discreta"
                    tamanho="pequeno"
                    icone={<IconeExcluir />}
                    onClick={() => setApagando(endereco.id)}
                  >
                    Apagar
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {formulario}
    </div>
  );
}
