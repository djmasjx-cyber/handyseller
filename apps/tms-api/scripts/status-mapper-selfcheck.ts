import { strict as assert } from 'node:assert';
import {
  extractCarrierStatusHint,
  normalizeCarrierShipmentStatus,
} from '../src/modules/shipments/status-mapper';

function run(): void {
  assert.equal(
    normalizeCarrierShipmentStatus('confirmed', 'cdek', 'refresh').status,
    'CONFIRMED',
    'canonical normalization should keep confirmed',
  );
  assert.equal(
    normalizeCarrierShipmentStatus('order not found', 'cdek', 'refresh').status,
    'DELETED_EXTERNAL',
    'cdek not-found should map to deleted external',
  );
  assert.equal(
    normalizeCarrierShipmentStatus('cancelled', 'dellin', 'webhook').status,
    'DELETED_EXTERNAL',
    'dellin cancelled should map to deleted external',
  );
  assert.equal(
    normalizeCarrierShipmentStatus('ВРУЧЕН', 'major-express', 'refresh').status,
    'DELIVERED',
    'russian delivered keyword should map to delivered',
  );
  assert.equal(
    normalizeCarrierShipmentStatus('mystery_status', 'cdek', 'refresh').status,
    null,
    'unknown status should not force overwrite',
  );

  const hint = extractCarrierStatusHint({
    payload: { state: 'in_transit' },
  });
  assert.equal(hint, 'in_transit', 'status hint should be extracted from nested payload');

  // eslint-disable-next-line no-console
  console.log('status-mapper-selfcheck: OK');
}

run();
