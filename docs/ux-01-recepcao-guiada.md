# UX-01 — Recepção guiada

## Caminhos

Antes, a Chegada mostrava a paisagem e “Um espaço de chegada”; para encontrar um serviço, a pessoa precisava descobrir o menu ou percorrer a Travessia. Recepção e Atividades exibiam campos de prévia que não encaminhavam perguntas.

Agora, a primeira tela explica o Instituto e oferece Atendimento, Cursos, Atividades, Instituto e Recepção em um toque. A Travessia continua como caminho opcional. Recepção e Atividades apontam para o único Assistente Potala da IA-01, com links públicos disponíveis mesmo sem respostas inteligentes.

Conhecer um atendimento é público. A solicitação de atendimento ocorre no Meu Potala e pode pedir identificação. Criar conta não confirma um horário; a confirmação depende do fluxo de agendamento existente.

## Jornadas auditadas no código

| Objetivo | Ações desde a Chegada | Destino e informação | Barreira a conferir em navegador |
| --- | --- | --- | --- |
| Entender o Instituto | 1: Conhecer o Instituto | `quem-somos.html`, página institucional pública | Legibilidade do guia em tela baixa |
| Descobrir e solicitar atendimento | 1: Receber atendimento; 2: Solicitar um atendimento | `atendimentos.html` mostra opções e explica que a conta é exigida para o pedido, confirmado depois pelo Instituto | Autenticação apenas na segunda etapa |
| Cursos ou atividades | 1: Conhecer cursos ou Participar de atividades | Páginas públicas; cursos distinguem turmas oficiais e interesse, atividades indicam confirmação por contato | Disponibilidade real depende do Instituto |
| Pedir orientação | 1: Não sei por onde começar; 2: Conversar com o Assistente Potala | Recepção abre a IA-01; se a IA falhar, o convite leva ao contato humano | Tempo de carregamento e estado indisponível |
| Falar com pessoa | 1: Não sei por onde começar; 2: Começar uma conversa | Âncora de contato da Recepção com WhatsApp, telefone e e-mail | Canal e prazo de resposta não confirmados |

Esta tabela descreve a inspeção de código e os testes de comportamento. Não substitui a homologação visual com visitante real.

## Homologação visual

As larguras de 320, 375, 390, 428, 768 e 1366 px, a orientação horizontal, teclado virtual, leitor de tela, foco, movimento reduzido e ausência de overflow horizontal **ainda não têm evidência de navegador**. A tentativa de abrir o arquivo local pela automação foi bloqueada pela política de URL do navegador. Não se deve marcar esses critérios como aprovados com base apenas na inspeção do CSS. Uma Preview HTTPS protegida da branch, quando autorizada e acessível, é necessária para screenshots e revisão por visitante leigo antes de produção.

## Informações a confirmar com o Instituto

- Descrição institucional aprovada para a primeira tela, incluindo o uso de “saúde integrativa e cultura”.
- Quais serviços e atividades estão ativos, com horários, preços, vagas e profissionais atualizados. O portal contém detalhes editoriais de atividades que precisam de conferência antes de serem tratados como disponibilidade real.
- Canal e prazo oficial para resposta humana às dúvidas e solicitações de atendimento.
- Texto oficial sobre a etapa de confirmação de atendimentos e aulas.

## Limites operacionais

Nenhuma configuração da IA, segredo, regra de autenticação ou agendamento foi alterada. A Preview protegida depende de acesso institucional ao projeto de hospedagem; não houve deploy nem merge.

## Análise complementar: compreensão de quem chega pela primeira vez

Esta análise separa funcionamento técnico de compreensão. Os links da Chegada funcionam, mas alguns elementos ainda exigem que a pessoa conheça a linguagem interna do Potala:

| Elemento real | Arquivo principal | Dificuldade para visitante leigo | Impacto |
| --- | --- | --- | --- |
| Título “Um espaço de chegada” | `outputs/transcender.html` | É acolhedor, mas não explica que o Potala oferece cuidado, cursos, atividades e cultura. | Alto |
| Regiões “Tempo”, “Presença”, “Fluxo”, “Horizonte” e “Entrada” | `outputs/transcender.html`, `outputs/js/chegada/arrival-world.js` | Parecem conceitos poéticos; não indicam qual serviço ou informação será encontrado. | Médio |
| Botão “Percorrer a Travessia” | `outputs/transcender.html` | Não informa que é uma exploração editorial em 12 etapas nem que é opcional. | Médio |
| Capítulos “01 — Atendimentos” até “12 — Blog” | `outputs/travessia.html`, componentes de jornada | A numeração e os nomes ajudam a marca, mas não dizem o próximo passo ou o benefício de cada etapa. | Médio |
| Cartões editoriais da Travessia | `outputs/js/home/home-controller.js`, `outputs/js/home/home-scenes.js` | “O cuidado”, “O conhecimento” e “O movimento” são temas, não ações; a finalidade só aparece depois da leitura. | Alto |
| “Visite nossa loja” e “Seu espaço no Potala” | `outputs/js/home/home-controller.js`, `outputs/js/home/living-footer.js` | O primeiro pode parecer publicidade; o segundo pode parecer obrigatório ou exigir conta antes de a pessoa entender o portal. | Baixo/médio |
| Controles “Respirar”, “Som” e “Pausar movimento” | `outputs/transcender.html`, `outputs/js/chegada/arrival-controller.js` | São controles contemplativos úteis, mas secundários e sem relação explícita com encontrar um serviço. | Baixo |
| Botão circular do Assistente | `outputs/js/assistente/assistente-ui.js`, `outputs/css/assistente-flutuante.css` | O rótulo “Ajuda” existe, mas o ícone e a posição flutuante podem parecer decorativos. | Médio |

### Proposta objetiva para aprovação, sem implementação nesta PR

1. Manter a paisagem e a Travessia, mas apresentar na Chegada uma frase institucional direta e a pergunta “O que você gostaria de fazer hoje?”.
2. Transformar cada escolha inicial em necessidade + descrição curta + ação: “Quero cuidar de mim — conheça atendimentos e como solicitar um horário” / “Conhecer atendimentos”.
3. Nas regiões interativas da paisagem, exibir uma legenda curta e contextual apenas depois da escolha, com no máximo duas ações: “Conhecer atendimentos” e “Continuar explorando”.
4. Em cada etapa da Travessia, manter o título artístico, acrescentar uma linha “Você encontrará…” e uma ação primária cotidiana. A pessoa poderá voltar, abrir Explorar ou pedir Ajuda em qualquer momento.
5. Renomear controles sem ação clara para verbos cotidianos, preservando a estética: “Ouvir sons”, “Pausar movimento” e “Abrir ajuda”.

Essa proposta não altera destinos, autenticação, agendamentos, Supabase ou IA-01. Ela deve ser aprovada pelo proprietário antes de uma frente visual própria.

## Homologação complementar e pendências

- A saudação do Assistente agora varia por modo: real, demonstração e indisponível. O modo demonstrativo declara que as respostas são simuladas; o indisponível aponta links públicos e Recepção.
- Os tratamentos de Preview sem banco continuam falhando fechado para operações que exigem backend. Conteúdo HTML empacotado permanece visível; erros de leitura em origem conhecida continuam registrados e usam fallback.
- Testes reais anteriores aprovaram as larguras 320, 375, 390, 428, 768 e 1366 px, altura curta, orientação horizontal, foco e ausência de overflow. A tentativa desta retomada não conseguiu repetir zoom nativo de 200% nem emular `prefers-reduced-motion` no navegador, pois a sessão nativa perdeu o controle para uma autenticação externa. Esses dois itens permanecem pendentes.
- Não foram homologados fluxos reais que dependem de banco, como turmas dinâmicas, envio de interesse, autenticação ou agendamento. A Preview sem banco não deve ser usada como prova desses fluxos.
