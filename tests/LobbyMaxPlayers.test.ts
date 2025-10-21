import { getServerConfigFromServer } from "../src/core/configuration/ConfigLoader";
import { GameMapType, GameMode } from "../src/core/game/Game";
import { initMapNationCounts } from "../src/core/game/MapNationCounts";

describe("LobbyMaxPlayers", () => {
  const config = getServerConfigFromServer();

  beforeAll(async () => {
    await initMapNationCounts();
  });

  describe("HumansVsNations mode", () => {
    test("should return a valid player count for World map", () => {
      const maxPlayers = config.lobbyMaxPlayers(
        GameMapType.World,
        GameMode.HumansVsNations,
        undefined,
      );
      // World has [50, 30, 20] in numPlayersConfig
      expect([20, 30, 50]).toContain(maxPlayers);
    });

    test("should return a valid player count for Europe map", () => {
      const maxPlayers = config.lobbyMaxPlayers(
        GameMapType.Europe,
        GameMode.HumansVsNations,
        undefined,
      );
      // Europe has [100, 70, 50] in numPlayersConfig
      expect([50, 70, 100]).toContain(maxPlayers);
    });

    test("should return a valid player count for Mars map", () => {
      const maxPlayers = config.lobbyMaxPlayers(
        GameMapType.Mars,
        GameMode.HumansVsNations,
        undefined,
      );
      // Mars has [70, 40, 30] in numPlayersConfig
      expect([30, 40, 70]).toContain(maxPlayers);
    });

    test("should return a valid player count for Montreal map", () => {
      const maxPlayers = config.lobbyMaxPlayers(
        GameMapType.Montreal,
        GameMode.HumansVsNations,
        undefined,
      );
      // Montreal has [60, 40, 30] in numPlayersConfig
      expect([30, 40, 60]).toContain(maxPlayers);
    });

    test("should return a valid player count for GiantWorldMap", () => {
      const maxPlayers = config.lobbyMaxPlayers(
        GameMapType.GiantWorldMap,
        GameMode.HumansVsNations,
        undefined,
      );
      // GiantWorldMap has [100, 70, 50] in numPlayersConfig
      expect([50, 70, 100]).toContain(maxPlayers);
    });
  });

  describe("FFA mode", () => {
    test("should return a value based on numPlayersConfig", () => {
      const maxPlayers = config.lobbyMaxPlayers(
        GameMapType.World,
        GameMode.FFA,
        undefined,
      );
      // Should be one of: 50, 30, or 20 (from numPlayersConfig for World)
      expect([20, 30, 50]).toContain(maxPlayers);
    });
  });

  describe("Team mode", () => {
    test("should return a value based on numPlayersConfig with team adjustment", () => {
      const maxPlayers = config.lobbyMaxPlayers(
        GameMapType.World,
        GameMode.Team,
        2,
      );
      // Should be even (divisible by 2) and based on World's config
      expect(maxPlayers % 2).toBe(0);
      expect(maxPlayers).toBeGreaterThan(0);
    });
  });
});
