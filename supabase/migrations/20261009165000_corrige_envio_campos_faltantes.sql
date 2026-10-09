-- Corrige a montagem da lista de campos faltantes em submit_daily_report:
-- "texto[] || 'literal'" era interpretado como concatenação de arrays e gerava
-- "malformed array literal" em vez da mensagem amigável. Usa array_append.
-- (Os arquivos de migração anteriores já trazem a versão corrigida para instalações novas.)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.submit_daily_report(uuid, integer)'::regprocedure);
  d := regexp_replace(d, 'v_missing := v_missing \|\| (''[^'']*'')', 'v_missing := array_append(v_missing, \1)', 'g');
  execute d;
end $$;
