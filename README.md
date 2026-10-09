# Diário de Obra

Sistema web para empresas de construção registrarem o dia a dia de várias obras: diário, equipe, fotos, ocorrências, cronograma, aprovações e relatórios em PDF.

- **Front-end:** React 19 + TypeScript + Vite (sem biblioteca de UI externa; roteador e componentes próprios).
- **Back-end:** Supabase — Postgres com RLS, Auth, Storage privado e Edge Functions.
- **Hospedagem:** Vercel (site estático), publicado a cada envio para a branch `main`.

## Situação por fase

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 — Fundação | banco, RLS, auditoria, autenticação, empresas, usuários e convites, permissões por obra, cadastro de obras, painel | concluída |
| 2 — Diário de Obra | diário em 8 seções (identificação, clima, serviços, mão de obra, materiais e equipamentos, ocorrências, fotos, encerramento), cópia local de segurança, controle de edição simultânea, calendário por obra | concluída |
| 3 — Fotos e documentos | câmera e galeria do celular, data original da foto (EXIF), miniaturas, fila com reenvio, galeria por dia, comparação, documentos da obra | concluída |
| 4 — Gestão de campo | etapas e atividades com peso, dependências, cronograma (Gantt), ocorrências com comentários e histórico, equipe, materiais e equipamentos | concluída |
| 5 — Relatórios e aprovações | envio, aprovação, devolução e reabertura com versões; 9 relatórios em PDF | concluída |
| 6 — Finalização | alertas automáticos diários, limpeza de notificações, backup e restauração | concluída |

Testes no banco: autorização e integridade **92/92**, alertas automáticos **10/10**. As telas foram verificadas por capturas automatizadas (computador e celular) com dados simulados; a validação com dados reais é feita no site publicado.

## Alertas automáticos

Todos os dias às 07:05 (Brasília) o banco gera notificações (pg_cron → `private.run_daily_alerts()`):

- atividade atrasada → responsável e quem gerencia atividades;
- prazo de atividade ou ocorrência vencendo em até *N* dias (Configurações da empresa) → responsável;
- ocorrência vencida → responsável e quem gerencia ocorrências;
- ocorrência sem responsável há mais de 1 dia → quem gerencia ocorrências;
- obra em andamento sem diário há *N* dias úteis → gestores e quem preenche diários.

Cada aviso é enviado uma única vez por pessoa (não se repete todo dia). Aos domingos, notificações lidas há mais de 180 dias são apagadas.

## Backup

Veja [docs/BACKUP.md](docs/BACKUP.md). Resumo: o backup automático do Supabase (planos pagos) cobre o banco, mas **não** as fotos; use `tools/backup/` para uma cópia externa completa.

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
select tests.install_helpers(); select tests.run_autorizacao();
select tests.install_helpers(); select tests.run_alertas();      -- supabase/tests/alertas.sql
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
