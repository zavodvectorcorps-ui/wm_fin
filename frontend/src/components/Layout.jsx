import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Receipt, FolderKanban, Users, BarChart3, Calendar,
  Settings, HelpCircle, LogOut, ChevronDown, Menu, X, Bell,
  TrendingUp, Wallet, PiggyBank, FileText, Bot, Paperclip, Zap, Plug, Link2, Shield,
  ClipboardList, Repeat, Banknote, Eye, AlertTriangle, UserPlus
} from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from './ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { cn } from './ui/utils';
import { NotificationsDropdown } from './Notifications';

const menuItems = [
  { icon: LayoutDashboard, label: 'Рабочий стол', path: '/dashboard' },
  { icon: Receipt, label: 'Операции', path: '/transactions' },
  { icon: FolderKanban, label: 'Проекты', path: '/projects' },
  { icon: Users, label: 'Контрагенты', path: '/contractors' },
];

const analyticsItems = [
  { icon: TrendingUp, label: 'Движение средств', path: '/analytics/cashflow' },
  { icon: FileText, label: 'Прибыли и убытки', path: '/analytics/pnl' },
  { icon: Wallet, label: 'Баланс', path: '/analytics/balance' },
  { icon: PiggyBank, label: 'Анализ расходов', path: '/analytics/expenses' },
  { icon: BarChart3, label: 'Рентабельность', path: '/analytics/profitability' },
];

const documentItems = [
  { icon: Paperclip, label: 'Все документы', path: '/documents' },
  { icon: FileText, label: 'Импорт выписок', path: '/import' },
  { icon: Zap, label: 'Автоправила', path: '/settings/rules' },
];

const planningItems = [
  { icon: Calendar, label: 'Платёжный календарь', path: '/planning/calendar' },
  { icon: ClipboardList, label: 'План расходов', path: '/planning/expenses' },
  { icon: Repeat, label: 'Регулярные расходы', path: '/planning/recurring' },
  { icon: Banknote, label: 'Зарплаты', path: '/planning/salaries' },
];

const settingsItems = [
  { icon: Settings, label: 'Настройки', path: '/settings' },
  { icon: Link2, label: 'Интеграции', path: '/settings/integrations' },
  { icon: Plug, label: 'Миграция из Adesk', path: '/settings/adesk' },
];

const SidebarContent = ({ onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isDemo, workspaceRole, canManageWorkspace } = useAuth();
  const [analyticsOpen, setAnalyticsOpen] = useState(location.pathname.startsWith('/analytics'));
  const [documentsOpen, setDocumentsOpen] = useState(location.pathname === '/documents' || location.pathname === '/import' || location.pathname === '/settings/rules');
  const [planningOpen, setPlanningOpen] = useState(location.pathname.startsWith('/planning'));

  // Visibility per role
  const isViewer = workspaceRole === 'viewer';
  const isAccountantOrViewer = ['accountant', 'viewer'].includes(workspaceRole);
  const isManagerOrAbove = ['owner', 'admin', 'manager'].includes(workspaceRole) || user?.role === 'superadmin';
  const showAnalytics = !isViewer; // viewer has only dashboard
  const showSettings = canManageWorkspace; // settings only for owner/admin/superadmin
  const showTeam = canManageWorkspace;

  const handleExitDemo = () => {
    logout();
    navigate('/demo');
    if (onClose) onClose();
  };

  const NavItem = ({ icon: Icon, label, path }) => (
    <Link
      to={path}
      onClick={onClose}
      className={cn(
        'sidebar-item',
        location.pathname === path && 'active'
      )}
      data-testid={`nav-${path.replace(/\//g, '-').slice(1) || 'dashboard'}`}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">WM</span>
          </div>
          <div>
            <h1 className="font-semibold text-lg">WM Finance</h1>
            <p className="text-xs text-muted-foreground">Финансовый учёт</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {/* Viewer sees only Dashboard */}
        {isViewer ? (
          <NavItem icon={LayoutDashboard} label="Рабочий стол" path="/dashboard" />
        ) : (
          menuItems.map(item => (
            <NavItem key={item.path} {...item} />
          ))
        )}

        {!isViewer && <div className="h-px bg-border my-4" />}

        {/* Documents Section */}
        {!isViewer && (
        <Collapsible open={documentsOpen} onOpenChange={setDocumentsOpen}>
          <CollapsibleTrigger className="sidebar-item w-full justify-between" data-testid="nav-documents-toggle">
            <div className="flex items-center gap-3">
              <Paperclip className="h-5 w-5" />
              <span>Документы</span>
            </div>
            <ChevronDown className={cn('h-4 w-4 transition-transform', documentsOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 space-y-1 mt-1">
            {documentItems.map(item => (
              <NavItem key={item.path} {...item} />
            ))}
          </CollapsibleContent>
        </Collapsible>
        )}

        {/* Analytics Section */}
        {showAnalytics && (
        <Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
          <CollapsibleTrigger className="sidebar-item w-full justify-between" data-testid="nav-analytics-toggle">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5" />
              <span>Аналитика</span>
            </div>
            <ChevronDown className={cn('h-4 w-4 transition-transform', analyticsOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 space-y-1 mt-1">
            {analyticsItems.map(item => (
              <NavItem key={item.path} {...item} />
            ))}
          </CollapsibleContent>
        </Collapsible>
        )}

        {/* Planning Section */}
        {!isViewer && (
        <Collapsible open={planningOpen} onOpenChange={setPlanningOpen}>
          <CollapsibleTrigger className="sidebar-item w-full justify-between" data-testid="nav-planning-toggle">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5" />
              <span>Планирование</span>
            </div>
            <ChevronDown className={cn('h-4 w-4 transition-transform', planningOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 space-y-1 mt-1">
            {planningItems.map(item => (
              <NavItem key={item.path} {...item} />
            ))}
          </CollapsibleContent>
        </Collapsible>
        )}

        {showSettings && <div className="h-px bg-border my-4" />}

        {showSettings && settingsItems.map(item => (
          <NavItem key={item.path} {...item} />
        ))}

        {/* Team management - owner/admin */}
        {showTeam && (
          <NavItem icon={UserPlus} label="Команда" path="/team" />
        )}

        {/* Admin Users - only for superadmin */}
        {user?.role === 'superadmin' && (
          <NavItem icon={Shield} label="Пользователи" path="/admin/users" />
        )}

        <NavItem icon={HelpCircle} label="Справка и FAQ" path="/faq" />
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 h-auto py-2" data-testid="user-menu-trigger">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {user?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {user?.name || 'Пользователь'}
                  {isDemo && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-semibold px-1.5 py-0.5 leading-none"
                      data-testid="demo-badge-sidebar"
                    >
                      <Eye className="h-2.5 w-2.5" />
                      DEMO
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Настройки
              </Link>
            </DropdownMenuItem>
            {isDemo && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleExitDemo}
                  className="text-amber-500"
                  data-testid="exit-demo-btn"
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Выйти из демо
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive" data-testid="logout-btn">
              <LogOut className="mr-2 h-4 w-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export const Layout = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { isDemo, logout } = useAuth();

  const handleExitDemo = () => {
    logout();
    navigate('/demo');
  };
  
  // Global hotkeys
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if user is typing in input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }
      
      // N - new transaction (navigate to transactions page)
      if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') {
        e.preventDefault();
        navigate('/transactions');
      }
      
      // F or / - focus search (if exists)
      if (e.key === 'f' || e.key === 'F' || e.key === '/' || e.key === 'а' || e.key === 'А') {
        const searchInput = document.querySelector('[data-testid="filter-search"]');
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
        }
      }
      
      // D - dashboard
      if (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') {
        e.preventDefault();
        navigate('/dashboard');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Demo banner — sticky top, visible only for demo users */}
      {isDemo && (
        <div
          className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500/95 to-orange-500/95 text-black border-b border-amber-700/40 backdrop-blur-md"
          data-testid="demo-banner"
        >
          <div className="px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium flex-wrap">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">
              Вы в демо-режиме — просмотр данных доступен, изменения отключены.
            </span>
            <span className="sm:hidden">Демо-режим (read-only)</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3 bg-black/10 hover:bg-black/20 text-black gap-1.5"
              onClick={handleExitDemo}
              data-testid="exit-demo-banner-btn"
            >
              <LogOut className="h-3.5 w-3.5" />
              Выйти из демо
            </Button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col border-r border-border bg-card/50 backdrop-blur-xl z-30",
          isDemo && "lg:top-10"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <header
        className={cn(
          "lg:hidden fixed left-0 right-0 h-16 border-b border-border bg-card z-40 flex items-center px-4",
          isDemo ? "top-10" : "top-0"
        )}
      >
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-foreground" data-testid="mobile-menu-btn">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex-1 flex items-center justify-center">
          <span className="font-semibold text-foreground">WM Finance</span>
        </div>

        <NotificationsDropdown />
      </header>

      {/* Main Content */}
      <main
        className={cn(
          "lg:pl-64 min-h-screen flex flex-col",
          isDemo ? "pt-[6.5rem] lg:pt-10" : "pt-16 lg:pt-0"
        )}
      >
        <div className="flex-1">
          {children}
        </div>
        {/* Footer */}
        <footer className="border-t border-border py-4 px-6 text-center text-xs text-muted-foreground">
          <p>Теплицы • Сауны • Купели</p>
          <p className="mt-1 flex items-center justify-center gap-1.5">
            <span className="w-4 h-4 rounded bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">MK</span>
            <span>Made by Knyazev</span>
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Layout;
