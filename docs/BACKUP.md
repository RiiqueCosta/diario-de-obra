# Backup e restauração

O Diário de Obra guarda dados em dois lugares, e **os dois precisam de backup**:

| O quê | Onde fica | Coberto pelo backup automático do Supabase? |
|---|---|---|
| Registros (obras, diários, ocorrências, usuários, auditoria…) | Postgres | Sim, nos planos pagos (diário; Pro guarda 7 dias). No plano gratuito **não há** backup automático. |
| Fotos e documentos | Storage, bucket privado `obra-arquivos` | **Não.** Os backups do banco guardam só a referência ao arquivo, não o arquivo. |

## Rotina recomendada

1. **Plano Pro do Supabase** (ou superior) para ter backup diário automático do banco. Para voltar a qualquer minuto, ative *Point-in-Time Recovery* (custo adicional).
2. **Cópia externa semanal**, guardada fora do Supabase (HD externo, nuvem da empresa):
   ```bash
   export SUPABASE_DB_URL='postgresql://postgres.<ref>:<SENHA>@aws-0-<região>.pooler.supabase.com:5432/postgres'
   bash tools/backup/backup-banco.sh                 # cria backups/AAAA-MM-DD_HHMM/
   export SUPABASE_URL=https://<ref>.supabase.co
   export SUPABASE_SECRET_KEY=<chave secreta>
   node tools/backup/backup-arquivos.mjs backups/AAAA-MM-DD_HHMM
   ```
   A pasta `backups/` contém dados pessoais (LGPD): guarde com acesso restrito e criptografia.
3. **Teste a restauração** a cada 3 meses num projeto Supabase separado (passos abaixo). Backup que nunca foi restaurado não é garantia.

## Restaurar num projeto novo

1. Crie o projeto Supabase de destino e aplique as migrações de `supabase/migrations/` em ordem.
2. Restaure os usuários do Auth **antes** dos dados (os perfis dependem deles):
   ```bash
   pg_restore --data-only --disable-triggers -d "$DESTINO_DB_URL" backups/<pasta>/auth.dump
   ```
3. Restaure os dados do sistema. Como as migrações já criaram as tabelas, restaure só os dados, com gatilhos desligados (para não registrar auditoria falsa nem bloquear diários aprovados):
   ```bash
   pg_restore --data-only --disable-triggers --schema=public -d "$DESTINO_DB_URL" backups/<pasta>/app.dump
   ```
   Se a restauração for no **mesmo** projeto (desfazer um erro), prefira o recurso de restauração do painel do Supabase (Database → Backups), que não exige estes passos.
4. Envie os arquivos:
   ```bash
   SUPABASE_URL=https://<ref-destino>.supabase.co SUPABASE_SECRET_KEY=<chave> \
     node tools/backup/restaurar-arquivos.mjs backups/<pasta>
   ```
5. Aponte o site para o novo projeto (variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no Vercel), refaça a *URL Configuration* do Auth e reimplante a Edge Function `convidar-usuario`.
6. Confira: entre com um usuário, abra um diário aprovado com fotos e gere um PDF. Rode `select tests.run_autorizacao();` (deve dar 0 falhas).

## Cuidados

- A chave secreta (`service_role`) ignora todas as regras de acesso. Use apenas no seu computador, nunca no site nem no Git.
- O arquivo `storage-meta.dump` serve só para conferência (lista de arquivos e tamanhos). Não o restaure: o envio dos arquivos recria esses registros.
- Fotos e documentos excluídos pelo sistema ficam apenas marcados como excluídos (o arquivo continua no Storage), e obras são arquivadas, não apagadas. Esses casos podem ser desfeitos sem backup. Rascunhos de diário descartados são apagados de verdade.
