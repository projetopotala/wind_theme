# Mesa do Blog — homologação com um único Owner (LAB)

Atualizado em 2026-11-15. Nada foi aplicado nem criado no LAB (`hmspabllgxqfzzricijv`) nem em Production (`gotrumwuimpoeggwamut`). Esta versão substitui o roteiro anterior: o escopo mudou depois de conferir o histórico oficial de Production.

## 1. Onde cada migration está

| Migration | `main` | Production (histórico oficial, backup de 13/11) | LAB (leitura anônima de 15/11) |
|---|---|---|---|
| 202611060002 `admin_list_accounts` | sim | **aplicada** | ausente |
| 202611060003 `admin_professional_links` | sim | **aplicada** | ausente |
| 202611060005 `blog_editorial_permissions` | sim | **aplicada** | ausente |
| 202611120002 `blog_perfis_escritores` | sim | aplicada | **aplicada** |
| 202611150001 `blog_correcoes_protegidas` | **só nesta PR** | **pendente** | ausente |

Consequências:
- A PR #71 traz **uma** migration nova (`202611150001`). As outras três já estão em `main` e em Production: o LAB é que está atrás.
- Para Production, a única pendência desta PR é `202611150001` (conferir de novo o histórico no dia, porque o backup é de 13/11).
- No histórico de Production a 060002 foi gravada com acentos corrompidos na mensagem de erro (`Ã ` no lugar de `à`). É cosmético (mesmo `errcode`), mas serve de aviso: no LAB o texto precisa chegar em UTF-8, e a verificação pós-aplicação compara o corpo da função.

## 2. Sequência no LAB (a executar só com autorização e backup)

`202611060002` → `202611060003` → `202611060005` → `202611150001`, uma por vez, com verificação depois de cada uma.

- **060005 sozinha falha**: ela grava em `admin_access_events`, criada pela 060003.
- **060003** cria a tabela de auditoria, três funções administrativas de vínculo profissional e o gatilho `op_records_close_rooms_on_professional_revoked`. O gatilho só age quando um perfil perde o papel profissional (ou é apagado) e só preenche `closed_at` das salas abertas daquele perfil; não altera consultas nem cadastros.
- **150001** só refaz `mesa_salvar_post` (`create or replace`): sem tabela, coluna nem política.
- **060002** é somente leitura e é o que permite ao Owner listar contas na tela "Usuários e acessos"; sem ela o Owner não concede o nível "escritor" pela interface.

Pacote de execução (preflight somente leitura, ensaio transacional, rollbacks, verificação pós-aplicação, backup PostgreSQL 17 e restauração em banco temporário, manifest com SHA-256): pasta `pacote-lab-mesa-20261115`, fora do repositório. O que o repositório guarda deste trabalho: `supabase/rollbacks/202611150001_rollback_blog_correcoes_protegidas.sql`.

## 3. Provas já feitas (sem LAB, sem Docker)

- PGlite (`tests/potala/blog-mesa-fluxo-owner-banco.test.mjs`): 11 cenários com um Owner e duas escritoras, sem editor.
- PostgreSQL 17 local e descartável, com a **estrutura** de Production (backup de 13/11, sem dados):
  - preflight no estado Production acusa as 3 migrations já presentes; no estado LAB (as 3 revertidas) dá PRONTO, sem FAIL nem WARN;
  - ensaio transacional (as 4 migrations dentro de um bloco que termina em erro) devolve `ENSAIO_OK` e não deixa diferença no esquema;
  - aplicando os arquivos originais, o esquema fica **idêntico ao de Production** nas três já aplicadas, exceto pela mensagem corrompida da 060002; a 150001 altera somente `mesa_salvar_post`;
  - reaplicar cada migration é inofensivo (retomada após falha parcial);
  - 28 verificações funcionais (Owner, escritoras A e B, conta sem acesso): publicar bloqueado, rascunho isolado, nota protegida contra autosave antigo e contra forja, nota ausente no que é público, revogação, nenhum privilégio administrativo novo, sala fechada só quando o papel profissional é retirado;
  - rollbacks R4, R3, R2 e R1 devolvem o esquema exatamente ao estado anterior.

## 4. Roteiro E2E no LAB (Escritor → Owner → Publicação, sem conta de editor)

Contas: o Owner legítimo do LAB (a conta que o dono reconhece pelo último acesso, identificada pelo preflight só por id parcial, papel, data e tipo de domínio) e **uma** conta comum sintética, `escritora.lab`, sem papel administrativo. Não se cria outro administrador nem editor. A senha do Owner nunca é pedida nem digitada pelo assistente: o Owner entra sozinho e faz os passos 8, 11 e os de acesso. Todo conteúdo tem o prefixo `[HOMOLOGAÇÃO LAB]`.

Pré-condições: backup validado; preflight PRONTO; as 4 migrations aplicadas e verificadas; implantação do PR com origem do LAB (`wind-theme-m2-lab-preview*`); a conta sintética criada no LAB (autorização específica) e o nível Escritor concedido pelo Owner em "Usuários e acessos".

| # | Quem | Passo | Passa quando |
|---|---|---|---|
| 1 | escritora | Entrar na Mesa → **Meus textos** | lista vazia ou só dela; sem botão Publicar |
| 2 | escritora | Criar um artigo | rascunho aberto no editor |
| 3 | escritora | Escrever com negrito, itálico, título, lista, citação, link | marcas visíveis no editor e na prévia |
| 4 | escritora | Aguardar o salvamento automático | "Salvo às…" |
| 5 | escritora | Fechar a aba, reabrir, abrir o rascunho | conteúdo idêntico |
| 6 | escritora | Pré-visualizar (computador e celular) | igual ao Blog público |
| 7 | escritora | **Enviar para revisão** | "Em revisão"; sem Publicar |
| 8 | Owner | Visão geral → "N textos aguardando a sua revisão" → abrir → **Devolver com correções** (nota) | texto volta a rascunho |
| 9 | escritora | Reabrir: nota visível; corrigir | nota exibida; edição normal |
| 10 | escritora | **Enviar para revisão** de novo | nota some; "Em revisão" |
| 11 | Owner | Abrir e **Publicar** | publicado |
| 12 | visitante (aba anônima) | Procurar no Blog e no perfil público da escritora | artigo aparece nos dois; sem a nota |

### Verificações de segurança (mesma sessão)

| # | Verificação | Passa quando |
|---|---|---|
| S1 | Escritora tenta publicar direto (RPC `mesa_salvar_post` com `publicar`) | `42501` |
| S2 | Outra escritora ou conta sem acesso lê/edita o rascunho | negado; texto não aparece em `mesa_listar_posts` |
| S3 | Aba antiga da escritora autossalva depois da devolução | a nota continua no banco |
| S4 | Escritora tenta gravar uma nota própria | a do Owner permanece |
| S5 | API pública (`blog_posts` com chave anônima) do artigo publicado | sem `correcao` em `document` nem em `pending_document` |
| S6 | Owner revoga o nível da escritora | próxima ação dela é recusada; texto publicado continua |
| S7 | Mesma conta em duas abas, edições diferentes | **hoje não há aviso de edição simultânea**: vale a última gravação; as versões guardam só envio, devolução e publicação. Registrar o que ocorrer; se houver perda silenciosa, é pendência para o merge |
| S8 | Contas administrativas antes e depois | mesmo número; nenhuma conta nova com papel `owner`/`admin` |
| S9 | Conta de Production usada em algum passo | nenhuma |

Se um passo exigir algo indisponível, registra-se o impedimento exato e o E2E para ali.

## 5. Pendências reais

1. Autorização específica de escrita no LAB e **decisão do caminho de aplicação**: o `apply_migration` do MCP e a CLI com `--include-all` gravam versões diferentes ou levariam migrations antigas do repositório; o caminho previsto é executar o arquivo original e registrar a versão exata no histórico (insert de uma linha por versão), o que exige autorização expressa.
2. Backup do LAB executado pelo dono (senha do banco nunca passa pelo assistente) e restauração validada em PostgreSQL 17 temporário.
3. Implantação do PR com origem do LAB e conta sintética no LAB.
4. Sessão do próprio Owner nos passos 8, 11 e S6.
5. Edição simultânea (S7): sem aviso de conflito.
6. Aprovação final e merge da PR #71 (Preview protegida); depois, para Production, repetir o histórico oficial e aplicar apenas `202611150001`, com autorização própria.
