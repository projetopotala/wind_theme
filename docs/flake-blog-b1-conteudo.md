# Falha intermitente de tempo em `blog-b1-conteudo` (registro)

Teste: `tests/potala/blog-b1-conteudo.test.mjs`, "migration: com o papel authenticated o gatilho funciona… o desempenho é desprezível" (linha 404): `comGrande - semGrande < 400` ms, em PGlite/WASM.

## O que o teste mede

Duas medições de relógio em sequência sobre o mesmo texto de 300 blocos: 30 regravações com o gatilho `blog_posts_valida_conteudo` ligado e 30 com ele desligado; a diferença média por regravação não pode passar de 400 ms. É uma métrica de tempo absoluto: quando a máquina está ocupada, as duas medições são afetadas, mas a diferença cresce junto.

## Reproduções (14/11/2026, máquina de desenvolvimento, 12 núcleos lógicos)

| Cenário | Texto típico (25 blocos) | Texto no limite (300 blocos) | Resultado |
|---|---|---|---|
| Isolado, 5 execuções em sequência | +2,1 a +2,4 ms | +95 a +107 ms | 5/5 passam |
| 6 cópias em paralelo, 3 rodadas (18 execuções) | +6,5 a +9,2 ms | +249 a +300 ms | 18/18 passam |
| Suíte completa `npm run test:portal` (12 arquivos em paralelo), 3 execuções locais | n/d | acima de 400 ms | **3/3 falham** só este teste (1849/1850, depois 1864/1865) |
| CI (GitHub Actions) | n/d | abaixo de 400 ms | passa nas execuções das PRs #69 (duas) |

## Diagnóstico

- A branch não altera nenhuma migration em relação à `main` (`git diff origin/main -- supabase/migrations` vazio), e o teste e o gatilho são idênticos aos da `main`: **não há regressão introduzida por estas PRs**.
- O custo cresce de ~100 ms (isolado) para ~250–300 ms (6 em paralelo): ~3×. A margem de 4× no isolado cai para ~1,4× sob carga; na suíte completa o limite é ultrapassado.
- Conclusão: **sensibilidade a carga de CPU da máquina de desenvolvimento**, não regressão do gatilho.

## O que NÃO foi feito (por decisão)

- O limite de 400 ms **não foi aumentado** e a métrica **não foi trocada** por uma razão entre medições.
- Antes de qualquer troca de métrica seria preciso demonstrar que o novo teste detecta regressões reais (por exemplo, injetando um gatilho deliberadamente 5× mais lento e verificando que o teste falha, e que passa sob a mesma carga sem a regressão). Isso fica como proposta, em PR separada, com aprovação do proprietário.

## Como reproduzir

```powershell
node --import ./tests/potala/_ambiente-testes.mjs --test tests/potala/blog-b1-conteudo.test.mjs   # isolado
npm run test:portal                                                                                  # suíte completa
```
A linha `# gatilho (PGlite/WASM…)` da saída mostra o custo medido.
