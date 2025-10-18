import { GameMapType } from "./Game";

const manifests = {
  [GameMapType.Africa]: () =>
    import("../../../resources/maps/africa/manifest.json"),
  [GameMapType.Asia]: () =>
    import("../../../resources/maps/asia/manifest.json"),
  [GameMapType.Australia]: () =>
    import("../../../resources/maps/australia/manifest.json"),
  [GameMapType.Baikal]: () =>
    import("../../../resources/maps/baikal/manifest.json"),
  [GameMapType.BetweenTwoSeas]: () =>
    import("../../../resources/maps/betweentwoseas/manifest.json"),
  [GameMapType.BlackSea]: () =>
    import("../../../resources/maps/blacksea/manifest.json"),
  [GameMapType.Britannia]: () =>
    import("../../../resources/maps/britannia/manifest.json"),
  [GameMapType.DeglaciatedAntarctica]: () =>
    import("../../../resources/maps/deglaciatedantarctica/manifest.json"),
  [GameMapType.EastAsia]: () =>
    import("../../../resources/maps/eastasia/manifest.json"),
  [GameMapType.Europe]: () =>
    import("../../../resources/maps/europe/manifest.json"),
  [GameMapType.EuropeClassic]: () =>
    import("../../../resources/maps/europeclassic/manifest.json"),
  [GameMapType.FalklandIslands]: () =>
    import("../../../resources/maps/falklandislands/manifest.json"),
  [GameMapType.FaroeIslands]: () =>
    import("../../../resources/maps/faroeislands/manifest.json"),
  [GameMapType.GatewayToTheAtlantic]: () =>
    import("../../../resources/maps/gatewaytotheatlantic/manifest.json"),
  [GameMapType.GiantWorldMap]: () =>
    import("../../../resources/maps/giantworldmap/manifest.json"),
  [GameMapType.Halkidiki]: () =>
    import("../../../resources/maps/halkidiki/manifest.json"),
  [GameMapType.Iceland]: () =>
    import("../../../resources/maps/iceland/manifest.json"),
  [GameMapType.Italia]: () =>
    import("../../../resources/maps/italia/manifest.json"),
  [GameMapType.Japan]: () =>
    import("../../../resources/maps/japan/manifest.json"),
  [GameMapType.Mars]: () =>
    import("../../../resources/maps/mars/manifest.json"),
  [GameMapType.Mena]: () =>
    import("../../../resources/maps/mena/manifest.json"),
  [GameMapType.Montreal]: () =>
    import("../../../resources/maps/montreal/manifest.json"),
  [GameMapType.NorthAmerica]: () =>
    import("../../../resources/maps/northamerica/manifest.json"),
  [GameMapType.Oceania]: () =>
    import("../../../resources/maps/oceania/manifest.json"),
  [GameMapType.Pangaea]: () =>
    import("../../../resources/maps/pangaea/manifest.json"),
  [GameMapType.Pluto]: () =>
    import("../../../resources/maps/pluto/manifest.json"),
  [GameMapType.SouthAmerica]: () =>
    import("../../../resources/maps/southamerica/manifest.json"),
  [GameMapType.StraitOfGibraltar]: () =>
    import("../../../resources/maps/straitofgibraltar/manifest.json"),
  [GameMapType.World]: () =>
    import("../../../resources/maps/world/manifest.json"),
  [GameMapType.Yenisei]: () =>
    import("../../../resources/maps/yenisei/manifest.json"),
} as const;

type ManifestModule = { default: { nations: unknown[] } };

let nationCountCache: Record<GameMapType, number> | null = null;

async function loadNationCounts(): Promise<Record<GameMapType, number>> {
  const counts = {} as Record<GameMapType, number>;

  await Promise.all(
    Object.entries(manifests).map(async ([mapType, loader]) => {
      const manifest = (await loader()) as ManifestModule;
      counts[mapType as GameMapType] = manifest.default.nations.length;
    }),
  );

  return counts;
}

// Initialize the cache immediately
const initPromise = loadNationCounts().then((counts) => {
  nationCountCache = counts;
});

export function getNationCount(map: GameMapType): number {
  if (!nationCountCache) {
    throw new Error(
      "MapNationCounts not initialized. Call initMapNationCounts() first.",
    );
  }
  return nationCountCache[map] ?? 20;
}

export async function initMapNationCounts(): Promise<void> {
  await initPromise;
}

export function getNationCountsSync(): Record<GameMapType, number> | null {
  return nationCountCache;
}
