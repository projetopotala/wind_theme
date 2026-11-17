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
