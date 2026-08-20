# Portal Potala — A Travessia

**Data:** 20 de agosto de 2026
**Status:** especificação de design aprovada para revisão final
**Escopo:** adaptação da Chegada (`outputs/transcender.html`) e da Home (`outputs/transcendido.html`)

## 1. Objetivo

Adaptar a experiência existente do Portal Potala para que Chegada e Home formem uma travessia contínua, contemplativa e viva. O visitante deve sentir que pausa, percebe um caminho surgindo e passa a percorrer um ecossistema, em vez de navegar por uma sequência convencional de páginas e cards.

A evolução deve acontecer sobre o projeto atual. Não haverá reconstrução em React nem troca indiscriminada de assets, interações ou identidade visual.

## 2. Princípios obrigatórios

- Preservar a estrada da Home como espinha dorsal narrativa e espacial.
- Preservar o drag existente na Chegada, incluindo mouse, touch e teclado.
- Preservar a respiração 3-3-3: inspirar por 3 segundos, segurar por 3 segundos e expirar por 3 segundos.
- Manter a respiração inteiramente opcional. A interface completa só aparece depois de uma escolha explícita do visitante.
- Manter Chegada e Home como dois documentos HTML separados, mas construir uma passagem visual que pareça uma única experiência.
- Evoluir a base estática com HTML, CSS, JavaScript modular, canvas e WebGL nativo. React não será introduzido.
- Usar movimento apenas quando ele contribuir para a sensação de travessia.
- Evitar excesso de cards, controles, textos, partículas, símbolos espirituais ou efeitos simultâneos.

## 3. Estado atual que será preservado e evoluído

### Chegada

O arquivo `outputs/transcender.html` contém atualmente:

- paisagem em vídeo de tela cheia;
- drag para prosseguir;
- suporte a Pointer Events, mouse e touch;
- atalhos de teclado com Espaço e Enter;
- transição para `transcendido.html`;
- controle de som;
- acesso à experiência de respiração.

O vídeo será substituído por uma cena interativa construída com uma imagem cinematográfica e um mapa de profundidade. O drag, os atalhos, o som opcional e a respiração serão preservados e integrados à nova cena.

### Respiração

`outputs/respiracao.js` e `outputs/respiracao.css` já implementam:

- fases de 3 segundos;
- oito ciclos;
- pausa, retomada, reinício e encerramento;
- áudio opcional;
- consideração por movimento reduzido.

O temporizador atual continuará sendo a fonte de verdade. A apresentação deixará de ser uma janela invasiva e passará a se integrar à paisagem.

### Home

`outputs/transcendido.html`, `outputs/secoes.js` e `outputs/secoes.css` já possuem:

- estrada desenhada em canvas;
- câmera e posições calculadas pelo progresso;
- seis regiões de conteúdo;
- painéis informativos;
- suporte parcial a movimento reduzido.

A estrada será mantida e reestruturada para percorrer oito regiões, com trechos silenciosos, encontros editoriais variados e duas explorações laterais. O scroll artificial que intercepta a roda do mouse será removido em favor do scroll nativo.

## 4. Arquitetura da experiência

Chegada e Home permanecem em arquivos separados por razões de compatibilidade e menor risco de regressão. A continuidade será construída por quatro mecanismos combinados:

1. a composição final da Chegada enquadra o primeiro trecho da estrada;
2. a Home inicia com enquadramento, iluminação e direção equivalentes;
3. o estado essencial é transferido via `sessionStorage` de forma não crítica;
4. a View Transition API entre documentos pode ser usada quando suportada, com transição CSS equivalente como fallback.

Nenhum dado essencial dependerá de `sessionStorage`. Se o armazenamento estiver indisponível, a Home deve abrir normalmente.

## 5. Chegada — cena interativa

### 5.1 Direção visual

A cena deve usar uma paisagem cinematográfica inspirada nas referências fornecidas pelo usuário:

- montanhas, névoa, céu atmosférico e luz distante;
- natureza e arquitetura tratadas com sofisticação e humanidade;
- profundidade clara entre primeiro plano, plano médio e fundo;
- composição com espaço negativo;
- paleta compatível com o restante do Portal;
- nenhuma logo, palavra, botão ou elemento de interface gravado na imagem.

A densidade visual será cinematográfica, porém contida: um foco principal, poucos sinais secundários e períodos em que quase nada acontece.

### 5.2 Tecnologia da cena

A mídia principal será:

- uma imagem-base cinematográfica responsiva;
- um mapa de profundidade em escala de cinza correspondente;
- um canvas WebGL sobreposto;
- shaders pequenos e locais para deslocamento por profundidade, luz, névoa e partículas discretas.

O efeito não será um cenário 3D completo. Será uma ilusão de profundidade controlada, mais leve e previsível:

- mouse e touch deslocam a perspectiva em amplitude pequena;
- o scroll aproxima e abaixa levemente a câmera;
- a névoa abre gradualmente;
- uma luz distante conduz o olhar;
- um indício do caminho aparece apenas durante a progressão.

Não serão adicionadas dependências 3D pesadas. A implementação deverá funcionar em WebGL 1 ou 2 conforme disponibilidade. Se o contexto falhar, uma imagem estática com névoa CSS assume a apresentação.

### 5.3 Progressão

A Chegada terá aproximadamente duas alturas de viewport:

- **primeiro momento:** contemplação livre, estrada quase imperceptível;
- **segundo momento:** o movimento de scroll abre a névoa, avança o enquadramento e revela o caminho;
- **limiar final:** a composição se alinha com a entrada da Home e inicia a passagem.

O scroll é a forma narrativa principal de entrada. O drag continua disponível como atalho opcional. Nenhuma interação é obrigatória para permanecer na Chegada.

### 5.4 Drag da Chegada

O drag permanece minimalista, centralizado na parte inferior e sem texto excessivo. Deve manter:

- mouse;
- touch;
- Pointer Events;
- feedback de progresso;
- Espaço e Enter;
- foco visível;
- posicionamento responsivo.

Ao completar o drag, a passagem usa a mesma coreografia do final do scroll. O efeito de perspectiva do mouse fica suspenso durante o arrasto para evitar disputa de movimentos.

## 6. Respiração 3-3-3 integrada

### 6.1 Escolha explícita

A respiração nunca começa automaticamente e sua interface completa não é exibida de imediato. A Chegada mostra apenas um convite discreto, integrado à paisagem, como “Respirar”.

- Se o visitante ignorar, a experiência continua sem interrupção.
- Se escolher respirar, fase, contagem, esfera e controles surgem suavemente.
- Ao sair, esses elementos desaparecem e a paisagem volta ao estado contemplativo.
- A respiração nunca bloqueia scroll, drag ou entrada na Home.

### 6.2 Resposta ambiental

O temporizador existente emitirá mudanças de fase para a cena:

- **Inspirar — 3 s:** luz cresce suavemente, névoa recua, profundidade aumenta e o elemento visual expande.
- **Segurar — 3 s:** movimento ambiental quase para e a cena entra em suspensão.
- **Expirar — 3 s:** luz diminui levemente, névoa retorna parcialmente, profundidade reduz e o elemento contrai.

Pausa congela temporizador e resposta ambiental. Retomada continua do ponto correto; não reinicia o progresso. Reinício continua disponível como ação separada.

Em `prefers-reduced-motion`, apenas texto, contagem e pequenas alterações de luz serão usadas.

## 7. Som

O áudio permanece opcional e desligado até uma ação do usuário. A arquitetura será preparada para futuras fontes de natureza, música ambiente, mantra e meditação.

- A preferência de som será preservada durante a sessão.
- Ao atravessar para a Home, o som diminui com fade.
- A Home oferece um controle discreto para retomar o ambiente sonoro.
- Se autoplay for bloqueado, a interface permanece em estado mudo coerente, sem erro visível.

## 8. Home — narrativa da estrada

### 8.1 Direção visual

A Home manterá e evoluirá sua linguagem abstrata clara:

- branco gelo, azul, marrom suave e um tom complementar discreto;
- estrada como elemento gráfico contínuo;
- ambiente luminoso com variação lenta de profundidade e iluminação;
- apenas três ou quatro imagens estratégicas, usadas como grandes encontros;
- nenhum fundo visualmente poluído ou sequência de painéis idênticos.

As fotografias não substituirão a identidade abstrata da Home. Elas surgirão em momentos editoriais específicos e desaparecerão antes do próximo ambiente.

### 8.2 Oito regiões principais

A travessia será estruturada em oito regiões, sem divisões rígidas visíveis:

1. **Quem Somos** — entrada silenciosa, identidade, propósito e história.
2. **Atendimentos** — cuidado, acolhimento, orientação e possibilidades.
3. **Cursos** — conhecimento, estudo e formação.
4. **Atividades** — corpo, arte, convivência e prática.
5. **Profissionais** — pessoas, trajetórias e relações com conteúdos.
6. **Programação** — acontecimentos presentes e próximos.
7. **Arte e Cultura** — cinema, música, literatura, expressão e encontros.
8. **Inspiração** — descanso, frase, música, meditação ou reflexão.

Quem Somos abre a experiência com baixa densidade. Inspiração desacelera o ritmo antes do encerramento. A estrada não termina no footer: continua visualmente para além da tela.

### 8.3 Ritmo

A duração esperada para uma travessia completa em scroll confortável é de aproximadamente 90 segundos a 2 minutos e 30 segundos.

O ritmo alterna:

`encontro → estrada → paisagem → frase curta → silêncio → próxima descoberta`

Curvas, bifurcações e mudanças de direção devem acontecer principalmente nos intervalos silenciosos. Informações nunca devem ficar em cima da estrada ou dentro de uma curva.

### 8.4 Conteúdo secundário

Blog, Revista, Loja, Para Empresas, ações sociais, campanhas, projetos, vídeos e novidades aparecem como descobertas secundárias ou pontos de luz. Eles não serão pins repetidos nem cards iguais.

Exemplos de manifestações:

- uma luz distante conduz a um artigo;
- uma composição editorial apresenta uma matéria da Revista;
- um objeto contextual sugere um produto;
- um pequeno acontecimento anuncia uma campanha;
- uma fotografia ou frase revela um profissional.

Nem todos aparecem simultaneamente. Prioridade editorial determina quais são exibidos em cada versão da Home.

### 8.5 Exploração lateral

O drag lateral existirá somente em dois momentos:

- Atendimentos;
- Profissionais.

Durante o arrasto, a câmera olha elasticamente para os arredores e revela conteúdos relacionados. Ao soltar, retorna suavemente à estrada. A exploração é opcional e nunca impede a progressão vertical.

No teclado, controles equivalentes permitem explorar e retornar. No mobile, a área de gesto deve evitar conflito com a rolagem vertical.

## 9. Dados editoriais

O conteúdo da Home não ficará preso ao HTML. Uma configuração JavaScript local fornecerá módulos editoriais com campos conceituais como:

- `id`;
- `type`;
- `category`;
- `title`;
- `description`;
- `media`;
- `link`;
- `date`;
- `featured`;
- `priority`;
- `tags`;
- `relatedContent`;
- `layoutVariant`;
- `region`;
- `roadPlacement`;
- `liveStatus`.

Os nomes finais podem ser ajustados durante a implementação, mas conteúdo, apresentação e animação devem permanecer separados.

Somente informações públicas verificadas serão usadas para profissionais e acontecimentos reais. Na ausência de conteúdo confirmado, a região deve usar uma composição neutra sem inventar nomes, datas ou serviços.

## 10. Conteúdos relacionados

A configuração local deve permitir ligações entre áreas. Por exemplo:

- artigo sobre sono → meditação → atividade → profissional → curso;
- matéria sobre solidão → grupo → atividade cultural → profissional → evento;
- profissional → atendimentos → cursos → artigos → programação.

Inicialmente essas relações podem ser mock data editorial identificado como tal, desde que não sejam apresentadas como fatos reais. A estrutura deverá aceitar uma fonte de backend futura sem alterar a composição da Home.

## 11. Organização proposta do código

A implementação deverá evoluir os arquivos existentes e separar responsabilidades. A divisão prevista é:

- `outputs/js/travessia-state.js` — preferências de sessão, som, movimento reduzido e estado de passagem;
- `outputs/js/chegada-scene.js` — WebGL, profundidade, luz, névoa, partículas e fallback;
- `outputs/js/transition-handoff.js` — pré-carregamento e continuidade Chegada/Home;
- `outputs/respiracao.js` — temporizador existente e eventos de fase;
- `outputs/js/journey-data.js` — regiões, módulos, relações e prioridades;
- `outputs/js/home-road.js` — geometria e desenho da estrada;
- `outputs/js/home-scenes.js` — regiões, encontros, silêncio e estados visuais;
- `outputs/js/lateral-exploration.js` — drag elástico da Home;
- folhas CSS separadas por Chegada, respiração, Home e acessibilidade quando isso reduzir acoplamento.

Os nomes são propostos e poderão ser adaptados ao padrão encontrado durante a implementação. Não haverá grande reestruturação apenas por estética arquitetural.

## 12. Scroll e movimento

- Usar scroll nativo, sem `preventDefault` global no evento `wheel`.
- Remover cauda artificial de rolagem e interpolação que faça a página continuar por muito tempo.
- Centralizar animações em um ciclo `requestAnimationFrame` por página.
- Agrupar leituras de layout antes de escritas para evitar layout thrashing.
- Usar `IntersectionObserver` para ativar mídias abaixo da dobra.
- Parar animações quando `document.hidden` estiver ativo.
- Desligar interações de mouse em ponteiros imprecisos quando elas prejudicarem touch.

## 13. Performance e fallbacks

### Chegada

- limitar a resolução interna do canvas a um DPR efetivo entre aproximadamente 1,25 e 1,5;
- reduzir partículas e resolução conforme capacidade do aparelho;
- evitar leitura de pixels por frame;
- pré-carregar apenas imagem-base, mapa de profundidade e recursos acima da dobra;
- comprimir imagem, mapa e variação mobile;
- usar imagem estática e névoa CSS quando WebGL falhar ou o aparelho estiver abaixo do limite definido.

### Home

- manter apenas um canvas de estrada ativo;
- não executar efeitos ocultos;
- carregar fotografias de encontro sob demanda;
- evitar sombras e filtros grandes animados;
- não recalcular toda a geometria da estrada a cada frame sem necessidade.

## 14. Acessibilidade

- foco visível em todos os controles;
- elementos interativos semânticos;
- drag operável por mouse, touch e teclado;
- Escape encerra experiências expandidas quando aplicável;
- mudanças da respiração anunciadas em uma região `aria-live` concisa, sem anunciar cada segundo;
- descrições alternativas para imagens editoriais;
- contraste suficiente apesar da atmosfera suave;
- nenhum conteúdo essencial exclusivamente visual;
- áudio nunca obrigatório;
- `prefers-reduced-motion` preserva a narrativa com fades e estados estáticos;
- a estrada decorativa deve permanecer fora da árvore de acessibilidade, enquanto links e encontros mantêm ordem lógica de leitura.

## 15. Tratamento de falhas

- **WebGL indisponível ou contexto perdido:** trocar para fallback estático sem interromper respiração ou drag.
- **Imagem ou mapa de profundidade falha:** mostrar a imagem-base ou um fundo CSS neutro.
- **Áudio bloqueado:** permanecer mudo e atualizar o controle.
- **`sessionStorage` indisponível:** realizar passagem padrão.
- **mídia editorial ausente:** usar composição tipográfica neutra.
- **JavaScript parcialmente indisponível:** manter links e conteúdo principal navegáveis no HTML.

## 16. Validação

### Testes funcionais

- temporizador 3-3-3 e oito ciclos;
- pausa, retomada sem reinício, reinício e saída;
- eventos de fase enviados à cena;
- drag limitado, feedback e conclusão;
- retorno elástico das explorações laterais;
- passagem por scroll e por drag;
- continuidade da estrada e ausência de conteúdo sobre curvas;
- dados editoriais e relações válidas;
- fallback estático e movimento reduzido.

### Testes de navegador

- desktop com mouse e teclado;
- celular e tablet com touch;
- redimensionamento e mudança de orientação;
- navegação direta para a Home;
- voltar e avançar do navegador;
- carregamento lento e falhas de mídia;
- áudio permitido e bloqueado;
- console sem erros;
- verificação de desempenho em notebook e celular intermediários.

### Revisão visual

A revisão final deverá percorrer Chegada e Home como uma única experiência e responder:

> Isto parece uma sequência de componentes ou uma jornada?

Se parecer uma sequência previsível de painéis, a composição ainda não estará concluída.

## 17. Assets e conteúdo ainda necessários

Para a implementação completa serão necessários:

- uma imagem cinematográfica principal da Chegada;
- seu mapa de profundidade correspondente;
- uma variação ou enquadramento mobile;
- três ou quatro imagens estratégicas para os grandes encontros da Home;
- seleção final de áudio ambiente;
- conteúdos reais priorizados, links, datas e profissionais confirmados;
- decisões futuras sobre backend ou CMS.

As imagens poderão ser geradas seguindo as referências fornecidas pelo usuário. Os arquivos gerados não poderão conter logo, texto, botões ou outros elementos de interface incorporados. Cada imagem deverá ser revisada antes de substituir um asset do site.

## 18. Critérios de aceitação

A implementação só estará completa quando:

- a Chegada for contemplativa e não parecer hero ou splash;
- o fundo interativo responder com sutileza sem poluição visual;
- a respiração continuar 3-3-3, opcional e não invasiva;
- o drag continuar funcional em mouse, touch e teclado;
- a estrada surgir durante a passagem e permanecer central na Home;
- Chegada e Home parecerem momentos da mesma travessia;
- as oito regiões forem reconhecíveis sem virar uma sequência rígida;
- existirem intervalos reais de silêncio visual;
- informações nunca cobrirem a estrada ou suas curvas;
- conteúdos relacionados e atualizações futuras estiverem configuráveis;
- scroll, histórico do navegador e touch funcionarem sem atraso artificial;
- movimento reduzido, fallback e acessibilidade preservarem a jornada;
- desktop e mobile mantiverem a mesma narrativa;
- nenhum recurso atual obrigatório tiver sido removido;
- performance e ausência de erros tiverem sido verificadas antes da publicação.
