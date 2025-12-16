-- Create known_users table for Sales service
-- Stores customer information separately to avoid data duplication in sales documents

CREATE TABLE IF NOT EXISTS known_users (
  knownUserId BIGINT AUTO_INCREMENT PRIMARY KEY,
  companyId CHAR(36) NOT NULL COMMENT 'UUID reference to company',
  customerId BIGINT NULL COMMENT 'Reference to ecommerce customer (null if not from ecommerce)',
  customerName VARCHAR(255) NOT NULL COMMENT 'Customer name - mandatory',
  customerPhone VARCHAR(20) NOT NULL COMMENT 'Customer phone - mandatory',
  customerEmail VARCHAR(255) NOT NULL COMMENT 'Customer email - mandatory',
  customerAddress TEXT NULL COMMENT 'Customer address - optional',
  isActive BOOLEAN DEFAULT TRUE COMMENT 'Soft delete flag',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_known_users_company_id (companyId),
  INDEX idx_known_users_customer_id (customerId),
  UNIQUE INDEX idx_known_users_company_phone (companyId, customerPhone),
  UNIQUE INDEX idx_known_users_company_email (companyId, customerEmail)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create index for active users queries
CREATE INDEX idx_known_users_is_active ON known_users(companyId, isActive);
