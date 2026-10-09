#!/usr/bin/env bash
# Backup lógico do banco do Diário de Obra (estrutura + dados), para guardar fora do Supabase.
# Rode no SEU computador (nunca no navegador). Requer pg_dump 17 ou superior.
#
#   export SUPABASE_DB_URL='postgresql://postgres.<ref>:<SENHA>@aws-0-<região>.pooler.supabase.com:5432/postgres'
#   bash tools/backup/backup-banco.sh            # gera backups/AAAA-MM-DD_HHMM/
#
# A string de conexão fica em Supabase → Project Settings → Database → Connection string (modo "Session").
set -euo pipefail
: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL (veja o cabeçalho deste arquivo)}"
dest="backups/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$dest"
umask 077

# Esquemas do sistema: public (dados), private (regras de acesso) e os usuários do Auth.
pg_dump "$SUPABASE_DB_URL" --schema=public --schema=private --no-owner --no-privileges -Fc -f "$dest/app.dump"
pg_dump "$SUPABASE_DB_URL" --data-only --table=auth.users --table=auth.identities -Fc -f "$dest/auth.dump"
# Metadados dos arquivos (o conteúdo das fotos vem do script de Storage).
pg_dump "$SUPABASE_DB_URL" --data-only --table=storage.objects -Fc -f "$dest/storage-meta.dump"

( cd "$dest" && sha256sum *.dump > SHA256SUMS )
echo "Backup do banco salvo em $dest"
echo "Lembrete: rode também 'node tools/backup/backup-arquivos.mjs $dest' para copiar as fotos e documentos."
