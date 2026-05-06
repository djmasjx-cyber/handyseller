export interface WbMappingHealthConfig {
  cronDisabled: boolean;
  maxUsers: number;
  unmappedAlertThreshold: number;
  duplicateAlertThreshold: number;
  autoRepairEnabled: boolean;
  autoRepairMaxUnmapped: number;
  autoRepairLimit: number;
}

export function getWbMappingHealthConfig(): WbMappingHealthConfig {
  return {
    cronDisabled: process.env.WB_MAPPING_HEALTH_CRON_DISABLED === '1',
    maxUsers: Math.max(1, Math.min(200, Number(process.env.WB_MAPPING_HEALTH_MAX_USERS ?? 50))),
    unmappedAlertThreshold: Math.max(1, Number(process.env.WB_MAPPING_ALERT_UNMAPPED_THRESHOLD ?? 20)),
    duplicateAlertThreshold: Math.max(1, Number(process.env.WB_MAPPING_ALERT_DUPLICATES_THRESHOLD ?? 5)),
    autoRepairEnabled: process.env.WB_MAPPING_AUTO_REPAIR_ENABLED === '1',
    autoRepairMaxUnmapped: Math.max(1, Number(process.env.WB_MAPPING_AUTO_REPAIR_MAX_UNMAPPED ?? 30)),
    autoRepairLimit: Math.max(1, Math.min(150, Number(process.env.WB_MAPPING_AUTO_REPAIR_LIMIT ?? 50))),
  };
}
