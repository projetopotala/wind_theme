# Ambientes do Supabase (produção × LAB × local)

## Regra
O front estático escolhe o projeto Supabase pela **origem exata** da página (nunca por substring) e **não existe fallback para a produção**:

| Origem | Resultado | Arquivo de configuração |
|---|---|---|
| `https://wind-theme.vercel.app` (e domínios aprovados em `HOSTS_OFICIAIS`) | produção `gotrumwuimpoeggwamut` | embutida em `ambiente.js` (chave publicável) |
| `https://wind-theme-m2-lab-preview[-<id>-potala].vercel.app` | LAB `hmspabllgxqfzzricijv`, e só ele | `outputs/js/supabase/ambiente-lab.js` (fora do Git) |
| `localhost`, `127.0.0.1`, `[::1]`, `*.localhost` | só com configuração explícita; nunca a produção | `outputs/js/supabase/ambiente-local.js` (fora do Git) |
| qualquer outra origem (outras Previews, http, porta, `file://`) | **erro controlado**: aviso na tela, nenhum login/leitura/escrita | — |
| LAB ou local **sem** o arquivo | **erro controlado** | — |

- `siteUrl` (`emailRedirectTo`, recuperação de senha, OAuth) é sempre a origem validada do ambiente.
- Esta verificação roda na **inicialização** (`config.js`) e no **build** (`scripts/ambiente-supabase.mjs`).
- Chave `sb_secret_`/`service_role` no navegador é rejeitada.
- Isto **não substitui** a configuração de *Site URL* e *Redirect URLs* no Supabase Auth de cada projeto.

## Como o arquivo LAB chega à Preview LAB
O arquivo nunca é versionado. `npm run lab:preparar` o gera em `outputs/` a partir de:
1. variáveis `LAB_SUPABASE_PROJECT_REF`, `LAB_SUPABASE_URL`, `LAB_SUPABASE_PUBLISHABLE_KEY` (ex.: variáveis do projeto Vercel LAB); ou
2. `ops/lab-preview/ambiente-lab.local.json` (ignorado pelo Git; modelo em `ops/lab-preview/ambiente-lab.exemplo.json`).

Sem nenhuma das duas fontes o comando falha e a Preview LAB sem o arquivo também falha (nunca cai em produção). Depois de preparar: `node scripts/ambiente-supabase.mjs lab` e então publicar a Preview LAB.

## Uso local
Crie `outputs/js/supabase/ambiente-local.js` (ignorado pelo Git):
`export const AMBIENTE_LOCAL = { projectRef, url, publishableKey };` apontando para um projeto que **não** seja a produção. Sem ele, localhost mostra o erro de configuração.

## Testes e ferramentas fora do navegador
Informe a origem em `POTALA_AMBIENTE_ORIGEM`. Os scripts `test:portal`/`check:portal` pré-carregam `tests/potala/_ambiente-testes.mjs` (domínio oficial); `audit:database` declara a produção explicitamente.

## Build de produção
`npm run build` executa `ambiente-supabase.mjs auto` e falha se `outputs/` contiver o ID do LAB, `ambiente-lab.js`, `ambiente-local.js`, `sb_secret_` ou JWT `service_role`. Também falha se for executado no projeto Vercel LAB.

## Pendências institucionais (não alteradas nesta etapa)
1. O projeto Vercel de **produção** deve usar `npm run build` (ou `node scripts/ambiente-supabase.mjs producao`) como comando de build.
2. Aprovar e acrescentar à lista `HOSTS_OFICIAIS` qualquer domínio próprio definitivo.
3. Supabase Auth de produção: Site URL e Redirect URLs do domínio oficial.
