-- ============================================================================
-- CUADRO DE TURNO (Fase 1 base) — migración ADITIVA, no destructiva.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shift_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  start_time TIME,
  end_time TIME,
  hours NUMERIC NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#64748b',
  active BOOLEAN NOT NULL DEFAULT true,
  observation TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shift_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  dependency TEXT NOT NULL DEFAULT 'Referencia y Contrarreferencia',
  base_hours NUMERIC NOT NULL DEFAULT 176,
  status TEXT NOT NULL DEFAULT 'borrador',
  notes TEXT,
  elaborated_by TEXT,
  approved_by_name TEXT,
  created_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, month, dependency)
);

CREATE TABLE IF NOT EXISTS public.shift_schedule_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.shift_schedules(id) ON DELETE CASCADE,
  user_id UUID,
  full_name TEXT NOT NULL DEFAULT '',
  identification_number TEXT,
  role_name TEXT,
  sede TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  base_hours NUMERIC,
  pending_hours NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shift_members_schedule ON public.shift_schedule_members(schedule_id);

CREATE TABLE IF NOT EXISTS public.shift_schedule_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.shift_schedules(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.shift_schedule_members(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 31),
  shift_date DATE,
  shift_code TEXT,
  hours NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  origin TEXT NOT NULL DEFAULT 'edicion_directa',
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member_id, day_number)
);
CREATE INDEX IF NOT EXISTS idx_shift_days_schedule ON public.shift_schedule_days(schedule_id);

CREATE TABLE IF NOT EXISTS public.shift_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_type TEXT NOT NULL DEFAULT 'permiso',
  requester_id UUID NOT NULL,
  requester_name TEXT,
  requester_identification TEXT,
  requester_role TEXT,
  requester_sede TEXT,
  status TEXT NOT NULL DEFAULT 'PENDIENTE',
  reason_type TEXT,
  other_reason TEXT,
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  will_recover_time BOOLEAN NOT NULL DEFAULT false,
  requires_replacement BOOLEAN NOT NULL DEFAULT false,
  replacement_name TEXT,
  replacement_role TEXT,
  paid BOOLEAN,
  original_shift_date DATE,
  original_shift_code TEXT,
  requested_shift_date DATE,
  requested_shift_code TEXT,
  swap_user_id UUID,
  swap_partner_name TEXT,
  reason_detail TEXT,
  observations TEXT,
  requester_signature_id UUID,
  requester_signature_hash TEXT,
  register_absenteeism BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejected_by UUID,
  rejected_at TIMESTAMPTZ,
  approval_observation TEXT,
  rejection_reason TEXT,
  response_observation TEXT,
  out_of_rule_justification TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shift_requests_requester ON public.shift_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_shift_requests_status ON public.shift_requests(status);

CREATE TABLE IF NOT EXISTS public.shift_request_recovery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.shift_requests(id) ON DELETE CASCADE,
  recovery_date DATE,
  start_time TIME,
  end_time TIME,
  verified_by TEXT,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recovery_request ON public.shift_request_recovery_logs(request_id);

CREATE TABLE IF NOT EXISTS public.user_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  signature_path TEXT,
  signature_hash TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_signatures_user ON public.user_signatures(user_id);

CREATE TABLE IF NOT EXISTS public.shift_absenteeism_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.shift_requests(id) ON DELETE SET NULL,
  user_id UUID,
  registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
  identification_number TEXT,
  worker_name TEXT,
  role_name TEXT,
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  minutes_number INTEGER NOT NULL DEFAULT 0,
  days_number NUMERIC NOT NULL DEFAULT 0,
  event_code TEXT,
  event_name TEXT,
  reason TEXT,
  eps TEXT,
  arl TEXT,
  daily_salary NUMERIC,
  required_resources TEXT,
  additional_details TEXT,
  origin TEXT NOT NULL DEFAULT 'registro_manual',
  status TEXT NOT NULL DEFAULT 'activo',
  annulled_reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_absenteeism_user ON public.shift_absenteeism_records(user_id);

CREATE TABLE IF NOT EXISTS public.shift_request_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.shift_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  user_id UUID,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_request_audit_request ON public.shift_request_audit(request_id);

-- ===== GRANTS =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_schedule_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_schedule_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_request_recovery_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_signatures TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_absenteeism_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_request_audit TO authenticated;
GRANT ALL ON public.shift_types, public.shift_schedules, public.shift_schedule_members,
  public.shift_schedule_days, public.shift_requests, public.shift_request_recovery_logs,
  public.user_signatures, public.shift_absenteeism_records, public.shift_request_audit
  TO service_role;

-- ===== RLS =====
ALTER TABLE public.shift_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_schedule_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_schedule_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_request_recovery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_absenteeism_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_request_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "st_select" ON public.shift_types FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));
CREATE POLICY "st_insert" ON public.shift_types FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "st_update" ON public.shift_types FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "st_delete" ON public.shift_types FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sch_select" ON public.shift_schedules FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));
CREATE POLICY "sch_write" ON public.shift_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "schm_select" ON public.shift_schedule_members FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));
CREATE POLICY "schm_write" ON public.shift_schedule_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "schd_select" ON public.shift_schedule_days FOR SELECT TO authenticated
  USING (public.is_active_member(auth.uid()));
CREATE POLICY "schd_write" ON public.shift_schedule_days FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "req_select" ON public.shift_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "req_insert" ON public.shift_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND public.is_active_member(auth.uid()));
CREATE POLICY "req_update_own" ON public.shift_requests FOR UPDATE TO authenticated
  USING (requester_id = auth.uid()) WITH CHECK (requester_id = auth.uid());
CREATE POLICY "req_update_admin" ON public.shift_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rec_select" ON public.shift_request_recovery_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.shift_requests r WHERE r.id = request_id AND r.requester_id = auth.uid()));
CREATE POLICY "rec_insert" ON public.shift_request_recovery_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.shift_requests r WHERE r.id = request_id AND r.requester_id = auth.uid()));
CREATE POLICY "rec_admin_write" ON public.shift_request_recovery_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sig_select" ON public.user_signatures FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sig_insert" ON public.user_signatures FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sig_update" ON public.user_signatures FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sig_delete" ON public.user_signatures FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "abs_admin_all" ON public.shift_absenteeism_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ra_select" ON public.shift_request_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.shift_requests r WHERE r.id = request_id AND r.requester_id = auth.uid()));
CREATE POLICY "ra_insert" ON public.shift_request_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member(auth.uid()));

-- ===== TRIGGERS updated_at =====
CREATE TRIGGER trg_shift_types_updated BEFORE UPDATE ON public.shift_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shift_schedules_updated BEFORE UPDATE ON public.shift_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shift_members_updated BEFORE UPDATE ON public.shift_schedule_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shift_requests_updated BEFORE UPDATE ON public.shift_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_user_signatures_updated BEFORE UPDATE ON public.user_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_absenteeism_updated BEFORE UPDATE ON public.shift_absenteeism_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== CONVENCIONES INICIALES (TH-FR-10) =====
INSERT INTO public.shift_types (code, name, start_time, end_time, hours, color, observation)
VALUES
  ('ADM', 'Administrativo', '07:00', '14:00', 7, '#2563eb', 'Turno administrativo'),
  ('M',   'Mañana',         '07:00', '14:00', 7, '#16a34a', NULL),
  ('T',   'Tarde',          '14:00', '19:00', 5, '#f59e0b', NULL),
  ('N',   'Noche',          '19:00', '07:00', 12, '#7c3aed', NULL),
  ('M/T', 'Mañana/Tarde',   '07:00', '19:00', 12, '#0891b2', NULL),
  ('D',   'Descanso',       NULL, NULL, 0, '#94a3b8', 'Día de descanso')
ON CONFLICT (code) DO NOTHING;

-- ===== POLÍTICAS BUCKET PRIVADO 'firmas' (storage.objects) =====
CREATE POLICY "firmas_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'firmas' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "firmas_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'firmas' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "firmas_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'firmas' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "firmas_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'firmas' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
