-- ============================================================
-- Historial de Casos · fuente canónica de UNIDADES VISUALES
-- security_invoker => RLS de las tablas subyacentes se conserva.
-- ============================================================

create or replace function public.hist_sin_tildes(_t text)
returns text language sql immutable set search_path = '' as $$
  select upper(translate(coalesce(_t,''),
    'áéíóúüÁÉÍÓÚÜñÑ','aeiouuAEIOUUnN'))
$$;

-- ---------- ENTRANTES: eventos (vivos + históricos) ----------
create or replace view public.v_hist_entrantes_eventos
with (security_invoker = true) as
select
  c.id::text                                          as ev_id,
  upper(coalesce(nullif(c.cod_ref,''), nullif(c.codigo,''), c.id::text)) as unit_key,
  c.created_at,
  c.cod_ref,
  upper(coalesce(c.tipo,''))                          as tipo_u,
  coalesce(c.estado,'')                               as estado_txt,
  c.documento,
  c.fecha::timestamptz                                as fecha_funcional,
  coalesce(c.unidad,'')                               as sede_txt,
  coalesce(c.unidad,'')||' '||coalesce(c.especialidad,'') as servicio_txt,
  lower(concat_ws(' ', c.codigo, c.documento, c.nombres, c.apellidos, c.ips)) as haystack
from public.casos_entrantes c
union all
select
  'hist-'||h.id::text,
  upper(coalesce(nullif(h.radicado,''), h.id::text)),
  h.created_at,
  null::text,
  upper(coalesce(h.tipo_caso, h.fuente_hoja, 'HIST')),
  coalesce(h.estado,''),
  h.documento,
  h.fecha::timestamptz,
  '',
  '',
  lower(concat_ws(' ', h.radicado, h.documento, h.paciente, h.ips))
from public.historicos_casos h
where h.seccion = 'entrante' and coalesce(h.archivado,false) = false;

-- ---------- Unidades normalizadas de los 4 módulos ----------
create or replace view public.v_hist_unidades
with (security_invoker = true) as
with ev as (select * from public.v_hist_entrantes_eventos),
agg as (
  select unit_key,
         string_agg(tipo_u,' ')      as tipos,
         string_agg(haystack,' ')    as haystack,
         array_agg(ev_id)            as ids
  from ev group by unit_key
)
select
  'ENTRANTES'::text as modulo,
  a.unit_key,
  a.ids,
  b.fecha_funcional,
  b.created_at      as orden_at,
  coalesce(b.documento,'') as documento,
  a.tipos           as tipo_txt,
  b.estado_txt,
  b.sede_txt,
  b.servicio_txt,
  ''::text          as subtipo,
  a.haystack
from agg a
cross join lateral (
  select * from ev e where e.unit_key = a.unit_key
  order by (e.cod_ref is not null), e.created_at limit 1
) b

union all
-- ---------- SALIENTES ----------
select 'SALIENTES', r.id::text, array[r.id::text], r.fecha_inicio, r.created_at,
  coalesce(r.documento,''),
  coalesce(r.estado,''), coalesce(r.estado,''), '',
  coalesce(r.servicio,'')||' '||coalesce(r.especialidades_receptoras,''), '',
  lower(concat_ws(' ', r.codigo_radicacion, r.documento, r.paciente, r.ips_receptora, r.servicio))
from public.remisiones r
union all
select 'SALIENTES', 'hist-'||h.id::text, array['hist-'||h.id::text],
  h.fecha::timestamptz, h.created_at, coalesce(h.documento,''),
  coalesce(h.estado,''), coalesce(h.estado,''), '', '', '',
  lower(concat_ws(' ', h.radicado, h.documento, h.paciente, h.ips))
from public.historicos_casos h
where h.seccion = 'saliente' and coalesce(h.archivado,false) = false
  and not (public.hist_sin_tildes(concat_ws(' ',h.seccion,h.tipo_caso,h.fuente_hoja,h.fuente_archivo)) ~ '\m(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\M'
        or public.hist_sin_tildes(coalesce(h.detalle,'')) ~ '\m(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\M'
        or public.hist_sin_tildes(concat_ws(' ',h.seccion,h.tipo_caso,h.fuente_hoja,h.fuente_archivo)) ~ '\mESPECIALES?\M')
  and not (public.hist_sin_tildes(concat_ws(' ',h.seccion,h.tipo_caso,h.fuente_hoja,h.fuente_archivo)) ~ '\m(REF\.?\s*INTERNA|REFERENCIA\s*INTERNA|INTERNA)\M')

union all
-- ---------- ATENCION DOMICILIARIA ----------
select 'ATENCION_DOMICILIARIA', d.id::text, array[d.id::text], d.fecha_inicio, d.created_at,
  coalesce(d.documento,''), coalesce(d.estado,''), coalesce(d.estado,''), '',
  coalesce(d.servicio,'')||' '||coalesce(d.tipo_solicitud,'')||' '||coalesce(d.unidad_especial,''),
  upper(coalesce(d.tipo_solicitud,'')),
  lower(concat_ws(' ', d.paciente, d.documento, d.tipo_solicitud, d.eapb, d.codigo_radicacion))
from public.domiciliarios d
union all
select 'ATENCION_DOMICILIARIA', 'hist-'||h.id::text, array['hist-'||h.id::text],
  h.fecha::timestamptz, h.created_at, coalesce(h.documento,''),
  coalesce(h.estado,''), coalesce(h.estado,''), '', '', '',
  lower(concat_ws(' ', h.radicado, h.documento, h.paciente, h.ips))
from public.historicos_casos h
where coalesce(h.archivado,false) = false
  and (public.hist_sin_tildes(concat_ws(' ',h.seccion,h.tipo_caso,h.fuente_hoja,h.fuente_archivo)) ~ '\m(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\M'
    or public.hist_sin_tildes(coalesce(h.detalle,'')) ~ '\m(PHD|PAD|O2|OXIGENO|DOMICILIARIO|DOMICILIARIOS)\M'
    or public.hist_sin_tildes(concat_ws(' ',h.seccion,h.tipo_caso,h.fuente_hoja,h.fuente_archivo)) ~ '\mESPECIALES?\M')

union all
-- ---------- REFERENCIAS INTERNAS ----------
select 'REFERENCIAS_INTERNAS', i.id::text, array[i.id::text], i.fecha_inicio, i.created_at,
  coalesce(i.documento,''), coalesce(i.estado,''), coalesce(i.estado,''), '',
  coalesce(i.servicio,'')||' '||coalesce(i.tipo_solicitud,''), '',
  lower(concat_ws(' ', i.paciente, i.documento, i.tipo_solicitud, i.servicio, i.eapb))
from public.referencia_interna i
union all
select 'REFERENCIAS_INTERNAS', 'hist-'||h.id::text, array['hist-'||h.id::text],
  h.fecha::timestamptz, h.created_at, coalesce(h.documento,''),
  coalesce(h.estado,''), coalesce(h.estado,''), '', '', '',
  lower(concat_ws(' ', h.radicado, h.documento, h.paciente, h.ips))
from public.historicos_casos h
where coalesce(h.archivado,false) = false
  and public.hist_sin_tildes(concat_ws(' ',h.seccion,h.tipo_caso,h.fuente_hoja,h.fuente_archivo)) ~ '\m(REF\.?\s*INTERNA|REFERENCIA\s*INTERNA|INTERNA)\M';

grant select on public.v_hist_entrantes_eventos to authenticated;
grant select on public.v_hist_unidades to authenticated;

-- ---------- RPC canónica de listado ----------
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

  create temporary table if not exists _hist_tmp on commit drop as select 1;

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
revoke all on function public.hist_sin_tildes(text) from public, anon;
grant execute on function public.hist_sin_tildes(text) to authenticated;