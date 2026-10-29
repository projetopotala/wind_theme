# Marco 2 — rastreabilidade do Portal

| ID | Item contratual | Módulo | Implementação | Evidência prevista | Estado |
|---|---|---|---|---|---|
| T-01 | Autenticação real e Meu Potala | Conta | Branch `feat/m2-t01-auth-meu-potala`, commit `94ef2918` | 19 cenários integrados; e-mail pendente por 429 | BLOCKED parcial |
| M2-B-01 | Cadastro e publicação de profissionais | Central Operacional | `op_records.profiles`, `op_apply`, formulário administrativo ampliado | JWT administrativo real; cadastro, edição, publicação e desativação no laboratório | PASS API/banco |
| M2-B-02 | Serviços, valores e modalidades | Ofertas operacionais | `activity_offerings` ligado por `professional_id`; projeção pública mínima | Serviço e valor persistidos e consultados sem contato privado | PASS API/banco |
| M2-B-03 | Disponibilidade e agenda | Agenda operacional | `schedule_items` e `professional_id`; disponibilidade pública no perfil | Disponibilidade persistida e vínculo preservado; conflitos cobertos por regressão | PASS API/banco |
| M2-B-04 | Busca pública de profissionais | Especialistas | RPC pública segura, busca e filtros | Projeção pública e filtros automatizados PASS; Preview exclusiva do laboratório indisponível | BLOCKED visual |

As frentes P4.1 e T-01 permanecem em branches independentes. Esta matriz não presume integração entre branches antes de revalidação conjunta.
