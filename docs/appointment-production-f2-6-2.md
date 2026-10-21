# F2.6.2 — implantação controlada do recebimento em produção

**Estado:** Edge Function implantada manualmente e desativada no projeto oficial, conforme confirmação do responsável em 2026-10-20. O Codex não executou nem verificou remotamente essa implantação.

O responsável informou deploy de `submit-appointment-request` pelo Dashboard com `index.ts` e `handler.ts`, verificação JWT legada desligada, `APPOINTMENT_INTAKE_ENABLED=false`, HTTP 503 com a mensagem de indisponibilidade e zero solicitações criadas nos 30 minutos anteriores à consulta. Nenhum pedido válido foi enviado nessa etapa. Preservar o estado desativado.

## Destino e pré-condições

- Supabase oficial: organização `projetopotala`, projeto `Painel`, Project ID `gotrumwuimpoeggwamut`.
- Endereço temporário de testes definido pelo responsável: `https://wind-theme.vercel.app`. Usar este endereço para hostname Turnstile e origem CORS nesta implantação controlada. O domínio personalizado e sua confirmação em Vercel Settings → Domains ficam para a entrega final; antes de publicar o formulário em outro endereço, atualizar widget, CORS e hostname da função.
- O checkout principal foi vinculado anteriormente ao projeto pessoal `pntjdelwdhicrdhanedr`. Antes de qualquer comando remoto, conferir o `--project-ref` explícito e a conta da CLI. Não usar `--linked` neste checkout sem confirmar o vínculo.
- A F2.2 foi aplicada manualmente no oficial e `202610160001` ainda não está no histórico. O reparo F2.6.1 está pendente: o perfil CLI atual recebeu `Missing required permission(s): database_write` até para `migration list --linked`. Não registrar versões anteriores por suposição.
- O banco oficial já foi consultado pelo responsável: `appointment_requests` e RPC existem; RLS ativa; EXECUTE efetivo `PUBLIC=false`, `anon=false`, `authenticated=false`, `service_role=true`. Reconfirmar esses quatro valores antes de qualquer teste positivo futuro. Com `service_role=true`, a migration `202610200001_appointment_intake_edge_execute.sql` não foi pré-requisito operacional do deploy; não marcá-la como aplicada enquanto não for executada. Ela formaliza o GRANT e contém uma verificação transacional, para execução futura separadamente autorizada.

## Turnstile e configuração

Decisão do responsável: manter o widget institucional original `Potala - Agendamentos Producao`, na conta Cloudflare `cf2a964cf338aa8f3f69fb0ecb5e5cc2`, para `wind-theme.vercel.app`; a exigência de widget v2 foi cancelada. **Nenhuma secret key anteriormente exposta pode ser usada.** O responsável fará nova rotação no Cloudflare quando permitida e inserirá a nova secret key diretamente no Supabase oficial, sem exibi-la a ferramentas, capturas ou chat. Até lá, a função pode ser implantada somente com `APPOINTMENT_INTAKE_ENABLED=false`: o handler retorna 503 antes de ler a secret key ou invocar a RPC. Não abrir páginas de chaves com ferramentas automatizadas, não excluir widgets e não reutilizar o widget pessoal de homologação. A action esperada pelo backend permanece `appointment_request`; a sitekey pública só entrará no frontend mediante autorização posterior.

| Configuração | Valor preparado / regra |
| --- | --- |
| `APPOINTMENT_INTAKE_ENABLED` | `false` antes, durante e depois do primeiro deploy |
| `APPOINTMENT_ALLOWED_ORIGINS` | `https://wind-theme.vercel.app` |
| `APPOINTMENT_TURNSTILE_HOSTNAME` | `wind-theme.vercel.app` |
| `TURNSTILE_SECRET_KEY` | Pendente de nova rotação do widget institucional original; não configurar com nenhum valor anteriormente exposto |
| `APPOINTMENT_TURNSTILE_SITE_KEY` | Sitekey pública no frontend somente em publicação futura autorizada |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` | Fornecidos pelo runtime Supabase; nunca copiar para o frontend |

O arquivo `supabase/config.toml` mantém `verify_jwt=false` para esta função; `withSupabase({ auth: "publishable" })` valida a chave publicável no `apikey`. A RPC continua inacessível diretamente a `anon` e `authenticated`. A credencial privilegiada é usada exclusivamente no servidor para invocar a RPC.

## Sequência de fechamento F2.7, cada escrita dependente de autorização

1. **Estado de partida:** preservar o deploy desativado informado pelo responsável. Antes de qualquer mudança futura, confirmar no Dashboard oficial o Project ID `gotrumwuimpoeggwamut`, a flag desligada, os privilégios efetivos e os objetos de agendamento. O portal continua com `APPOINTMENT_REQUESTS_ENABLED=false` e `APPOINTMENT_ADMIN_ENABLED=false`.
2. **Histórico:** a F2.6.1 permanece pendente de reparo pontual, autorizado separadamente. O deploy isolado da função desativada não executou nem registrou migrations; não usar `db push` nem presumir que o histórico esteja reconciliado.
3. **Função desligada:** o deploy inicial e o teste HTTP 503 foram informados como concluídos. Antes de qualquer teste positivo futuro, confirmar no Dashboard oficial a configuração e a ausência de gravações, sem acessar dados pessoais. Não repetir o deploy apenas para refazer essa etapa.
4. **Após a rotação:** com autorização específica, configurar no Dashboard oficial `APPOINTMENT_ALLOWED_ORIGINS=https://wind-theme.vercel.app`, `APPOINTMENT_TURNSTILE_HOSTNAME=wind-theme.vercel.app` e a nova `TURNSTILE_SECRET_KEY` diretamente pelo responsável. Manter `APPOINTMENT_INTAKE_ENABLED=false` e não usar nenhuma chave exposta anteriormente. A sitekey pública só entra no frontend em publicação futura autorizada.
5. **Teste controlado posterior:** só com nova autorização, ligar temporariamente `APPOINTMENT_INTAKE_ENABLED`, enviar uma solicitação fictícia, verificar um único registro, idempotência e sua leitura pelo administrador autorizado. Desligar a flag ao final e confirmar HTTP 503. A ativação do frontend e do painel é decisão separada.

## Pacote Git para revisão futura

- Preservar as alterações existentes. Para um eventual commit, revisar juntos a migration F2.2 corrigida, `supabase/config.toml`, a Edge Function, a migration F2.5 ainda não executada, o frontend de agendamentos e seus testes. Não marcar F2.5 como aplicada por estar no Git.
- Manter fora do pacote de publicação os verificadores temporários `.potala-f242-admin-check.mjs`, `.potala-f253-http-check.mjs`, `.potala-f253-preview.mjs` e o estado local `supabase/.temp/`. Não apagar nem incluir por engano esses arquivos; `LevaAi-Apresentacao-Centralizada.*` é trabalho não relacionado.
- As flags `APPOINTMENT_REQUESTS_ENABLED` e `APPOINTMENT_ADMIN_ENABLED` permanecem `false`. A pendência de histórico `202610160001` e a limpeza de dados fictícios de homologação exigem decisões próprias; nenhuma é executada por este roteiro.

## Critérios de interrupção e rollback

- No deploy desligado, interromper se Project ID, origem, flag ou privilégios forem inesperados; a ausência temporária da nova secret key e a pendência conhecida do histórico não acionam SQL nem impedem esse deploy isolado. Antes de ativar o recebimento, exigir a nova secret key rotacionada, hostname/action corretos e resolução das pendências aprovadas. Nunca repetir automaticamente uma operação de resultado incerto.
- Se o deploy ou teste falhar, manter/retornar `APPOINTMENT_INTAKE_ENABLED=false`; frontend segue com ambas as flags `false`. Preservar registros recebidos para triagem, sem exclusão automática.
- Monitorar respostas 2xx, 403, 429 e 5xx e falhas de Siteverify durante eventual abertura. Não registrar payload, contato, token Turnstile nem segredos.
- Turnstile, limites PostgreSQL (cinco pedidos por contato em 24 h; sessenta novos pedidos globais por minuto), CORS exato e chave publicável oferecem defesa em camadas. Não há limite distribuído por IP; abuso distribuído pode esgotar o limite global. Avaliar proteção adicional antes de divulgação ampla ou se aparecerem 429/5xx persistentes. CORS não impede clientes fora do navegador.

**Nenhuma alteração no Portal publicado, Supabase oficial, homologação ou Cloudflare decorre da criação deste roteiro.**
