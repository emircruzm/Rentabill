-- Migración H-17 (Segunda Parte: Cobertura Restante)
-- Restricciones de finitud faltantes: products.units_sold y simulations (quantity, unit_cost)
-- Coincide exactamente con las restricciones definidas en supabase/rentabill_schema_v3.7.sql.

BEGIN;

-- 1. products (columna units_sold)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_finite_units_sold;
ALTER TABLE public.products ADD CONSTRAINT chk_products_finite_units_sold
    CHECK (public.is_finite_numeric(units_sold) AND units_sold >= 0);

-- 2. simulations (columnas quantity y unit_cost)
ALTER TABLE public.simulations DROP CONSTRAINT IF EXISTS chk_simulations_finite_quantity;
ALTER TABLE public.simulations ADD CONSTRAINT chk_simulations_finite_quantity
    CHECK (public.is_finite_numeric(quantity) AND quantity > 0);

ALTER TABLE public.simulations DROP CONSTRAINT IF EXISTS chk_simulations_finite_unit_cost;
ALTER TABLE public.simulations ADD CONSTRAINT chk_simulations_finite_unit_cost
    CHECK (public.is_finite_numeric(unit_cost) AND unit_cost >= 0);

COMMIT;
