# Portal Potala — Grama, Marketplace e o Palácio

**Data:** 27 de agosto de 2026
**Status:** especificação de design aprovada para revisão
**Escopo:** borda de grama na estrada, extensão da estrada, nona região (Marketplace) e cena final interativa do interior do Palácio Potala

## 1. Objetivo

Fechar a travessia em círculo. Hoje ela começa na Chegada, percorre oito regiões na Home e termina num bloco de texto com link externo. Esta evolução acrescenta uma nona região, estende a estrada para além da última informação e leva o visitante a uma cena final interativa dentro do Palácio Potala, de onde ele retorna à Chegada.

A evolução acontece sobre o projeto atual. Não há reconstrução em React, não há troca do motor da Chegada e não há refazimento do renderizador da estrada.

## 2. Princípios obrigatórios

- Reaproveitar o motor da Chegada (`createArrivalScene`, shader, fases integradas na CPU) para a cena do palácio. O que muda é perfil e assets, não engine.
- Preservar o renderizador atual da estrada. A grama é camada nova, não substituição.
- Preservar a respiração 3-3-3, o drag e a passagem Chegada→Home intactos.
- Manter cada documento HTML separado, como Chegada e Home já são.
- Respeitar `prefers-reduced-motion`, teclado, foco visível e contraste em tudo que for novo.
- Nenhum gesto pode ser a única forma de completar uma ação.

## 3. Estado atual que será preservado e estendido

### Estrada

`outputs/js/home/home-road.js` desenha o calçamento em quatro camadas de largura decrescente: sombra no chão, acostamento borrado e duas passadas de textura. A borda é esfumada por máscara: a forma da estrada é pintada borrada numa tela auxiliar e a textura entra por `source-in`. O perfil de opacidade atravessando a borda é rampa contínua.

O contrato de `buildMedievalRoadLayers` é coberto por teste: quatro camadas, larguras decrescentes, textura na terceira, sem `lineDash`, todas `source-over`.

Nada disso muda.

### Geometria da travessia

`outputs/js/home/journey-layout.js` monta segmentos alternando reta e curva, um par por região. `DIRECTIONS` tem exatamente oito entradas para oito regiões. `ROAD_TRAVEL` escala os três comprimentos juntos.

`outputs/js/home/home-scenes.js` guarda `regionHeights` (8 entradas) e `silenceHeights` (7). O palco de cada região é `sticky` com 100svh, então a informação fica parada no centro por `regionHeight - 100`.

`roadStateForScroll`, em `home-controller.js`, casa seções do DOM com segmentos da estrada **em ordem, uma a uma**. Esta correspondência é a restrição mais rígida do sistema.

### Passagem entre documentos

`outputs/js/chegada/transition-handoff.js` expõe `enterHome({ entry, soundEnabled, destination })`: marca `data-transitioning`, grava estado efêmero, adiciona as classes do véu e navega após `handoffDelayForMotion` (850ms, ou 80ms em movimento reduzido). O destino já é parametrizável.

## 4. Grama na borda da estrada

### 4.1 Por que procedural

A estrada curva. Uma faixa de textura não acompanha a borda de uma curva sem esticar ou repetir de forma visível. Tufo desenhado ao longo da normal da curva acompanha qualquer traçado.

### 4.2 Desenho

Um módulo puro calcula as posições: dado o comprimento de arco e um espaçamento, devolve uma lista de tufos com posição no caminho, lado, altura e inclinação, tudo derivado de semente determinística por índice. A mesma estrada sai igual em qualquer máquina, e o módulo é testável fora do navegador.

O adaptador de canvas percorre essa lista, converte posição de arco em ponto e normal usando `sampleSegment`, e desenha. Tufos fora do quadro são descartados por caixa delimitadora antes de qualquer desenho — a estrada redesenha a cada quadro de rolagem e a lista inteira é longa.

### 4.3 Onde entra na pilha

Entre o acostamento (camada 2) e o calçamento. A grama nasce por baixo da pedra e sua ponta se perde na máscara borrada que já esfuma a borda, então não aparece linha onde a grama encontra a estrada.

### 4.4 Movimento

Em movimento reduzido a grama é estática. Fora dele, cada tufo oscila com amplitude pequena e fase própria, derivada da mesma semente. A oscilação usa a fase integrada na CPU, como o resto do projeto, e nunca `tempo × velocidade` — este produto salta quando a velocidade muda e foi a causa do piscar da cachoeira.

## 5. Estrada estendida e a subida

### 5.1 Nona direção

`DIRECTIONS` ganha uma entrada para o Marketplace.

### 5.2 O trecho de subida

Depois da última região entra um bloco `journey-ascent`: caminho sem informação, terminando fora do quadro.

**Restrição crítica.** `roadStateForScroll` casa seções do DOM com segmentos da estrada em ordem. Um bloco a mais no fim sem segmento correspondente desalinha todo o mapeamento a partir dele. A subida precisa do próprio segmento no layout, não apenas de altura no CSS.

O segmento da subida é uma reta na direção final, com comprimento próprio, e entra em `pathSections` junto com regiões e silêncios.

### 5.3 O véu

Ao fim da subida o véu fecha e navega para `palacio.html`, reaproveitando `enterHome` com `destination`. O nome da função descreve mal o novo uso e será generalizado para `crossTo({ entry, soundEnabled, destination })`, mantendo `enterHome` como invólucro para não tocar na Chegada.

## 6. Marketplace

Nona região da travessia e décima entrada da navegação.

Conteúdo: a loja física do instituto — cristais, incensos, livros, óleos essenciais, alimentos saudáveis, mais de três mil produtos — com contato para comprar. A loja online fica fora deste escopo.

`marketplace.html` segue o padrão editorial das outras páginas de seção, usando `secao-conteudo.css`.

Pontos que precisam da nona entrada, e que quebram silenciosamente se esquecidos:

- `journey-data.js` — a região
- `home-scenes.js` — `regionHeights`, `silenceHeights` e `featuredDiscoveries`, que hoje tem oito entradas
- `journey-layout.js` — `DIRECTIONS`
- `secoes.js` — `siteSections`
- `transcendido.html` — a lista do `noscript`
- `home-scenes.test.mjs` — o teste de ritmo varre sete trechos e passa a varrer oito

## 7. Cena do palácio

### 7.1 Os assets

`assets-source/potala-interior/potala-interior-plate-1024x576.png` e `potala-interior-depth-1024x576.png`, ambos 1024×576, verificados.

A profundidade segue a convenção do motor, perto claro: vão da porta ao fundo 0.00, chão em primeiro plano 0.90, coluna próxima 0.72, figuras centrais 0.42.

O pipeline gera as versões 2K espelhando `prepare-arrival-v2-assets.mjs`, com a mesma recusa de assets desalinhados.

### 7.2 O que a cena interior muda

A cena é interna. Isso invalida parte do que o motor faz por padrão:

- **Sem céu.** Não há máscara de céu nem camada de nuvem.
- **A luz vem do vão da porta, não de cima.** O shader tem um termo `sky` calculado como `smoothstep(0.48, 0.16, sceneUv.y)`. Como `uv.y = 1` é o topo da tela, esse termo vale 1 no rodapé do quadro: o brilho do sol é aplicado embaixo. Numa paisagem externa isso passa por luz refletida no chão; num corredor acenderia a laje errada. O perfil do palácio zera `uSun` e a cena ganha um foco próprio ancorado no vão.
- **A névoa é quente e local**, concentrada no facho de luz, e não uma faixa de vale.

### 7.3 Máscaras derivadas

Geradas por código a partir da placa e da profundidade, como a máscara de céu da Chegada foi:

- **Facho de luz** — região de alta luminância com profundidade baixa, crescendo a partir do vão.
- **Poeira** — o mesmo facho, usado como recorte para as partículas suspensas.

Nenhuma máscara de água ou cachoeira: a cena não tem nem uma nem outra.

### 7.4 Movimento

- Parallax por ponteiro, herdado do motor, usando a profundidade real.
- Poeira subindo devagar dentro do facho.
- A luz do vão respirando, com período longo.
- Ociosidade leve nas três figuras.

Tudo por fase integrada na CPU. Em movimento reduzido a cena é desenhada parada.

### 7.5 Sem atores nesta versão

O sistema de atores e poemas da Chegada não entra agora. Parallax, poeira e luz já dão a cena viva, e ator é camada que soma depois sem refazer nada.

## 8. O botão de segurar

### 8.1 Comportamento

Botão no centro inferior. Segurar por 1,5s completa a ação. Soltar antes faz o progresso recuar, e o zoom recua junto — é o recuo que ensina o gesto, porque o visitante experimenta, vê começar e entende sem instrução escrita.

Ao completar, a câmera avança para dentro do vão da porta, a tela lava no claro e o documento navega para `transcender.html`. A travessia fecha em círculo: sai do palácio para a paisagem onde começou.

### 8.2 Estado

Uma máquina de estado pura, fora do navegador e testável: recebe tempo decorrido e se está pressionado, devolve progresso entre 0 e 1 e se completou. O zoom é função do progresso, então recuo e avanço saem de graça.

### 8.3 Acessibilidade

Segurar é difícil para quem navega por teclado ou tem limitação motora, e a spec do projeto exige teclado e foco visível.

- Enter e Espaço disparam a mesma conclusão sem exigir pressão mantida.
- O botão é `<button>` de verdade, com foco visível.
- Em `prefers-reduced-motion` o zoom vira corte curto.
- O progresso é anunciado por texto acessível, não só por animação.

## 9. Arquivos

### Criar

- `outputs/js/home/road-grass.js` — posições e fases dos tufos, puro
- `outputs/marketplace.html` — a nona seção
- `outputs/palacio.html` — a cena final
- `outputs/css/palacio.css` — cena e botão
- `outputs/js/palacio/palace-controller.js` — monta a cena sobre o motor da Chegada
- `outputs/js/palacio/palace-profile.js` — perfil, assets e ajuste de luz
- `outputs/js/palacio/hold-to-return.js` — máquina de estado do segurar
- `scripts/prepare-palace-assets.mjs` — pipeline 2K
- `scripts/build-palace-masks.mjs` — facho e poeira
- `outputs/media/palacio-*.webp` — saídas do pipeline

### Alterar

- `outputs/js/home/home-road.js` — chamar a camada de grama
- `outputs/js/home/journey-layout.js` — nona direção e segmento da subida
- `outputs/js/home/home-scenes.js` — alturas, descobertas e o bloco de subida
- `outputs/js/home/home-controller.js` — subida em `pathSections`, véu ao fim
- `outputs/js/chegada/transition-handoff.js` — `crossTo` genérico
- `outputs/js/home/journey-data.js` — região Marketplace
- `outputs/secoes.js` — navegação
- `outputs/transcendido.html` — `noscript`
- `scripts/validate-portal-assets.mjs` — orçamento dos assets novos

## 10. Testes

- **Grama** — posições determinísticas para a mesma semente; tufos fora do quadro descartados; estática em movimento reduzido.
- **Ritmo** — oito trechos em vez de sete, dentro da faixa de distância entre encontros.
- **Mapeamento** — a subida tem segmento próprio, e a contagem de seções do DOM bate com a de segmentos. Este teste é o que protege contra o desalinhamento descrito em 5.2.
- **Marketplace** — presente na navegação, no `noscript` e nos dados da travessia.
- **Passagem** — o fim da subida leva a `palacio.html`; `crossTo` preserva o comportamento de `enterHome`.
- **Segurar** — progresso avança sob pressão, recua ao soltar, completa em 1,5s, e Enter conclui sem pressão mantida.
- **Assets do palácio** — placa e profundidade com dimensões casadas; pipeline recusa desalinhado; orçamento de bytes.

## 11. Riscos

- **Desalinhamento seção↔segmento.** O maior. Coberto por teste próprio, descrito em 5.2.
- **Custo da grama por quadro.** A estrada redesenha a cada quadro de rolagem. Se o descarte por caixa não bastar, a grama é assada numa tela auxiliar por trecho visível.
- **Nona região alonga a travessia.** Hoje ela tem 1885svh. Uma região a mais soma cerca de 240svh. Se ficar longo, o ajuste é na parada, e parada e comprimento são o mesmo botão: distância entre encontros = parada + 100svh.
- **O termo `sky` do shader.** Zerá-lo no palácio resolve esta cena, mas o bug de orientação continua na Chegada, onde acende o rodapé em vez do céu. Fica registrado, fora deste escopo.
