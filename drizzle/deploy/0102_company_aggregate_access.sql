-- Free company aggregate access. No employee management or seeker access.
CREATE TABLE IF NOT EXISTS companyAggregateAccess (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  domain VARCHAR(255) NOT NULL,
  verifiedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY company_aggregate_user_domain (userId, domain),
  CONSTRAINT company_aggregate_user_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS companyClaimChallenges (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  domain VARCHAR(255) NOT NULL,
  tokenHash VARCHAR(64) NOT NULL UNIQUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt TIMESTAMP NOT NULL,
  consumedAt TIMESTAMP NULL,
  INDEX company_claim_user_created (userId, createdAt),
  CONSTRAINT company_claim_user_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
