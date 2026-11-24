# Scripts de Reversa (Rollbacks)
Archivos SQL para revertir de forma controlada las migraciones de base de datos de la Fase 4 (H-17).
NO deben aplicarse junto con las migraciones ordinarias de `supabase/migrations/` ni por herramientas CI/CD.
En caso de requerir un rollback manual, deben ejecutarse estrictamente en orden inverso:
1. `20261123_02_h17_cobertura_restante_reversa.sql` y posteriormente 2. `20261123_01_h17_reversa.sql`.
