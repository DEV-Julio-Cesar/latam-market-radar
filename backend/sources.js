import { validateObservation } from './domain.js';

// Source adapter contract: normalize(payload) returns a validated observation.
// A future authorized API can implement this same boundary. No remote collector exists.
export class ManualSource {
  name = 'manual';
  normalize(payload) { return validateObservation(payload); }
}
