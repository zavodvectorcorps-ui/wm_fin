import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { AIChat } from './components/AIChat';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import PlannedPaymentsPage from './pages/PlannedPaymentsPage';
import ProjectsPage from './pages/ProjectsPage';
import ContractorsPage from './pages/ContractorsPage';
import SettingsPage from './pages/SettingsPage';
import ImportPage from './pages/ImportPage';
import DocumentsPage from './pages/DocumentsPage';
import CashFlowPage from './pages/CashFlowPage';
import PnLPage from './pages/PnLPage';
import BalancePage from './pages/BalancePage';
import ExpenseAnalysisPage from './pages/ExpenseAnalysisPage';
import ProfitabilityPage from './pages/ProfitabilityPage';
import AutoRulesPage from './pages/AutoRulesPage';
import AdeskMigrationPage from './pages/AdeskMigrationPage';
import FAQPage from './pages/FAQPage';
import IntegrationsPage from './pages/IntegrationsPage';

// Protected Route wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return (
    <Layout>
      {children}
      <AIChat />
    </Layout>
  );
};

// Public Route wrapper (redirect if logged in)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

// Placeholder pages for analytics
const AnalyticsPlaceholder = ({ title }) => (
  <div className="p-6 md:p-8 space-y-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">Раздел в разработке</p>
    </div>
    <div className="flex items-center justify-center h-64 border border-dashed border-border rounded-xl">
      <p className="text-muted-foreground">Функционал будет добавлен в следующей версии</p>
    </div>
  </div>
);

const HelpPage = () => (
  <div className="p-6 md:p-8 space-y-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Помощь</h1>
      <p className="text-muted-foreground">Справка по работе с системой</p>
    </div>
    <div className="prose dark:prose-invert max-w-none">
      <h2>Быстрый старт</h2>
      <p>WM Finance — система финансового учёта для бизнеса по производству теплиц, саун и купелей.</p>
      
      <h3>Основные функции:</h3>
      <ul>
        <li><strong>Рабочий стол</strong> — обзор финансовых показателей</li>
        <li><strong>Операции</strong> — ввод доходов и расходов</li>
        <li><strong>Импорт</strong> — загрузка банковских выписок</li>
        <li><strong>Планирование</strong> — платёжный календарь</li>
        <li><strong>Проекты</strong> — учёт сделок</li>
        <li><strong>Контрагенты</strong> — база клиентов и поставщиков</li>
        <li><strong>Настройки</strong> — справочники и автоматизация</li>
      </ul>
      
      <h3>AI Ассистент</h3>
      <p>Нажмите на кнопку чата в правом нижнем углу, чтобы задать вопрос о финансах.</p>
      
      <h3>Горячие клавиши</h3>
      <ul>
        <li><code>N</code> — новая операция</li>
        <li><code>F</code> — фокус на поиск</li>
      </ul>
    </div>
  </div>
);

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      } />
      
      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>
      } />
      
      <Route path="/transactions" element={
        <ProtectedRoute>
          <TransactionsPage />
        </ProtectedRoute>
      } />
      
      <Route path="/projects" element={
        <ProtectedRoute>
          <ProjectsPage />
        </ProtectedRoute>
      } />
      
      <Route path="/contractors" element={
        <ProtectedRoute>
          <ContractorsPage />
        </ProtectedRoute>
      } />
      
      <Route path="/planning/calendar" element={
        <ProtectedRoute>
          <PlannedPaymentsPage />
        </ProtectedRoute>
      } />
      
      <Route path="/import" element={
        <ProtectedRoute>
          <ImportPage />
        </ProtectedRoute>
      } />
      
      <Route path="/settings" element={
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      } />

      <Route path="/documents" element={
        <ProtectedRoute>
          <DocumentsPage />
        </ProtectedRoute>
      } />
      
      {/* Analytics routes */}
      <Route path="/analytics/cashflow" element={
        <ProtectedRoute>
          <CashFlowPage />
        </ProtectedRoute>
      } />
      
      <Route path="/analytics/pnl" element={
        <ProtectedRoute>
          <PnLPage />
        </ProtectedRoute>
      } />
      
      <Route path="/analytics/balance" element={
        <ProtectedRoute>
          <BalancePage />
        </ProtectedRoute>
      } />
      
      <Route path="/analytics/expenses" element={
        <ProtectedRoute>
          <ExpenseAnalysisPage />
        </ProtectedRoute>
      } />
      
      <Route path="/analytics/profitability" element={
        <ProtectedRoute>
          <ProfitabilityPage />
        </ProtectedRoute>
      } />
      
      <Route path="/settings/rules" element={
        <ProtectedRoute>
          <AutoRulesPage />
        </ProtectedRoute>
      } />
      
      <Route path="/settings/adesk" element={
        <ProtectedRoute>
          <AdeskMigrationPage />
        </ProtectedRoute>
      } />
      
      <Route path="/faq" element={
        <ProtectedRoute>
          <FAQPage />
        </ProtectedRoute>
      } />
      
      <Route path="/help" element={
        <ProtectedRoute>
          <FAQPage />
        </ProtectedRoute>
      } />
      
      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="dark">
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster 
            position="top-right" 
            toastOptions={{
              style: {
                background: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                border: '1px solid hsl(var(--border))',
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
