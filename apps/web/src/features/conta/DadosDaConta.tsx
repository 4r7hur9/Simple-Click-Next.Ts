"use client";

/**
 * Dados cadastrais (card #35): nome, telefone, CPF opcional e a preferência de
 * ofertas. O e-mail aparece mas não se edita aqui: ele é a chave do login, e
 * trocá-lo sem confirmar o novo endereço abriria a conta a quem pegar um
 * aparelho emprestado. A foto é as iniciais da pessoa.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo, Selo } from "@simpleclick/ui";
import { EXPLICACOES_PARA_CLIENTES } from "../loja/explicacoes-para-clientes.ts";

import { iniciaisDe } from "../../lib/iniciais.ts";
import { chamarConta } from "./chamar-conta.ts";
import type { DadosDaConta as Dados } from "../../lib/conta-do-cliente.ts";

const MENSAGENS: Readonly<Record<string, string>> = {
  cpf_invalido: "Esse CPF não parece válido. Confira os números.",
  telefone_invalido: "Informe o telefone com DDD, por exemplo (11) 91234-5678.",
  dados_invalidos: "Confira o nome: use pelo menos 2 letras.",
};

/** +5511912345678 → (11) 91234-5678 */
export function telefoneParaTela(e164: string | null): string {
  if (e164 === null) return "";
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function cpfParaTela(cpf: string | null): string {
  if (cpf === null || cpf.length !== 11) return cpf ?? "";
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function DadosDaConta({ inicial }: { readonly inicial: Dados }) {
  const [nome, setNome] = useState(inicial.nome ?? "");
  const [telefone, setTelefone] = useState(telefoneParaTela(inicial.telefone));
  const [cpf, setCpf] = useState(cpfParaTela(inicial.cpf));
  const [ofertas, setOfertas] = useState(inicial.aceitaOfertas);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setResultado(null);
    const resposta = await chamarConta("PATCH", "dados", {
      nome: nome.trim(),
      telefone: telefone.trim() === "" ? null : telefone,
      cpf: cpf.trim() === "" ? null : cpf,
      aceitaOfertas: ofertas,
    });
    setEnviando(false);
    setResultado(
      resposta.ok
        ? { tom: "sucesso", texto: "Dados salvos." }
        : {
            tom: "erro",
            texto:
              MENSAGENS[resposta.erro ?? ""] ??
              "Não foi possível salvar agora. Tente de novo.",
          },
    );
  }

  return (
    <form className="sc-dados" aria-label="Meus dados" noValidate onSubmit={(e) => void salvar(e)}>
      <div className="sc-dados__quem">
        <span className="sc-dados__avatar" aria-hidden="true">
          {iniciaisDe(nome || inicial.email)}
        </span>
        <div>
          <p className="sc-dados__nome">{nome || "Sem nome"}</p>
          <p className="sc-dados__desde">
            Conta criada em{" "}
            {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
              new Date(inicial.criadaEm),
            )}
          </p>
        </div>
      </div>

      {resultado === null ? null : <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}

      <div className="sc-dados__grade">
        <Campo
          id="dados-nome"
          rotulo="Nome completo"
          obrigatorio
          autoComplete="name"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Campo
          id="dados-telefone"
          rotulo="WhatsApp com DDD"
          dica="A loja usa para falar do seu pedido."
          placeholder="(85) 91234-5678"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
        <Campo
          id="dados-cpf"
          rotulo="CPF (opcional)"
          dica="Só para a nota fiscal. Pode deixar em branco."
          info={EXPLICACOES_PARA_CLIENTES.cpf}
          placeholder="000.000.000-00"
          inputMode="numeric"
          maxLength={14}
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
        />
        <Campo
          id="dados-email"
          rotulo="E-mail"
          type="email"
          dica="É o seu login e não muda por aqui. Para trocar, fale com o suporte."
          value={inicial.email}
          readOnly
        />
      </div>

      <label className="sc-enderecos__marcar">
        <input type="checkbox" checked={ofertas} onChange={(e) => setOfertas(e.target.checked)} />
        Quero receber ofertas e novidades das lojas
      </label>

      <div className="sc-minha-conta__acao">
        <Botao type="submit" carregando={enviando} rotuloDeEspera="Salvando…">
          Salvar alterações
        </Botao>
        {inicial.aplicativoAutenticador ? <Selo tom="sucesso">Verificação em duas etapas ativa</Selo> : null}
      </div>
    </form>
  );
}
