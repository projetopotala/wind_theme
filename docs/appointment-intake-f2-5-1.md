# Recebimento público de atendimentos — F2.5.1

Esta etapa prepara código local. Nenhuma flag, migration, segredo ou função remota foi ativada.

## Contrato

`POST /functions/v1/submit-appointment-request`, com `apikey` publicável do mesmo projeto e JSON contendo `p_idempotency_key`, `p_service`, `p_modality`, `p_requester_name`, `p_contact_type`, `p_contact`, `p_preferred_date`, `p_preferred_period` e `turnstile_token`. Sucesso: HTTP 200, somente `{ "id": "UUID", "status": "recebida" }`. Nenhuma reserva é confirmada. Erros públicos: 400, 403, 409, 413, 429 ou 503, sem conteúdo privado do banco.

A função usa `withSupabase({ auth: "publishable" })` e `verify_jwt=false`: a chave publicável em `apikey` identifica o projeto, não autoriza a RPC. A função usa o cliente privilegiado apenas no servidor e apenas para chamar a RPC existente. A migration nova concede `EXECUTE` somente a `service_role` e falha se os privilégios efetivos de `anon` ou `authenticated` permitirem a chamada.

## Configuração por ambiente

- `APPOINTMENT_INTAKE_ENABLED`: permanece diferente de `true` até liberação supervisionada.
- `APPOINTMENT_ALLOWED_ORIGINS`: origens HTTPS exatas, separadas por vírgula; incluir somente o frontend daquele ambiente.
- `APPOINTMENT_TURNSTILE_HOSTNAME`: hostname exato do frontend daquele ambiente.
- `TURNSTILE_SECRET_KEY`: segredo do widget, apenas nos segredos da Edge Function.
- `APPOINTMENT_TURNSTILE_SITE_KEY`: valor público em `outputs/js/appointments/config.js`, próprio da publicação. Permanece vazio nesta etapa.
- `SUPABASE_URL` e `SUPABASE_SECRET_KEYS`: fornecidos pelo runtime Supabase à Edge Function. A chave secreta nunca vai ao HTML ou bundle.

Turnstile usa `action=appointment_request`. A função valida `success`, `hostname` e `action` no Siteverify. O widget é carregado somente com a flag do formulário ativa. Uma nova tentativa gera um token novo, mas conserva o UUID idempotente para os mesmos dados. A data relativa é validada pela RPC após consultar a chave antiga, permitindo repetição idempotente depois de mudar o dia.

## Limites e pendência antiabuso

O PostgreSQL já serializa inserções e limita a 5 novos pedidos por contato em 24 horas e 60 novos pedidos globais por minuto. Turnstile é uma camada adicional antes da chamada privilegiada. Não foi implementado limite distribuído por IP: endereços vindos de cabeçalhos HTTP não foram considerados uma identidade confiável, e um contador em memória da Edge Function falharia entre instâncias. Se a homologação exigir esse controle, usar um armazenamento distribuído com operações atômicas e avaliar custo, retenção de IP e autorização antes de adicionar a dependência. CORS não impede clientes fora do navegador. Monitorar respostas 429 e falhas de Siteverify; a flag do servidor é o desligamento imediato.

## Sequência futura, sujeita a autorização

1. Conciliar a migration de agendamentos aplicada manualmente com o histórico remoto, conferindo a versão local de 12 dígitos. Não executar `db push` indiscriminadamente.
2. No projeto pessoal de homologação, configurar widget, segredos e origens específicos; aplicar somente a nova migration e verificar os privilégios efetivos.
3. Implantar a Edge Function com `APPOINTMENT_INTAKE_ENABLED` desligado. Testar configuração, CORS, falhas de Turnstile e ausência de chamada à RPC.
4. Habilitar somente o recebimento no servidor e testar HTTP real, idempotência, concorrência, limites e RLS com dados fictícios. Usar uma cópia isolada do frontend com sitekey própria e flag pública ativa.
5. Somente após aprovação, repetir as verificações no projeto oficial; habilitar primeiro a função e depois o formulário. O painel administrativo tem flag independente.
6. Se falhar, desligar `APPOINTMENT_INTAKE_ENABLED` e a flag pública. Preservar solicitações já recebidas para triagem; não executar exclusão automática.
