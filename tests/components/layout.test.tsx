// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SplitLayout } from '@/components/SplitLayout';

const panes = (container: HTMLElement) => container.querySelector('.split') as HTMLElement;

describe('SplitLayout', () => {
  it('starts on the main pane and switches panes from the tabs', async () => {
    const { container } = render(<SplitLayout main={<p>game</p>} chat={<p>talk</p>} mainLabel="Game" chatLabel="Chat" />);
    expect(panes(container)).toHaveAttribute('data-pane', 'main');
    expect(screen.getByRole('tab', { name: 'Game' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(panes(container)).toHaveAttribute('data-pane', 'chat');
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows an unread badge while on the other pane and clears it when opened', async () => {
    const { rerender, container } = render(<SplitLayout main={<p>game</p>} chat={<p>talk</p>} mainLabel="Game" chatLabel="Chat" chatCount={0} />);
    expect(screen.queryByLabelText(/new messages/)).not.toBeInTheDocument();
    rerender(<SplitLayout main={<p>game</p>} chat={<p>talk</p>} mainLabel="Game" chatLabel="Chat" chatCount={3} />);
    expect(screen.getByLabelText('3 new messages')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Chat/ }));
    expect(screen.queryByLabelText(/new messages/)).not.toBeInTheDocument();
    expect(panes(container)).toHaveAttribute('data-pane', 'chat');
  });

  it('caps a large badge at 9+', () => {
    const { rerender } = render(<SplitLayout main={<p>g</p>} chat={<p>c</p>} mainLabel="Game" chatCount={0} />);
    rerender(<SplitLayout main={<p>g</p>} chat={<p>c</p>} mainLabel="Game" chatCount={25} />);
    expect(screen.getByLabelText('25 new messages')).toHaveTextContent('9+');
  });

  it('has no tabs and a single column when there is no chat', () => {
    const { container } = render(<SplitLayout main={<p>game</p>} mainLabel="Game" />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(panes(container)).toHaveClass('split--solo');
  });

  it('falls back to the main pane if the chat disappears while it is open', async () => {
    const { rerender, container } = render(<SplitLayout main={<p>game</p>} chat={<p>talk</p>} mainLabel="Game" />);
    await userEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    rerender(<SplitLayout main={<p>game</p>} mainLabel="Game" />);
    expect(panes(container)).toHaveAttribute('data-pane', 'main');
  });
});
