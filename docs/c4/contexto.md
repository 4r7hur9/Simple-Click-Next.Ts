# C4 — Nível 1: Contexto

O diagrama de contexto (Cliente, Lojista, SimpleClick e WhatsApp externo), com os pontos que ele precisa deixar claros e as referências de código, **fica em um só lugar** para não haver duas versões:

➡ [`docs/arquitetura/c4.md` — seção 1. Contexto](../arquitetura/c4.md#1-contexto)

Resumo: Cliente e Lojista usam o SimpleClick; o SimpleClick **não** envia WhatsApp — monta o link `wa.me` e o cliente envia. Ver também [containers](containers.md).
