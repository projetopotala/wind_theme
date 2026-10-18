# F2.2.2 — Formulário público de solicitações

Integração da Home em `outputs/transcendido.html#agendar`. Não confirma reserva,
não consulta disponibilidade e não utiliza profissionais/horários demonstrativos.
O formulário mantém os componentes visuais existentes e acrescenta nome e contato.

## Ativação controlada

`outputs/js/appointments/config.js` exporta `APPOINTMENT_REQUESTS_ENABLED = false`.
Nenhuma URL, parâmetro, localStorage ou variável global ativa o recurso.
HTML também inicia com fieldset e botão disabled: falha/carregamento do JavaScript
não habilita o envio. A função de submit confere a chave antes de validar ou enviar.
Enquanto desativado não instancia o sender nem acessa a RPC/armazenamento de pedidos.
Os campos pessoais permanecem bloqueados, com aviso de indisponibilidade.

Após autorização e homologação isolada:

1. Confirmar a migration, RLS, grants, limites e RPC no ambiente isolado, conforme
   `appointment-requests-f2-2-1.md`. Validar também triagem administrativa, retenção,
   aviso de privacidade e proteção contra abuso antes de disponibilizar ao público.
2. Confirmar o destino efetivo de `outputs/js/supabase/config.js` em uma cópia de
   homologação. Nunca habilitar uma cópia de teste apontada para produção.
3. Alterar explicitamente a constante para `true` nessa cópia; não remover os
   disabled do HTML: o controlador libera os controles quando a configuração permite.
4. Testar com dados fictícios contra API isolada, incluindo recarga após resposta
   perdida e alterações de proposta. Publicação/ativação em produção são decisões
   separadas, não autorizadas nesta etapa. Para desativar, restaurar false.

A chave no frontend é um controle de lançamento, não uma barreira de segurança do
banco. Quem conhece a URL pode chamar uma RPC implantada diretamente; a proteção
real permanece nas permissões e validações do servidor.

## Comportamento

- Serviço entre as três opções previamente apresentadas, modalidade, data/período,
  nome, tipo de contato e contato. Nenhum preço ou horário exato é prometido.
- Data civil válida entre hoje e +365 dias, usando America/Sao_Paulo.
- Validação nativa e validação do contrato antes de qualquer requisição.
- Submit via teclado/botão, mensagens anunciadas por aria-live e foco no feedback.
- Durante envio: campos e botão desabilitados, aria-busy e bloqueio no controlador.
- Falha: campos preservados, controles liberados e nova tentativa pela mesma chave.
- Resposta recebida: somente a frase aprovada, sem confirmação de reserva.
- Repetição idêntica já confirmada na mesma instância mostra a mesma frase sem POST.
- Edição limpa a mensagem anterior; proposta alterada passa ao sender, que gera outra
  chave. Recarga da mesma proposta utiliza a chave persistida pelo cliente F2.2.1.
- As limitações de abas, limpeza do armazenamento e proposta mais recente do cliente
  F2.2.1 continuam documentadas. A validação de data da interface pode impedir repetir
  uma preferência já passada após recarga; o contrato RPC preserva replay idempotente.

## Evidências e limites

Testes Node usam DOM mínimo e fetch simulado: validam integração com o cliente/RPC,
payload, falhas, chave, reenvio, duplicata e estado desativado. Não são comprovação de
persistência PostgreSQL nem de comportamento completo do Supabase.

Navegador real na prévia local com CSP bloqueando conexões externas: 1366×768,
335×812 e 320×568. Larguras úteis/documento respectivamente 1351/1351, 320/320 e
305/305 px (15 px de scrollbar). Campos dentro da largura disponível, aviso final
acessível por rolagem e estado disabled confirmado. Nenhum erro de console observado
nessa verificação. O fluxo habilitado foi testado com mocks, não com a API remota.

Nenhuma migration aplicada, nenhum SQL executado, nenhuma escrita em produção.
