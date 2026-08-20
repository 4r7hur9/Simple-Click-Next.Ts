# Tasks: Cardápio na TV da loja

> feature: cardapio-na-tv

## T-950 — Exibição que avança sozinha, sem ninguém operar [pendente]

- Refs: US-908, AC-925, AC-930
- Arquivos: apps/web/src/features/tv/ExibicaoDeCardapio.tsx, apps/web/src/features/tv/useRodizio.ts, apps/web/src/features/tv/useRodizio.test.ts
- Notas: sem cursor, sem barra de rolagem, sem nada que espere toque. Produto indisponível não entra no rodízio — cardápio de parede não se corrige a caneta.
- Esforço: medio

## T-951 — Corpo e contraste para leitura a três metros [pendente]

- Refs: US-908, AC-926, AC-927
- Arquivos: packages/ui/styles/exibicao.css, apps/web/src/features/tv/densidade.ts, apps/web/src/features/tv/densidade.test.ts
- Notas: o número de produtos por tela sai da proporção e do tamanho da televisão, e nunca reduz o corpo abaixo do mínimo legível. Em pé e deitada recebem divisões diferentes do espaço.
- Esforço: alto

## T-952 — Catálogo que se atualiza sozinho e sobrevive à queda [pendente]

- Refs: US-908, AC-928, AC-929
- Arquivos: apps/web/src/features/tv/useCatalogoDaTv.ts, apps/web/src/features/tv/useCatalogoDaTv.test.ts
- Notas: a televisão fica ligada o dia inteiro, então a atualização não pode depender de recarregar a página. Queda de internet mantém o último cardápio recebido, e não tela de erro.
- Esforço: alto

## T-954 — Ponte da parede para o celular [pendente]

- Refs: US-908, AC-931
- Arquivos: apps/web/src/features/tv/CodigoParaOCelular.tsx, apps/web/src/features/tv/codigo.ts, apps/web/src/features/tv/codigo.test.ts
- Notas: o código aparece em TODA tela do rodízio, e não só numa — quem decidiu pedir não espera a televisão dar a volta. Tamanho pensado para leitura a três metros, o que faz dele elemento grande e não selo de canto. O endereço leva à vitrine daquela loja, e carrega de onde a pessoa veio para o dono saber que a TV converteu.
- Esforço: medio

## T-953 — Teste de ponta a ponta da exibição [pendente]

- Refs: US-908, AC-925, AC-929
- Arquivos: e2e/specs/cardapio-na-tv.spec.ts
- Notas: cobre a tela avançando sozinha e a exibição continuando de pé com a rede cortada.
- Esforço: medio
