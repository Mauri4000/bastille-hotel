-- ================================================================
-- BASTILLE HOTEL — Vitrina: separar en Higiene y Alimentos
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run
-- ================================================================

-- 1) Columna de categoría (higiene / alimentos)
ALTER TABLE public.vitrina_products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'higiene';

ALTER TABLE public.vitrina_products
  DROP CONSTRAINT IF EXISTS vitrina_products_category_check;
ALTER TABLE public.vitrina_products
  ADD CONSTRAINT vitrina_products_category_check CHECK (category IN ('higiene', 'alimentos'));

-- 2) Clasificación automática de los productos ya existentes.
--    Todo queda en 'higiene' por defecto; esto solo pasa a 'alimentos'
--    los que son claramente comestibles/bebidas. Lo que quede mal
--    clasificado se puede corregir con un clic desde el panel.
UPDATE public.vitrina_products SET category = 'alimentos'
WHERE name IN (
  'AGUA',
  'CHOCOLATE DE DINOSAURIO',
  'CHOCOLATE PEQUEÑO',
  'DINOSAURIO',
  'ECO TEA',
  'GRAJEAS',
  'NUTRIGOMAS',
  'SUEROX',
  'SAL DE HIDRATACION VITA DRIL',
  'TABLETA DE CHOCOLATE BLANCO TABOADA 100g',
  'TABLETA DE CHOCOLATE PEQUEÑO TE AMO',
  'TABLETA DE CHOCOLATE TABOADA 100g',
  'TABLETA DE CHOCOLATE TABOADA PEQUEÑA',
  'TURRON CHOCOMANIES',
  'TURRON DE ALMENDRA',
  'TURRON DE COCO 40g'
);
