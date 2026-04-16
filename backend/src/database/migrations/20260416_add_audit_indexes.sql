CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100) NULL,
  resource_id VARCHAR(255) NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @idx_created_at := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND index_name = 'idx_audit_logs_created_at'
);
SET @sql_created_at := IF(@idx_created_at = 0, 'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_created_at (created_at)', 'SELECT 1');
PREPARE stmt_created_at FROM @sql_created_at;
EXECUTE stmt_created_at;
DEALLOCATE PREPARE stmt_created_at;

SET @idx_user_created_at := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND index_name = 'idx_audit_logs_user_created_at'
);
SET @sql_user_created_at := IF(@idx_user_created_at = 0, 'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_user_created_at (user_id, created_at)', 'SELECT 1');
PREPARE stmt_user_created_at FROM @sql_user_created_at;
EXECUTE stmt_user_created_at;
DEALLOCATE PREPARE stmt_user_created_at;

SET @idx_resource_created_at := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND index_name = 'idx_audit_logs_resource_created_at'
);
SET @sql_resource_created_at := IF(@idx_resource_created_at = 0, 'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_resource_created_at (resource_type, created_at)', 'SELECT 1');
PREPARE stmt_resource_created_at FROM @sql_resource_created_at;
EXECUTE stmt_resource_created_at;
DEALLOCATE PREPARE stmt_resource_created_at;

SET @idx_action_created_at := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_logs'
    AND index_name = 'idx_audit_logs_action_created_at'
);
SET @sql_action_created_at := IF(@idx_action_created_at = 0, 'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_action_created_at (action, created_at)', 'SELECT 1');
PREPARE stmt_action_created_at FROM @sql_action_created_at;
EXECUTE stmt_action_created_at;
DEALLOCATE PREPARE stmt_action_created_at;
