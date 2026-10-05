-- Kept separate because PostgreSQL cannot safely use a freshly added enum
-- value until the transaction that adds it has committed.
alter type public.inventory_movement_type add value 'sale';
