-- Políticas de acceso al bucket privado de soportes de permisos.
-- Archivos guardados como {user_id}/archivo.ext → la primera carpeta es el dueño.

CREATE POLICY "permiso_soportes_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'permiso-soportes'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "permiso_soportes_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'permiso-soportes'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "permiso_soportes_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'permiso-soportes'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "permiso_soportes_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'permiso-soportes'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin')
  )
);