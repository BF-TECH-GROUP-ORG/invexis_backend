-- Migration: Create event_outbox table for transactional outbox pattern
-- Database: invexis_sales
-- Service: sales-service

CREATE TABLE IF NOT EXISTS event_outbox (
  id CHAR(36) PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  exchange VARCHAR(255) NOT NULL,
  routing_key VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending', 'processing', 'sent', 'permanent_failed') NOT NULL DEFAULT 'pending',
  retries INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  locked_at TIMESTAMP NULL,
  last_attempt_at TIMESTAMP NULL,
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

