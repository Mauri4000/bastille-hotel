-- ================================================================
-- BASTILLE HOTEL — Vitrina: fecha de vencimiento + subida de imágenes
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run
-- ================================================================

-- 1) Columna de fecha de vencimiento por producto
ALTER TABLE public.vitrina_products
  ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- 2) Bucket de Storage para las fotos subidas desde el panel
INSERT INTO storage.buckets (id, name, public)
VALUES ('vitrina-images', 'vitrina-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Políticas: cualquier usuario autenticado (personal con login) puede
--    subir/leer/borrar imágenes de este bucket. Lectura pública para que
--    las fotos se puedan mostrar en el panel sin problema.
DROP POLICY IF EXISTS "vitrina_images_public_read" ON storage.objects;
CREATE POLICY "vitrina_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vitrina-images');

DROP POLICY IF EXISTS "vitrina_images_auth_insert" ON storage.objects;
CREATE POLICY "vitrina_images_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'vitrina-images');

DROP POLICY IF EXISTS "vitrina_images_auth_update" ON storage.objects;
CREATE POLICY "vitrina_images_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'vitrina-images');

DROP POLICY IF EXISTS "vitrina_images_auth_delete" ON storage.objects;
CREATE POLICY "vitrina_images_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'vitrina-images');
