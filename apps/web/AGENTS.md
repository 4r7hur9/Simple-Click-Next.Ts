<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Campos explicados

Pedido do dono: todo campo que não se explica sozinho ganha um "i" com explicação BEM escrita, e nem o "i" nem o balão podem ficar por cima de campos, botões ou textos.

**Como usar**

- No `Campo` de `@simpleclick/ui`: prop `info` (`string` ou `{ titulo?, texto, exemplo? }`). O "i" aparece na linha do rótulo, logo depois do texto, e o texto entra no `aria-describedby` do controle (`{id}-info`).
- Com `controle` próprio (ex.: `Seletor`), passe ao controle `aria-describedby={descritoresDoCampo(id, { info: true, dica }).join(" ")}`.
- Fora do `Campo` (rótulo escrito à mão, cabeçalho de coluna, chave liga/desliga): `<Info rotulo="…" conteudo={…} />` como irmão do texto do rótulo — nunca dentro do `<label>`, nunca dentro do input, nunca com `position: absolute` por cima do controle.
- `dica` continua existindo: é a frase curta que precisa estar SEMPRE visível embaixo do campo (formato, limite). O "i" é para o que explica o conceito.

**Regra de escrita**

1. Rótulo sempre visível. Placeholder nunca substitui rótulo. Campo numérico não vem pré-preenchido com `0` se isso esconder o significado (vazio + rótulo claro é melhor que um 0 que parece valor de verdade).
2. Unidade no rótulo: `Acréscimo (R$)`, `Peso (kg)`, `Prazo (dias)`, `Desconto (%)`.
3. "i" só quando o rótulo não basta. `Nome`, `E-mail`, `Telefone` não ganham "i".
4. Texto do "i" em português simples, de 1 a 3 frases, dizendo O QUE é, QUANDO usar e O QUE ACONTECE; mais 1 exemplo do ramo da loja (`Ex.: …`; não escreva o "Ex.:", o componente põe).
5. Sem jargão: nada de "SKU", "slug", "flag", "toggle" sem explicar; nunca mostrar enum em inglês (`VARIATION`, `WHOLESALE`, `PERCENT`) — traduza para o que a pessoa entende.

Exemplo bom:

```tsx
<Campo
  id="acrescimo"
  rotulo="Acréscimo (R$)"
  info={{
    texto: "Valor somado ao preço do produto quando o cliente marca esta opção. Deixe vazio se a opção não custa nada a mais.",
    exemplo: "Borda recheada de catupiry: + R$ 8,00 na pizza.",
  }}
/>
```

Vitrine com todos os casos (rolagem própria, borda da tela, janela modal): `/ui`, seção "Info (campo explicado)".
