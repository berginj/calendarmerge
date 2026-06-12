import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BulkFeedForm from './BulkFeedForm';

describe('BulkFeedForm', () => {
  it('shows provider guidance and previews multiple pasted feeds', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ created: [], failed: [] });

    render(<BulkFeedForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByText('GameChanger')).toBeInTheDocument();
    expect(screen.getByText('TeamSnap')).toBeInTheDocument();
    expect(screen.getByText('TeamSideline')).toBeInTheDocument();
    expect(screen.getByText('Google Calendar')).toBeInTheDocument();

    await user.type(
      screen.getByLabelText('Calendar subscription links'),
      'Parker | https://example.gc.com/team.ics\nConner, webcal://example.teamsnap.com/team.ics',
    );

    expect(screen.getByText('Ready to add (2)')).toBeInTheDocument();
    expect(screen.getByText('Parker')).toBeInTheDocument();
    expect(screen.getByText('Conner')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add 2 calendars/i }));

    expect(onSubmit).toHaveBeenCalledWith([
      { name: 'Parker', url: 'https://example.gc.com/team.ics' },
      { name: 'Conner', url: 'https://example.teamsnap.com/team.ics' },
    ]);
  });

  it('prioritizes paste input and can read subscription links from the clipboard', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ created: [], failed: [] });
    const readText = vi.fn().mockResolvedValue('webcal://example.gc.com/team.ics');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText },
    });

    const { container } = render(<BulkFeedForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const input = screen.getByLabelText('Calendar subscription links');
    const help = screen.getByText('Provider help and examples');
    expect(container.textContent?.indexOf('Calendar subscription links')).toBeLessThan(
      container.textContent?.indexOf('Provider help and examples') ?? Number.POSITIVE_INFINITY,
    );
    expect(input.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /paste from clipboard/i }));

    expect(readText).toHaveBeenCalled();
    expect(input).toHaveValue('webcal://example.gc.com/team.ics');
    expect(screen.getByText('Ready to add (1)')).toBeInTheDocument();
  });
});
