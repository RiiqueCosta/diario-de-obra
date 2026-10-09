# Diário de Obra

Sistema web para empresas de construção registrarem o dia a dia de várias obras: diário, equipe, fotos, ocorrências, cronograma, aprovações e relatórios em PDF.

- **Front-end:** React 19 + TypeScript + Vite (sem biblioteca de UI externa; roteador e componentes próprios).
- **Back-end:** Supabase — Postgres com RLS, Auth, Storage privado e Edge Functions.
- **Hospedagem prevista:** Vercel (site estático).

## Situação por fase

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 — Fundação | banco, RLS, auditoria, autenticação, empresas, usuários e convites, permissões por obra, cadastro de obras, painel | **concluída** (testes de autorização 92/92) |
| 2 — Diário de Obra | diário completo por seções, clima, serviços, equipe, materiais, equipamentos, calendário | tabelas e regras prontas no banco; telas a fazer |
| 3 — Fotos e documentos | upload/câmera, galeria, miniaturas | Storage e políticas prontos; telas a fazer |
| 4 — Gestão de campo | atividades, cronograma, ocorrências | tabelas e regras prontas; telas a fazer |
| 5 — Relatórios e aprovações | PDFs, fluxo de aprovação | fluxo de aprovação pronto e testado no banco; PDFs e telas a fazer |
| 6 — Finalização | notificações agendadas, backup, desempenho, manual | a fazer |

## Rodar no computador

Requisitos: Node 20 ou superior.

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:5173
npm run build      # checagem de tipos + build de produção em dist/
```

## Publicar no Vercel

1. Importe o repositório no Vercel (framework: Vite).
2. Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (valores em `.env.example`).
3. No Supabase → Authentication → URL Configuration: defina **Site URL** com o endereço do Vercel e inclua `https://SEU-DOMINIO/**` em **Redirect URLs** (necessário para recuperação de senha e convites por e-mail).

## E-mails (recuperação de senha e convites)

O servidor de e-mail padrão do Supabase envia poucas mensagens por hora e só para endereços da equipe do projeto. Para uso real, configure um SMTP próprio em Authentication → Emails → SMTP Settings. Enquanto isso, o convite com **senha provisória** funciona sem e-mail.

## Banco de dados

- Migrações em `supabase/migrations/` (aplicadas em ordem de nome).
- Todas as tabelas expostas têm RLS. A autorização é decidida no banco pelas funções do esquema `private` (`is_org_admin`, `has_perm`, `can_view_report`...).
- Diário aprovado é bloqueado por gatilho; correções só pela função `reopen_daily_report`, que guarda a versão anterior.
- Auditoria (`audit_logs`) é gravada por gatilhos e só pode ser lida por administradores.

### Testes de autorização

`supabase/tests/autorizacao.sql` instala o esquema `tests` (sem acesso pela API). Para rodar no SQL Editor:

```sql
select tests.run_autorizacao();
```

A execução termina com a mensagem `RESULTADO: X ok, Y falhas` e a lista de verificações. Tudo roda numa transação desfeita no final: nenhum dado de teste fica no banco.

## Papéis

| Papel | Onde | Resumo |
|---|---|---|
| Administrador | empresa | tudo da empresa: obras, usuários, configurações, auditoria |
| Gestor de obras | obra | edita a obra, aprova e corrige diários, equipe, atividades, ocorrências |
| Engenheiro | obra | registra e aprova diários, atividades, ocorrências, relatórios |
| Encarregado | obra | preenche diários, equipe, fotos, abre ocorrências |
| Colaborador | obra | consulta; ações liberadas individualmente |

Ajustes finos por pessoa e por obra ficam na aba **Equipe** de cada obra.

## Aviso legal

A aprovação de diários dentro do sistema registra quem aprovou e quando. Ela **não** é assinatura digital certificada (ICP-Brasil) e não garante, por si só, validade jurídica.
