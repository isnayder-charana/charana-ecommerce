-- Se ejecuta solo la primera vez que arranca el contenedor (volumen vacío).

-- Base separada para los tests de integración.
CREATE DATABASE IF NOT EXISTS charanatech_test;

-- SOLO EN LOCAL: Prisma Migrate necesita crear una "shadow database" temporal
-- para comparar el esquema, así que el usuario de la app puede crear bases.
-- En AWS (RDS) el usuario de la app tendrá permisos mínimos.
GRANT ALL PRIVILEGES ON *.* TO 'charanatech'@'%';
FLUSH PRIVILEGES;
