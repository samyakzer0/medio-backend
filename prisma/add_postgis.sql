-- PostGIS setup + geography columns migration
-- Run AFTER `prisma migrate dev --name init`
-- File: prisma/migrations/add_postgis.sql

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography(Point) column to pharmacies
ALTER TABLE "Pharmacy"
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

-- Populate from existing lat/lng (and keep in sync via trigger)
UPDATE "Pharmacy"
  SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Trigger: keep location in sync when lat/lng updated
CREATE OR REPLACE FUNCTION sync_pharmacy_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pharmacy_location_sync ON "Pharmacy";
CREATE TRIGGER pharmacy_location_sync
  BEFORE INSERT OR UPDATE OF lat, lng ON "Pharmacy"
  FOR EACH ROW EXECUTE FUNCTION sync_pharmacy_location();

-- Add geography(Point) column to riders (for nearest-rider dispatch)
ALTER TABLE "Rider"
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

UPDATE "Rider"
  SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_rider_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_location_sync ON "Rider";
CREATE TRIGGER rider_location_sync
  BEFORE INSERT OR UPDATE OF lat, lng ON "Rider"
  FOR EACH ROW EXECUTE FUNCTION sync_rider_location();

-- Spatial index for fast radius queries
CREATE INDEX IF NOT EXISTS idx_pharmacy_location ON "Pharmacy" USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_rider_location    ON "Rider"    USING GIST (location);
