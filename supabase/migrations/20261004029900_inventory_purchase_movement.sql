-- Kept separate from the purchase schema because a newly added enum value
-- cannot be used safely until this migration has committed.
alter type public.inventory_movement_type add value 'purchase';
