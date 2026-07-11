import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { User, Menu, X, LogOut, CreditCard, HelpCircle } from 'lucide-react';
import { useToast } from '../../../hooks/use-toast';
import { useAuthStore } from '../../../store/auth.store';
import { logout } from '../../../services/auth.service';

export default function DashboardHeader({ sidebarOpen, setSidebarOpen }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, clearAuth } = useAuthStore();

  const handleLogout = () => {
    clearAuth();
    logout();
    toast({
      title: 'Logged Out',
      description: 'You have been successfully logged out.',
    });
    navigate('/login');
  };

  const handleLoginRedirect = () => {
    navigate('/login');
  };

  const userInitials = user?.email
    ? user.email.charAt(0).toUpperCase()
    : 'U';

  return (
    <header className="dashboard-header">
      <div className="header-content">
        <div className="logo-section">
          <img
            src="https://customer-assets.emergentagent.com/job_5e208c76-5a6c-4a32-8918-b9a39e80d303/artifacts/mvzy74up_Logo%20%282%29.png"
            alt="DCVerse"
            className="logo"
          />
          <span className="logo-text">DCVerse</span>
        </div>

        <div className="header-actions">
          {user ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/80">
                  <CreditCard className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">
                    {user.creditsBalance} credits
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
                    {userInitials}
                  </div>
                  <span className="text-sm text-muted-foreground hidden lg:inline">
                    {user.email}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hover:bg-accent h-8 px-2.5"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-accent h-8 gap-1.5"
              onClick={handleLoginRedirect}
            >
              <User className="w-4 h-4" />
              <span className="text-sm font-medium">Sign in</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-accent h-8 w-8 p-0 hidden sm:flex"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
        </div>

        <Button
          variant="ghost"
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </Button>
      </div>
    </header>
  );
}
