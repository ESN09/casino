import type { BjAction, Card, HandResult } from '../games/blackjack/engine';
import type { SpinOutcome } from '../games/slots/engine';

/**
 * Contrat entre l'interface et le « serveur ».
 * - LocalServer (dev / hors-ligne) : implémentation navigateur + localStorage.
 * - SupabaseServer (Phase 5) : mêmes méthodes, appelées via Edge Functions,
 *   tirages et soldes validés en base. L'UI ne change pas.
 *
 * Chaque opération qui modifie le solde reçoit une clé d'idempotence :
 * rejouer la même clé renvoie le même résultat sans débiter deux fois.
 */

export type TxType = 'starting' | 'daily' | 'rescue' | 'slot_bet' | 'slot_win' | 'bj_bet' | 'bj_win' | 'case_buy';

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  balanceAfter: number;
  at: number;
  ref?: string;
}

export interface OwnedCard {
  cardId: string;
  count: number;
  firstAt: number;
  lastAt: number;
  favorite: boolean;
}

export interface ProfileView {
  playerId: string;
  name: string;
  avatar: string;
  balance: number;
  xp: number;
  level: number;
  levelXp: number;
  levelXpNext: number;
  ageConfirmed: boolean;
  stats: {
    spins: number;
    bjHands: number;
    casesOpened: number;
    totalWagered: number;
    totalWon: number;
    biggestWin: number;
  };
  collection: Record<string, OwnedCard>;
  settings: { sound: boolean; reducedMotion: boolean; sessionLimitMin: number };
}

export interface DailyStatus {
  canClaim: boolean;
  /** Jour de la série (1..7) qui sera réclamé. */
  nextDay: number;
  streak: number;
  msUntilNext: number;
  clockTamper: boolean;
  rescueAvailable: boolean;
  rescueMsLeft: number;
}

export interface DailyClaim {
  day: number;
  credits: number;
  xp: number;
  profile: ProfileView;
}

export interface CaseOpenResult {
  openId: string;
  caseId: string;
  oddsVersion: number;
  cardId: string;
  isNew: boolean;
  profile: ProfileView;
}

export interface CaseHistoryEntry { openId: string; caseId: string; cardId: string; at: number }

export interface SlotSpinResult {
  outcome: SpinOutcome;
  bet: number;
  wasFree: boolean;
  freeSpinsLeft: number;
  freeSpinsWon: number;
  profile: ProfileView;
}

export interface SlotSession { machineId: string; freeSpinsLeft: number; freeSpinBet: number; freeSpinsWon: number }

/** Vue client du blackjack : la carte cachée du croupier n'est JAMAIS envoyée avant la fin. */
export interface BlackjackView {
  roundId: string;
  phase: 'player' | 'done';
  dealer: (Card | null)[];
  dealerTotal: number | null;
  hands: { cards: Card[]; bet: number; doubled: boolean; total: number; soft: boolean; result?: HandResult; payout?: number }[];
  active: number;
  actions: Record<BjAction, boolean>;
  netResult?: number;
  profile: ProfileView;
}

export class GameError extends Error {
  constructor(public code: 'INSUFFICIENT_FUNDS' | 'INVALID' | 'NOT_AVAILABLE' | 'CLOCK', message: string) {
    super(message);
  }
}

export interface GameServer {
  getProfile(): Promise<ProfileView>;
  updateProfile(patch: Partial<Pick<ProfileView, 'name' | 'avatar' | 'ageConfirmed'>> & { settings?: Partial<ProfileView['settings']> }): Promise<ProfileView>;
  toggleFavorite(cardId: string): Promise<ProfileView>;

  dailyStatus(): Promise<DailyStatus>;
  claimDaily(key: string): Promise<DailyClaim>;
  claimRescue(key: string): Promise<ProfileView>;

  openCase(caseId: string, key: string): Promise<CaseOpenResult>;
  caseHistory(): Promise<CaseHistoryEntry[]>;

  slotSession(machineId: string): Promise<SlotSession>;
  slotSpin(machineId: string, bet: number, key: string): Promise<SlotSpinResult>;

  bjCurrent(): Promise<BlackjackView | null>;
  bjDeal(bet: number, key: string): Promise<BlackjackView>;
  bjAction(roundId: string, action: BjAction, key: string): Promise<BlackjackView>;

  transactions(): Promise<Transaction[]>;
  exportData(): Promise<string>;
  resetAll(): Promise<ProfileView>;
}
