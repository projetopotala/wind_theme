# F2.2.1 — Contrato preparado, ainda não implantado

Nenhum SQL foi executado nesta etapa. Não habilitar o formulário antes de homologar
o contrato em ambiente isolado. O laboratório H1/H2/H3 não é alterado por estes arquivos.

## Contrato

`POST /rest/v1/rpc/submit_appointment_request`, usando o cliente público existente,
sem credenciais administrativas. Argumentos:

| Argumento | Regra no servidor |
| --- | --- |
| p_idempotency_key | UUID obrigatório; gerar aleatoriamente e preservar em repetição |
| p_service | Texto de 3 a 120 caracteres; preferência sujeita a triagem, não catálogo disponível |
| p_modality | presencial ou online |
| p_requester_name | 2 a 100 caracteres |
| p_contact_type | email ou telefone |
| p_contact | 8 a 254 caracteres; email sem espaços ou telefone internacional/nacional de 10–15 dígitos, com + opcional |
| p_preferred_date | Data válida, hoje até 365 dias, fuso America/Sao_Paulo |
| p_preferred_period | manha, tarde ou noite |

Resposta: `{ "id": "UUID", "status": "recebida" }`. Sem nome, contato ou estado
administrativo. Mesma resposta na repetição, inclusive após alteração administrativa
ou passagem da data originalmente solicitada. Nunca significa disponibilidade/reserva.
Não há coleta de histórico clínico, CPF, pagamento ou notas livres.

Erros: 22023 para parâmetros inválidos (HTTP 400 pelo PostgREST); PT409 para chave
reutilizada com outros dados; PT429 para limite ou contenção. UUID/data malformados
também são rejeitados pelo PostgreSQL antes do corpo da função. Falhas HTTP/rede
propagam pelo RestError existente. Resposta 2xx vazia ou fora do contrato é recusada.

## Persistência e segurança

Tabela específica `public.appointment_requests`. Estados: recebida, em_contato,
encerrada, cancelada. Nenhum estado equivale a reserva confirmada. Administradores
podem alterar apenas status; updated_at é controlado por trigger. Não há DELETE
concedido à aplicação, nem acesso direto de INSERT para visitantes.

RLS reutiliza `public.is_portal_admin()` (papel owner/admin ativo em public.users,
conforme migration 202609080004). A RPC tem search_path vazio, referências de tabela
qualificadas e EXECUTE revogado de PUBLIC antes do grant a anon/authenticated.
O trigger não é SECURITY DEFINER. Validar também privilégios herdados, donos e
definição efetiva de is_portal_admin no destino antes de implantação autorizada.

A chave única e a comparação dos campos normalizados impedem repetição persistente
com a mesma chave. Uma trava transacional serializa a verificação e inserção; sob
contenção retorna 429 sem aguardar indefinidamente. Não modifica op_apply/op_snapshot,
op_records, op_requests, site_interests ou a agenda pessoal.

## Cliente e idempotência

`createAppointmentRequestSender` não faz chamadas na importação. O chamador recebe
pending durante uma requisição; só recebe recebida após validar o comprovante.
localStorage contém UUID e SHA-256 dos dados normalizados da proposta mais recente,
sem os campos em claro. Se o armazenamento falhar, nenhum POST é feito. Ao recarregar
e reenviar os mesmos dados, a chave é reutilizada. A chave fica salva antes do POST,
cobrindo perda da resposta depois de o servidor persistir.

Limites: não sincroniza duas abas durante a criação inicial da chave; outro aparelho,
limpeza do armazenamento ou alternância entre propostas podem gerar outra chave.
Idempotência não é deduplicação por pessoa/serviço: chaves novas são novas solicitações.
O resumo criptográfico continua sendo dado pseudonimizado e deve ser tratado como tal.
Na integração visual futura, definir expiração/limpeza e ação explícita para um pedido
intencionalmente novo, sem apagar uma chave de operação com resultado desconhecido.

## Administração: integração preparada

`outputs/js/admin/appointment-requests.js` oferece listagem limitada a 100 registros
recentes e atualização do estado com resposta de uma linha. Nenhum import foi adicionado
à interface. Ponto de conexão futuro: `recebidosDoSite` em
`outputs/js/admin/operations/views.js`, alimentado junto de `carregarRecebidos` em
`outputs/js/admin/recebidos.js`. Solicitações devem ser carregadas separadamente dos
interesses e sem bloquear a agenda se a consulta falhar. Renderizar os campos com `esc`.
Paginação, filtros e tratamento de estados serão implementados na integração visual.

## Prevenção de abuso e privacidade — limitações para publicação

Limites iniciais propostos: 5 novos pedidos por contato em 24 h e 60 globais/minuto.
Repetições idempotentes não consomem cota. Estes valores precisam de aprovação de
produto e teste de carga. Contato não é autenticado: aliases, números variados ou
contatos de terceiros contornam a cota individual; abuso pode consumir a cota global.
A trava reduz concorrência. Os limites não substituem CAPTCHA verificado no servidor,
limites por origem no gateway ou verificação de contato. Não confiar em IP/headers
fornecidos livremente pelo cliente. Nenhuma integração externa foi inventada.

Revisão F2.2.2: a restrição UNIQUE da chave é a garantia atômica contra duas linhas
com a mesma chave. A trava cooperativa cobre chamadas desta RPC, não INSERTs de
operadores privilegiados. As contagens pressupõem READ COMMITTED (confirmar no
PostgREST); transações com snapshots antigos não oferecem a mesma garantia de cota.
Testar concorrência, isolamento e repetição após 429 antes de liberar o endpoint.

Antes de abrir ao público: decidir proteção de gateway/antibot compatível com RPC direta,
limites de corpo/timeout, aviso de privacidade, base de tratamento, retenção, procedimento
de eliminação, acesso administrativo e monitoramento sem registrar contatos nos logs.
Não há limpeza automática nem compartilhamento de dados com o marketplace.

## Homologação pendente — execução separada e autorizada

1. Preparar ambiente NOVO descartável, com Auth/papéis e is_portal_admin equivalentes;
   não copiar dados reais nem reaplicar a cadeia de seeds/bootstrap de produção.
2. Revisar/aplicar a nova migration somente após autorização. Ela deliberadamente
   não usa IF NOT EXISTS para esconder colisões com objetos preexistentes.
3. `tests/sql/appointment-requests.sql` está preparado para PostgreSQL 17 em
   127.0.0.1:55433, banco potala_appointments_test, tabela inicialmente vazia,
   executor com permissão SET ROLE. Não cria infraestrutura nem aplica a migration.
   Começa com guarda de destino e termina em ROLLBACK; usar psql -X e ON_ERROR_STOP.
   Guardas de host/porta/nome não substituem verificar o cluster descartável e seu dono.
4. Casos preparados: envio anon válido, replay idempotente, conflito de chave,
   campos/data inválidos, SELECT/UPDATE anon negados, INSERT direto negado,
   usuário comum sem acesso por RLS, limite por contato e ausência de linhas extras.
5. Complementar em ambiente isolado: admin ativo lê/altera apenas status; admin inativo
   não lê/altera; trigger mantém updated_at; tentativa de alterar contato falha; limite
   global; data +366/infinita/null; demais limites de tamanho; ausência de vazamento
   de dados nos erros PostgREST. Testar duas sessões simultâneas com mesma chave:
   uma pode receber 429, repetição posterior retorna mesmo id e há só uma linha.
6. Validar Auth/JWT real, privilégios herdados, cache do schema PostgREST, respostas
   HTTP e isolamento entre usuários em Supabase de homologação. PostgreSQL com
   auth.uid substituta não homologa autenticação Supabase.
7. Somente depois conectar a interface pública e administrativa; não fornecer
   profissionais/horários fictícios como disponibilidade. Confirmar triagem humana
   e separação entre solicitação recebida e reserva efetiva.

Os testes Node usam fetch simulado e inspeção textual do SQL. Não demonstram que
a migration compilou ou que políticas funcionam no banco. Não houve execução SQL.
