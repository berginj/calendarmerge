import { Dialog, DialogContent } from './ui/Dialog';
import { LayoutDashboard, Rss, Bell, Settings as SettingsIcon, X } from 'lucide-react';
import { clsx } from 'clsx';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  currentView: 'dashboard' | 'feeds' | 'changes' | 'settings';
  onViewChange: (view: 'dashboard' | 'feeds' | 'changes' | 'settings') => void;
}

export default function MobileMenu({ open, onClose, currentView, onViewChange }: MobileMenuProps) {
  const handleViewChange = (view: 'dashboard' | 'feeds' | 'changes' | 'settings') => {
    onViewChange(view);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Navigation</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => handleViewChange('dashboard')}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                currentView === 'dashboard'
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <LayoutDashboard className="h-5 w-5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => handleViewChange('feeds')}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                currentView === 'feeds'
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <Rss className="h-5 w-5" />
              <span>Feeds</span>
            </button>

            <button
              onClick={() => handleViewChange('changes')}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                currentView === 'changes'
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <Bell className="h-5 w-5" />
              <span>Changes</span>
            </button>

            <button
              onClick={() => handleViewChange('settings')}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors',
                currentView === 'settings'
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <SettingsIcon className="h-5 w-5" />
              <span>Settings</span>
            </button>
          </nav>
        </div>
      </DialogContent>
    </Dialog>
  );
}
