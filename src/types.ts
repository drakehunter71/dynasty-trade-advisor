export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

export type WinWindow = 'rebuilding' | 'developing' | 'contending' | 'win-now';

export type ScoringFormat = 'ppr' | 'half_ppr' | 'standard';

export interface Player {
  sleeperId: string;
  name: string;
  position: Position;
  nflTeam: string;
  age: number;
  yearsExp: number;
}

export interface TradeValues {
  fantasyCalc?: number;
  ktc?: number;
  dynastyProcess?: number;
  normalized: number;
}

export interface RosterPlayer {
  player: Player;
  values: TradeValues;
}

export interface DraftPick {
  season: string;
  round: number;
  originalOwnerName: string;
  currentOwnerName: string;
  currentOwnerRosterId: number; // internal — used for grouping picks by roster in sleeper.ts
}

export interface Team {
  rosterId: number;
  ownerId: string;
  ownerName: string;
  teamName: string;
  roster: RosterPlayer[];
  picks: DraftPick[];
  winWindow: WinWindow;
  totalRosterValue: number;
}

export interface League {
  id: string;
  name: string;
  season: string;
  scoringFormat: ScoringFormat;
  isSuperflex: boolean;
  teams: Team[];
  myRosterId: number;
}

export interface Snapshot {
  createdAt: string;
  sleeperUsername: string;
  leagues: League[];
  valueSources: string[];
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  settings: {
    type: number;
    rec: number;
    bonus_rec_te?: number;
  };
  roster_positions: string[];
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  metadata: {
    team_name?: string;
  };
}

export interface SleeperPlayerData {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  age?: number;
  years_exp?: number;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface CalcPlayerValue {
  name: string;
  sleeperId?: string;
  value: number;
}
