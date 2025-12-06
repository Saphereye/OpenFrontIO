/**
 * Global parameter store for the procedurally generated "Generated" map.
 * Provides defaults, immutable reads, setters with validation, and subscriptions
 * so UI sliders (octaves, lacunarity, persistence, threshold, seed, etc.)
 * can update generation in a predictable way.
 */

export type GeneratedParams = {
  // Noise configuration
  octaves: number; // number of noise layers
  lacunarity: number; // frequency multiplier between octaves
  persistence: number; // amplitude multiplier between octaves
  landThreshold: number; // threshold for land (0-1 range)
  seed: number; // deterministic seed for map generation
  contrastGamma: number; // elevation contrast exponent (gamma)

  // Map dimensions (Normal, 4x, 16x); kept here for now to keep all config in one place
  width: number; // normal map width
  height: number; // normal map height
  width4x: number; // 4x map width
  height4x: number; // 4x map height
  width16x: number; // 16x map width
  height16x: number; // 16x map height

  // Post-processing
  minLandRegionSize: number; // remove land blobs smaller than this
  minWaterRegionSize: number; // fill water blobs smaller than this
  smoothingRadius: number; // blur radius for magnitude smoothing (0-2)
  ridgeAccent: boolean; // accentuate local maxima after smoothing
};

/**
 * Reasonable defaults for fast generation and decent-looking landmasses.
 * These can be tuned by sliders in the options menu.
 */
const defaultParams: GeneratedParams = {
  // Noise config
  octaves: 5,
  lacunarity: 2.0,
  persistence: 0.6,
  landThreshold: 0.46,
  seed: 123456789, // default deterministic seed
  contrastGamma: 0.8, // more contrast by default

  // Dimensions
  width: 512,
  height: 256,
  width4x: 1024,
  height4x: 512,
  width16x: 2048,
  height16x: 1024,

  // Post-processing
  minLandRegionSize: 30,
  minWaterRegionSize: 200,
  smoothingRadius: 1,
  ridgeAccent: true,
};

/**
 * Very small observable store for GeneratedParams.
 * - get(): returns a cloned, immutable snapshot
 * - set(): partial updates with validation & notification
 * - reset(): restore defaults with notification
 * - subscribe(): listen to changes; returns an unsubscribe function
 */
class GeneratedParamsStore {
  private params: GeneratedParams;
  private subscribers: Set<(p: GeneratedParams) => void>;

  constructor(initial: GeneratedParams) {
    this.params = { ...initial };
    this.subscribers = new Set();
  }

  /**
   * Immutable snapshot of current parameters.
   */
  public get(): Readonly<GeneratedParams> {
    return { ...this.params };
  }

  /**
   * Update parameters partially. Performs clamping/validation where appropriate.
   * Notifies subscribers only if at least one value changes.
   */
  public set(update: Partial<GeneratedParams>): Readonly<GeneratedParams> {
    const next = { ...this.params };

    // Noise config
    if (update.octaves !== undefined) {
      // Clamp octaves to [1, 12] to keep generation reasonable
      next.octaves = Math.max(1, Math.min(12, Math.floor(update.octaves)));
    }
    if (update.lacunarity !== undefined) {
      // Clamp lacunarity to [1.0, 5.0]
      next.lacunarity = clamp(update.lacunarity, 1.0, 5.0);
    }
    if (update.persistence !== undefined) {
      // Clamp persistence to [0.1, 1.0]
      next.persistence = clamp(update.persistence, 0.1, 1.0);
    }
    if (update.landThreshold !== undefined) {
      // Threshold in [0.0, 1.0]
      next.landThreshold = clamp(update.landThreshold, 0.0, 1.0);
    }
    if (update.seed !== undefined) {
      // Keep seed in 32-bit unsigned range
      next.seed = toUint32(update.seed);
    }
    if (update.contrastGamma !== undefined) {
      // Elevation contrast exponent in [0.5, 1.5]
      next.contrastGamma = clamp(update.contrastGamma, 0.5, 1.5);
    }

    // Dimensions (avoid absurd values to keep performance sane)
    if (update.width !== undefined) {
      // Fixed map size: ignore width updates
    }
    if (update.height !== undefined) {
      // Fixed map size: ignore height updates
    }
    if (update.width4x !== undefined) {
      // Fixed map size: ignore 4x width updates
    }
    if (update.height4x !== undefined) {
      // Fixed map size: ignore 4x height updates
    }
    if (update.width16x !== undefined) {
      // Fixed map size: ignore 16x width updates
    }
    if (update.height16x !== undefined) {
      // Fixed map size: ignore 16x height updates
    }

    // Post-processing
    if (update.minLandRegionSize !== undefined) {
      next.minLandRegionSize = clampInt(update.minLandRegionSize, 0, 10000);
    }
    if (update.minWaterRegionSize !== undefined) {
      next.minWaterRegionSize = clampInt(update.minWaterRegionSize, 0, 10000);
    }
    if (update.smoothingRadius !== undefined) {
      next.smoothingRadius = clampInt(update.smoothingRadius, 0, 2);
    }
    if (update.ridgeAccent !== undefined) {
      next.ridgeAccent = Boolean(update.ridgeAccent);
    }

    // Only notify if something actually changed
    if (!generatedParamsEqual(this.params, next)) {
      this.params = next;
      this.notify();
    }

    return this.get();
  }

  /**
   * Reset to defaults and notify subscribers.
   */
  public reset(): Readonly<GeneratedParams> {
    this.params = { ...defaultParams };
    this.notify();
    return this.get();
  }

  /**
   * Subscribe to parameter changes. Returns an unsubscribe function.
   */
  public subscribe(fn: (params: GeneratedParams) => void): () => void {
    this.subscribers.add(fn);
    // Optionally emit current state immediately so UI can sync
    fn(this.get());
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notify(): void {
    const snapshot = this.get();
    for (const fn of this.subscribers) {
      try {
        fn(snapshot);
      } catch (err) {
        // Swallow subscriber errors to avoid breaking the store

        console.error("GeneratedParams subscriber error:", err);
      }
    }
  }
}

// Utilities
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clampInt(n: number, min: number, max: number): number {
  const v = Math.floor(n);
  return Math.max(min, Math.min(max, v));
}

function toUint32(n: number): number {
  // Normalize to 32-bit unsigned
  return Math.floor(n) >>> 0;
}

function generatedParamsEqual(a: GeneratedParams, b: GeneratedParams): boolean {
  return (
    a.octaves === b.octaves &&
    a.lacunarity === b.lacunarity &&
    a.persistence === b.persistence &&
    a.landThreshold === b.landThreshold &&
    a.seed === b.seed &&
    a.contrastGamma === b.contrastGamma &&
    a.width === b.width &&
    a.height === b.height &&
    a.width4x === b.width4x &&
    a.height4x === b.height4x &&
    a.width16x === b.width16x &&
    a.height16x === b.height16x &&
    a.minLandRegionSize === b.minLandRegionSize &&
    a.minWaterRegionSize === b.minWaterRegionSize &&
    a.smoothingRadius === b.smoothingRadius &&
    a.ridgeAccent === b.ridgeAccent
  );
}

// Singleton instance that can be imported anywhere
export const GeneratedParams = new GeneratedParamsStore(defaultParams);

// Export defaults for potential UI reset buttons, etc.
export const DefaultGeneratedParams: Readonly<GeneratedParams> = {
  ...defaultParams,
};
