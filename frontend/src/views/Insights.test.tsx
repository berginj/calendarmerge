import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { adminStatus, publicStatus } from '../test/statusFixtures';
import { mockStatus } from '../test/mockServiceStatus';
import Insights from './Insights';

describe('Insights', () => {
  it('shows an auth-required state without admin diagnostics', () => {
    mockStatus(publicStatus());

    render(<Insights />);

    expect(screen.getByText('Admin insights unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Sign in with an admin access code/)).toBeInTheDocument();
  });

  it('renders feed health, metadata, and the operator queue from admin status', () => {
    mockStatus(adminStatus());

    render(<Insights />);

    expect(screen.getByText('Refresh Metadata')).toBeInTheDocument();
    expect(screen.getByText('refresh-1')).toBeInTheDocument();
    expect(screen.getByText('Feed Health')).toBeInTheDocument();
    expect(screen.getAllByText('Sports Calendar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HTTP 403').length).toBeGreaterThan(0);
    expect(screen.getByText('Operator Queue')).toBeInTheDocument();
    expect(screen.getByText('Game vs Tigers')).toBeInTheDocument();
    expect(screen.getByText('Feed dropped to zero events')).toBeInTheDocument();
  });

  it('filters the operator queue by type and feed', async () => {
    const user = userEvent.setup();
    mockStatus(adminStatus());

    render(<Insights />);

    await user.selectOptions(screen.getByLabelText('Type'), 'duplicate');
    expect(screen.getByText('Practice')).toBeInTheDocument();
    expect(screen.queryByText('Game vs Tigers')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Type'), 'all');
    await user.selectOptions(screen.getByLabelText('Feed'), 'School Calendar');
    expect(screen.queryByText('Feed dropped to zero events')).not.toBeInTheDocument();
  });
});
