import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Toast, ToastProvider } from './Toast';

describe('Toast', () => {
  it('uses mobile-safe width and viewport padding', () => {
    render(
      <ToastProvider>
        <Toast title="Saved" description="Calendar updated" variant="success" onOpenChange={vi.fn()} />
      </ToastProvider>,
    );

    const root = screen.getByText('Saved').closest('li') ?? screen.getByText('Saved').parentElement?.parentElement?.parentElement;
    expect(root).toHaveClass('w-full');
    expect(root).toHaveClass('max-w-md');
    expect(root).not.toHaveClass('min-w-[320px]');

    const viewport = document.querySelector('ol');
    expect(viewport).toHaveClass('p-3');
    expect(viewport).toHaveClass('sm:p-6');
    expect(viewport).toHaveClass('w-full');
    expect(viewport).toHaveClass('max-w-md');
  });
});
