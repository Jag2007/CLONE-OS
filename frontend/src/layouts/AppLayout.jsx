import React, { useState, useEffect, Fragment } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Video,
  Film,
  UserPlus,
  FlaskConical,
  Menu,
  X,
  LogOut,
  CreditCard,
  HelpCircle,
  BookOpen,
  Zap,
  CheckSquare,
  Shield,
  Crown,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { ThemeToggleButton } from "../components/ThemeToggleButton";
import { useAuthStore } from "../store/auth.store";
import { useToast } from "../hooks/use-toast";
import { logout } from "../services/auth.service";
import BuyCreditsModal from "../components/BuyCreditsModal";
import { StaggerItemIndexed } from "../motion/Stagger";
import { springSoft, springSnappy } from "../motion/springs";
import { useMediaQuery } from "../hooks/useMediaQuery";

const navItems = [
  { to: "/create-video", label: "Create Video", icon: Video },
  { to: "/videos", label: "View Videos", icon: Film },
  { to: "/create-clone", label: "Make Clone", icon: UserPlus },
  {
    to: "/generation-lab",
    label: "Generation Lab",
    icon: FlaskConical,
    allowedEmail: "demo1@cloneos.com",
  },
  {
    to: "/admin",
    label: "Admin Console",
    icon: Shield,
    requireAdmin: true,
  },
];

const headerTap = { scale: 0.94 };
const headerHover = { scale: 1.04 };

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [buyCreditsTab, setBuyCreditsTab] = useState("credits");
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, clearAuth } = useAuthStore();
  const isDesktop = useMediaQuery("(min-width: 1025px)");

  useEffect(() => {
    const openBuyCredits = (e) => {
      setBuyCreditsTab(e?.detail?.tab || "credits");
      setBuyCreditsOpen(true);
    };
    window.addEventListener("openBuyCredits", openBuyCredits);
    return () => window.removeEventListener("openBuyCredits", openBuyCredits);
  }, []);

  const handleLogout = () => {
    clearAuth();
    logout();
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
    navigate("/login");
  };

  const userInitials = user?.email ? user.email.charAt(0).toUpperCase() : "U";
  const isPro = user?.plan === "pro";
  const isAdmin = user?.role === "admin";

  const sidebarX = isDesktop ? 0 : sidebarOpen ? 0 : "-100%";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-left">
            <motion.span
              whileHover={headerHover}
              whileTap={headerTap}
              className="inline-flex"
            >
              <Button
                variant="ghost"
                size="sm"
                className="app-mobile-menu-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </Button>
            </motion.span>
            <motion.div
              className="app-logo cursor-pointer"
              onClick={() => navigate("/create-video")}
              whileHover={{ scale: 1.02 }}
              transition={springSnappy}
            >
              <img
                src="/logo.png"
                alt="Clone OS"
                className="app-logo-img"
              />
            </motion.div>
          </div>

          <div className="app-header-actions">
            <motion.span
              whileHover={headerHover}
              whileTap={headerTap}
              className="inline-flex"
            >
              <ThemeToggleButton className="app-theme-toggle" />
            </motion.span>
            {user ? (
              <Fragment>
                <motion.span
                  whileHover={headerHover}
                  whileTap={headerTap}
                  className="inline-flex"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="app-credits-badge"
                    onClick={() => {
                      setBuyCreditsTab("credits");
                      setBuyCreditsOpen(true);
                    }}
                    title="Buy credits"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-primary" />
                    <span>{user.creditsBalance ?? 0} credits</span>
                  </Button>
                </motion.span>
                <BuyCreditsModal
                  open={buyCreditsOpen}
                  defaultTab={buyCreditsTab}
                  onClose={() => setBuyCreditsOpen(false)}
                />
                <div className="app-user-badge relative flex items-center gap-1.5">
                  <div className="app-user-avatar relative">
                    {userInitials}
                    {isPro && (
                      <Crown className="w-3 h-3 text-amber-400 absolute -top-1 -right-1 drop-shadow" />
                    )}
                  </div>
                  <span className="app-user-email flex items-center gap-1">
                    {user.email}
                    {isPro && (
                      <span className="px-1 py-0.2 text-[9px] font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded uppercase tracking-wider">
                        PRO
                      </span>
                    )}
                  </span>
                </div>
                <motion.span
                  whileHover={headerHover}
                  whileTap={headerTap}
                  className="inline-flex"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="app-logout-btn"
                    onClick={handleLogout}
                    title="Log out"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </motion.span>
                <motion.span
                  whileHover={headerHover}
                  whileTap={headerTap}
                  className="inline-flex"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="app-help-btn"
                    title="Help"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </Button>
                </motion.span>
              </Fragment>
            ) : null}
          </div>
        </div>
      </header>

      <div className="app-body">
        <AnimatePresence>
          {!isDesktop && sidebarOpen && (
            <motion.div
              key="sidebar-backdrop"
              className="app-sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <motion.aside
          className={`app-sidebar app-sidebar--motion ${sidebarOpen ? "open" : ""}`}
          initial={false}
          animate={{ x: sidebarX }}
          transition={springSoft}
          style={{ willChange: "transform" }}
        >
          <div className="app-sidebar-inner">
            <div className="app-sidebar-mobile-header">
              <span className="app-sidebar-section-label">Navigation</span>
              <Button
                variant="ghost"
                size="icon"
                className="app-sidebar-close"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <nav className="app-sidebar-nav">
              <p className="app-sidebar-section-label">Pages</p>
              {navItems
                .filter((item) => {
                  if (item.requireAdmin && user?.role !== "admin") return false;
                  if (item.allowedEmail && user?.email?.toLowerCase() !== item.allowedEmail) return false;
                  return true;
                })
                .map(({ to, label, icon: Icon }, i) => (
                <StaggerItemIndexed key={to} index={i} className="w-full">
                  <NavLink
                    to={to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `app-nav-item${isActive ? " active" : ""}`
                    }
                  >
                    <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span>{label}</span>
                  </NavLink>
                </StaggerItemIndexed>
              ))}
            </nav>

            <div className="app-sidebar-footer">
              <p className="app-sidebar-section-label">Resources</p>
              <div className="app-sidebar-footer-links">
                {[
                  { icon: BookOpen, label: "Quick Start Guide" },
                  { icon: Zap, label: "Create Yours Guide" },
                  { icon: CheckSquare, label: "Tech Review Check" },
                ].map(({ icon: Fi, label }, i) => (
                  <StaggerItemIndexed key={label} index={i + 4} className="w-full">
                    <button type="button" className="app-sidebar-footer-link w-full">
                      <Fi className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  </StaggerItemIndexed>
                ))}
              </div>
            </div>
          </div>
        </motion.aside>

        <main className="app-main">
          <motion.div
            key={location.pathname}
            className="min-h-0"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSoft}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
