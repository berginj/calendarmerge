import type { LucideIcon } from 'lucide-react';
import Button from './ui/Button';
import { Card, CardContent } from './ui/Card';

interface AdminGateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  error?: string;
  variant?: 'card' | 'inline';
}

function focusAdminSignIn() {
  const input = document.getElementById('admin-key');
  if (input instanceof HTMLInputElement) {
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus();
  }
}

export default function AdminGate({ icon: Icon, title, description, error, variant = 'card' }: AdminGateProps) {
  const body = (
    <div className="text-center py-12">
      <Icon className="h-12 w-12 text-slate-400 mx-auto mb-3" aria-hidden="true" />
      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 max-w-md mx-auto">{description}</p>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <Button variant="secondary" size="sm" className="mt-4" onClick={focusAdminSignIn}>
        Sign in
      </Button>
    </div>
  );

  if (variant === 'inline') {
    return body;
  }

  return (
    <Card>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
