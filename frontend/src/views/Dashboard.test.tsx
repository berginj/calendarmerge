import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { adminStatus, publicStatus } from '../test/statusFixtures';
import { mockStatus, resetStatusMock } from '../test/mockServiceStatus';
import Dashboard from './Dashboard';

describe('Dashboard', () => {
  afterEach(() => {
    resetStatusMock();
  });

  it('renders public status with an admin diagnostics empty state', () => {
    mockStatus(publicStatus());

    render(<Dashboard />);

    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Games Only')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Admin details unavailable')).toBeInTheDocument();
    expect(screen.getByText('Admin diagnostics unavailable')).toBeInTheDocument();
    expect(screen.getByText('Sign in with an admin access code to view per-feed health and operational details.')).toBeInTheDocument();
  });

  it('renders protected admin diagnostics when available', () => {
    mockStatus(adminStatus());

    render(<Dashboard />);

    expect(screen.getByText('1 failed')).toBeInTheDocument();
    expect(screen.getByText('School Calendar')).toBeInTheDocument();
    expect(screen.getByText('Sports Calendar')).toBeInTheDocument();
    expect(screen.getByText('Failed 3x in a row')).toBeInTheDocument();
    expect(screen.queryByText('Admin diagnostics unavailable')).not.toBeInTheDocument();
  });
});
