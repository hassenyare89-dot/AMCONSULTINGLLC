-- Current truck location is now a full street address (address search), not only a city.
ALTER TABLE public.driver_registrations DROP CONSTRAINT IF EXISTS driver_registrations_location_len_chk;
ALTER TABLE public.driver_registrations ADD CONSTRAINT driver_registrations_location_len_chk
  CHECK (current_location IS NULL OR char_length(current_location) <= 300);
