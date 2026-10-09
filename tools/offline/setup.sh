#!/usr/bin/env bash
# Monta dependências locais para checagem de tipos e build SEM acesso ao npm.
# Uso apenas no ambiente de desenvolvimento assistido; em máquinas normais use `npm install`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NPM_TOOLS=${NPM_TOOLS:-/opt/npm-tools/node_modules}
VENDOR=${VENDOR:-/home/claude/vendor-src}
NM="$ROOT/node_modules"
mkdir -p "$NM/@types" "$NM/@supabase"
ln -sfn "$NPM_TOOLS/react" "$NM/react"
ln -sfn "$NPM_TOOLS/react-dom" "$NM/react-dom"
ln -sfn "$NPM_TOOLS/scheduler" "$NM/scheduler"
ln -sfn "$NPM_TOOLS/pdf-lib" "$NM/pdf-lib"
ln -sfn "$NPM_TOOLS/typescript" "$NM/typescript"
ln -sfn "$NPM_TOOLS/esbuild" "$NM/esbuild"
ln -sfn "$VENDOR/dt/types/react" "$NM/@types/react"
ln -sfn "$VENDOR/dt/types/react-dom" "$NM/@types/react-dom"
ln -sfn "$VENDOR/csstype" "$NM/csstype"
echo "ok: dependências offline ligadas em $NM"
