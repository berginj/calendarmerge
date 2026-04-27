# UI Enhancement Recommendations

**Date:** 2026-04-27
**Context:** The backend now provides rich diagnostic data (operational state, reschedules, duplicates, feed health) that isn't yet surfaced in the UI.

---

## Executive Summary

Your backend is now **enterprise-grade** with comprehensive monitoring, change detection, and health tracking. The UI should match this capability. Current UI is functional but **misses opportunities** to surface valuable data that parents and operators need.

**Priority:** Transform from "admin panel" to "family calendar control center"

---

## Current UI Analysis

### ✅ What Works Well

1. **Clean Design System**
   - Teal/slate color scheme (professional, calming)
   - Card-based layout
   - Gradient background
   - Good spacing and typography

2. **Essential Features**
   - Feed CRUD operations
   - Settings management
   - Admin key security
   - Troubleshooting links

3. **Good UX Patterns**
   - Inline editing for feeds
   - Confirmation dialogs for deletion
   - Loading states
   - Error messaging

### ❌ What's Missing

**The backend provides but UI doesn't show:**
1. Service operational state (healthy/degraded/failed)
2. Potential duplicates (flagged with confidence)
3. Rescheduled events (time/location changes)
4. Feed change alerts (0 events, drops, increases)
5. Per-feed health status (consecutive failures, suspect)
6. Manual refresh trigger
7. Feed validation feedback (platform detection, event count)
8. Calendar staleness (age in hours)
9. Request/refresh ID tracking
10. Real-time status updates

**Missing UX features:**
- Dashboard overview
- Feed health indicators
- Change notifications
- Duplicate review workflow
- Filter/search for feeds
- Bulk operations
- Mobile responsiveness (limited)

---

## Enhancement Recommendations

### 🎯 Priority 1: Essential Visibility (Quick Wins)

#### 1.1 Service Health Dashboard

**Add at top of page, always visible:**

```tsx
<ServiceHealthBanner>
  {/* Healthy State */}
  <div className="health-banner health-healthy">
    <StatusIcon status="healthy" /> {/* Green checkmark */}
    <div>
      <strong>Service Healthy</strong>
      <span>Last refresh: 5 minutes ago • {mergedEventCount} events • {feedCount} feeds</span>
    </div>
  </div>

  {/* Degraded State */}
  <div className="health-banner health-degraded">
    <StatusIcon status="degraded" /> {/* Yellow warning */}
    <div>
      <strong>Service Degraded</strong>
      <span>1 feed failed • Serving data from 2 hours ago</span>
    </div>
    <button onClick={openDetails}>View Details</button>
  </div>

  {/* Failed State */}
  <div className="health-banner health-failed">
    <StatusIcon status="failed" /> {/* Red X */}
    <div>
      <strong>Service Failed</strong>
      <span>All feeds failed • Calendar may be out of date</span>
    </div>
    <button onClick={triggerManualRefresh}>Retry Now</button>
  </div>
</ServiceHealthBanner>
```

**Design:**
- Full-width banner below header
- Color-coded: Green (healthy), Yellow (degraded), Red (failed)
- Icon + status text + key metrics
- Actionable button when needed
- Auto-updates every 30 seconds

**Value:** Immediate visibility into service health without clicking anything.

---

#### 1.2 Manual Refresh Button

**Add prominent refresh button:**

```tsx
<div className="actions">
  <button className="btn-refresh" onClick={handleManualRefresh} disabled={refreshing}>
    {refreshing ? (
      <>
        <Spinner /> Refreshing...
      </>
    ) : (
      <>
        <RefreshIcon /> Refresh Now
      </>
    )}
  </button>

  <button className="btn-primary" onClick={() => setShowForm(true)}>
    <PlusIcon /> Add Feed
  </button>
</div>
```

**With status feedback:**
```tsx
{refreshResult && (
  <div className={`refresh-result ${refreshResult.state}`}>
    <CheckIcon /> Refresh completed
    • {refreshResult.eventCount} events
    • {refreshResult.operationalState}
    {refreshResult.warnings?.length > 0 && (
      <ul>
        {refreshResult.warnings.map(w => <li key={w}>{w}</li>)}
      </ul>
    )}
  </div>
)}
```

**Value:** Parents can force update when they know schedule changed.

---

#### 1.3 Per-Feed Health Indicators

**Enhance FeedItem.tsx to show health:**

```tsx
<div className="feed-item">
  {/* Health Badge */}
  <div className="feed-health-badge">
    {feedHealth.ok && feedHealth.eventCount > 0 && (
      <span className="badge badge-success">
        ✓ {feedHealth.eventCount} events
      </span>
    )}

    {feedHealth.ok && feedHealth.suspect && (
      <span className="badge badge-warning">
        ⚠ 0 events (suspect)
      </span>
    )}

    {!feedHealth.ok && (
      <span className="badge badge-error">
        ✗ Failed ({feedHealth.consecutiveFailures}x)
      </span>
    )}

    {feedHealth.detectedPlatform && (
      <span className="badge badge-info">
        {feedHealth.detectedPlatform}
      </span>
    )}
  </div>

  <div className="feed-info">
    <h3>{feed.name}</h3>
    <p className="feed-url">{redactedUrl}</p>
    <p className="feed-meta">
      Last check: {timeSince(feedHealth.lastCheck)}
      {feedHealth.previousEventCount && (
        <> • Was: {feedHealth.previousEventCount} events</>
      )}
    </p>
  </div>

  {/* ... rest of component */}
</div>
```

**Badge Colors:**
- Green: Feed healthy with events
- Yellow: Suspect (0 events), or small warning
- Red: Feed failing
- Blue: Platform detected

**Value:** Quickly identify problematic feeds.

---

#### 1.4 Feed Enable/Disable Toggle

**Add toggle switch to FeedItem:**

```tsx
<div className="feed-actions">
  <label className="toggle-switch">
    <input
      type="checkbox"
      checked={feed.enabled !== false}
      onChange={(e) => handleToggleEnabled(feed.id, e.target.checked)}
    />
    <span className="toggle-slider"></span>
    <span className="toggle-label">
      {feed.enabled !== false ? 'Enabled' : 'Disabled'}
    </span>
  </label>

  <button className="btn-secondary" onClick={() => setEditing(true)}>
    Edit
  </button>

  <button className="btn-danger" onClick={handleDelete}>
    Delete
  </button>
</div>
```

**Value:** Temporarily disable feeds during off-season without deletion.

---

### 🎯 Priority 2: Change Detection UI (High Value)

#### 2.1 Reschedule Notifications Panel

**Add dedicated panel for reschedules:**

```tsx
<ReschedulesPanel>
  <h3>
    <CalendarIcon /> Recent Schedule Changes
    {rescheduledEvents.length > 0 && (
      <span className="badge badge-warning">{rescheduledEvents.length}</span>
    )}
  </h3>

  {rescheduledEvents.length === 0 ? (
    <div className="empty-state">
      <CheckIcon /> No schedule changes detected in the last 7 days
    </div>
  ) : (
    <div className="reschedule-list">
      {rescheduledEvents.map(event => (
        <div key={event.uid} className="reschedule-item">
          <div className="event-title">{event.summary}</div>
          <div className="event-source">{event.feedName}</div>

          {event.changes.time && (
            <div className="change-detail time-change">
              <ClockIcon />
              <span className="change-from">{formatTime(event.changes.time.from)}</span>
              <ArrowIcon />
              <span className="change-to">{formatTime(event.changes.time.to)}</span>
            </div>
          )}

          {event.changes.location && (
            <div className="change-detail location-change">
              <LocationIcon />
              <span className="change-from">{event.changes.location.from}</span>
              <ArrowIcon />
              <span className="change-to">{event.changes.location.to}</span>
            </div>
          )}

          <div className="change-meta">
            Detected {timeAgo(event.detectedAt)}
          </div>
        </div>
      ))}
    </div>
  )}
</ReschedulesPanel>
```

**Design:**
- Prominent placement (top of main content or separate tab)
- Time/location changes clearly highlighted
- Before → After visualization
- Timestamp showing when detected
- Badge count for visibility

**Value:** Parents immediately see game time/location changes!

---

#### 2.2 Feed Change Alerts Panel

**Show feed event count changes:**

```tsx
<FeedAlertsPanel>
  <h3>
    <BellIcon /> Feed Alerts
    {alertCount > 0 && <span className="badge badge-warning">{alertCount}</span>}
  </h3>

  {feedChangeAlerts.map(alert => (
    <div key={alert.feedId} className={`alert-item alert-${alert.severity}`}>
      <div className="alert-icon">
        {alert.severity === 'warning' && <WarningIcon />}
        {alert.severity === 'info' && <InfoIcon />}
      </div>

      <div className="alert-content">
        <strong>{alert.feedName}</strong>
        <p>{formatChangeType(alert.change)}</p>
        <p className="alert-meta">
          {alert.previousCount} events → {alert.currentCount} events
          ({alert.percentChange > 0 ? '+' : ''}{alert.percentChange}%)
        </p>
      </div>

      <button className="btn-link" onClick={() => viewFeed(alert.feedId)}>
        View Feed
      </button>
    </div>
  ))}
</FeedAlertsPanel>
```

**Alert Types Display:**
- **events-to-zero** (⚠️): "Feed went from 20 events to 0 - May be off-season or broken"
- **zero-to-events** (ℹ️): "Feed recovered - Now has 15 events"
- **significant-drop** (⚠️): "Event count dropped 65% - Verify feed is correct"
- **significant-increase** (ℹ️): "Event count increased 150% - Season may have started"

**Value:** Detect broken feeds vs. off-season transitions.

---

#### 2.3 Potential Duplicates Review

**Add duplicates panel:**

```tsx
<DuplicatesPanel>
  <h3>
    <DuplicateIcon /> Potential Duplicates
    {potentialDuplicates.length > 0 && (
      <span className="badge badge-info">{potentialDuplicates.length}</span>
    )}
  </h3>

  {potentialDuplicates.map(dup => (
    <div key={`${dup.date}-${dup.summary}`} className="duplicate-group">
      <div className="duplicate-header">
        <strong>{dup.summary}</strong>
        <span className="duplicate-date">{formatDate(dup.date)}</span>
        <span className={`confidence-badge confidence-${dup.confidence}`}>
          {dup.confidence} confidence
        </span>
      </div>

      <div className="duplicate-instances">
        {dup.instances.map(instance => (
          <div key={instance.uid} className="instance">
            <div className="instance-source">{instance.feedName}</div>
            <div className="instance-time">{formatTime(instance.time)}</div>
            <div className="instance-location">{instance.location}</div>
          </div>
        ))}
      </div>

      <div className="duplicate-actions">
        <button className="btn-link" onClick={() => viewInCalendar(dup)}>
          View in Calendar
        </button>
        <button className="btn-link" onClick={() => markNotDuplicate(dup)}>
          Not a Duplicate
        </button>
      </div>
    </div>
  ))}
</DuplicatesPanel>
```

**Confidence Indicators:**
- 🔴 High: Red badge (same time, likely true duplicate)
- 🟡 Medium: Yellow badge (within 2 hours, possibly duplicate)
- 🟢 Low: Green badge (different times, probably separate events)

**Value:** Review and clean up duplicate feeds.

---

### 🎯 Priority 3: Enhanced Feed Management

#### 3.1 Feed Validation Visual Feedback

**When editing feed URL, show validation results:**

```tsx
<FeedForm>
  <input
    type="url"
    value={url}
    onChange={handleUrlChange}
    onBlur={triggerValidation}  // Validate on blur
  />

  {validating && (
    <div className="validation-progress">
      <Spinner /> Validating feed...
    </div>
  )}

  {validationResult && (
    <div className={`validation-result ${validationResult.valid ? 'valid' : 'invalid'}`}>
      {validationResult.valid ? (
        <>
          <CheckIcon /> Feed is valid
          <div className="validation-details">
            <span>{validationResult.eventCount} events found</span>
            {validationResult.detectedPlatform && (
              <span className="badge badge-info">{validationResult.detectedPlatform}</span>
            )}
            {validationResult.eventDateRange && (
              <span>
                {formatDate(validationResult.eventDateRange.earliest)} -
                {formatDate(validationResult.eventDateRange.latest)}
              </span>
            )}
          </div>

          {validationResult.sampleEvents && (
            <details>
              <summary>Sample events ({validationResult.sampleEvents.length})</summary>
              <ul>
                {validationResult.sampleEvents.map(title => <li key={title}>{title}</li>)}
              </ul>
            </details>
          )}

          {validationResult.warnings && (
            <div className="validation-warnings">
              {validationResult.warnings.map(w => (
                <div key={w} className="warning-item">⚠️ {w}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <ErrorIcon /> Feed validation failed
          <div className="validation-error">{validationResult.error}</div>
        </>
      )}
    </div>
  )}
</FeedForm>
```

**Value:** Know feed is valid before saving, see what platform it's from.

---

#### 3.2 Feed Status Card (Enhanced)

**Replace basic feed item with rich status card:**

```tsx
<div className={`feed-card feed-status-${feedStatus.status}`}>
  {/* Header with name and status */}
  <div className="feed-card-header">
    <div className="feed-title">
      <h3>{feed.name}</h3>
      {feedStatus.detectedPlatform && (
        <span className="platform-badge">{feedStatus.detectedPlatform}</span>
      )}
    </div>

    <div className="feed-status-indicator">
      {feedStatus.status === 'healthy' && (
        <span className="status-healthy">● Healthy</span>
      )}
      {feedStatus.status === 'suspect' && (
        <span className="status-warning">● Suspect (0 events)</span>
      )}
      {feedStatus.status === 'failed' && (
        <span className="status-error">
          ● Failed ({feedStatus.consecutiveFailures}x)
        </span>
      )}
    </div>
  </div>

  {/* Metrics row */}
  <div className="feed-metrics">
    <div className="metric">
      <span className="metric-label">Events</span>
      <span className="metric-value">
        {feedStatus.eventCount}
        {feedStatus.previousEventCount && feedStatus.previousEventCount !== feedStatus.eventCount && (
          <span className={`metric-change ${feedStatus.eventCount > feedStatus.previousEventCount ? 'positive' : 'negative'}`}>
            {feedStatus.eventCount > feedStatus.previousEventCount ? '↑' : '↓'}
            {Math.abs(feedStatus.eventCount - feedStatus.previousEventCount)}
          </span>
        )}
      </span>
    </div>

    <div className="metric">
      <span className="metric-label">Last Check</span>
      <span className="metric-value">{timeAgo(feedStatus.lastCheck)}</span>
    </div>

    {feedStatus.nextCheck && (
      <div className="metric">
        <span className="metric-label">Next Check</span>
        <span className="metric-value">{timeUntil(feedStatus.nextCheck)}</span>
      </div>
    )}
  </div>

  {/* Warnings/Alerts */}
  {feedStatus.alerts?.length > 0 && (
    <div className="feed-alerts">
      {feedStatus.alerts.map(alert => (
        <div key={alert.type} className={`feed-alert alert-${alert.severity}`}>
          <AlertIcon severity={alert.severity} />
          {alert.message}
        </div>
      ))}
    </div>
  )}

  {/* Actions */}
  <div className="feed-actions">
    <label className="toggle-compact">
      <input
        type="checkbox"
        checked={feed.enabled !== false}
        onChange={(e) => handleToggle(e.target.checked)}
      />
      <span>Enabled</span>
    </label>

    <button className="btn-icon" onClick={() => setEditing(true)} title="Edit">
      <EditIcon />
    </button>

    <button className="btn-icon" onClick={handleRefreshFeed} title="Refresh this feed">
      <RefreshIcon />
    </button>

    <button className="btn-icon btn-danger" onClick={handleDelete} title="Delete">
      <TrashIcon />
    </button>
  </div>
</div>
```

**Design Features:**
- Card-based layout (already established)
- Color-coded status indicator (dot + text)
- Metrics with change indicators (↑ ↓)
- Platform badge
- Alert chips for warnings
- Quick-action buttons (enable/disable toggle, individual refresh)

**Value:** Complete feed health at a glance.

---

### 🎯 Priority 4: Dashboard & Overview

#### 4.1 Dashboard Tab (New View)

**Add "Dashboard" as primary view:**

```tsx
<nav className="app-nav">
  <button onClick={() => setView('dashboard')}>Dashboard</button>
  <button onClick={() => setView('feeds')}>Feeds</button>
  <button onClick={() => setView('changes')}>Changes</button>
  <button onClick={() => setView('settings')}>Settings</button>
</nav>
```

**Dashboard layout:**

```tsx
<div className="dashboard">
  {/* Hero metrics */}
  <div className="dashboard-hero">
    <MetricCard
      icon={<CalendarIcon />}
      label="Total Events"
      value={status.mergedEventCount}
      trend={calculateTrend(status)}
    />

    <MetricCard
      icon={<GameIcon />}
      label="Games Only"
      value={status.gamesOnlyMergedEventCount}
    />

    <MetricCard
      icon={<FeedIcon />}
      label="Active Feeds"
      value={status.sourceFeedCount}
      sublabel={`${failedCount} failed`}
    />

    <MetricCard
      icon={<ClockIcon />}
      label="Calendar Age"
      value={formatAge(status.checkAgeHours?.fullCalendar)}
      status={status.checkAgeHours?.fullCalendar > 2 ? 'warning' : 'success'}
    />
  </div>

  {/* Calendar freshness */}
  <div className="dashboard-section">
    <h3>Calendar Freshness</h3>
    <div className="freshness-cards">
      <div className="freshness-card">
        <h4>Full Calendar</h4>
        <div className="freshness-indicator">
          <div className={`freshness-bar ${getFreshnessStatus(status.checkAgeHours?.fullCalendar)}`}>
            <div className="freshness-fill" style={{ width: `${getFreshnessPercentage(status.checkAgeHours?.fullCalendar)}%` }}></div>
          </div>
          <span>{formatAge(status.checkAgeHours?.fullCalendar)}</span>
        </div>
        <p className="freshness-meta">
          Last updated: {formatTimestamp(status.lastSuccessfulCheck?.fullCalendar)}
        </p>
      </div>

      <div className="freshness-card">
        <h4>Games Calendar</h4>
        <div className="freshness-indicator">
          <div className={`freshness-bar ${getFreshnessStatus(status.checkAgeHours?.gamesCalendar)}`}>
            <div className="freshness-fill" style={{ width: `${getFreshnessPercentage(status.checkAgeHours?.gamesCalendar)}%` }}></div>
          </div>
          <span>{formatAge(status.checkAgeHours?.gamesCalendar)}</span>
        </div>
        <p className="freshness-meta">
          Last updated: {formatTimestamp(status.lastSuccessfulCheck?.gamesCalendar)}
        </p>
      </div>
    </div>
  </div>

  {/* Feed health overview */}
  <div className="dashboard-section">
    <h3>Feed Health</h3>
    <div className="feed-health-grid">
      {status.sourceStatuses.map(feed => (
        <div key={feed.id} className={`feed-health-card status-${getHealthStatus(feed)}`}>
          <div className="feed-health-icon">
            {getHealthIcon(feed)}
          </div>
          <div className="feed-health-info">
            <strong>{feed.name}</strong>
            <span>{feed.eventCount} events</span>
            {feed.suspect && <span className="suspect-label">⚠ Suspect</span>}
            {feed.consecutiveFailures > 0 && (
              <span className="failure-count">Failed {feed.consecutiveFailures}x</span>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
</div>
```

**Value:** Complete service overview in one glance.

---

#### 4.2 Changes Tab (New View)

**Dedicated view for all changes:**

```tsx
<div className="changes-view">
  {/* Summary cards */}
  <div className="change-summary-cards">
    <SummaryCard
      icon={<RescheduleIcon />}
      count={rescheduledEvents.length}
      label="Reschedules"
      status="warning"
    />

    <SummaryCard
      icon={<DuplicateIcon />}
      count={potentialDuplicates.length}
      label="Potential Duplicates"
      status="info"
    />

    <SummaryCard
      icon={<CancelIcon />}
      count={status.cancelledEventsFiltered}
      label="Cancelled Events"
      status="neutral"
    />

    <SummaryCard
      icon={<AlertIcon />}
      count={feedChangeAlerts.length}
      label="Feed Alerts"
      status="warning"
    />
  </div>

  {/* Tabbed content */}
  <Tabs>
    <Tab label={`Reschedules (${rescheduledEvents.length})`}>
      <ReschedulesPanel /> {/* From 2.1 above */}
    </Tab>

    <Tab label={`Duplicates (${potentialDuplicates.length})`}>
      <DuplicatesPanel /> {/* From 2.3 */}
    </Tab>

    <Tab label={`Feed Alerts (${feedChangeAlerts.length})`}>
      <FeedAlertsPanel /> {/* From 2.2 */}
    </Tab>
  </Tabs>
</div>
```

**Value:** Central location for all change detection features.

---

### 🎯 Priority 5: Modern UX Enhancements

#### 5.1 Real-Time Status Updates

**Use polling or SSE to keep UI fresh:**

```tsx
// Poll status.json every 30 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    try {
      const status = await fetch('/status.json').then(r => r.json());
      updateServiceStatus(status);
    } catch (error) {
      // Handle silently or show toast
    }
  }, 30000);

  return () => clearInterval(interval);
}, []);
```

**With visual indicator:**
```tsx
<div className="status-indicator">
  <div className="pulse-dot"></div>
  <span>Live • Updated {timeAgo(lastUpdate)}</span>
</div>
```

**Value:** Always showing current state without manual refresh.

---

#### 5.2 Toast Notifications

**Replace alert() and error divs with toast system:**

```tsx
<ToastContainer>
  {toasts.map(toast => (
    <Toast
      key={toast.id}
      type={toast.type}
      message={toast.message}
      onDismiss={() => dismissToast(toast.id)}
      autoHide={toast.type !== 'error'}
    />
  ))}
</ToastContainer>
```

**Toast types:**
- Success (green): "Feed created successfully"
- Warning (yellow): "Feed returned 0 events"
- Error (red): "Failed to update feed"
- Info (blue): "Refresh triggered automatically"

**Position:** Top-right corner, stacked
**Auto-dismiss:** Success/Info after 3s, Warning after 5s, Error stays until dismissed

**Value:** Non-blocking notifications, modern UX.

---

#### 5.3 Search and Filter

**Add to Feeds view:**

```tsx
<div className="feeds-toolbar">
  <input
    type="search"
    placeholder="Search feeds..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="search-input"
  />

  <div className="filter-chips">
    <FilterChip
      label="All"
      active={filter === 'all'}
      count={feeds.length}
      onClick={() => setFilter('all')}
    />

    <FilterChip
      label="Healthy"
      active={filter === 'healthy'}
      count={healthyFeeds.length}
      onClick={() => setFilter('healthy')}
    />

    <FilterChip
      label="Suspect"
      active={filter === 'suspect'}
      count={suspectFeeds.length}
      onClick={() => setFilter('suspect')}
    />

    <FilterChip
      label="Failed"
      active={filter === 'failed'}
      count={failedFeeds.length}
      onClick={() => setFilter('failed')}
    />

    <FilterChip
      label="Disabled"
      active={filter === 'disabled'}
      count={disabledFeeds.length}
      onClick={() => setFilter('disabled')}
    />
  </div>

  <div className="view-toggle">
    <button
      className={viewMode === 'grid' ? 'active' : ''}
      onClick={() => setViewMode('grid')}
    >
      <GridIcon />
    </button>
    <button
      className={viewMode === 'list' ? 'active' : ''}
      onClick={() => setViewMode('list')}
    >
      <ListIcon />
    </button>
  </div>
</div>
```

**Value:** Find specific feeds quickly, filter by health status.

---

#### 5.4 Bulk Operations

**Add bulk selection:**

```tsx
<div className="bulk-actions">
  <label>
    <input
      type="checkbox"
      checked={selectedFeeds.length === feeds.length}
      onChange={toggleSelectAll}
    />
    Select All ({selectedFeeds.length} selected)
  </label>

  {selectedFeeds.length > 0 && (
    <div className="bulk-action-buttons">
      <button onClick={bulkEnable}>
        <CheckIcon /> Enable Selected
      </button>
      <button onClick={bulkDisable}>
        <XIcon /> Disable Selected
      </button>
      <button onClick={bulkRefresh}>
        <RefreshIcon /> Refresh Selected
      </button>
      <button onClick={bulkDelete} className="btn-danger">
        <TrashIcon /> Delete Selected
      </button>
    </div>
  )}
</div>
```

**Value:** Manage multiple feeds at once (e.g., disable all during off-season).

---

### 🎯 Priority 6: Advanced Features

#### 6.1 Timeline View for Reschedules

**Visualize schedule changes over time:**

```tsx
<TimelineView>
  {groupedByDate(rescheduledEvents).map(({date, events}) => (
    <div key={date} className="timeline-date-group">
      <div className="timeline-date">{formatDate(date)}</div>
      <div className="timeline-events">
        {events.map(event => (
          <div key={event.uid} className="timeline-event">
            <div className="timeline-marker"></div>
            <div className="timeline-content">
              <strong>{event.summary}</strong>
              <div className="timeline-changes">
                {event.changes.time && (
                  <div className="timeline-change">
                    <ClockIcon />
                    <s>{formatTime(event.changes.time.from)}</s>
                    <span>{formatTime(event.changes.time.to)}</span>
                  </div>
                )}
                {event.changes.location && (
                  <div className="timeline-change">
                    <LocationIcon />
                    <s>{event.changes.location.from}</s>
                    <span>{event.changes.location.to}</span>
                  </div>
                )}
              </div>
              <div className="timeline-meta">
                {event.feedName} • Detected {timeAgo(event.detectedAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  ))}
</TimelineView>
```

**Visual Design:**
- Vertical timeline with markers
- Grouped by date
- Strikethrough for old values
- Color highlight for new values

**Value:** See reschedule history at a glance.

---

#### 6.2 Calendar Preview Widget

**Show upcoming events from merged calendar:**

```tsx
<UpcomingEventsWidget>
  <h3>Next 7 Days</h3>

  {upcomingEvents.map(event => (
    <div key={event.uid} className="upcoming-event">
      <div className="event-date">
        <div className="date-day">{formatDay(event.start)}</div>
        <div className="date-month">{formatMonth(event.start)}</div>
      </div>

      <div className="event-details">
        <strong>{event.title}</strong>
        <div className="event-meta">
          <span><ClockIcon /> {formatTime(event.start)}</span>
          {event.location && <span><LocationIcon /> {event.location}</span>}
          <span className="event-source">{event.sourceName}</span>
        </div>

        {event.isRescheduled && (
          <span className="event-badge badge-warning">
            Rescheduled
          </span>
        )}

        {event.isPotentialDuplicate && (
          <span className="event-badge badge-info">
            Possible Duplicate
          </span>
        )}
      </div>
    </div>
  ))}

  <button className="btn-link" onClick={openFullCalendar}>
    View Full Calendar →
  </button>
</UpcomingEventsWidget>
```

**Value:** Preview calendar without leaving management UI.

---

#### 6.3 Feed Health Chart

**Visual representation of feed reliability:**

```tsx
<FeedHealthChart>
  <h3>Feed Reliability (Last 30 Days)</h3>

  <div className="chart-container">
    {feeds.map(feed => (
      <div key={feed.id} className="chart-row">
        <div className="chart-label">{feed.name}</div>

        <div className="chart-bar">
          <div
            className="chart-fill chart-fill-success"
            style={{ width: `${feed.successRate}%` }}
            title={`${feed.successRate}% success rate`}
          >
            {feed.successRate}%
          </div>
        </div>

        <div className="chart-meta">
          {feed.totalAttempts} checks
        </div>
      </div>
    ))}
  </div>
</FeedHealthChart>
```

**Value:** Identify consistently unreliable feeds.

---

#### 6.4 Duplicate Review Workflow

**Guided workflow to handle duplicates:**

```tsx
<DuplicateReviewModal duplicate={selectedDuplicate}>
  <h2>Review Potential Duplicate</h2>

  <div className="duplicate-comparison">
    {duplicate.instances.map((instance, index) => (
      <div key={instance.uid} className="instance-card">
        <div className="instance-header">
          <span className="instance-number">Option {index + 1}</span>
          <span className="instance-source">{instance.feedName}</span>
        </div>

        <div className="instance-details">
          <h3>{duplicate.summary}</h3>
          <p><ClockIcon /> {formatTime(instance.time)}</p>
          <p><LocationIcon /> {instance.location || 'No location'}</p>
        </div>

        <button className="btn-primary" onClick={() => keepThisOne(instance)}>
          Keep This One
        </button>
      </div>
    ))}
  </div>

  <div className="duplicate-actions">
    <button className="btn-secondary" onClick={() => keepBoth()}>
      Keep Both (Not a Duplicate)
    </button>
    <button className="btn-link" onClick={closeModal}>
      Skip
    </button>
  </div>
</DuplicateReviewModal>
```

**Workflow:**
1. Show all instances side-by-side
2. Let user pick which to keep
3. Mark decision (persist to avoid showing again)
4. Auto-navigate to next duplicate

**Value:** Clean up duplicate feeds systematically.

---

### 🎯 Priority 7: Mobile Optimization

#### 7.1 Responsive Dashboard

**Mobile-first breakpoints:**

```css
/* Mobile first */
.dashboard-hero {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

/* Tablet */
@media (min-width: 640px) {
  .dashboard-hero {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .dashboard-hero {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

#### 7.2 Hamburger Menu for Mobile

**Collapsible navigation:**

```tsx
<header className="app-header">
  <div className="header-top">
    <h1>Calendar Merge</h1>
    <button className="hamburger-menu" onClick={toggleMenu}>
      <MenuIcon />
    </button>
  </div>

  <nav className={`app-nav ${menuOpen ? 'open' : ''}`}>
    {/* Navigation items */}
  </nav>
</header>
```

#### 7.3 Touch-Friendly Actions

**Larger touch targets, swipe actions:**

```tsx
<div className="feed-item" onSwipeLeft={showActions}>
  {/* Feed content */}

  <div className="swipe-actions">
    <button className="swipe-action action-edit">
      <EditIcon /> Edit
    </button>
    <button className="swipe-action action-disable">
      <ToggleIcon /> Disable
    </button>
    <button className="swipe-action action-delete">
      <TrashIcon /> Delete
    </button>
  </div>
</div>
```

**Value:** Better mobile experience for parents on-the-go.

---

### 🎯 Priority 8: User Experience Polish

#### 8.1 Loading Skeletons

**Replace "Loading..." with skeleton screens:**

```tsx
<FeedListSkeleton>
  {[1, 2, 3].map(i => (
    <div key={i} className="feed-skeleton">
      <div className="skeleton-line skeleton-title"></div>
      <div className="skeleton-line skeleton-url"></div>
      <div className="skeleton-line skeleton-meta"></div>
    </div>
  ))}
</FeedListSkeleton>
```

**Value:** Perceived performance improvement.

---

#### 8.2 Empty States with Actions

**Contextual empty states:**

```tsx
{/* No reschedules */}
<div className="empty-state">
  <RescheduleIcon className="empty-icon" />
  <h3>No Schedule Changes</h3>
  <p>When game times or locations change, they'll appear here.</p>
  <p className="empty-meta">We're monitoring the next 7 days for changes.</p>
</div>

{/* No duplicates */}
<div className="empty-state">
  <CheckCircleIcon className="empty-icon" />
  <h3>No Duplicates Detected</h3>
  <p>Your calendar feeds are clean!</p>
</div>

{/* All feeds failed */}
<div className="empty-state empty-state-error">
  <ErrorIcon className="empty-icon" />
  <h3>Unable to Load Feeds</h3>
  <p>All calendar feeds failed to fetch. This may be temporary.</p>
  <button className="btn-primary" onClick={retryAll}>
    <RefreshIcon /> Retry All Feeds
  </button>
</div>
```

**Value:** Guide users on what to do next.

---

#### 8.3 Contextual Help

**Add help tooltips and info panels:**

```tsx
<InfoTooltip content="This feed returned 0 events but previously had 20. This may indicate off-season or a broken feed.">
  <InfoIcon />
</InfoTooltip>

<ExpandableHelp>
  <summary>What does "suspect" mean?</summary>
  <p>
    A suspect feed is one that successfully fetches but returns 0 events when it
    previously had events. This often happens during off-season transitions.
  </p>
  <p>
    <strong>Action:</strong> Check the source platform to verify if this is expected.
  </p>
</ExpandableHelp>
```

**Value:** Self-service troubleshooting.

---

#### 8.4 Keyboard Shortcuts

**Power-user features:**

```tsx
// Global shortcuts
useKeyboardShortcut('cmd+k', openSearch);
useKeyboardShortcut('cmd+r', triggerManualRefresh);
useKeyboardShortcut('cmd+n', openNewFeedForm);
useKeyboardShortcut('?', toggleShortcutsHelp);

<ShortcutsPanel>
  <h3>Keyboard Shortcuts</h3>
  <dl>
    <dt>⌘ + K</dt><dd>Search feeds</dd>
    <dt>⌘ + R</dt><dd>Manual refresh</dd>
    <dt>⌘ + N</dt><dd>New feed</dd>
    <dt>?</dt><dd>Show shortcuts</dd>
  </dl>
</ShortcutsPanel>
```

**Value:** Faster navigation for frequent users.

---

### 🎯 Priority 9: Data Visualization

#### 9.1 Event Count Trend Chart

**Show event count over time:**

```tsx
<EventTrendChart>
  <ResponsiveContainer width="100%" height={200}>
    <LineChart data={historicalData}>
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Line type="monotone" dataKey="eventCount" stroke="#0f766e" name="Total Events" />
      <Line type="monotone" dataKey="gamesOnly" stroke="#0891b2" name="Games Only" />
    </LineChart>
  </ResponsiveContainer>
</EventTrendChart>
```

**Data source:** Store historical status.json snapshots (client-side or backend)

**Value:** Visualize season patterns, detect anomalies.

---

#### 9.2 Feed Comparison Matrix

**Side-by-side feed comparison:**

```tsx
<FeedComparisonTable>
  <table>
    <thead>
      <tr>
        <th>Feed</th>
        <th>Status</th>
        <th>Events</th>
        <th>Last Check</th>
        <th>Platform</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {feeds.map(feed => (
        <tr key={feed.id} className={`status-${getFeedStatus(feed)}`}>
          <td>
            <div className="feed-name">{feed.name}</div>
            <div className="feed-id-small">{feed.id}</div>
          </td>
          <td>
            <StatusBadge status={getFeedStatus(feed)} />
          </td>
          <td>
            <div className="event-count">
              {feed.eventCount}
              {feed.eventCountChange && (
                <span className="count-change">{feed.eventCountChange}</span>
              )}
            </div>
          </td>
          <td>{timeAgo(feed.lastCheck)}</td>
          <td>{feed.platform || '—'}</td>
          <td>
            <ActionButtons feed={feed} />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</FeedComparisonTable>
```

**Value:** Quick comparison across all feeds.

---

### 🎯 Priority 10: Parent-Focused Features

#### 10.1 Notification Preferences (Future)

**Let parents opt-in to alerts:**

```tsx
<NotificationSettings>
  <h3>Get Notified When:</h3>

  <label className="notification-option">
    <input type="checkbox" checked={notify.reschedules} onChange={...} />
    <div>
      <strong>Game Times Change</strong>
      <p>Email me when games are rescheduled</p>
    </div>
  </label>

  <label className="notification-option">
    <input type="checkbox" checked={notify.cancellations} onChange={...} />
    <div>
      <strong>Events Cancelled</strong>
      <p>Email me when events are cancelled</p>
    </div>
  </label>

  <label className="notification-option">
    <input type="checkbox" checked={notify.newEvents} onChange={...} />
    <div>
      <strong>New Events Added</strong>
      <p>Email me when new events appear</p>
    </div>
  </label>

  <input type="email" placeholder="your-email@example.com" />
  <button className="btn-primary">Save Preferences</button>
</NotificationSettings>
```

**Backend needed:** Email service integration (SendGrid, etc.)

**Value:** Proactive notifications for busy parents.

---

#### 10.2 iCal Subscription Instructions

**Make it easy to subscribe:**

```tsx
<SubscriptionPanel>
  <h3>Subscribe to Your Calendar</h3>
  <p>Add this URL to your calendar app to get automatic updates:</p>

  <div className="subscription-url-box">
    <input
      type="text"
      value={calendarUrl}
      readOnly
      ref={urlInput}
    />
    <button onClick={copyToClipboard}>
      <CopyIcon /> Copy
    </button>
  </div>

  <div className="subscription-instructions">
    <details>
      <summary>How to subscribe in Google Calendar</summary>
      <ol>
        <li>Open Google Calendar</li>
        <li>Click + next to "Other calendars"</li>
        <li>Select "From URL"</li>
        <li>Paste the URL above</li>
        <li>Click "Add calendar"</li>
      </ol>
    </details>

    <details>
      <summary>How to subscribe in Apple Calendar</summary>
      <ol>
        <li>Open Calendar app</li>
        <li>File → New Calendar Subscription</li>
        <li>Paste the URL above</li>
        <li>Click "Subscribe"</li>
      </ol>
    </details>

    <details>
      <summary>How to subscribe in Outlook</summary>
      <ol>
        <li>Open Outlook Calendar</li>
        <li>Add Calendar → From Internet</li>
        <li>Paste the URL above</li>
        <li>Click "OK"</li>
      </ol>
    </details>
  </div>
</SubscriptionPanel>
```

**Value:** Self-service calendar subscription.

---

### 🎯 Priority 11: Settings Enhancements

#### 11.1 Update Settings Descriptions

**Settings.tsx - Update refresh schedule descriptions based on platform research:**

```tsx
{
  value: 'every-15-min',
  label: 'Every 15 Minutes',
  description: 'Aggressive - Use only if you need near real-time updates (may hit rate limits)',
  recommended: false,
},
{
  value: 'every-30-min',
  label: 'Every 30 Minutes (Recommended)',
  description: 'Best for most platforms - Safe for GameChanger, TeamSnap, SportsEngine',
  recommended: true,
},
{
  value: 'hourly',
  label: 'Every Hour',
  description: 'Conservative - Good for TeamSnap, TeamLinkt, SportsConnect',
  recommended: false,
},
{
  value: 'every-2-hours',
  label: 'Every 2 Hours',
  description: 'Recommended for LeagueApps (slow updates, creates separate reschedule events)',
  recommended: false,
},
```

**Add platform-specific recommendations.**

---

#### 11.2 Polling Interval Estimator

**Help users choose:**

```tsx
<PollingEstimator>
  <h4>What schedule should I use?</h4>

  <div className="platform-recommendations">
    {feeds.map(feed => (
      <div key={feed.id} className="platform-rec">
        <span>{feed.name}</span>
        {feed.detectedPlatform && (
          <span className="rec-label">
            {feed.detectedPlatform}:
            <strong>{getRecommendedInterval(feed.detectedPlatform)}</strong>
          </span>
        )}
      </div>
    ))}

    <div className="rec-summary">
      <strong>Recommended:</strong> {calculateOptimalInterval(feeds)}
      <p>Based on your slowest feed platform</p>
    </div>
  </div>
</PollingEstimator>
```

**Logic:** Recommend interval based on slowest feed (LeagueApps = 2 hours, etc.)

**Value:** Informed decision-making.

---

### 🎯 Priority 12: Accessibility (A11y)

#### 12.1 ARIA Labels and Roles

```tsx
<button
  aria-label="Refresh all calendar feeds now"
  aria-busy={refreshing}
  onClick={handleManualRefresh}
>
  Refresh Now
</button>

<div role="alert" aria-live="polite">
  {successMessage}
</div>

<div role="status" aria-live="assertive">
  {error}
</div>
```

#### 12.2 Keyboard Navigation

```tsx
// Focus management
<FeedList>
  {feeds.map((feed, index) => (
    <FeedItem
      key={feed.id}
      feed={feed}
      tabIndex={0}
      onKeyDown={(e) => handleKeyboardNav(e, index)}
      {...props}
    />
  ))}
</FeedList>
```

#### 12.3 Screen Reader Announcements

```tsx
<VisuallyHidden>
  <div aria-live="polite" aria-atomic="true">
    {`${feeds.length} feeds loaded. ${healthyCount} healthy, ${failedCount} failed.`}
  </div>
</VisuallyHidden>
```

**Value:** Accessibility for all users.

---

## Modern Design System

### Component Library Recommendations

**Option 1: Headless UI + Tailwind CSS**
- Headless UI for accessible components
- Tailwind for utility-first styling
- shadcn/ui for pre-built components

**Option 2: Radix UI + CSS Modules**
- Radix primitives for complex components
- CSS modules for styling
- Full control over design

**Option 3: Material UI (MUI)**
- Complete component library
- Established design system
- Quick implementation

**Recommendation:** **Radix UI + Tailwind** (modern, accessible, flexible)

---

### Color Scheme Enhancement

**Expand current teal/slate palette:**

```css
:root {
  /* Primary */
  --primary-50: #f0fdfa;
  --primary-100: #ccfbf1;
  --primary-500: #14b8a6;  /* Current primary */
  --primary-600: #0d9488;
  --primary-700: #0f766e;  /* Current */

  /* Semantic colors */
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;

  /* Grays */
  --gray-50: #f8fafc;
  --gray-100: #f1f5f9;
  --gray-500: #64748b;
  --gray-700: #334155;
  --gray-900: #0f172a;

  /* Functional */
  --bg-healthy: var(--success);
  --bg-degraded: var(--warning);
  --bg-failed: var(--error);
  --bg-suspect: var(--warning);
}
```

---

### Typography Scale

```css
:root {
  /* Type scale */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;

  /* Line heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  /* Font weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

---

### Component Patterns

**Card Component:**
```tsx
<Card variant="default" | "outlined" | "elevated">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardAction>Action Button</CardAction>
  </CardHeader>
  <CardContent>
    Content here
  </CardContent>
  <CardFooter>
    Footer actions
  </CardFooter>
</Card>
```

**Badge Component:**
```tsx
<Badge variant="success" | "warning" | "error" | "info" | "neutral">
  Label
</Badge>
```

**Button Variants:**
```tsx
<Button variant="primary" | "secondary" | "danger" | "ghost" | "link" size="sm" | "md" | "lg">
  Click me
</Button>
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (2-3 days)
1. Add service health banner
2. Add manual refresh button
3. Add per-feed health badges
4. Add enable/disable toggle
5. Add toast notifications

**Estimated effort:** 8-12 hours
**Value:** High - Major visibility improvements

---

### Phase 2: Change Detection UI (3-4 days)
1. Create Changes tab/view
2. Build reschedules panel
3. Build duplicates panel
4. Build feed alerts panel
5. Add real-time status polling

**Estimated effort:** 12-16 hours
**Value:** High - Leverages all new backend features

---

### Phase 3: Dashboard (4-5 days)
1. Create dashboard view
2. Build metrics cards
3. Add calendar freshness visualization
4. Add feed health grid
5. Add upcoming events widget

**Estimated effort:** 16-20 hours
**Value:** Medium-High - Great overview, useful for operators

---

### Phase 4: Advanced UX (5-7 days)
1. Add search and filtering
2. Implement bulk operations
3. Add duplicate review workflow
4. Build timeline view
5. Add feed validation visual feedback
6. Mobile optimization

**Estimated effort:** 20-28 hours
**Value:** Medium - Nice-to-have enhancements

---

### Phase 5: Polish & Accessibility (3-4 days)
1. Loading skeletons
2. Enhanced empty states
3. Contextual help/tooltips
4. Keyboard shortcuts
5. ARIA labels
6. Screen reader support
7. Mobile touch gestures

**Estimated effort:** 12-16 hours
**Value:** Medium - Professional polish

---

## Technical Implementation Notes

### State Management

**Current:** React useState (works for now)

**Recommendation for growth:**
- Add React Context for global state (service status, feed health)
- Consider Zustand for simple state management
- Or TanStack Query for server state caching

**Example with Context:**
```tsx
<ServiceStatusProvider>
  <App />
</ServiceStatusProvider>

// In components
const { status, refresh } = useServiceStatus();
```

---

### API Integration

**Current:** Direct fetch calls in components

**Recommendation:**
```tsx
// Use react-query (TanStack Query)
const { data: feeds, isLoading, error, refetch } = useQuery({
  queryKey: ['feeds'],
  queryFn: listFeeds,
  refetchInterval: 30000, // Auto-refetch every 30s
});

// Mutations with optimistic updates
const createFeedMutation = useMutation({
  mutationFn: createFeed,
  onSuccess: () => queryClient.invalidateQueries(['feeds']),
});
```

**Benefits:**
- Automatic caching
- Optimistic updates
- Retry logic
- Loading states
- Error handling

---

### Component Architecture

**Recommended structure:**

```
frontend/src/
├── components/
│   ├── ui/              # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Card.tsx
│   │   └── Toast.tsx
│   ├── feeds/           # Feed-specific components
│   │   ├── FeedList.tsx
│   │   ├── FeedItem.tsx
│   │   ├── FeedForm.tsx
│   │   └── FeedHealthCard.tsx
│   ├── dashboard/       # Dashboard components
│   │   ├── ServiceHealthBanner.tsx
│   │   ├── MetricCard.tsx
│   │   ├── FeedHealthGrid.tsx
│   │   └── UpcomingEvents.tsx
│   ├── changes/         # Change detection components
│   │   ├── ReschedulesPanel.tsx
│   │   ├── DuplicatesPanel.tsx
│   │   └── FeedAlertsPanel.tsx
│   └── layout/          # Layout components
│       ├── Header.tsx
│       ├── Navigation.tsx
│       └── Footer.tsx
├── hooks/               # Custom hooks
│   ├── useServiceStatus.ts
│   ├── useFeedHealth.ts
│   ├── useManualRefresh.ts
│   └── useToast.ts
├── lib/                 # Utilities
│   ├── api.ts           # API client
│   ├── formatters.ts    # Date/time formatting
│   └── constants.ts     # Constants
└── types/               # TypeScript types
    ├── api.ts           # API types
    └── domain.ts        # Domain types
```

---

### Styling Approach

**Current:** Plain CSS with CSS variables

**Recommendations:**

**Option A: Add Tailwind CSS (Recommended)**
```tsx
<div className="flex items-center gap-4 rounded-lg bg-white p-4 shadow-sm">
  <Badge variant="success">Healthy</Badge>
  <span className="text-sm text-gray-600">{feedCount} feeds</span>
</div>
```

**Benefits:**
- Rapid development
- Consistent spacing
- Responsive utilities
- Dark mode support built-in

**Option B: Keep CSS + Add CSS Modules**
```tsx
import styles from './FeedItem.module.css';

<div className={styles.feedItem}>
  <div className={styles.feedInfo}>...</div>
</div>
```

**Benefits:**
- Scoped styles (no conflicts)
- Better organization
- Type safety with TypeScript

---

### Dark Mode Support

**Add theme toggle:**

```tsx
const [theme, setTheme] = useState<'light' | 'dark'>('light');

<button onClick={toggleTheme}>
  {theme === 'light' ? <MoonIcon /> : <SunIcon />}
</button>
```

**CSS:**
```css
:root[data-theme='dark'] {
  --bg-gradient-start: #1e293b;
  --bg-gradient-end: #0f172a;
  --card-bg: rgba(30, 41, 59, 0.92);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --border-color: #334155;
}
```

**Value:** Better visibility in low-light, modern expectation.

---

## Quick Wins vs. Full Rebuild

### Quick Wins (Can implement today)

**Without changing architecture:**
1. Add service health banner (fetch status.json, display state)
2. Add manual refresh button (call POST /api/refresh)
3. Show feed health badges (from sourceStatuses)
4. Add enable/disable toggle (call PUT /api/feeds/{id})
5. Show reschedules (from status.json rescheduledEvents)

**Estimated: 4-6 hours of focused work**

```tsx
// Example: Service Health Banner (30 minutes)
function ServiceHealthBanner() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/status.json')
      .then(r => r.json())
      .then(setStatus);

    const interval = setInterval(() => {
      fetch('/status.json').then(r => r.json()).then(setStatus);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  return (
    <div className={`health-banner health-${status.operationalState}`}>
      <StatusIcon status={status.operationalState} />
      <div>
        <strong>Service {status.operationalState}</strong>
        {status.degradationReasons && (
          <span>{status.degradationReasons.join(' • ')}</span>
        )}
      </div>
    </div>
  );
}
```

---

### Full Rebuild (Modern stack)

**If doing major refactor:**

**Tech Stack:**
- **Framework:** Keep React 19
- **Styling:** Tailwind CSS
- **Components:** Radix UI primitives
- **Icons:** Lucide React (modern, consistent)
- **State:** TanStack Query for server state
- **Routing:** React Router (if adding more views)
- **Forms:** React Hook Form
- **Validation:** Zod

**Estimated:** 2-3 weeks
**Value:** Future-proof, maintainable, professional

---

## Design Mockup (Conceptual)

### Dashboard View

```
┌────────────────────────────────────────────────────────────┐
│ Calendar Merge                    [Dashboard][Feeds][...]  │
│                                                     [🔄][☰] │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ● Service Healthy                         Last: 5 min ago  │
│  3 feeds • 45 events • 12 games                             │
│                                                              │
├────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ 📅 45   │  │ 🏈 12   │  │ 📡 3    │  │ 🕐 0.5h │       │
│  │ Events  │  │ Games   │  │ Feeds   │  │ Age     │       │
│  │ ↑ +3    │  │         │  │ ✓ All OK│  │ Fresh   │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
├────────────────────────────────────────────────────────────┤
│  🔔 Recent Changes (2)                                      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Game vs Tigers                        GameChanger    │ │
│  │ 🕐 6:00 PM → 7:30 PM  📍 Field 4 → Field 5          │ │
│  │ Detected 10 minutes ago                              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                              │
├────────────────────────────────────────────────────────────┤
│  📊 Feed Health                                             │
│  GameChanger    ████████████████████░ 95%   ✓ Healthy      │
│  TeamSnap       ██████████████████░░░ 88%   ✓ Healthy      │
│  Athletics      ░░░░░░░░░░░░░░░░░░░░░  0%   ⚠ 0 events     │
└────────────────────────────────────────────────────────────┘
```

---

## Recommended Next Steps

### Immediate (Today)
1. Review this document
2. Decide on implementation approach (quick wins vs. full rebuild)
3. Prioritize features (which resonate most?)

### This Week (Quick Wins)
1. Add service health banner
2. Add manual refresh button
3. Add per-feed health indicators
4. Add enable/disable toggles
5. Show reschedules

### This Month (Full Enhancement)
1. Build Dashboard view
2. Build Changes view
3. Add all change detection panels
4. Implement real-time updates
5. Mobile optimization

### This Quarter (Polish)
1. Add notification preferences
2. Duplicate review workflow
3. Advanced visualizations
4. Full accessibility
5. Mobile app (if needed)

---

## Cost-Benefit Analysis

### High Value, Low Effort (Do First)
- ✅ Service health banner
- ✅ Manual refresh button
- ✅ Feed health badges
- ✅ Reschedule display

### High Value, Medium Effort
- ✅ Dashboard tab
- ✅ Changes tab
- ✅ Feed validation feedback
- ✅ Real-time updates

### Medium Value, Low Effort
- ✅ Toast notifications
- ✅ Enable/disable toggle
- ✅ Search/filter
- ✅ Empty state improvements

### Medium Value, High Effort
- Duplicate review workflow
- Timeline visualization
- Event trend charts
- Mobile app

### Low Value, Any Effort (Defer)
- Keyboard shortcuts (power users only)
- Bulk operations (rarely needed)
- Theme customization

---

## User Personas & Priorities

### Persona 1: Busy Parent (Primary User)
**Needs:**
- Know when games are rescheduled (HIGH)
- Easy calendar subscription (HIGH)
- Know if calendar is up-to-date (MEDIUM)
- Manage multiple team feeds (MEDIUM)

**UI Priorities:**
1. Reschedule notifications panel ⭐⭐⭐
2. Service health banner ⭐⭐⭐
3. Calendar subscription instructions ⭐⭐
4. Manual refresh button ⭐⭐

### Persona 2: Technical Operator (Secondary User)
**Needs:**
- Diagnose feed failures (HIGH)
- Monitor service health (HIGH)
- Review duplicates (MEDIUM)
- Manage feeds at scale (MEDIUM)

**UI Priorities:**
1. Dashboard with metrics ⭐⭐⭐
2. Feed health indicators ⭐⭐⭐
3. Feed change alerts ⭐⭐
4. Search/filter feeds ⭐⭐

### Persona 3: Admin (Tertiary User)
**Needs:**
- Initial setup (ONE-TIME)
- Troubleshooting (RARE)
- Settings management (RARE)

**UI Priorities:**
1. Troubleshooting links (already exists) ✓
2. Settings page (already exists) ✓
3. Feed validation (new) ⭐

---

## Conclusion

Your backend is **production-grade** with comprehensive monitoring and change detection. The UI should surface this value.

**Recommended Approach:**
1. **This week:** Implement Quick Wins (5 enhancements, ~6 hours)
2. **This month:** Add Dashboard + Changes views (full visibility)
3. **This quarter:** Polish and mobile optimization

**ROI:** Parents will immediately see reschedules and know calendars are up-to-date. Operators can diagnose issues without diving into status.json.

**Start with reschedule panel** - it's the highest-value feature for your primary users (parents).
