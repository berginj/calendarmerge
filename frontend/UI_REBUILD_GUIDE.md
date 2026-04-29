# Modern UI Rebuild - Implementation Guide

**Status:** Foundation Complete ✅
**Next:** Continue implementation following this guide

---

## ✅ What's Been Set Up

### Dependencies Installed
- ✅ Tailwind CSS (utility-first styling)
- ✅ Radix UI primitives (accordion, dialog, switch, tabs, toast, tooltip)
- ✅ Lucide React (modern icon library)
- ✅ TanStack Query (server state management)
- ✅ clsx (conditional classnames)

### Configuration Complete
- ✅ tailwind.config.js (with custom colors for operational states)
- ✅ postcss.config.cjs (Tailwind + autoprefixer)
- ✅ index.css (Tailwind directives + base styles)

### Foundation Components Created
- ✅ `components/ui/Button.tsx` - Base button component
- ✅ `components/ui/Badge.tsx` - Badge component
- ✅ `hooks/useServiceStatus.ts` - Service status hook with auto-refresh
- ✅ `providers/QueryProvider.tsx` - TanStack Query provider
- ✅ `components/ServiceHealthBanner.tsx` - Example component using new stack

### Ready to Build
All dependencies installed, configuration complete, pattern established.

---

## 🎯 Implementation Phases

### Phase 1: Integrate Foundation (2-3 hours)

**1.1 Update main.tsx to use QueryProvider**

```tsx
import QueryProvider from './providers/QueryProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </React.StrictMode>
);
```

**1.2 Add ServiceHealthBanner to App.tsx**

```tsx
import ServiceHealthBanner from './components/ServiceHealthBanner';

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <ServiceHealthBanner />

      <header className="bg-white/90 backdrop-blur shadow-sm">
        {/* Existing header content */}
      </header>

      <main>
        {/* Existing content */}
      </main>
    </div>
  );
}
```

**1.3 Test that banner works**
- Should show service health from status.json
- Should auto-update every 30 seconds
- Should show operational state + metrics

---

### Phase 2: Build UI Component Library (4-5 hours)

**Create these components in `components/ui/`:**

**2.1 Card.tsx**
```tsx
export function Card({ children, className }: CardProps) {
  return <div className={clsx('card', className)}>{children}</div>;
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="card-header">{children}</div>;
}

export function CardContent({ children }: { children: ReactNode }) {
  return <div className="card-content">{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="card-footer">{children}</div>;
}
```

**2.2 Toast.tsx (using Radix)**
```tsx
import * as ToastPrimitive from '@radix-ui/react-toast';

export function Toast({ title, description, variant }: ToastProps) {
  return (
    <ToastPrimitive.Root className={clsx('toast', `toast-${variant}`)}>
      <ToastPrimitive.Title>{title}</ToastPrimitive.Title>
      {description && <ToastPrimitive.Description>{description}</ToastPrimitive.Description>}
      <ToastPrimitive.Close>×</ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return <ToastPrimitive.Provider>{children}</ToastPrimitive.Provider>;
}
```

**2.3 Switch.tsx (using Radix)**
```tsx
import * as SwitchPrimitive from '@radix-ui/react-switch';

export function Switch({ checked, onCheckedChange, label }: SwitchProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={clsx(
          'w-11 h-6 rounded-full transition-colors',
          checked ? 'bg-primary-700' : 'bg-slate-300'
        )}
      >
        <SwitchPrimitive.Thumb
          className={clsx(
            'block w-5 h-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-0.5'
          )}
        />
      </SwitchPrimitive.Root>
      {label && <span className="text-sm font-medium">{label}</span>}
    </label>
  );
}
```

**2.4 Tabs.tsx (using Radix)**
**2.5 Dialog.tsx (using Radix)**
**2.6 Tooltip.tsx (using Radix)**

---

### Phase 3: Rebuild Feeds View (6-8 hours)

**3.1 Create enhanced FeedCard.tsx**

Using the design from UI_ENHANCEMENTS.md section 3.2:
- Feed health badge
- Event count with trend indicator
- Platform badge
- Last check time
- Enable/disable toggle
- Action buttons

**3.2 Update FeedList.tsx**
- Grid layout (responsive)
- Empty states
- Loading skeletons

**3.3 Enhance FeedForm.tsx**
- Real-time validation
- Platform detection display
- Event count preview
- Validation warnings

---

### Phase 4: Build Dashboard View (8-10 hours)

**4.1 Create Dashboard.tsx**

Structure:
```tsx
<div className="dashboard">
  <div className="dashboard-hero">
    <MetricCard icon={Calendar} label="Total Events" value={status.mergedEventCount} />
    <MetricCard icon={Trophy} label="Games" value={status.gamesOnlyMergedEventCount} />
    <MetricCard icon={Rss} label="Feeds" value={status.sourceFeedCount} />
    <MetricCard icon={Clock} label="Age" value={formatAge(status.checkAgeHours?.fullCalendar)} />
  </div>

  <FreshnessCards />
  <FeedHealthGrid />
  <UpcomingEventsWidget />
</div>
```

**4.2 Create MetricCard.tsx**
- Icon + label + value
- Trend indicator (up/down arrow)
- Status color coding

**4.3 Create FreshnessCards.tsx**
- Visual progress bars
- Per-calendar (full vs games)
- Age in hours

**4.4 Create FeedHealthGrid.tsx**
- All feeds at a glance
- Color-coded status
- Quick stats

---

### Phase 5: Build Changes View (8-10 hours)

**5.1 Create Changes.tsx layout**

```tsx
<div className="changes-view">
  <div className="summary-cards-grid">
    <SummaryCard count={rescheduledEvents.length} label="Reschedules" icon={Calendar} />
    <SummaryCard count={potentialDuplicates.length} label="Duplicates" icon={Copy} />
    <SummaryCard count={feedChangeAlerts.length} label="Alerts" icon={Bell} />
  </div>

  <Tabs defaultValue="reschedules">
    <TabsList>
      <TabsTrigger value="reschedules">
        Reschedules ({rescheduledEvents.length})
      </TabsTrigger>
      <TabsTrigger value="duplicates">
        Duplicates ({potentialDuplicates.length})
      </TabsTrigger>
      <TabsTrigger value="alerts">
        Alerts ({feedChangeAlerts.length})
      </TabsTrigger>
    </TabsList>

    <TabsContent value="reschedules">
      <ReschedulesPanel />
    </TabsContent>

    <TabsContent value="duplicates">
      <DuplicatesPanel />
    </TabsContent>

    <TabsContent value="alerts">
      <FeedAlertsPanel />
    </TabsContent>
  </Tabs>
</div>
```

**5.2 Create ReschedulesPanel.tsx**
- Display all rescheduled events
- Show time changes with before→after
- Show location changes
- Group by date
- Empty state when no reschedules

**5.3 Create DuplicatesPanel.tsx**
- Show potential duplicates
- Display confidence levels
- Show all instances
- Allow marking as "not a duplicate"

**5.4 Create FeedAlertsPanel.tsx**
- Show all feed change alerts
- Color-code by severity
- Show percentage changes
- Link to affected feed

---

### Phase 6: Add Advanced Features (8-10 hours)

**6.1 Manual Refresh**
- Button with loading state
- Success toast on completion
- Show results (event count, warnings)

**6.2 Search and Filter**
- Search input
- Filter chips (All, Healthy, Suspect, Failed, Disabled)
- Real-time filtering

**6.3 Bulk Operations**
- Checkbox selection
- Bulk enable/disable
- Bulk refresh
- Bulk delete

**6.4 Feed Validation Feedback**
- Show validation as user types URL
- Display event count, platform, date range
- Show sample events
- Validation warnings

---

### Phase 7: Mobile & Accessibility (6-8 hours)

**7.1 Responsive Navigation**
```tsx
<nav className="hidden md:flex gap-2">
  {/* Desktop nav */}
</nav>

<button className="md:hidden" onClick={toggleMobileMenu}>
  <Menu />
</button>

<MobileMenu open={mobileMenuOpen} onClose={closeMobileMenu}>
  {/* Mobile nav */}
</MobileMenu>
```

**7.2 Mobile-Optimized Components**
- Stack metrics vertically on mobile
- Collapsible sections
- Touch-friendly buttons (min 44px)

**7.3 Accessibility**
- ARIA labels on all interactive elements
- Keyboard navigation
- Focus management
- Screen reader announcements

---

## 🛠️ Step-by-Step Implementation

### Day 1: Foundation & Dashboard (6-8 hours)

**Morning (3-4 hours):**
1. Integrate QueryProvider in main.tsx
2. Add ServiceHealthBanner to App.tsx
3. Create remaining base UI components (Card, Toast, Switch)
4. Test that status banner works

**Afternoon (3-4 hours):**
5. Create Dashboard.tsx
6. Build MetricCard component
7. Build FreshnessCards component
8. Add Dashboard to navigation

**End of day:** Dashboard view working with real data

---

### Day 2: Changes View (6-8 hours)

**Morning (3-4 hours):**
1. Create Changes.tsx layout
2. Create SummaryCard component
3. Build ReschedulesPanel.tsx
4. Test reschedule display

**Afternoon (3-4 hours):**
5. Build DuplicatesPanel.tsx
6. Build FeedAlertsPanel.tsx
7. Add Changes to navigation
8. Polish empty states

**End of day:** Changes view working with all panels

---

### Day 3: Enhanced Feeds View (6-8 hours)

**Morning (3-4 hours):**
1. Rebuild FeedCard.tsx with health indicators
2. Add enable/disable toggle
3. Show platform badges
4. Add trend indicators

**Afternoon (3-4 hours):**
5. Add search and filter
6. Implement bulk operations
7. Enhance FeedForm with validation
8. Add manual refresh button

**End of day:** Feeds view fully enhanced

---

### Day 4: Polish & Mobile (6-8 hours)

**Morning (3-4 hours):**
1. Mobile responsive layout
2. Hamburger menu
3. Test on mobile viewport
4. Touch gesture support

**Afternoon (3-4 hours):**
5. Add accessibility attributes
6. Keyboard navigation
7. Loading skeletons
8. Toast notifications working

**End of day:** Production-ready UI

---

## 📋 Implementation Checklist

### Setup Phase (Complete ✅)
- [x] Install Tailwind CSS
- [x] Install Radix UI
- [x] Install Lucide React
- [x] Install TanStack Query
- [x] Configure Tailwind
- [x] Create index.css
- [x] Create base components
- [x] Create example hook
- [x] Create example component

### Phase 1: Integration
- [ ] Update main.tsx with QueryProvider
- [ ] Add ServiceHealthBanner to App
- [ ] Test status display working
- [ ] Verify auto-refresh every 30s

### Phase 2: UI Components
- [ ] Card component
- [ ] Toast component (with provider)
- [ ] Switch component
- [ ] Tabs component
- [ ] Dialog component
- [ ] Tooltip component

### Phase 3: Dashboard
- [ ] Dashboard.tsx layout
- [ ] MetricCard component
- [ ] FreshnessCards component
- [ ] FeedHealthGrid component
- [ ] UpcomingEvents widget (optional)
- [ ] Add to navigation

### Phase 4: Changes View
- [ ] Changes.tsx layout
- [ ] SummaryCard component
- [ ] ReschedulesPanel
- [ ] DuplicatesPanel
- [ ] FeedAlertsPanel
- [ ] Add to navigation

### Phase 5: Enhanced Feeds
- [ ] Rebuild FeedCard with health
- [ ] Add enable/disable toggle
- [ ] Platform badges
- [ ] Event count trends
- [ ] Search and filter
- [ ] Bulk operations
- [ ] Enhanced validation feedback

### Phase 6: Features
- [ ] Manual refresh button
- [ ] Toast notifications system
- [ ] Real-time status updates
- [ ] Keyboard shortcuts (optional)

### Phase 7: Mobile & A11y
- [ ] Responsive navigation
- [ ] Mobile menu
- [ ] Touch-friendly sizing
- [ ] ARIA labels
- [ ] Keyboard navigation
- [ ] Screen reader support

---

## 🚀 Quick Start (Continue from Here)

### Step 1: Wrap App with QueryProvider

**Edit: frontend/src/main.tsx**
```tsx
import QueryProvider from './providers/QueryProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </React.StrictMode>
);
```

### Step 2: Add Health Banner to App

**Edit: frontend/src/App.tsx**
```tsx
import ServiceHealthBanner from './components/ServiceHealthBanner';

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100">
      <ServiceHealthBanner />

      {/* Rest of existing App */}
    </div>
  );
}
```

### Step 3: Test

```bash
cd frontend
npm run dev
```

Open http://localhost:5173/manage/

**You should see:**
- Health banner at top showing operational state
- Auto-updates every 30 seconds
- Green (healthy), Yellow (degraded), or Red (failed)

---

## 📚 Component Patterns to Follow

### Using Radix UI Components

**Example: Dialog**
```tsx
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Trigger asChild>
    <Button>Open Dialog</Button>
  </Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/50" />
    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6 max-w-md">
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      {/* Content */}
      <Dialog.Close asChild>
        <Button>Close</Button>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

**Example: Toast**
```tsx
import * as Toast from '@radix-ui/react-toast';

<Toast.Provider>
  <App />

  <Toast.Viewport className="fixed top-0 right-0 p-6 flex flex-col gap-2" />
</Toast.Provider>

// In component
<Toast.Root className="bg-white shadow-lg rounded-lg p-4">
  <Toast.Title>Success!</Toast.Title>
  <Toast.Description>Feed created successfully</Toast.Description>
</Toast.Root>
```

### Using Lucide Icons

```tsx
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Plus } from 'lucide-react';

<Button>
  <Plus className="h-4 w-4" />
  Add Feed
</Button>

<div className="flex items-center gap-2">
  <CheckCircle className="h-5 w-5 text-green-600" />
  <span>Healthy</span>
</div>
```

### Using TanStack Query

**Fetch data:**
```tsx
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['feeds'],
  queryFn: async () => {
    const response = await fetch('/api/feeds');
    if (!response.ok) throw new Error('Failed to fetch');
    return response.json();
  },
  refetchInterval: 30000,
});
```

**Mutations:**
```tsx
const createMutation = useMutation({
  mutationFn: (feed) => createFeed(feed),
  onSuccess: () => {
    queryClient.invalidateQueries(['feeds']);
    toast.success('Feed created');
  },
  onError: (error) => {
    toast.error(error.message);
  },
});
```

---

## 🎨 Design System Reference

### Colors (Tailwind Classes)

**Operational States:**
- Healthy: `bg-green-50 text-green-800 border-green-200`
- Degraded: `bg-yellow-50 text-yellow-800 border-yellow-200`
- Failed: `bg-red-50 text-red-800 border-red-200`

**Primary Colors:**
- Primary: `bg-primary-700 text-white`
- Secondary: `bg-slate-100 text-slate-700`

**Semantic Colors:**
- Success: `bg-green-600 text-white`
- Warning: `bg-yellow-500 text-white`
- Error: `bg-red-600 text-white`
- Info: `bg-blue-600 text-white`

### Spacing Scale

Use Tailwind's spacing: `p-4` (1rem), `gap-6` (1.5rem), etc.

**Standard spacing:**
- Cards: `p-6`
- Card headers: `px-6 py-4`
- Sections: `space-y-6`
- Grids: `gap-4` or `gap-6`

### Typography

**Headings:**
```tsx
<h1 className="text-3xl font-bold text-slate-900">
<h2 className="text-2xl font-semibold text-slate-800">
<h3 className="text-lg font-semibold text-slate-700">
<h4 className="text-base font-medium text-slate-700">
```

**Body:**
```tsx
<p className="text-sm text-slate-600">      // Secondary text
<p className="text-base text-slate-900">   // Primary text
<small className="text-xs text-slate-500"> // Meta text
```

---

## 🔧 Utility Hooks to Create

### useToast.ts
```tsx
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = {
    success: (message: string) => addToast('success', message),
    error: (message: string) => addToast('error', message),
    warning: (message: string) => addToast('warning', message),
    info: (message: string) => addToast('info', message),
  };

  return { toast, toasts };
}
```

### useManualRefresh.ts
```tsx
export function useManualRefresh() {
  const mutation = useMutation({
    mutationFn: async () => {
      const key = loadSavedFunctionsKey();
      const response = await fetch(`/api/refresh?code=${key}`, { method: 'POST' });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['serviceStatus']);
      toast.success(`Refresh completed • ${data.eventCount} events`);
    },
  });

  return {
    refresh: mutation.mutate,
    isRefreshing: mutation.isPending,
    result: mutation.data,
  };
}
```

### useFeedHealth.ts
```tsx
export function useFeedHealth(feedId: string) {
  const { data: status } = useServiceStatus();

  const feedStatus = status?.sourceStatuses.find(f => f.id === feedId);

  return {
    isHealthy: feedStatus?.ok && (feedStatus?.eventCount ?? 0) > 0,
    isSuspect: feedStatus?.suspect,
    isFailed: !feedStatus?.ok,
    eventCount: feedStatus?.eventCount ?? 0,
    previousEventCount: feedStatus?.previousEventCount,
    consecutiveFailures: feedStatus?.consecutiveFailures ?? 0,
    lastError: feedStatus?.error,
  };
}
```

---

## 📐 Layout Structure

### App Structure (New)

```tsx
<QueryProvider>
  <ToastProvider>
    <div className="min-h-screen flex flex-col">
      {/* Health Banner - Always visible */}
      <ServiceHealthBanner />

      {/* Header */}
      <header className="bg-white/90 backdrop-blur shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1>Calendar Merge</h1>

          {/* Navigation Tabs */}
          <nav className="flex gap-2 mt-4">
            <NavButton active={view === 'dashboard'}>Dashboard</NavButton>
            <NavButton active={view === 'feeds'}>Feeds</NavButton>
            <NavButton active={view === 'changes'}>Changes</NavButton>
            <NavButton active={view === 'settings'}>Settings</NavButton>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {view === 'dashboard' && <Dashboard />}
        {view === 'feeds' && <Feeds />}
        {view === 'changes' && <Changes />}
        {view === 'settings' && <Settings />}
      </main>
    </div>

    <ToastViewport />
  </ToastProvider>
</QueryProvider>
```

---

## 🎨 Design Tokens

```tsx
// tailwind.config.js extensions
theme: {
  extend: {
    borderRadius: {
      lg: '0.75rem',
    },
    boxShadow: {
      'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      'md': '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    },
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
      '2xl': ['1.5rem', { lineHeight: '2rem' }],
      '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    },
  },
}
```

---

## ⚡ Performance Tips

### Code Splitting
```tsx
// Lazy load views
const Dashboard = lazy(() => import('./views/Dashboard'));
const Changes = lazy(() => import('./views/Changes'));

<Suspense fallback={<LoadingSkeleton />}>
  {view === 'dashboard' && <Dashboard />}
</Suspense>
```

### Optimize Re-renders
```tsx
// Memoize expensive components
const DashboardMemo = memo(Dashboard);

// Use useMemo for expensive calculations
const healthyFeeds = useMemo(
  () => feeds.filter(f => f.ok && f.eventCount > 0),
  [feeds]
);
```

---

## 🧪 Testing the New UI

### Visual Testing
```bash
npm run dev
# Open http://localhost:5173/manage/
```

**Check:**
- Health banner appears
- Status updates every 30s
- All views accessible
- Responsive on mobile (toggle DevTools device mode)

### Build Testing
```bash
npm run build
npm run preview
```

**Check:**
- Build succeeds
- Preview works
- Assets loaded correctly

---

## 🚢 Deployment

### Build for Production

```bash
cd frontend
npm run build
```

### Deploy to Azure

```bash
az storage blob upload-batch \
  --account-name $env:AZ_STORAGE_ACCOUNT \
  --destination '$web/manage' \
  --source frontend/build \
  --auth-mode login \
  --overwrite
```

---

## 📊 Progress Tracking

Mark phases complete as you go:

- [x] Setup Phase - Dependencies and configuration
- [ ] Phase 1 - Integration (2-3 hrs)
- [ ] Phase 2 - UI Components (4-5 hrs)
- [ ] Phase 3 - Dashboard (8-10 hrs)
- [ ] Phase 4 - Changes View (8-10 hrs)
- [ ] Phase 5 - Enhanced Feeds (6-8 hrs)
- [ ] Phase 6 - Advanced Features (8-10 hrs)
- [ ] Phase 7 - Mobile & A11y (6-8 hrs)

**Total Remaining:** ~40-50 hours

---

## 🆘 Troubleshooting

### Tailwind not applying
- Check postcss.config.cjs includes tailwindcss
- Check tailwind.config.js content paths
- Restart dev server

### Icons not showing
```bash
npm install lucide-react
```

### Type errors
```bash
npm install --save-dev @types/node
```

### Query errors
- Ensure QueryProvider wraps App
- Check network tab for API calls
- Verify CORS if running locally

---

## 🔗 Reference Links

- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Radix UI Docs](https://www.radix-ui.com/primitives)
- [Lucide Icons](https://lucide.dev/icons/)
- [TanStack Query Docs](https://tanstack.com/query/latest)

---

## 📝 Notes

**Why This Stack:**
- **Tailwind**: Fast development, consistent spacing, responsive utilities
- **Radix UI**: Accessible primitives, unstyled (full design control)
- **Lucide**: Modern icons, tree-shakeable, consistent style
- **TanStack Query**: Auto caching, refetching, loading states

**Alternatives Considered:**
- Material UI: Too opinionated, larger bundle
- Ant Design: Good but heavier
- Chakra UI: Good but switching to Tailwind anyway

**This stack is:**
- Modern (2024-2026 best practices)
- Lightweight (no bloat)
- Flexible (full design control)
- Accessible (Radix handles it)
- Maintainable (popular, well-documented)

---

## ✅ Next Session Checklist

**When you return to continue:**

1. Review this guide
2. Start with Phase 1 (Integration)
3. Test ServiceHealthBanner works
4. Move to Phase 2 (UI Components)
5. Build incrementally, test often
6. Commit frequently

**Estimated completion:** 1-2 weeks of focused work

**Result:** Production-grade, modern UI surfacing all backend capabilities.

Good luck! 🚀
