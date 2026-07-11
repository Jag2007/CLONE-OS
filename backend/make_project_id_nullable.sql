-- Make project_id nullable in scenes table
-- Run this if synchronize doesn't automatically update the schema

ALTER TABLE scenes ALTER COLUMN project_id DROP NOT NULL;
