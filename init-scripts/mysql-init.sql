-- File: init-scripts/mysql-init.sql
-- Additional MySQL initialization to ensure proper permissions

-- The MYSQL_USER environment variable already creates the user
-- But we need to ensure it has proper permissions

-- Grant additional privileges if needed
GRANT ALL PRIVILEGES ON salesdb.* TO 'invexis'@'%';

-- Ensure the user can connect from any host
CREATE USER IF NOT EXISTS 'invexis'@'localhost' IDENTIFIED BY 'invexispass';
GRANT ALL PRIVILEGES ON salesdb.* TO 'invexis'@'localhost';

-- Grant specific privileges that might be needed
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER ON salesdb.* TO 'invexis'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER ON salesdb.* TO 'invexis'@'localhost';

-- Flush privileges to apply changes
FLUSH PRIVILEGES;

-- Verify the user exists
SELECT User, Host FROM mysql.user WHERE User = 'invexis';