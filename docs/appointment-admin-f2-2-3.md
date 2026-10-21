# F2.2.3 — Acompanhamento administrativo

Em Relatórios, junto de “Recebido pelo site”, os atendimentos aparecem em seção
própria. Interesses, newsletter e reservas operacionais mantêm seus contratos.
São exibidas as 100 solicitações mais recentes, em ordem de criação e ID;
empates de data têm ordenação estável. Não há paginação nesta entrega.

`APPOINTMENT_ADMIN_ENABLED` em `outputs/js/appointments/config.js` permanece false,
independente da flag pública, também false. Desativado, o painel não consulta Auth,
appointment_requests ou RPCs para este recurso. As consultas administrativas
preexistentes continuam operando normalmente.

Após homologar a migration e obter aprovação do destino, habilitar explicitamente
a flag administrativa na cópia de homologação. Não há ativação por URL ou storage.
Esta flag não substitui RLS: a tabela permite leitura e UPDATE(status) somente aos
administradores ativos conforme is_portal_admin(). A interface reutiliza
getAdminAccess antes de cada operação. Mudanças da sessão limpam os dados locais
e invalidam respostas pendentes; a decisão final de acesso é sempre do banco.
Erros 401/403 ou permissão negada limpam contatos e exigem novo acesso.

O botão Salvar estado envia somente status e filtra id + updated_at original.
Zero linhas significa conflito, remoção ou perda de permissão; nenhuma atualização
é afirmada. Erros descartam a lista e pedem recarga antes de repetir. Não há retry
automático de escrita. A resposta precisa confirmar id, estado e updated_at.
O trigger da migration atualiza updated_at; essa dependência deve ser homologada.
Nenhuma ação cria reserva ou utiliza op_apply/op_snapshot.

Estados: recebida, em_contato, encerrada, cancelada. Mudanças entre estes estados
seguem o contrato existente, sem inventar transições restritas.

Testes Node usam mocks de sessão e API; não comprovam RLS ou persistência reais.
Pendente em ambiente isolado: matriz de papéis e RLS, dois administradores editando
a mesma linha, perda de sessão durante PATCH, erro após gravação, comportamento
responsivo/teclado no navegador e políticas de retenção dos contatos. Nenhuma
migration foi executada ou flag ativada nesta etapa.
