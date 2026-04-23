ALTER TABLE users ADD COLUMN first_name VARCHAR(120) NULL AFTER full_name;
ALTER TABLE users ADD COLUMN last_name VARCHAR(120) NULL AFTER first_name;

UPDATE users
SET
  first_name = COALESCE(NULLIF(TRIM(first_name), ''), NULLIF(TRIM(SUBSTRING_INDEX(COALESCE(NULLIF(full_name, ''), username, email, ''), ' ', 1)), '')),
  last_name = COALESCE(NULLIF(TRIM(last_name), ''), NULLIF(TRIM(SUBSTRING(COALESCE(NULLIF(full_name, ''), ''), LENGTH(SUBSTRING_INDEX(COALESCE(NULLIF(full_name, ''), ''), ' ', 1)) + 1)), ''))
WHERE first_name IS NULL OR TRIM(first_name) = '' OR last_name IS NULL;

ALTER TABLE employees ADD COLUMN first_name VARCHAR(120) NULL AFTER name;
ALTER TABLE employees ADD COLUMN last_name VARCHAR(120) NULL AFTER first_name;

UPDATE employees
SET
  first_name = COALESCE(NULLIF(TRIM(first_name), ''), NULLIF(TRIM(SUBSTRING_INDEX(COALESCE(NULLIF(name, ''), ''), ' ', 1)), '')),
  last_name = COALESCE(NULLIF(TRIM(last_name), ''), NULLIF(TRIM(SUBSTRING(COALESCE(NULLIF(name, ''), ''), LENGTH(SUBSTRING_INDEX(COALESCE(NULLIF(name, ''), ''), ' ', 1)) + 1)), ''))
WHERE first_name IS NULL OR TRIM(first_name) = '' OR last_name IS NULL;
