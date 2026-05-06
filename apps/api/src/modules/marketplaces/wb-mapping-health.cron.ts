import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramAlertService } from '../../common/monitoring/telegram-alert.service';
import { MarketplacesService } from './marketplaces.service';
import { getWbMappingHealthConfig } from './wb-mapping-health.config';

@Injectable()
export class WbMappingHealthCron {
  private readonly logger = new Logger(WbMappingHealthCron.name);

  constructor(
    private readonly marketplacesService: MarketplacesService,
    private readonly telegram: TelegramAlertService,
  ) {}

  async runManualCheckForUser(
    userId: string,
    options?: { withDryRunRepairPreview?: boolean; withApplyRepair?: boolean; repairLimit?: number; sendTelegram?: boolean },
  ) {
    const cfg = getWbMappingHealthConfig();
    const audit = await this.marketplacesService.getWbMappingAudit(userId);
    const unmapped = audit.summary.unmappedProducts;
    const duplicateTotal = audit.summary.duplicateNmIds + audit.summary.duplicateArticles;
    const needsAlert = unmapped >= cfg.unmappedAlertThreshold || duplicateTotal >= cfg.duplicateAlertThreshold;

    const repairLimit = Math.max(1, Math.min(150, Number(options?.repairLimit ?? cfg.autoRepairLimit)));
    const withDryRunRepairPreview = !!options?.withDryRunRepairPreview;
    const withApplyRepair = !!options?.withApplyRepair;
    let dryRunRepairPreview: Awaited<ReturnType<MarketplacesService['repairWbMappings']>> | null = null;
    let appliedRepair: Awaited<ReturnType<MarketplacesService['repairWbMappings']>> | null = null;

    if (withDryRunRepairPreview) {
      dryRunRepairPreview = await this.marketplacesService.repairWbMappings(userId, {
        limit: Math.min(repairLimit, Math.max(1, unmapped)),
        dryRun: true,
      });
    }

    if (withApplyRepair && unmapped > 0) {
      appliedRepair = await this.marketplacesService.repairWbMappings(userId, {
        limit: Math.min(repairLimit, unmapped),
        dryRun: false,
      });
    }

    if (options?.sendTelegram) {
      const lines: string[] = [
        'WB mapping manual health check',
        `userId: ${userId}`,
        `needsAlert: ${needsAlert ? 'yes' : 'no'}`,
        `unmapped: ${unmapped}, duplicateNmIds: ${audit.summary.duplicateNmIds}, duplicateArticles: ${audit.summary.duplicateArticles}`,
      ];
      if (dryRunRepairPreview) {
        lines.push(
          `dry-run: considered=${dryRunRepairPreview.summary.considered}, wouldFix=${dryRunRepairPreview.summary.wouldFix}, failed=${dryRunRepairPreview.summary.failed}, strategy=${dryRunRepairPreview.strategy}`,
        );
      }
      if (appliedRepair) {
        lines.push(
          `applied: fixed=${appliedRepair.summary.fixed}, notFound=${appliedRepair.summary.notFoundOnWb}, failed=${appliedRepair.summary.failed}, strategy=${appliedRepair.strategy}`,
        );
      }
      await this.telegram.sendOpsNotice(lines.join('\n'), {
        userId,
        needsAlert,
        summary: audit.summary,
      });
    }

    return {
      userId,
      needsAlert,
      summary: audit.summary,
      recommendations: audit.recommendations,
      suggestedActions: audit.suggestedActions,
      dryRunRepairPreview,
      appliedRepair,
    };
  }

  @Cron('30 1 * * *', { name: 'wb-mapping-health-check' })
  async runDailyHealthCheck() {
    const cfg = getWbMappingHealthConfig();
    if (cfg.cronDisabled) return;

    const wbConnections = await this.marketplacesService.findAllWbConnections();
    const users = wbConnections.slice(0, cfg.maxUsers).map((c) => c.userId);
    if (users.length === 0) return;

    let alertsCount = 0;
    let autoRepairRuns = 0;

    for (const userId of users) {
      try {
        const audit = await this.marketplacesService.getWbMappingAudit(userId);
        const unmapped = audit.summary.unmappedProducts;
        const duplicateTotal = audit.summary.duplicateNmIds + audit.summary.duplicateArticles;

        const needsAlert = unmapped >= cfg.unmappedAlertThreshold || duplicateTotal >= cfg.duplicateAlertThreshold;
        if (needsAlert) {
          alertsCount++;
          const lines: string[] = [
            'WB mapping health alert (daily cron)',
            `userId: ${userId}`,
            `unmapped: ${unmapped}, duplicateNmIds: ${audit.summary.duplicateNmIds}, duplicateArticles: ${audit.summary.duplicateArticles}`,
            `legacySkuWithoutMapping: ${audit.summary.legacySkuWithoutMapping}`,
          ];

          let repairPreview:
            | { considered: number; wouldFix: number; notFoundOnWb: number; failed: number; strategy: string }
            | undefined;

          if (cfg.autoRepairEnabled && unmapped > 0 && unmapped <= cfg.autoRepairMaxUnmapped) {
            const dryRun = await this.marketplacesService.repairWbMappings(userId, {
              limit: Math.min(cfg.autoRepairLimit, unmapped),
              dryRun: true,
            });
            repairPreview = {
              considered: dryRun.summary.considered,
              wouldFix: dryRun.summary.wouldFix,
              notFoundOnWb: dryRun.summary.notFoundOnWb,
              failed: dryRun.summary.failed,
              strategy: dryRun.strategy,
            };

            if (dryRun.summary.wouldFix > 0 && dryRun.summary.failed === 0) {
              const applied = await this.marketplacesService.repairWbMappings(userId, {
                limit: Math.min(cfg.autoRepairLimit, unmapped),
                dryRun: false,
              });
              autoRepairRuns++;
              lines.push(
                `auto-repair applied: fixed=${applied.summary.fixed}, notFound=${applied.summary.notFoundOnWb}, failed=${applied.summary.failed}, strategy=${applied.strategy}`,
              );
            }
          }

          if (repairPreview) {
            lines.push(
              `auto-repair preview: considered=${repairPreview.considered}, wouldFix=${repairPreview.wouldFix}, notFound=${repairPreview.notFoundOnWb}, failed=${repairPreview.failed}, strategy=${repairPreview.strategy}`,
            );
          }

          await this.telegram.sendOpsNotice(lines.join('\n'), {
            userId,
            summary: audit.summary,
            recommendations: audit.recommendations.slice(0, 5),
            suggestedActions: audit.suggestedActions.slice(0, 3),
          });
        }
      } catch (e) {
        this.logger.warn(
          `WB mapping health check failed for user=${userId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    this.logger.log(
      `WB mapping health cron completed: scanned=${users.length}, alerts=${alertsCount}, autoRepairs=${autoRepairRuns}`,
    );
  }
}
