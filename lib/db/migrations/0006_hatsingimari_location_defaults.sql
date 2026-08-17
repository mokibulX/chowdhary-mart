-- New records use Hatsingimari, Assam, India when no location is supplied.
-- Existing customer addresses and store locations are intentionally preserved.
ALTER TABLE addresses ALTER COLUMN city SET DEFAULT 'Hatsingimari';
ALTER TABLE addresses ALTER COLUMN state SET DEFAULT 'Assam';
ALTER TABLE addresses ALTER COLUMN pincode SET DEFAULT '783135';
ALTER TABLE stores ALTER COLUMN city SET DEFAULT 'Hatsingimari';
ALTER TABLE stores ALTER COLUMN pincode SET DEFAULT '783135';
