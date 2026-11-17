'use client';

import { useState } from 'react';
import type { ScreenProps } from './types';

/** "Face the town" style button that waits for the other players after being pressed. */
export function AckButton({ view, send, label }: Pick<ScreenProps, 'view' | 'send'> & { label: string }) {
  const [clicked, setClicked] = useState(false);
  const progress = view.ackProgress;

  return (
    <>
      <button
        type="button"
        className="btn btn--block"
        disabled={clicked || !view.you.alive}
        onClick={async () => {
          setClicked(true);
          if (!(await send({ type: 'ack' }))) setClicked(false);
        }}
      >
        {!view.you.alive ? 'YOU ARE WATCHING' : clicked ? 'WAITING FOR THE OTHERS' : label}
      </button>
      <p className="muted small center" role="status">
        {progress ? `${progress.acked} OF ${progress.total} READY` : ''}
      </p>
    </>
  );
}
