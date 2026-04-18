import { SetMetadata } from '@nestjs/common';

export const TMS_ACCESS_KEY = 'tms_access_level';
export type TmsAccessLevel = 'read' | 'write';

export const TmsAccess = (level: TmsAccessLevel) => SetMetadata(TMS_ACCESS_KEY, level);
