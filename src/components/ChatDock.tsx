'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX_LENGTH } from '@/lib/game/config';
import type { Action, Channel, ChatMessage, PlayerView } from '@/lib/game/types';
import { REACTIONS } from '@/lib/copy';
import { cx } from './ui';

type Send = (action: Action) => Promise<boolean>;

interface ChannelMeta {
  title: string;
  sub: string;
  placeholder: string;
  className: string;
  pin?: string;
}

const META: Record<Channel, ChannelMeta> = {
  lobby: { title: 'Wait Room', sub: 'Everyone', placeholder: 'just jest...', className: 'chat--lobby' },
  town: {
    title: 'Town Square',
    sub: 'Everyone',
    placeholder: 'say something...',
    className: 'chat--town',
    pin: 'PINNED: accuse loudly, lie smoothly. No quoting the dead.',
  },
  mafia: { title: 'The Den', sub: 'Mafia only', placeholder: 'whisper...', className: 'chat--den' },
  graveyard: { title: 'Graveyard', sub: 'The dead only', placeholder: 'haunt them...', className: 'chat--grave' },
};

const DEN_QUICK = ['Lock it in', 'Too risky', 'Lay low'];

/** Which channels this viewer should see, in display order. */
export function dockChannels(view: PlayerView): Channel[] {
  const { readable } = view.chat;
  const order: Channel[] = view.you.alive ? ['lobby', 'mafia', 'town'] : ['graveyard', 'town'];
  const wanted = order.filter((c) => readable.includes(c));
  // Mafia only need the den at night; by day it is closed and hidden.
  if (view.phase !== 'night') return wanted.filter((c) => c !== 'mafia');
  return view.you.alive && readable.includes('mafia') ? ['mafia'] : wanted.filter((c) => c !== 'mafia' && c !== 'town');
}

export function ChatDock({ view, send }: { view: PlayerView; send: Send }) {
  const channels = dockChannels(view);
  const [active, setActive] = useState<Channel | null>(null);
  const channel = active && channels.includes(active) ? active : channels[0];
  if (!channel) return null;

  const meta = META[channel];
  const messages = view.chat.messages[channel] ?? [];
  const writable = view.chat.writable.includes(channel);
  const silent = channel === 'town' && view.mode === 'silent' && view.phase !== 'end';

  return (
    <section className={cx('chat', meta.className)} aria-label={meta.title}>
      <header className="chat__head">
        <h2 className="chat__title">{meta.title}</h2>
        {channels.length > 1 ? (
          <div className="chat__switch" role="tablist" aria-label="Chat rooms">
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={c === channel}
                className="chat__switch-btn"
                onClick={() => setActive(c)}
              >
                {META[c].title}
              </button>
            ))}
          </div>
        ) : (
          <span className="chat__sub">{meta.sub}</span>
        )}
      </header>

      {meta.pin && writable ? <p className="chat__pin">{meta.pin}</p> : null}

      <MessageLog messages={messages} selfId={view.you.id} />

      {channel === 'town' && writable ? (
        <div className="chat__quick mobile-only" role="group" aria-label="Reactions">
          {REACTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              className={cx('quick', r.tone === 'green' && 'quick--green', r.tone === 'red' && 'quick--red')}
              onClick={() => void send({ type: 'react', reaction: r.key })}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}

      {channel === 'mafia' && writable ? (
        <div className="chat__quick" role="group" aria-label="Quick whispers">
          {DEN_QUICK.map((text) => (
            <button key={text} type="button" className="quick" onClick={() => void send({ type: 'chat', channel, text })}>
              {text}
            </button>
          ))}
        </div>
      ) : null}

      <ChatForm
        key={channel}
        channel={channel}
        placeholder={meta.placeholder}
        disabled={!writable || silent}
        send={send}
        closedReason={closedReason(view, channel, writable, silent)}
      />
    </section>
  );
}

function closedReason(view: PlayerView, channel: Channel, writable: boolean, silent: boolean): string | null {
  if (silent) return 'Silent mode: reactions only today.';
  if (writable) {
    if (channel === 'mafia') return 'Only living mafia can read this room. It closes at dawn.';
    if (channel === 'graveyard') return 'Only the dead can hear you here.';
    return null;
  }
  if (channel === 'mafia') return view.night?.mafiaChatEnabled ? null : 'You are the only one left. The den is silent.';
  if (channel === 'town') {
    return view.you.alive ? 'The square is quiet. Night is falling.' : 'The dead cannot speak to the living.';
  }
  return null;
}

function MessageLog({ messages, selfId }: { messages: ChatMessage[]; selfId: string }) {
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  return (
    <ul className="chat__log" role="log" aria-live="polite" aria-label="Messages">
      {messages.map((m) => (
        <li
          key={m.id}
          className={cx('msg', m.kind === 'system' && 'msg--system', m.kind === 'reaction' && 'msg--reaction', m.authorId === selfId && 'msg--mine')}
        >
          {m.kind !== 'system' ? <div className="msg__who">{m.authorName}</div> : null}
          <div className="msg__text">{m.text}</div>
        </li>
      ))}
      <li ref={endRef} aria-hidden="true" />
    </ul>
  );
}

function ChatForm({
  channel,
  placeholder,
  disabled,
  send,
  closedReason,
}: {
  channel: Channel;
  placeholder: string;
  disabled: boolean;
  send: Send;
  closedReason: string | null;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy || disabled) return;
    setBusy(true);
    const ok = await send({ type: 'chat', channel, text: trimmed });
    setBusy(false);
    if (ok) setText('');
  }

  return (
    <>
      <form className="chat__form" onSubmit={submit}>
        <label className="sr-only" htmlFor={`chat-${channel}`}>
          Message
        </label>
        <input
          id={`chat-${channel}`}
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder={disabled ? 'closed' : placeholder}
          disabled={disabled}
          autoComplete="off"
        />
        <button type="submit" className="btn btn--small" disabled={disabled || busy || !text.trim()}>
          SEND
        </button>
      </form>
      {closedReason ? <p className="chat__closed">{closedReason}</p> : null}
    </>
  );
}
