import { 
  User, 
  Shield, 
  Bell, 
  Moon, 
  HelpCircle, 
  FileText, 
  LogOut,
  ChevronRight,
  Key,
  Smartphone
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { TopUpThresholdSetting } from '@/components/settings/TopUpThresholdSetting';
import { NetworkToggle } from '@/components/settings/NetworkToggle';

interface SettingItemProps {
  icon: React.ElementType;
  label: string;
  description?: string;
  onClick?: () => void;
  toggle?: boolean;
  toggled?: boolean;
  danger?: boolean;
}

const SettingItem = ({ 
  icon: Icon, 
  label, 
  description, 
  onClick, 
  toggle, 
  toggled,
  danger 
}: SettingItemProps) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center justify-between p-4 rounded-xl transition-colors',
      danger ? 'hover:bg-destructive/10' : 'hover:bg-secondary'
    )}
  >
    <div className="flex items-center gap-3">
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center',
        danger ? 'bg-destructive/20' : 'bg-secondary'
      )}>
        <Icon className={cn('w-5 h-5', danger && 'text-destructive')} />
      </div>
      <div className="text-left">
        <div className={cn('font-medium text-foreground', danger && 'text-destructive')}>{label}</div>
        {description && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
      </div>
    </div>
    {toggle ? (
      <div className={cn(
        'w-11 h-6 rounded-full transition-colors relative',
        toggled ? 'bg-primary' : 'bg-secondary'
      )}>
        <div className={cn(
          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
          toggled ? 'left-6' : 'left-1'
        )} />
      </div>
    ) : (
      <ChevronRight className="w-5 h-5 text-muted-foreground" />
    )}
  </button>
);

const Settings = () => {
  const navigate = useNavigate();
  const { profile, walletAddress, logout } = usePrivyAuth();
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const displayName = walletAddress 
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` 
    : 'User';

  return (
    <AppShell>
      <div className="p-4 safe-top space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account</p>
        </div>

        {/* Profile Card */}
        <div className="p-4 rounded-xl bg-card flex items-center gap-4">
          <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center text-2xl font-bold text-primary-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-foreground">{displayName}</div>
            <div className="text-sm text-muted-foreground">{profile?.email || 'Wallet connected'}</div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </div>

        {/* Account Section */}
        <div>
          <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Account
          </h3>
          <div className="rounded-xl bg-card overflow-hidden">
            <SettingItem 
              icon={User} 
              label="Profile" 
              description="Edit your personal info"
            />
            <SettingItem 
              icon={Shield} 
              label="Security" 
              description="Password & 2FA"
            />
            <SettingItem 
              icon={Key} 
              label="Backup Wallet" 
              description="Export your recovery phrase"
            />
          </div>
        </div>

        {/* Preferences Section */}
        <div>
          <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Preferences
          </h3>
          <div className="rounded-xl bg-card overflow-hidden">
            <SettingItem 
              icon={Bell} 
              label="Notifications" 
              toggle 
              toggled={notifications}
              onClick={() => setNotifications(!notifications)}
            />
            <SettingItem 
              icon={Moon} 
              label="Dark Mode" 
              toggle 
              toggled={darkMode}
              onClick={() => setDarkMode(!darkMode)}
            />
            <SettingItem 
              icon={Smartphone} 
              label="Install App" 
              description="Add to home screen"
            />
          </div>
        </div>

        {/* DCA Settings Section */}
        <div>
          <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-2 px-1">
            DCA Settings
          </h3>
          <div className="rounded-xl bg-card overflow-hidden">
            <TopUpThresholdSetting />
            <NetworkToggle />
          </div>
        </div>

        {/* Support Section */}
        <div>
          <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Support
          </h3>
          <div className="rounded-xl bg-card overflow-hidden">
            <SettingItem 
              icon={HelpCircle} 
              label="Help Center" 
            />
            <SettingItem 
              icon={FileText} 
              label="Terms & Privacy" 
            />
          </div>
        </div>

        {/* Logout */}
        <div className="rounded-xl bg-card overflow-hidden">
          <SettingItem 
            icon={LogOut} 
            label="Log Out" 
            danger
            onClick={handleLogout}
          />
        </div>

        {/* Version */}
        <p className="text-center text-sm text-muted-foreground">
          StackFlow v1.0.0
        </p>
      </div>
    </AppShell>
  );
};

export default Settings;
