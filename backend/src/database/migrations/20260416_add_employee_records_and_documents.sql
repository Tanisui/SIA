ALTER TABLE employees ADD COLUMN birth_date DATE NULL AFTER name;
ALTER TABLE employees ADD COLUMN sex VARCHAR(32) NULL AFTER birth_date;
ALTER TABLE employees ADD COLUMN civil_status VARCHAR(32) NULL AFTER sex;
ALTER TABLE employees ADD COLUMN nationality VARCHAR(100) NULL AFTER civil_status;
ALTER TABLE employees ADD COLUMN mobile_number VARCHAR(32) NULL AFTER nationality;
ALTER TABLE employees ADD COLUMN present_address TEXT NULL AFTER mobile_number;
ALTER TABLE employees ADD COLUMN permanent_address TEXT NULL AFTER present_address;
ALTER TABLE employees ADD COLUMN position_title VARCHAR(150) NULL AFTER permanent_address;
ALTER TABLE employees ADD COLUMN department_name VARCHAR(150) NULL AFTER position_title;
ALTER TABLE employees ADD COLUMN employment_type ENUM('PROBATIONARY','REGULAR','CONTRACTUAL','PART_TIME','SEASONAL','INTERN') NULL AFTER hire_date;
ALTER TABLE employees ADD COLUMN pay_basis ENUM('DAILY','MONTHLY') NULL AFTER employment_status;
ALTER TABLE employees ADD COLUMN payroll_method ENUM('CASH','BANK_TRANSFER','E_WALLET') NULL AFTER pay_rate;
ALTER TABLE employees ADD COLUMN tin VARCHAR(64) NULL AFTER payroll_method;
ALTER TABLE employees ADD COLUMN sss_number VARCHAR(64) NULL AFTER tin;
ALTER TABLE employees ADD COLUMN philhealth_pin VARCHAR(64) NULL AFTER sss_number;
ALTER TABLE employees ADD COLUMN pagibig_mid VARCHAR(64) NULL AFTER philhealth_pin;
ALTER TABLE employees ADD COLUMN emergency_contact_name VARCHAR(255) NULL AFTER pagibig_mid;
ALTER TABLE employees ADD COLUMN emergency_contact_relationship VARCHAR(120) NULL AFTER emergency_contact_name;
ALTER TABLE employees ADD COLUMN emergency_contact_number VARCHAR(32) NULL AFTER emergency_contact_relationship;
ALTER TABLE employees ADD COLUMN emergency_contact_address TEXT NULL AFTER emergency_contact_number;

CREATE TABLE IF NOT EXISTS employee_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT UNSIGNED NOT NULL,
  file_id BIGINT UNSIGNED NULL,
  document_type VARCHAR(100) NOT NULL,
  document_number VARCHAR(255) NULL,
  issuing_agency VARCHAR(255) NULL,
  issue_date DATE NULL,
  expiry_date DATE NULL,
  status ENUM('NOT_SUBMITTED','SUBMITTED','VERIFIED','REJECTED','EXPIRED') DEFAULT 'NOT_SUBMITTED',
  remarks TEXT NULL,
  verified_by BIGINT UNSIGNED NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employee_documents_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_employee_documents_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_employee_documents_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_employee_documents_employee_type (employee_id, document_type),
  KEY idx_employee_documents_status (status),
  KEY idx_employee_documents_expiry_date (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
