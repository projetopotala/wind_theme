# Atendimentos — mapa da visão Tironi e direção da página isolada

## Decisão de escopo

Os três arquivos fornecidos descrevem uma experiência completa de **Atendimentos**, não uma nova Home geral. `ABRIR_NO_NAVEGADOR.bat` apenas abre o `index.html`; não contém requisitos de produto. A nova exploração será, portanto, uma página isolada de Atendimentos. Nenhum arquivo da Home (`transcendido.html`) ou da página atual (`atendimentos.html`) será substituído.

Rota de conceito: `outputs/atendimentos-conceito.html`.

## Fontes e autoridade

| Fonte | Papel | O que será preservado |
| --- | --- | --- |
| `Potala_Atendimentos_Tironi/index.html` | Visão do proprietário | Conteúdo, ordem narrativa, áreas, responsabilidade editorial e ações |
| `Potala_Atendimentos_Tironi/assets/midia-incorporada-01.png` | Imagem principal | Ambiente realista e acolhedor de atendimento |
| `potala_atendimentos_prototipo.html` | Esqueleto de design | Assimetria, respiro, variação de ritmo, capítulos, mapas e divulgação progressiva |
| Portal local atual | Sistema existente | Marca, cabeçalho, dados de recursos, padrões de acessibilidade e rotas reais |

O editor de textos embutido no protótipo Tironi é ferramenta de autoria. Ele não pertence à experiência pública. Disponibilidades, profissionais, valores e agendamento presentes nos protótipos são demonstrativos e não serão apresentados como dados operacionais reais.

## Diagnóstico dos materiais

### Visão Tironi

Pontos fortes:

- sequência editorial responsável: compreender saúde antes de escolher uma técnica;
- conteúdo amplo, cuidadoso e explícito sobre limites;
- busca, filtros, catálogo A–Z e caminhos por necessidade;
- distinção entre profissões regulamentadas, PICS, sistemas tradicionais, autoconhecimento, abordagens holísticas e espiritualidade;
- conexão com Biblioteca, Revista, profissionais, cuidados especiais, Sala Virtual e agendamento;
- Banco Vivo de Perguntas como ajuda contextual.

Problemas visuais/técnicos observados:

- o arquivo acumula muitas gerações de CSS e trechos duplicados;
- o editor de texto reduz a área pública e aparece na captura inicial;
- longos blocos textuais usam ritmo uniforme e cansam a leitura;
- parte da navegação por âncora aterrissa em posições inconsistentes;
- vários blocos assumem dados fictícios sem distinção visual suficiente;
- o repertório é rico, mas a interface alterna pouco entre leitura, exploração e ação.

### Esqueleto de referência

Princípios que serão importados:

- hero assimétrico com promessa editorial e mapa do conteúdo;
- numeração por capítulos e pequenas legendas;
- alternância entre claro/escuro e texto/imagem sem virar repetição de cards;
- painéis laterais e elementos aderentes apenas onde ajudam a leitura;
- mapas, linhas e trilhas para explicar relações;
- Praça como área funcional de descoberta;
- respiros deliberados entre ambientes densos;
- movimentos discretos que conduzem a leitura.

Não serão copiados literalmente: paleta, textos, posições, proporções ou cartões do protótipo.

## Mapa completo da jornada

| Capítulo | Finalidade | Obrigatório | Complementar | Relação e ação |
| --- | --- | --- | --- | --- |
| Abertura | Acolher e situar a página | título Atendimentos, introdução ampla, convite para explorar | mapa rápido da página | prepara Saúde; atalho para Praça |
| 01 Saúde | Colocar contexto antes da oferta | texto principal, prevenção, corpo/sono/alimentação/movimento/relações | Revista, Biblioteca e fontes | prepara as camadas da experiência; leitura progressiva |
| 02 O que vivemos | Mostrar que pessoa e mundo se relacionam | responsabilidade sem culpa, acaso/escolha, recursos possíveis | temas humanos | conduz à investigação; escolher uma situação |
| 03 Investigar | Explicar limites e encaminhamento | “sintoma não é diagnóstico”, perceber/observar/avaliar/compreender/cuidar | sinais de procura profissional | prepara o mapa de modalidades |
| 04 Papel do Potala | Organizar diferenças com responsabilidade | seis naturezas de cuidado, limites, exemplo “dor lombar” | glossário curto | prepara a Praça; selecionar uma natureza |
| 05 Grande Praça | Encontrar e descobrir atendimentos | busca, modalidade, categoria, destaques, catálogo | A–Z, online, “vale conhecer” | coração funcional; filtrar e abrir detalhes |
| 06 Oráculos | Situar leituras simbólicas | Tarot, Baralho Cigano, Runas, limite explícito | pergunta/reflexão | explorar sem substituir decisões |
| 07 Profissionais | Mostrar que técnicas são oferecidas por pessoas | contexto, especialidades e modalidade | perfis demonstrativos claramente identificados | conhecer ou ir à área real de profissionais |
| 08 Cuidados especiais | Apresentar acesso ampliado | atendimentos solidários, Regeneração Celular, Mural de Luz | intenção/nome em demonstração local | conhecer formas de acesso |
| 09 Sala Virtual | Explicar atendimento online | escolher, preparar, receber acesso, entrar cedo | preparação do ambiente | reduz dúvida antes de agendar |
| 10 Agendamento | Transformar descoberta em ação | técnica, profissional, modalidade, data, hora, investimento | resumo | protótipo local, sem falsa confirmação operacional |
| Encerramento | Continuar no ecossistema | mensagem de fechamento e caminhos relacionados | Banco Vivo de Perguntas | segue para Biblioteca, Revista, Blog, Cursos, Atividades e contato |

## Hierarquia de conteúdo

- **Primário:** abertura, Saúde, papel responsável do Potala, Praça e decisão de agendar.
- **Secundário:** situações humanas, investigação, Oráculos, profissionais e cuidados especiais.
- **Complementar:** Biblioteca, Revista, referências, Sala Virtual e caminhos finais.
- **Decorativo:** linha da jornada, números, textura, recortes de imagem e pequenas marcas editoriais.

## Direção consolidada após revisão

O `index.html` de Tironi é a fonte de verdade para **conteúdo, ordem, intenção e responsabilidade editorial**. O `potala_atendimentos_prototipo.html` é a referência dominante para **composição, ritmo, hierarquia, molduras de imagem e forma de revelar as informações**. As matérias integrais ficam visíveis por padrão dentro do fluxo editorial. O visitante pode recolhê-las, mas o redesign não esconde nem resume o conteúdo do proprietário na chegada à página.

## Correspondência entre conteúdo e composição

| Conteúdo real | Composição adaptada |
| --- | --- |
| Abertura extensa | hero claro e assimétrico do segundo modelo, com o texto original e a imagem real dentro de moldura editorial |
| Saúde longa | cabeçalho numerado, quatro pautas completas, painel escuro para Revista e Biblioteca, referências e matéria integral aberta |
| Temas humanos | composição atmosférica com mapa orbital, ensaio integral aberto e quatro caminhos completos da Biblioteca |
| Investigar | painel escuro de percurso, etapas visuais e matéria completa em segunda camada |
| E depois, o que fazer? | grande afirmação tipográfica assimétrica e lista editorial de caminhos |
| Naturezas de cuidado | mapa circular interativo do segundo modelo com as seis naturezas e estudo de dor lombar |
| Dor lombar | estudo de caso em faixas comparáveis, sem equiparar abordagens |
| Praça | busca ampla, filtros em pílulas, dois destaques assimétricos e catálogo editorial completo |
| Oráculos | ambiente escuro e silencioso com três portas editoriais |
| Profissionais | imagem real em moldura larga seguida por perfis demonstrativos claramente identificados |
| Especiais | composição assimétrica para atendimentos solidários, Regeneração Celular e Mural de Luz |
| Sala Virtual | interface em janela/moldura com imagem local e sequência numerada |
| Agendamento | formulário demonstrativo em composição dividida com resumo local |
| Encerramento | fechamento editorial do segundo modelo e acesso ao Banco de Perguntas |

## Continuidade da jornada

A continuidade é produzida pela numeração editorial, mudanças graduais de atmosfera, transições entre matéria e painéis laterais e repetição controlada dos cabeçalhos de capítulo. Não foi adicionada uma barra de progresso concorrente com a gramática do documento Tironi.

## Linguagem de movimento

| Movimento | Função | Custo | Mobile | Movimento reduzido |
| --- | --- | --- | --- | --- |
| reveal por capítulo | orientar a leitura | baixo, opacity/transform | fade curto | conteúdo visível sem deslocamento |
| recorte lento da imagem do hero | criar profundidade e chegada | baixo | imagem estática | estático |
| desenho do fio | continuidade da jornada | baixo, transform | simplificado | estado final estático |
| troca do mapa de naturezas | explicar diferenças | baixo, opacity | mesma interação | sem deslocamento |
| filtragem da Praça | feedback de busca | baixo | mesma interação | troca imediata |
| recolhimento opcional da leitura | permitir que o visitante compacte uma matéria já apresentada por inteiro | baixo | mesma interação | mesma interação |
| Banco Vivo lateral | ajuda contextual | médio, transform | folha inferior | abertura imediata |

## Reuso do projeto

- conteúdo, ordem narrativa e limites editoriais do `Potala_Atendimentos_Tironi/index.html`;
- estrutura visual, tipografia, cores, mapas e ritmo do `potala_atendimentos_prototipo.html`;
- imagens locais existentes do projeto, apresentadas em molduras editoriais e não como fundos de tela inteira;
- folha externa para os componentes adicionais, leituras integrais abertas, formulários locais e responsividade.

## Arquitetura da página isolada

- `outputs/atendimentos-conceito.html`: estrutura pública do segundo modelo alimentada pelo conteúdo integral da visão Tironi;
- `outputs/css/atendimentos-conceito.css`: componentes complementares, molduras de imagem, matérias abertas em colunas editoriais, responsividade e foco;
- `outputs/js/atendimentos-conceito.js`: interações locais do Mural, agendamento demonstrativo e rótulos das leituras;
- `outputs/media/atendimentos-conceito/`: assets fornecidos preservados para rastreabilidade; a página também reutiliza imagens locais do projeto;
- `tests/potala/atendimentos-conceito.test.mjs`: isolamento, conteúdo, acessibilidade e referências locais.

## Critérios de aceite

1. Home, chegada e `atendimentos.html` permanecem byte a byte fora do escopo desta entrega.
2. A nova página contém todos os ambientes, matérias, Revista, Biblioteca e interações relevantes da visão Tironi.
3. Nenhum dado demonstrativo é apresentado como agenda ou profissional real.
4. Busca, filtros, mapa, Mural de Luz, perguntas e agendamento demonstrativo funcionam no cliente.
5. Navegação por teclado, foco visível, landmarks, textos alternativos e `prefers-reduced-motion` são preservados.
6. Desktop e mobile têm composições próprias, sem overflow horizontal.
7. A página abre diretamente pelo servidor local e não depende dos arquivos em Downloads.
8. A barra superior não exibe Travessia, Quem Somos, Cultura, Cursos ou Programação.
