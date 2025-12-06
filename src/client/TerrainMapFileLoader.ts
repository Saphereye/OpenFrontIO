import version from "../../resources/version.txt";
import { FetchGameMapLoader } from "../core/game/FetchGameMapLoader";
import { GameMapType } from "../core/game/Game";
import { GameMapLoader, MapData } from "../core/game/GameMapLoader";
import { GeneratedMapLoader } from "../core/game/GeneratedMapLoader";
import { GeneratedParams } from "../core/game/GeneratedParams";

class CombinedMapLoader implements GameMapLoader {
  constructor(private readonly fetchLoader: FetchGameMapLoader) {}

  public getMapData(map: GameMapType): MapData {
    if (map === GameMapType.Generated) {
      // Construct a fresh GeneratedMapLoader with current params snapshot
      return new GeneratedMapLoader(GeneratedParams.get()).getMapData(map);
    }
    return this.fetchLoader.getMapData(map);
  }
}

export const terrainMapFileLoader = new CombinedMapLoader(
  new FetchGameMapLoader(`/maps`, version),
);
