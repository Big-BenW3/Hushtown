'use client';

import type { ReactNode } from 'react';
import type { Channel, Phase, PlayerView } from '@/lib/game/types';
import { ChatDock, dockChannels } from './ChatDock';
import { SplitLayout } from './SplitLayout';
import { DawnScreen } from './screens/DawnScreen';
import { DayScreen } from './screens/DayScreen';
import { EndScreen } from './screens/EndScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { NightScreen } from './screens/NightScreen';
import { RoleScreen } from './screens/RoleScreen';
import type { ScreenProps } from './screens/types';
import { VerdictScreen } from './screens/VerdictScreen';
import { VoteScreen } from './screens/VoteScreen';

const MAIN_LABEL: Record<Phase, string> = {
  lobby: 'Lobby',
  role: 'Role',
  night: 'Night',
  dawn: 'Dawn',
  day: 'Accuse',
  vote: 'Vote',
  verdict: 'Verdict',
  end: 'Results',
};

const CHAT_LABEL: Record<Channel, string> = {
  lobby: 'Wait Room',
  town: 'Town Square',
  mafia: 'The Den',
  graveyard: 'Graveyard',
};

function screenFor(phase: Phase, props: ScreenProps): ReactNode {
  switch (phase) {
    case 'lobby':
      return <LobbyScreen {...props} />;
    case 'role':
      return <RoleScreen {...props} />;
    case 'night':
      return <NightScreen {...props} />;
    case 'dawn':
      return <DawnScreen {...props} />;
    case 'day':
      return <DayScreen {...props} />;
    case 'vote':
      return <VoteScreen {...props} />;
    case 'verdict':
      return <VerdictScreen {...props} />;
    case 'end':
      return <EndScreen {...props} />;
  }
}

/** Chooses the right screen for the phase and pairs it with the right chat room. */
export function GameView(props: ScreenProps) {
  const { view } = props;
  const channels = dockChannels(view);
  const first = channels[0];
  const hasChat = channels.length > 0 && view.phase !== 'role';
  const chatCount = channels.reduce((n, c) => n + (view.chat.messages[c]?.length ?? 0), 0);

  return (
    <div className={`stage stage--${view.phase}`} data-phase={view.phase}>
      <SplitLayout
        // Remount when the phase changes so entrance animations replay and panes reset.
        key={view.phase}
        main={screenFor(view.phase, props)}
        chat={hasChat ? <ChatDock view={view as PlayerView} send={props.send} /> : undefined}
        mainLabel={MAIN_LABEL[view.phase]}
        chatLabel={first ? CHAT_LABEL[first] : 'Chat'}
        chatCount={chatCount}
      />
    </div>
  );
}
