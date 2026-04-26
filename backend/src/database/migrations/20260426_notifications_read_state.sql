-- Migration: add read_at + (optional) title/body columns so notifications can be
-- displayed inline in the topbar bell menu and tracked as read/unread per user.

ALTER TABLE `notifications`
  ADD COLUMN `read_at`    TIMESTAMP NULL DEFAULT NULL AFTER `sent_at`,
  ADD COLUMN `title`      VARCHAR(255) NULL AFTER `type`,
  ADD COLUMN `body`       TEXT NULL AFTER `title`,
  ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `read_at`;
