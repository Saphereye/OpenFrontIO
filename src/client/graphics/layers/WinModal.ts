import { LitElement, TemplateResult, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { isInIframe, translateText } from "../../../client/Utils";
import { ColorPalette, Pattern } from "../../../core/CosmeticSchemas";
import { EventBus } from "../../../core/EventBus";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { AllPlayersStats } from "../../../core/Schemas";
import {
  ATTACK_INDEX_SENT,
  BOAT_INDEX_SENT,
  BOMB_INDEX_LAUNCH,
  GOLD_INDEX_STEAL,
  GOLD_INDEX_TRADE,
  GOLD_INDEX_WAR,
  GOLD_INDEX_WORK,
  OTHER_INDEX_BUILT,
  PlayerStats,
} from "../../../core/StatsSchemas";
import "../../components/PatternButton";
import {
  fetchCosmetics,
  handlePurchase,
  patternRelationship,
} from "../../Cosmetics";
import { getUserMe } from "../../jwt";
import { SendWinnerEvent } from "../../Transport";
import { renderNumber } from "../../Utils";
import { Layer } from "./Layer";

@customElement("win-modal")
export class WinModal extends LitElement implements Layer {
  public game: GameView;
  public eventBus: EventBus;

  private hasShownDeathModal = false;

  @state()
  isVisible = false;

  @state()
  showButtons = false;

  @state()
  private isWin = false;

  @state()
  private patternContent: TemplateResult | null = null;

  @state()
  private playerStats: PlayerStats | null = null;

  @state()
  private allPlayersStats: AllPlayersStats | null = null;

  private _title: string;

  private rand = Math.random();

  // Override to prevent shadow DOM creation
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
  }

  render() {
    return html`
      <div
        class="${this.isVisible
          ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800/70 p-6 rounded-lg z-[9999] shadow-2xl backdrop-blur-sm text-white w-[350px] max-w-[90%] md:w-[700px] md:max-w-[700px] animate-fadeIn"
          : "hidden"}"
      >
        <h2 class="m-0 mb-4 text-[26px] text-center text-white">
          ${this._title || ""}
        </h2>
        ${this.innerHtml()}
        <div
          class="${this.showButtons
            ? "flex justify-between gap-2.5"
            : "hidden"}"
        >
          <button
            @click=${this._handleExit}
            class="flex-1 px-3 py-3 text-base cursor-pointer bg-blue-500/60 text-white border-0 rounded transition-all duration-200 hover:bg-blue-500/80 hover:-translate-y-px active:translate-y-px"
          >
            ${translateText("win_modal.exit")}
          </button>
          <button
            @click=${this.hide}
            class="flex-1 px-3 py-3 text-base cursor-pointer bg-blue-500/60 text-white border-0 rounded transition-all duration-200 hover:bg-blue-500/80 hover:-translate-y-px active:translate-y-px"
          >
            ${this.isWin
              ? translateText("win_modal.keep")
              : translateText("win_modal.spectate")}
          </button>
        </div>
      </div>

      <style>
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, -48%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      </style>
    `;
  }

  innerHtml() {
    const statsHtml = this.renderPlayerStats();

    if (isInIframe() || this.rand < 0.25) {
      return html`${statsHtml} ${this.steamWishlist()}`;
    }
    return html`${statsHtml} ${this.renderPatternButton()}`;
  }

  renderPlayerStats() {
    if (!this.playerStats || !this.allPlayersStats) {
      return html``;
    }

    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return html``;

    const clientID = myPlayer.clientID();
    if (!clientID) return html``;

    const stats = this.allPlayersStats[clientID];
    if (!stats) return html``;

    // Calculate survival time
    const survivalTime = stats.killedAt
      ? translateText("win_modal.turns", { count: String(stats.killedAt) })
      : translateText("win_modal.not_applicable");

    // Calculate total gold
    const goldArray = stats.gold ?? [];
    const totalGold =
      (goldArray[GOLD_INDEX_WORK] ?? 0n) +
      (goldArray[GOLD_INDEX_WAR] ?? 0n) +
      (goldArray[GOLD_INDEX_TRADE] ?? 0n) +
      (goldArray[GOLD_INDEX_STEAL] ?? 0n);

    // Calculate total troops sent
    const attacksArray = stats.attacks ?? [];
    const totalTroopsSent = attacksArray[ATTACK_INDEX_SENT] ?? 0n;

    // Get other stats
    const conquests = stats.conquests ? Number(stats.conquests) : 0;
    const betrayals = stats.betrayals ? Number(stats.betrayals) : 0;

    // Calculate units built
    const units = stats.units ?? {};
    const citiesBuilt = units.city?.[OTHER_INDEX_BUILT]
      ? Number(units.city[OTHER_INDEX_BUILT])
      : 0;
    const silosBuilt = units.silo?.[OTHER_INDEX_BUILT]
      ? Number(units.silo[OTHER_INDEX_BUILT])
      : 0;
    const defensePostsBuilt = units.defp?.[OTHER_INDEX_BUILT]
      ? Number(units.defp[OTHER_INDEX_BUILT])
      : 0;
    const factoriesBuilt = units.fact?.[OTHER_INDEX_BUILT]
      ? Number(units.fact[OTHER_INDEX_BUILT])
      : 0;
    const portsBuilt = units.port?.[OTHER_INDEX_BUILT]
      ? Number(units.port[OTHER_INDEX_BUILT])
      : 0;
    const warshipsBuilt = units.wshp?.[OTHER_INDEX_BUILT]
      ? Number(units.wshp[OTHER_INDEX_BUILT])
      : 0;
    const samLaunchersBuilt = units.saml?.[OTHER_INDEX_BUILT]
      ? Number(units.saml[OTHER_INDEX_BUILT])
      : 0;

    // Calculate boats launched
    const boats = stats.boats ?? {};
    const tradeShipsLaunched = boats.trade?.[BOAT_INDEX_SENT]
      ? Number(boats.trade[BOAT_INDEX_SENT])
      : 0;
    const transportShipsLaunched = boats.trans?.[BOAT_INDEX_SENT]
      ? Number(boats.trans[BOAT_INDEX_SENT])
      : 0;

    // Calculate bombs launched
    const bombs = stats.bombs ?? {};
    const bombsLaunched =
      (bombs.abomb?.[BOMB_INDEX_LAUNCH]
        ? Number(bombs.abomb[BOMB_INDEX_LAUNCH])
        : 0) +
      (bombs.hbomb?.[BOMB_INDEX_LAUNCH]
        ? Number(bombs.hbomb[BOMB_INDEX_LAUNCH])
        : 0) +
      (bombs.mirv?.[BOMB_INDEX_LAUNCH]
        ? Number(bombs.mirv[BOMB_INDEX_LAUNCH])
        : 0) +
      (bombs.mirvw?.[BOMB_INDEX_LAUNCH]
        ? Number(bombs.mirvw[BOMB_INDEX_LAUNCH])
        : 0);

    return html`
      <div class="mb-6 bg-black/30 p-4 rounded max-h-[40vh] overflow-y-auto">
        <h3 class="text-lg font-semibold text-white mb-3 text-center">
          ${translateText("win_modal.game_report")}
        </h3>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div class="text-gray-300">
            ${translateText("win_modal.survival_time")}:
          </div>
          <div class="text-white font-medium text-right">${survivalTime}</div>

          <div class="text-gray-300">
            ${translateText("win_modal.total_gold")}:
          </div>
          <div class="text-white font-medium text-right">
            ${renderNumber(totalGold)}
          </div>

          <div class="text-gray-300">
            ${translateText("win_modal.total_troops")}:
          </div>
          <div class="text-white font-medium text-right">
            ${renderNumber(totalTroopsSent)}
          </div>

          <div class="text-gray-300">
            ${translateText("win_modal.conquests")}:
          </div>
          <div class="text-white font-medium text-right">${conquests}</div>

          ${betrayals > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.betrayals")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${betrayals}
                </div>
              `
            : html``}
          ${bombsLaunched > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.bombs_launched")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${bombsLaunched}
                </div>
              `
            : html``}
          ${citiesBuilt > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.cities_built")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${citiesBuilt}
                </div>
              `
            : html``}
          ${silosBuilt > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.silos_built")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${silosBuilt}
                </div>
              `
            : html``}
          ${defensePostsBuilt > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.defense_posts")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${defensePostsBuilt}
                </div>
              `
            : html``}
          ${factoriesBuilt > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.factories")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${factoriesBuilt}
                </div>
              `
            : html``}
          ${portsBuilt > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.ports")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${portsBuilt}
                </div>
              `
            : html``}
          ${warshipsBuilt > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.warships")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${warshipsBuilt}
                </div>
              `
            : html``}
          ${samLaunchersBuilt > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.sam_launchers")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${samLaunchersBuilt}
                </div>
              `
            : html``}
          ${tradeShipsLaunched > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.trade_ships")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${tradeShipsLaunched}
                </div>
              `
            : html``}
          ${transportShipsLaunched > 0
            ? html`
                <div class="text-gray-300">
                  ${translateText("win_modal.transport_ships")}:
                </div>
                <div class="text-white font-medium text-right">
                  ${transportShipsLaunched}
                </div>
              `
            : html``}
        </div>
      </div>
    `;
  }

  renderPatternButton() {
    return html`
      <div class="text-center mb-6 bg-black/30 p-2.5 rounded">
        <h3 class="text-xl font-semibold text-white mb-3">
          ${translateText("win_modal.support_openfront")}
        </h3>
        <p class="text-white mb-3">
          ${translateText("win_modal.territory_pattern")}
        </p>
        <div class="flex justify-center">${this.patternContent}</div>
      </div>
    `;
  }

  async loadPatternContent() {
    const me = await getUserMe();
    const patterns = await fetchCosmetics();

    const purchasablePatterns: {
      pattern: Pattern;
      colorPalette: ColorPalette;
    }[] = [];

    for (const pattern of Object.values(patterns?.patterns ?? {})) {
      for (const colorPalette of pattern.colorPalettes ?? []) {
        if (
          patternRelationship(pattern, colorPalette, me, null) === "purchasable"
        ) {
          const palette = patterns?.colorPalettes?.[colorPalette.name];
          if (palette) {
            purchasablePatterns.push({
              pattern,
              colorPalette: palette,
            });
          }
        }
      }
    }

    if (purchasablePatterns.length === 0) {
      this.patternContent = html``;
      return;
    }

    // Shuffle the array and take patterns based on screen size
    const shuffled = [...purchasablePatterns].sort(() => Math.random() - 0.5);
    const isMobile = window.innerWidth < 768; // md breakpoint
    const maxPatterns = isMobile ? 1 : 3;
    const selectedPatterns = shuffled.slice(
      0,
      Math.min(maxPatterns, shuffled.length),
    );

    this.patternContent = html`
      <div class="flex gap-4 flex-wrap justify-start">
        ${selectedPatterns.map(
          ({ pattern, colorPalette }) => html`
            <pattern-button
              .pattern=${pattern}
              .colorPalette=${colorPalette}
              .requiresPurchase=${true}
              .onSelect=${(p: Pattern | null) => {}}
              .onPurchase=${(p: Pattern, colorPalette: ColorPalette | null) =>
                handlePurchase(p, colorPalette)}
            ></pattern-button>
          `,
        )}
      </div>
    `;
  }

  steamWishlist(): TemplateResult {
    return html`<p class="m-0 mb-5 text-center bg-black/30 p-2.5 rounded">
      <a
        href="https://store.steampowered.com/app/3560670"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[#4a9eff] underline font-medium transition-colors duration-200 text-2xl hover:text-[#6db3ff]"
      >
        ${translateText("win_modal.wishlist")}
      </a>
    </p>`;
  }

  async show() {
    await this.loadPatternContent();
    this.isVisible = true;
    this.requestUpdate();
    setTimeout(() => {
      this.showButtons = true;
      this.requestUpdate();
    }, 3000);
  }

  hide() {
    this.isVisible = false;
    this.showButtons = false;
    this.requestUpdate();
  }

  private _handleExit() {
    this.hide();
    window.location.href = "/";
  }

  init() {}

  tick() {
    const myPlayer = this.game.myPlayer();
    if (
      !this.hasShownDeathModal &&
      myPlayer &&
      !myPlayer.isAlive() &&
      !this.game.inSpawnPhase() &&
      myPlayer.hasSpawned()
    ) {
      this.hasShownDeathModal = true;
      this._title = translateText("win_modal.died");
      this.show();
    }
    const updates = this.game.updatesSinceLastTick();
    const winUpdates = updates !== null ? updates[GameUpdateType.Win] : [];
    winUpdates.forEach((wu) => {
      // Store the stats for rendering
      this.allPlayersStats = wu.allPlayersStats;
      const myPlayer = this.game.myPlayer();
      if (myPlayer) {
        const clientID = myPlayer.clientID();
        if (clientID && wu.allPlayersStats[clientID]) {
          this.playerStats = wu.allPlayersStats[clientID];
        }
      }

      if (wu.winner === undefined) {
        // ...
      } else if (wu.winner[0] === "team") {
        this.eventBus.emit(new SendWinnerEvent(wu.winner, wu.allPlayersStats));
        if (wu.winner[1] === this.game.myPlayer()?.team()) {
          this._title = translateText("win_modal.your_team");
          this.isWin = true;
        } else {
          this._title = translateText("win_modal.other_team", {
            team: wu.winner[1],
          });
          this.isWin = false;
        }
        this.show();
      } else {
        const winner = this.game.playerByClientID(wu.winner[1]);
        if (!winner?.isPlayer()) return;
        const winnerClient = winner.clientID();
        if (winnerClient !== null) {
          this.eventBus.emit(
            new SendWinnerEvent(["player", winnerClient], wu.allPlayersStats),
          );
        }
        if (
          winnerClient !== null &&
          winnerClient === this.game.myPlayer()?.clientID()
        ) {
          this._title = translateText("win_modal.you_won");
          this.isWin = true;
        } else {
          this._title = translateText("win_modal.other_won", {
            player: winner.name(),
          });
          this.isWin = false;
        }
        this.show();
      }
    });
  }

  renderLayer(/* context: CanvasRenderingContext2D */) {}

  shouldTransform(): boolean {
    return false;
  }
}
