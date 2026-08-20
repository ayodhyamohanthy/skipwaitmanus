UPDATE `referralRequests` AS `rr`
INNER JOIN `jobs` AS `j` ON `j`.`id` = `rr`.`jobId`
LEFT JOIN `profiles` AS `p` ON `p`.`workEmailDomain` = `j`.`company`
  AND `p`.`workEmailVerifiedAt` IS NOT NULL
  AND `p`.`accountType` = 'referrer'
SET `rr`.`waitingForCoverage` = TRUE,
    `rr`.`coverageQueuedAt` = COALESCE(`rr`.`coverageQueuedAt`, `rr`.`createdAt`)
WHERE `rr`.`status` = 'pending'
  AND `rr`.`referrerId` IS NULL
  AND `rr`.`waitingForCoverage` = FALSE
  AND `p`.`id` IS NULL;
