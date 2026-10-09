#!/usr/bin/env bash
# Checagem de tipos do código do app (erros internos das bibliotecas-fonte são ignorados).
cd "$(dirname "$0")/../.."
out=$(node node_modules/typescript/bin/tsc -p tools/offline/tsconfig.offline.json --noEmit 2>&1)
app=$(echo "$out" | grep -E '^src/' )
if [ -n "$app" ]; then echo "$app"; echo "--- $(echo "$app" | grep -c 'error TS') erro(s) no app"; exit 1; fi
echo "ok: sem erros de tipo no app"
