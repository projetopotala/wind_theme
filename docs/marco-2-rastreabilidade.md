# Marco 2 — matriz de rastreabilidade do Portal

| ID | Item | Módulo | Implementação | Evidência integrada | Cenário E2E | Estado | Dependência / próxima ação |
|---|---|---|---|---|---|---|---|
| T-01.1 | Cadastro e confirmação | Auth | Supabase Auth; perfil criado por trigger | Laboratório `hmspabllgxqfzzricijv` | Cadastro público atingiu limite de e-mail; duas identidades foram confirmadas pela API oficial | BLOCKED | Repetir cadastro e entrega do link após a janela de rate limit ou configurar SMTP de testes |
| T-01.2 | Login, sessão e logout | Auth | JWT, renovação e `onAuthStateChange` | Login e refresh token reais | Dois usuários sintéticos autenticados separadamente | PASS | Homologar logout visual na futura Preview isolada |
| T-01.3 | Recuperação e nova senha | Auth | `resetPasswordForEmail` e `updateUser` | Endpoint real retornou limite de e-mail | Fluxo externo de entrega não concluído | BLOCKED | SMTP/endereço de teste autorizado |
| T-01.4 | Perfil pessoal | Meu Potala | Perfil editável, interesses e cidade | PATCH PostgREST com JWT | Usuário A alterou e releu o próprio perfil | PASS | — |
| T-01.5 | Endereços | Meu Potala | `user_addresses`, formulário e RLS por usuário | INSERT real com JWT | Endereço sintético persistido; escrita cruzada recusada | PASS | Preview isolada para validação visual |
| T-01.6 | Favoritos e histórico | Meu Potala | `saved_items`/`history_items` com RLS | Favorito sintético persistido | Usuário B não leu favorito de A | PASS | — |
| T-01.7 | Privacidade | Meu Potala | `privacy_preferences` e formulário | UPSERT real com JWT | Escolhas persistidas e isoladas | PASS | Conectar consentimento aos scripts opcionais na Frente F/G |
| T-01.8 | Histórico de ações | Meu Potala | `account_activity` somente leitura; triggers `SECURITY DEFINER` | Ações de perfil/endereço/privacidade registradas | INSERT forjado pelo usuário recusado | PASS | Ampliar eventos quando inscrições/agendamentos forem implementados |
| T-01.9 | Isolamento entre usuários | Segurança | RLS baseada em `auth.uid()` | Consultas e escrita cruzadas reais | A não leu perfil de B; B não leu salvo de A; A não gravou endereço de B | PASS | — |
| T-01.10 | Permissões administrativas | Segurança | `public.users` e P3.18 preservados | Usuário comum obteve zero linhas administrativas | Conta pessoal não ganhou papel administrativo | PASS | — |
| T-09–T-14 | Demais requisitos do Marco 2 | Frentes B–H | Não tratados nesta branch | — | — | NOT TESTED | Executar nas branches isoladas correspondentes após integração da T-01 |

Os testes comerciais T-02 a T-08 pertencem ao Marketplace e não são declarados por este repositório.
