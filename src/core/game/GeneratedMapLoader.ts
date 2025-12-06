import { GameMapType } from "./Game";
import { GameMapLoader, MapData } from "./GameMapLoader";
import { GeneratedParams } from "./GeneratedParams";
import { MapManifest, Nation } from "./TerrainMapLoader";

/**
 * GeneratedMapLoader produces an in-memory, procedurally generated terrain
 * using Simplex-like noise. It exposes the same interface as FetchGameMapLoader,
 * but without performing any network I/O.
 *
 * Notes:
 * - This is a basic generator intended for initial integration. It creates:
 *   - map (Normal): 1024 x 512
 *   - map4x (Compact/minimap reference): 2048 x 1024
 *   - map16x (Mini variant): 4096 x 2048
 * - The data buffers are 8-bit tile masks (0 for water, 1 for land),
 *   matching what genTerrainFromBin expects: data.length === width * height.
 * - Nations are intentionally left empty for MVP; the UI can handle it.
 * - Thumbnail is a tiny inline PNG data URL placeholder.
 *
 * Future:
 * - Replace this with server-side generation for multiplayer consistency.
 * - Add seeded generation, configurable land thresholds, biome layers, and
 *   nation placement logic.
 */

export class GeneratedMapLoader implements GameMapLoader {
  private maps: Map<GameMapType, MapData> = new Map();
  constructor(private readonly params?: any) {}

  public getMapData(map: GameMapType): MapData {
    if (map !== GameMapType.Generated) {
      throw new Error(
        `GeneratedMapLoader only supports GameMapType.Generated, received: ${map}`,
      );
    }

    const cached = this.maps.get(map);
    if (cached) return cached;

    // Generation params (read from explicit params first, fallback to store)
    const p = this.params ?? GeneratedParams.get();
    const seed = p.seed;
    const dims = {
      map: { width: p.width, height: p.height },
      map4x: { width: p.width4x, height: p.height4x },
      map16x: { width: p.width16x, height: p.height16x },
    };

    const mapBin = this.generateTerrainBin(
      dims.map.width,
      dims.map.height,
      seed,
      p.landThreshold,
    );
    const map4xBin = this.generateTerrainBin(
      dims.map4x.width,
      dims.map4x.height,
      seed + 101,
      p.landThreshold,
    );
    const map16xBin = this.generateTerrainBin(
      dims.map16x.width,
      dims.map16x.height,
      seed + 202,
      p.landThreshold,
    );

    const manifest: MapManifest = {
      name: "Generated",
      map: {
        width: dims.map.width,
        height: dims.map.height,
        num_land_tiles: this.countLand(mapBin),
      },
      map4x: {
        width: dims.map4x.width,
        height: dims.map4x.height,
        num_land_tiles: this.countLand(map4xBin),
      },
      map16x: {
        width: dims.map16x.width,
        height: dims.map16x.height,
        num_land_tiles: this.countLand(map16xBin),
      },
      nations: this.generateNations([]),
    };

    const data: MapData = {
      mapBin: async () => mapBin,
      map4xBin: async () => map4xBin,
      map16xBin: async () => map16xBin,
      manifest: async () => manifest,
      webpPath: async () => this.placeholderThumbnail(),
    };

    this.maps.set(map, data);
    return data;
  }

  // ---------------------------------------------------------------------------
  // Noise and terrain generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a binary terrain buffer width*height in length.
   * Each byte is 0 (water) or 1 (land).
   */
  private generateTerrainBin(
    width: number,
    height: number,
    seed: number,
    landThreshold: number,
  ): Uint8Array {
    const noise = new Simplex2D(seed);
    const out = new Uint8Array(width * height);

    // Multi-octave noise for richer continents. Values in [0,1].
    // Build octaves from GeneratedParams (octaves, lacunarity, persistence).
    const p = GeneratedParams.get();
    const baseFreq = 1 / 256;
    const baseAmp = 0.55;
    const octaves: Array<{ freq: number; amp: number }> = [];
    let ampSum = 0;
    for (let i = 0; i < p.octaves; i++) {
      const freq = baseFreq * Math.pow(p.lacunarity, i);
      const amp = baseAmp * Math.pow(p.persistence, i);
      octaves.push({ freq, amp });
      ampSum += amp;
    }
    // Prevent division by zero in normalization
    if (ampSum <= 0) ampSum = 1;

    let idx = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++, idx++) {
        let v = 0;
        for (const o of octaves) {
          v += o.amp * noise.noise(x * o.freq, y * o.freq);
        }
        // Normalize by total amplitude and map to [0,1]
        // Normalize by total amplitude, then apply contrast gamma to widen distribution
        v = (v / ampSum + 1) / 2;
        const gamma = (this.params ?? GeneratedParams.get()).contrastGamma;
        v = Math.pow(Math.min(1, Math.max(0, v)), gamma);

        const isLand = v > landThreshold;

        // Map magnitude relative to land threshold so plains/highlands/mountains distribute correctly
        const vLand = isLand
          ? Math.min(1, Math.max(0, (v - landThreshold) / (1 - landThreshold)))
          : 0;

        // Map elevation to 5-bit magnitude (0-31)
        const magnitude = Math.max(0, Math.min(31, Math.floor(vLand * 31)));

        // Compose terrain byte:
        // bit7 (IS_LAND) = land
        // bit5 (OCEAN) = not land (ocean/lake - will refine ocean/lake later via flood fill)
        // bit6 (SHORELINE) will be set in a post-process pass below
        // lower 5 bits = magnitude
        const landBit = isLand ? 1 << 7 : 0;
        const oceanBit = isLand ? 0 : 1 << 5;
        out[idx] = (landBit | oceanBit | (magnitude & 0x1f)) & 0xff;
      }
    }

    // Optional pass: remove speckle islands and fill tiny lakes for playability
    {
      const p = GeneratedParams.get();
      this.removeSmallRegions(
        out,
        width,
        height,
        p.minLandRegionSize,
        p.minWaterRegionSize,
      );
    }

    // Flood-fill oceans from edges to keep inland lakes (unset OCEAN for enclosed water)
    {
      const IS_LAND_BIT = 7;
      const OCEAN_BIT = 5;
      const SHORELINE_BIT = 6;

      const index = (x: number, y: number) => y * width + x;
      const inBounds = (x: number, y: number) =>
        x >= 0 && x < width && y >= 0 && y < height;

      const visited = new Uint8Array(width * height);
      const q: Array<[number, number]> = [];

      // Seed queue with all edge water cells
      for (let x = 0; x < width; x++) {
        for (const y of [0, height - 1]) {
          const i = index(x, y);
          const cell = out[i];
          const isLand = (cell & (1 << IS_LAND_BIT)) !== 0;
          if (!isLand) q.push([x, y]);
        }
      }
      for (let y = 0; y < height; y++) {
        for (const x of [0, width - 1]) {
          const i = index(x, y);
          const cell = out[i];
          const isLand = (cell & (1 << IS_LAND_BIT)) !== 0;
          if (!isLand) q.push([x, y]);
        }
      }

      // BFS to mark edge-connected water as OCEAN, leave enclosed water as LAKE
      while (q.length > 0) {
        const [cx, cy] = q.shift()!;
        const ci = index(cx, cy);
        if (visited[ci]) continue;
        visited[ci] = 1;

        const ccell = out[ci];
        const isLand = (ccell & (1 << IS_LAND_BIT)) !== 0;
        if (!isLand) {
          // Mark as ocean
          out[ci] = out[ci] | (1 << OCEAN_BIT);
          // Visit neighbors
          const dirs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (!inBounds(nx, ny)) continue;
            const ni = index(nx, ny);
            if (visited[ni]) continue;
            const ncell = out[ni];
            const nIsLand = (ncell & (1 << IS_LAND_BIT)) !== 0;
            if (!nIsLand) q.push([nx, ny]);
          }
        }
      }

      // Set SHORELINE bit for land tiles adjacent to ocean
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = index(x, y);
          const cell = out[i];

          const isLand = (cell & (1 << IS_LAND_BIT)) !== 0;
          if (!isLand) continue;

          let adjacentOcean = false;
          // 4-neighborhood (up, down, left, right)
          if (x > 0) {
            const li = index(x - 1, y);
            if ((out[li] & (1 << OCEAN_BIT)) !== 0) adjacentOcean = true;
          }
          if (x + 1 < width) {
            const ri = index(x + 1, y);
            if ((out[ri] & (1 << OCEAN_BIT)) !== 0) adjacentOcean = true;
          }
          if (y > 0) {
            const ui = index(x, y - 1);
            if ((out[ui] & (1 << OCEAN_BIT)) !== 0) adjacentOcean = true;
          }
          if (y + 1 < height) {
            const di = index(x, y + 1);
            if ((out[di] & (1 << OCEAN_BIT)) !== 0) adjacentOcean = true;
          }

          if (adjacentOcean) {
            out[i] = out[i] | (1 << SHORELINE_BIT);
          }
        }
      }
    }

    // Smooth magnitude transitions for land tiles based on configurable radius (0=no blur, 1=3x3, 2=5x5)
    {
      const IS_LAND_BIT = 7;
      const MAG_MASK = 0x1f;
      const index = (x: number, y: number) => y * width + x;
      const copy = out.slice();
      const radius = Math.max(
        0,
        Math.min(2, (this.params ?? GeneratedParams.get()).smoothingRadius),
      );

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = index(x, y);
          // Only blur land tiles to preserve sharp water boundaries
          if ((copy[i] & (1 << IS_LAND_BIT)) === 0) continue;
          if (radius === 0) continue;
          let sum = 0;
          let count = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const ni = index(nx, ny);
              if ((copy[ni] & (1 << IS_LAND_BIT)) === 0) continue;
              sum += copy[ni] & MAG_MASK;
              count++;
            }
          }
          const avg = Math.min(
            31,
            Math.max(0, Math.floor(sum / Math.max(1, count))),
          );
          // Write smoothed magnitude back into lower 5 bits
          out[i] = (out[i] & ~MAG_MASK) | (avg & MAG_MASK);
        }
      }
    }
    // Optional ridge accent to keep peaks prominent after smoothing
    {
      const IS_LAND_BIT = 7;
      const MAG_MASK = 0x1f;
      const index = (x: number, y: number) => y * width + x;
      const enableAccent = Boolean(
        (this.params ?? GeneratedParams.get()).ridgeAccent,
      );
      if (enableAccent) {
        const copy = out.slice();
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = index(x, y);
            if ((copy[i] & (1 << IS_LAND_BIT)) === 0) continue;
            const selfMag = copy[i] & MAG_MASK;
            let sum = 0;
            let count = 0;
            // 3x3 neighborhood average
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const ni = index(nx, ny);
                if ((copy[ni] & (1 << IS_LAND_BIT)) === 0) continue;
                sum += copy[ni] & MAG_MASK;
                count++;
              }
            }
            const avg = Math.floor(sum / Math.max(1, count));
            // If this tile is noticeably above local average, accentuate slightly
            if (selfMag >= avg + 2) {
              const boosted = Math.min(31, selfMag + 2);
              out[i] = (out[i] & ~MAG_MASK) | (boosted & MAG_MASK);
            }
          }
        }
      }
    }
    return out;
  }

  private countLand(buf: Uint8Array): number {
    let c = 0;
    for (let i = 0; i < buf.length; i++) c += buf[i] === 1 ? 1 : 0;
    return c;
  }

  /**
   * Very simple connected-component pruning:
   * - Remove land blobs smaller than minLandSize (set to water)
   * - Remove water blobs smaller than minWaterSize (set to land)
   */
  private removeSmallRegions(
    grid: Uint8Array,
    width: number,
    height: number,
    minLandSize: number,
    minWaterSize: number,
  ): void {
    const visited = new Uint8Array(grid.length);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    const index = (x: number, y: number) => y * width + x;

    const bfs = (sx: number, sy: number, target: number) => {
      const q: Array<[number, number]> = [[sx, sy]];
      const cells: Array<[number, number]> = [];
      visited[index(sx, sy)] = 1;

      let size = 0;
      while (q.length > 0) {
        const [cx, cy] = q.shift()!;
        cells.push([cx, cy]);
        size++;

        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = index(nx, ny);
          if (visited[ni] === 1) continue;
          if (grid[ni] === target) {
            visited[ni] = 1;
            q.push([nx, ny]);
          }
        }
      }

      return { size, cells };
    };

    // Process land regions
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = index(x, y);
        if (visited[i] === 0 && grid[i] === 1) {
          const comp = bfs(x, y, 1);
          if (comp.size < minLandSize) {
            for (const [cx, cy] of comp.cells) {
              grid[index(cx, cy)] = 0;
            }
          }
        }
      }
    }

    // Reset visited
    visited.fill(0);

    // Process water regions
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = index(x, y);
        if (visited[i] === 0 && grid[i] === 0) {
          const comp = bfs(x, y, 0);
          if (comp.size < minWaterSize) {
            for (const [cx, cy] of comp.cells) {
              grid[index(cx, cy)] = 1;
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utility: Nations & thumbnail
  // ---------------------------------------------------------------------------

  private generateNations(_defaults: Nation[]): Nation[] {
    // For MVP, return empty to avoid invalid coordinates and to keep UI consistent.
    // Later, we can place a handful of balanced starting positions based on
    // landmass centers, Voronoi cells, or Poisson-disc sampling.
    return [];
  }

  /**
   * Returns a tiny inline PNG as the thumbnail placeholder.
   * This 1x1 transparent PNG will render fine in <img src="...">.
   */
  private placeholderThumbnail(): string {
    // Base64 for a 1x1 transparent PNG
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAoMBgYQJk+UAAAAASUVORK5CYII=";
  }

  private hashSeed(text: string): number {
    let h = 2166136261 >>> 0; // FNV-1a base
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
}

/**
 * Simplex-like 2D noise generator.
 * This is not a perfect, canonical Simplex implementation but a fast,
 * gradient-based noise adequate for terrain prototyping.
 */
class Simplex2D {
  private perm: Uint8Array;
  private gradX: Float32Array;
  private gradY: Float32Array;

  constructor(seed: number) {
    this.perm = this.buildPermutation(seed);
    const gradCount = 256;
    this.gradX = new Float32Array(gradCount);
    this.gradY = new Float32Array(gradCount);
    for (let i = 0; i < gradCount; i++) {
      const a = this.randFloat(seed + i * 31) * Math.PI * 2;
      this.gradX[i] = Math.cos(a);
      this.gradY[i] = Math.sin(a);
    }
  }

  public noise(x: number, y: number): number {
    // Skew factors for 2D simplex grid
    const F2 = 0.3660254037844386; // (sqrt(3)-1)/2
    const G2 = 0.21132486540518713; // (3-sqrt(3))/6

    // Skew to find the simplex cell
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    // Determine simplex corner offsets
    let i1 = 0,
      j1 = 0;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    // Hash gradients
    const gi0 = this.gradIndex(i, j);
    const gi1 = this.gradIndex(i + i1, j + j1);
    const gi2 = this.gradIndex(i + 1, j + 1);

    // Contribution from each corner
    let n0 = 0,
      n1 = 0,
      n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * (this.gradX[gi0] * x0 + this.gradY[gi0] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * (this.gradX[gi1] * x1 + this.gradY[gi1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * (this.gradX[gi2] * x2 + this.gradY[gi2] * y2);
    }

    // Scale to roughly [-1,1]
    return 70.0 * (n0 + n1 + n2);
  }

  private gradIndex(i: number, j: number): number {
    const idx = this.perm[i & 255] ^ this.perm[j & 255];
    return idx & 255;
  }

  private buildPermutation(seed: number): Uint8Array {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Fisher-Yates shuffle seeded
    let s = seed >>> 0;
    for (let i = 255; i > 0; i--) {
      s = this.xorshift32(s);
      const j = s % (i + 1);
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    return p;
  }

  private xorshift32(x: number): number {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  }

  private randFloat(seed: number): number {
    // Simple LCG for gradient angle
    let s = (seed ^ 0x9e3779b9) >>> 0;
    s = (1664525 * s + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0xfffffff;
  }
}
