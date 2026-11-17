import type { Action, PlayerView } from '@/lib/game/types';

export type Send = (action: Action) => Promise<boolean>;

/** Everything a phase screen needs. Screens never talk to the network directly. */
export interface ScreenProps {
  view: PlayerView;
  send: Send;
  /** Milliseconds to add to `Date.now()` for server time. */
  clockOffset: number;
}
