import { Link, useLocation } from "wouter";
import { History, Settings, TrendingUp, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { href: "/", label: "Picks", icon: TrendingUp },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { isAdmin, username, logout } = useAuth();
  const { toast } = useToast();

  async function handleLogout() {
    await logout();
    toast({ title: "Logged out" });
  }

  // If on login page, render without the nav chrome
  if (location === "/login") {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sharp-header sticky top-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg
                aria-label="Sharp Picks Logo"
                viewBox="0 0 36 36"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-9 h-9"
              >
                <circle cx="18" cy="18" r="17" fill="hsl(158,64%,52%)" opacity="0.15" />
                <circle cx="18" cy="18" r="17" stroke="hsl(158,64%,52%)" strokeWidth="1.5" />
                <path d="M18 8 L26 18 L22 18 L22 28 L14 28 L14 18 L10 18 Z" fill="hsl(158,64%,52%)" />
                <path d="M15 12 L18 8 L21 12" fill="none" stroke="hsl(222,47%,6%)" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wide leading-none">SHARP PICKS</div>
              <div className="text-xs text-muted-foreground leading-none mt-0.5">Daily Betting Analytics</div>
            </div>
          </div>

          {/* Nav */}
          <div className="flex items-center gap-1">
            <nav className="flex items-center gap-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <a
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      location === href
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    <Icon size={15} />
                    <span className="hidden sm:block">{label}</span>
                  </a>
                </Link>
              ))}
            </nav>

            {/* Auth button */}
            <div className="ml-2 pl-2 border-l border-border">
              {isAdmin ? (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                    <ShieldCheck size={11} />
                    <span>{username}</span>
                  </div>
                  <button
                    data-testid="btn-logout"
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Log out"
                  >
                    <LogOut size={15} />
                    <span className="hidden sm:block">Logout</span>
                  </button>
                </div>
              ) : (
                <Link href="/login">
                  <a
                    data-testid="btn-login-nav"
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      location === "/login"
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    <LogIn size={15} />
                    <span className="hidden sm:block">Admin</span>
                  </a>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>For entertainment purposes only. Always bet responsibly.</span>
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Created with Perplexity Computer
          </a>
        </div>
      </footer>
    </div>
  );
}

// Need to import Toaster for standalone login page
import { Toaster } from "@/components/ui/toaster";
