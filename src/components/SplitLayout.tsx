'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

interface SplitLayoutProps {
  main: ReactNode;
  /** Optional chat pane. Without it the layout is a single centred column on desktop. */
  chat?: ReactNode;
  mainLabel: string;
  chatLabel?: string;
  /** Total messages in the chat; used to show an unread badge while it is hidden. */
  chatCount?: number;
  /** Adds a scene class (e.g. `scene--night`) for per-phase backdrop. */
  scene?: string;
}

/**
 * Two panes. On desktop they sit side by side; on phones they become tabs so
 * each pane can use the whole screen, matching the mobile mockups.
 */
export function SplitLayout({ main, chat, mainLabel, chatLabel = 'Chat', chatCount = 0, scene }: SplitLayoutProps) {
  const [pane, setPane] = useState<'main' | 'chat'>('main');
  const seen = useRef(chatCount);

  useEffect(() => {
    if (pane === 'chat') seen.current = chatCount;
  }, [pane, chatCount]);

  // If the chat disappears (e.g. night ends) fall back to the main pane.
  useEffect(() => {
    if (!chat && pane === 'chat') setPane('main');
  }, [chat, pane]);

  const unread = pane === 'chat' ? 0 : Math.max(0, chatCount - seen.current);

  return (
    <div className={cx('split', !chat && 'split--solo', scene)} data-pane={pane}>
      <div className="split__pane split__pane--main" id="pane-main" role="tabpanel" aria-label={mainLabel}>
        {main}
      </div>
      {chat ? (
        <div className="split__pane split__pane--chat" id="pane-chat" role="tabpanel" aria-label={chatLabel}>
          {chat}
        </div>
      ) : null}
      {chat ? (
        <div className="split__tabs" role="tablist" aria-label="Switch view">
          <button
            type="button"
            role="tab"
            className="split__tab"
            aria-selected={pane === 'main'}
            aria-controls="pane-main"
            onClick={() => setPane('main')}
          >
            {mainLabel}
          </button>
          <button
            type="button"
            role="tab"
            className="split__tab"
            aria-selected={pane === 'chat'}
            aria-controls="pane-chat"
            onClick={() => setPane('chat')}
          >
            {chatLabel}
            {unread > 0 ? (
              <span className="split__badge" aria-label={`${unread} new messages`}>
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
