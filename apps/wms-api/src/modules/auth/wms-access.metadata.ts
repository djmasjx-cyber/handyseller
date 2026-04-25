import { SetMetadata } from '@nestjs/common';

export type WmsAccessLevel = 'read' | 'write' | 'admin';
export const WMS_ACCESS_KEY = 'wms:access';
export const WmsAccess = (level: WmsAccessLevel) => SetMetadata(WMS_ACCESS_KEY, level);
