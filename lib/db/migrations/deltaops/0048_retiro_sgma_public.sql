-- ===========================================================================
-- DGP-023.2 · Retiro definitivo de SGMA — eliminación de las 9 tablas legacy
-- del esquema public.*.
--
-- SGMA nunca llegó a producción; fue reemplazado por DeltaOps (producto único).
-- Estas tablas contenían exclusivamente datos de demostración (~52 filas),
-- respaldados con pg_dump antes de este DROP (FASE 1 de DGP-023.2).
--
-- SEGURIDAD (verificado por catálogo en DGP-023.1 y re-verificado en DGP-023.2
-- justo antes de aplicar): las 9 tablas NO tienen FKs (entrantes ni salientes),
-- NI vistas, NI triggers, NI funciones dependientes. NO existe referencia
-- cross-schema desde deltaops.* hacia public.*. El esquema public contiene
-- ÚNICAMENTE estas 9 tablas.
--
-- ALCANCE ESTRICTO: elimina SOLO las 9 tablas identificadas. NO se usa
-- DROP SCHEMA public CASCADE ni ningún comando destructivo global. El esquema
-- deltaops.* (174 tablas) permanece intacto, así como su RLS.
--
-- Las secuencias public.*_id_seq caen automáticamente con sus tablas (owned).
-- Se aplica con psql.
-- ===========================================================================

DROP TABLE IF EXISTS public.stock_movements;
DROP TABLE IF EXISTS public.work_orders;
DROP TABLE IF EXISTS public.maintenance_plans;
DROP TABLE IF EXISTS public.spare_parts;
DROP TABLE IF EXISTS public.assets;
DROP TABLE IF EXISTS public.technicians;
DROP TABLE IF EXISTS public.work_centers;
DROP TABLE IF EXISTS public.locations;
DROP TABLE IF EXISTS public.suppliers;
