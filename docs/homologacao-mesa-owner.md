# Mesa do Blog — homologação com um único Owner (LAB)

Estado verificado em 2026-11-15, somente leitura (chave publicável, sem login). Nada foi aplicado nem criado no LAB (`hmspabllgxqfzzricijv`).

## 1. Estado do LAB

| Objeto | Migration | LAB |
|---|---|---|
| `blog_writer_profiles` | 202611120002 | existe |
| `my_appointment_professional_profiles`, `is_appointment_professional` | 202611060001 | ausente |
| `admin_list_accounts` | 202611060002 | ausente |
| `admin_list_professional_profiles`, `admin_set_professional_link`, tabela `admin_access_events` | 202611060003 | ausente |
| `blog_access_level`, `admin_set_blog_access`, `admin_list_blog_events` | 202611060005 | ausente |
| `blog_documento_problema` | 202611100001 | ausente |
| `has_portal_permission`, `mesa_listar_posts`, `mesa_salvar_post` | 2026102800xx | existem (protegidas) |
| pedido de correções protegido no banco | 202611150001 (nova, desta PR) | ausente |

## 2. Sequência proposta (não aplicada)

`202611060002` → `202611060003` → `202611060005` → `202611150001`, sempre com dry-run (transação terminada em `rollback`) e conferência de objetos antes e depois. Nada de `db push` geral nem de reparo manual do histórico.

- **060005 sozinha falha** e reverte: ela grava em `admin_access_events`, criada pela 060003.
- **060003** cria `admin_access_events`, três funções administrativas de vínculo profissional e o gatilho `op_records_close_rooms_on_professional_revoked` (fecha salas quando o vínculo é revogado). Não depende da 060001 (ensaiado).
- **150001** só refaz `mesa_salvar_post` (create or replace): sem tabela, coluna nem política. Reversão: reaplicar o trecho da 060005.

### A 060002 é necessária?
- **Para o banco funcionar, não.** A 060005 e a 150001 não dependem dela; a cadeia 060003 → 060005 foi ensaiada sem a 060002.
- **Para o Owner conceder acesso pela tela, sim.** "Usuários e acessos" carrega `admin_list_accounts`, `admin_list_professional_profiles` e `admin_list_blog_events` juntas. Sem a 060002 o Owner não lista contas e não consegue dar o nível "escritor" pela interface. É somente leitura (uma função, `security definer`, sem `anon`) e depende só de tabelas que já existem no LAB.
- Conclusão: necessária para o E2E e para a operação real.

## 3. Prova no banco isolado
`tests/potala/blog-mesa-fluxo-owner-banco.test.mjs` aplica a cadeia na ordem do LAB (base, 120002, 060003, 060005, 150001) em Postgres isolado (PGlite) com um Owner e duas escritoras, sem editor. 11 cenários: isolamento de rascunhos, bloqueio de publicar/agendar/arquivar/destacar, devolução com nota, persistência, nota inalterável pela escritora, leitura negada a outra escritora, conta comum e visitante (RPC e RLS), reenvio, publicação sem a nota, pendência de texto no ar e revogação.

## 4. Roteiro E2E (executar só depois de autorização específica de escrita no LAB)

Contas: o Owner que já existe no LAB e **uma** conta comum sintética (`escritora.lab`, sem papel administrativo). Não se cria outro administrador nem conta de editor. A senha do Owner nunca é pedida: o Owner entra sozinho na própria sessão e executa os passos 4, 8 e 10 (ou acompanha por compartilhamento de tela).

| # | Quem | Passo | Passa quando |
|---|---|---|---|
| 0 | — | Preflight somente leitura repetido | estado da seção 1 inalterado |
| 1 | operador | Dry-run da sequência; depois aplicar na ordem da seção 2 | objetos esperados; contas administrativas: só o Owner |
| 2 | operador | Criar a conta sintética no LAB (autorização específica) | sem papel nem permissão de Blog |
| 3 | escritora | Abrir a Mesa | "esta conta não tem acesso à mesa do Blog" |
| 4 | Owner | Usuários e acessos → nível **Escritor** para `escritora.lab` | evento `blog_access_changed` no histórico |
| 5 | escritora | Meus textos → novo texto; escrever, formatar, capa, categoria, resumo | "Salvo às…" |
| 6 | escritora | Fechar a aba, reabrir, abrir o rascunho | conteúdo idêntico |
| 7 | escritora | Pré-visualizar (computador e celular); Enviar para revisão | prévia igual ao Blog; status "Em revisão"; sem botão Publicar |
| 8 | Owner | Visão geral → "1 texto aguardando a sua revisão" → abrir → **Devolver com correções** (nota) | texto volta a rascunho |
| 9 | escritora | Reabrir: nota visível; corrigir; Enviar para revisão | nota some; "Em revisão" |
| 10 | Owner | Abrir o texto e **Publicar** | no Blog e no perfil público da escritora, sem a nota |
| 11 | escritora | Tentar publicar/abrir texto alheio (chamando as RPCs) | `42501` |
| 12 | Owner | Revogar o nível da escritora | próxima ação da escritora recusada; texto continua publicado |

Se um passo exigir algo que não está disponível, registra-se o impedimento exato e o E2E para ali.

## 5. O que falta
1. Autorização específica para escrever no LAB (sequência da seção 2 e conta sintética).
2. Sessão do próprio Owner para os passos 4, 8, 10 e 12.
3. Aprovação final e merge da PR #71 (Preview protegida).
4. Para Production: repetir o preflight no projeto de produção e só então aplicar a mesma sequência, com autorização própria.
