import { Difficulty } from "../src/core/game/Game";

describe("HumansVsNations Difficulty Calculation", () => {
  // This tests the logic that calculates difficulty based on human percentage
  // The actual calculation happens in GameRunner.ts during game creation

  function calculateDifficulty(
    humanCount: number,
    nationCount: number,
  ): Difficulty {
    const totalPlayers = humanCount + nationCount;
    const humanPercentage = humanCount / totalPlayers;

    if (humanPercentage < 0.25) {
      return Difficulty.Easy;
    } else if (humanPercentage < 0.5) {
      return Difficulty.Medium;
    } else if (humanPercentage < 0.75) {
      return Difficulty.Hard;
    } else {
      return Difficulty.Impossible;
    }
  }

  test("difficulty is Easy when humans < 25% of total players", () => {
    // 1 human, 9 nations = 10% humans
    expect(calculateDifficulty(1, 9)).toBe(Difficulty.Easy);
    // 2 humans, 10 nations = 16.7% humans
    expect(calculateDifficulty(2, 10)).toBe(Difficulty.Easy);
  });

  test("difficulty is Medium when humans between 25-50% of total players", () => {
    // 3 humans, 5 nations = 37.5% humans
    expect(calculateDifficulty(3, 5)).toBe(Difficulty.Medium);
    // 4 humans, 6 nations = 40% humans
    expect(calculateDifficulty(4, 6)).toBe(Difficulty.Medium);
  });

  test("difficulty is Hard when humans between 50-75% of total players", () => {
    // 5 humans, 3 nations = 62.5% humans
    expect(calculateDifficulty(5, 3)).toBe(Difficulty.Hard);
    // 6 humans, 4 nations = 60% humans
    expect(calculateDifficulty(6, 4)).toBe(Difficulty.Hard);
  });

  test("difficulty is Impossible when humans >= 75% of total players", () => {
    // 9 humans, 1 nation = 90% humans
    expect(calculateDifficulty(9, 1)).toBe(Difficulty.Impossible);
    // 8 humans, 2 nations = 80% humans
    expect(calculateDifficulty(8, 2)).toBe(Difficulty.Impossible);
  });

  test("edge case: exactly 25% humans is Medium", () => {
    // 1 human, 3 nations = 25% humans
    expect(calculateDifficulty(1, 3)).toBe(Difficulty.Medium);
  });

  test("edge case: exactly 50% humans is Hard", () => {
    // 5 humans, 5 nations = 50% humans
    expect(calculateDifficulty(5, 5)).toBe(Difficulty.Hard);
  });

  test("edge case: exactly 75% humans is Impossible", () => {
    // 3 humans, 1 nation = 75% humans
    expect(calculateDifficulty(3, 1)).toBe(Difficulty.Impossible);
  });
});
