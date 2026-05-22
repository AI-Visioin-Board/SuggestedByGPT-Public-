-- Add indexes and unique constraint to va_assignments for query performance and data integrity
ALTER TABLE `va_assignments`
  ADD UNIQUE INDEX `va_assignments_order_dir_uniq` (`orderId`, `directoryName`),
  ADD INDEX `va_assignments_assigned_status` (`assignedToUserId`, `status`),
  ADD INDEX `va_assignments_status` (`status`),
  ADD INDEX `va_assignments_created` (`createdAt`);
