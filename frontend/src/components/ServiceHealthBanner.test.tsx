import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { publicStatus } from '../test/statusFixtures';
import { mockLoadingStatus, mockStatus, resetStatusMock } from '../test/mockServiceStatus';
import ServiceHealthBanner from './ServiceHealthBanner';

describe('ServiceHealthBanner', () => {
  afterEach(() => {
    resetStatusMock();
  });

  it('shows loading state', () => {
    mockLoadingStatus();

    render(<ServiceHealthBanner />);

    expect(screen.getByText('Loading service status...')).toBeInTheDocument();
  });

  it('renders public degraded status and reasons', () => {
    mockStatus(publicStatus({
      operationalState: 'degraded',
      degradationReasons: ['1 feed failed', 'calendar is stale'],
      mergedEventCount: 12,
      sourceFeedCount: 3,
    }));

    render(<ServiceHealthBanner />);

    expect(screen.getByText('Service Degraded')).toBeInTheDocument();
    expect(screen.getByText('12 events')).toBeInTheDocument();
    expect(screen.getByText('3 feeds')).toBeInTheDocument();
    expect(screen.getByText('1 feed failed')).toBeInTheDocument();
    expect(screen.getByText('calendar is stale')).toBeInTheDocument();
  });
});

