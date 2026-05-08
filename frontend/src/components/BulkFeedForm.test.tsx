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
});
