-- Reversa de Migración H-17 (Segunda Parte: Cobertura Restante)
-- Elimina las restricciones CHECK de finitud agregadas por 20261123_02_h17_cobertura_restante.sql

BEGIN;

ALTER TABLE public.simulations DROP CONSTRAINT IF EXISTS chk_simulations_finite_unit_cost;
ALTER TABLE public.simulations DROP CONSTRAINT IF EXISTS chk_simulations_finite_quantity;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_finite_units_sold;

COMMIT;
