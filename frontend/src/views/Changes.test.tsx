import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { adminStatus, publicStatus } from '../test/statusFixtures';
import { mockStatus, resetStatusMock } from '../test/mockServiceStatus';
import Changes from './Changes';

describe('Changes', () => {
  afterEach(() => {
    resetStatusMock();
  });

  it('shows an auth-required state without admin insights', () => {
    mockStatus(publicStatus());

    render(<Changes />);

    expect(screen.getByText('Admin insights unavailable')).toBeInTheDocument();
    expect(screen.getByText('Sign in with an admin access code to view reschedules, duplicates, and feed alerts.')).toBeInTheDocument();
  });

  it('renders reschedules, duplicates, and feed alerts from admin insights', async () => {
    mockStatus(adminStatus());
    const user = userEvent.setup();

    render(<Changes />);

    expect(screen.getByText('Reschedules')).toBeInTheDocument();
    expect(screen.getByText('Potential Duplicates')).toBeInTheDocument();
    expect(screen.getByText('Feed Alerts')).toBeInTheDocument();
    expect(screen.getByText('Game vs Tigers')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Duplicates (1)' }));
    expect(screen.getByText('Practice')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Feed Alerts (1)' }));
    expect(screen.getByText('Sports Calendar')).toBeInTheDocument();
    expect(screen.getByText('Feed went from events to 0')).toBeInTheDocument();
  });
});
