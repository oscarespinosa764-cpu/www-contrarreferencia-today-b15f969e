create or replace function public.historial_listado(
  _module text,
  _start timestamptz,
  _end timestamptz,
  _tipo text default null,
  _estado text default null,
  _sede text default null,
  _servicio text default null,
  _documento text default null,
  _term text default null,
  _subtype text default null,
  _page integer default 1,
  _page_size integer default 25
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  _mods text[];
  _sub text[];
  _page_s integer := case when _page_size in (10,25,50,100) then _page_size else 25 end;
  _pg integer := greatest(coalesce(_page,1),1);
  _total bigint;
  _missing bigint;
  _rows jsonb;
  _by jsonb;
begin
  if _module not in ('ENTRANTES','SALIENTES','ATENCION_DOMICILIARIA','REFERENCIAS_INTERNAS','GENERAL') then
    raise exception 'Modulo no autorizado';
  end if;
  _mods := case when _module = 'GENERAL'
    then array['ENTRANTES','SALIENTES','ATENCION_DOMICILIARIA','REFERENCIAS_INTERNAS']
    else array[_module] end;

  if _subtype is not null then
    _sub := case upper(_subtype)
      when 'PHD' then array['PHD']
      when 'PAD' then array['PAD']
      when 'O2' then array['O2','OXIGENO']
      when 'ESPECIALES' then array['ESPECIAL','ESPECIALES']
      else null end;
    if _sub is null then raise exception 'Subtipo no autorizado'; end if;
  end if;

  with base as (
    select u.* from public.v_hist_unidades u
    where u.modulo = any(_mods)
      and (_tipo is null or u.tipo_txt ilike '%'||_tipo||'%')
      and (_estado is null or u.estado_txt ilike '%'||_estado||'%')
      and (_sede is null or u.sede_txt = '' or public.hist_sin_tildes(u.sede_txt) like '%'||public.hist_sin_tildes(_sede)||'%')
      and (_servicio is null or public.hist_sin_tildes(u.servicio_txt) like '%'||public.hist_sin_tildes(_servicio)||'%')
      and (_documento is null or u.documento = _documento)
      and (_term is null or u.haystack like '%'||lower(_term)||'%')
      and (_sub is null or u.subtipo = any(_sub))
  ), periodo as (
    select * from base b
    where (_start is null and _end is null)
       or (b.fecha_funcional is not null
           and (_start is null or b.fecha_funcional >= _start)
           and (_end is null or b.fecha_funcional < _end))
  )
  select
    (select count(*) from periodo),
    (select count(*) from base where fecha_funcional is null),
    (select coalesce(jsonb_agg(x order by x.rn), '[]'::jsonb) from (
        select row_number() over (order by p.fecha_funcional desc nulls last, p.orden_at desc, p.modulo, p.unit_key) as rn,
               p.modulo, p.unit_key, p.ids, p.fecha_funcional
        from periodo p
        order by p.fecha_funcional desc nulls last, p.orden_at desc, p.modulo, p.unit_key
        offset (_pg-1)*_page_s limit _page_s
      ) x),
    (select coalesce(jsonb_object_agg(modulo, n), '{}'::jsonb)
       from (select modulo, count(*) as n from periodo group by modulo) y)
  into _total, _missing, _rows, _by;

  return jsonb_build_object(
    'rows', coalesce(_rows,'[]'::jsonb),
    'total', _total,
    'page', _pg,
    'pageSize', _page_s,
    'totalPages', greatest(1, ceil(_total::numeric / _page_s)::int),
    'hasNextPage', (_pg * _page_s) < _total,
    'hasPreviousPage', _pg > 1,
    'missingFunctionalDateCount', _missing,
    'totalsByModule', coalesce(_by,'{}'::jsonb)
  );
end;
$$;

revoke all on function public.historial_listado(text,timestamptz,timestamptz,text,text,text,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.historial_listado(text,timestamptz,timestamptz,text,text,text,text,text,text,text,integer,integer) to authenticated;