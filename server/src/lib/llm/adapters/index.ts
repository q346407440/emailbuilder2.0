import type { Vendor } from '../modelConfig.js';
import { doubaoAdapter } from './doubaoAdapter.js';
import { qwenAdapter } from './qwenAdapter.js';
import type { VendorAdapter } from './types.js';

export type { LlmRequest, LlmStreamCallbacks, VendorAdapter } from './types.js';

export function getVendorAdapter(vendor: Vendor): VendorAdapter {
  switch (vendor) {
    case 'qwen':
      return qwenAdapter;
    case 'doubao':
      return doubaoAdapter;
    default:
      throw new Error(`Unsupported vendor: ${vendor}`);
  }
}
