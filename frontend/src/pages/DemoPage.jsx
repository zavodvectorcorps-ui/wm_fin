import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Wallet, Repeat, FileText, Bot, Cloud, TrendingUp, Banknote, Calendar,
  Globe, Smartphone, Shield, Zap, ExternalLink, Github, Code, Database,
  Flame, CheckCircle2, ArrowRight, Loader2
} from 'lucide-react';

const features = [
  {
    icon: Wallet,
    title: 'Мультивалютный учёт',
    subtitle: 'EUR + PLN с автоконвертацией',
    description: 'Учёт операций в EUR и PLN одновременно. Живые курсы от Национального банка Польши (NBP). Все метрики пересчитываются в базовой валюте PLN для консолидированной аналитики.',
    highlights: ['Live NBP rates', 'Cross-currency transfers', 'Consolidated P&L'],
    color: 'blue',
  },
  {
    icon: TrendingUp,
    title: 'Управленческий дашборд',
    subtitle: 'Runway, burn rate, структура',
    description: 'Виджет «Runway» показывает, на сколько месяцев хватит денег при текущих постоянных расходах. Графики динамики баланса, структура расходов, прибыль по направлениям бизнеса.',
    highlights: ['Runway calculator', 'Burn rate analysis', 'Profit by direction'],
    color: 'amber',
  },
  {
    icon: Repeat,
    title: 'Регулярные платежи',
    subtitle: 'Аренда, абонплаты, налоги',
    description: 'Шаблоны постоянных платежей с автогенерацией в календарь. Каждый день в 03:00 система создаёт плановые платежи на ближайший срок. Работает как «подписки для бизнеса».',
    highlights: ['Monthly/quarterly', 'Auto-generation', 'Calendar integration'],
    color: 'rose',
  },
  {
    icon: Banknote,
    title: 'Зарплаты (ФОТ)',
    subtitle: 'Начисления + сверка',
    description: 'Сотрудники, начисления по месяцам (оклад + премия − удержания), сверка с фактическими выплатами. Виджет ФОТ на дашборде: начислено / выплачено / осталось с разбивкой по направлениям.',
    highlights: ['Employee management', 'Month-by-month', 'Payout reconciliation'],
    color: 'emerald',
  },
  {
    icon: Calendar,
    title: 'Платёжный календарь',
    subtitle: 'Plan vs Actual сверка',
    description: 'Плановые платежи сверяются с фактическими операциями из банковских выписок по умному алгоритму (окно ±10 дней, сумма ±15%). Новые транзакции не дублируются — только линкуются.',
    highlights: ['Smart matching', 'No duplication', 'Manual linking'],
    color: 'purple',
  },
  {
    icon: FileText,
    title: 'Документы и PDF',
    subtitle: 'AI-парсинг выписок',
    description: 'Загрузка PDF-выписок банка и автоматическое распознавание транзакций через Claude Sonnet. Привязка документов к операциям, папки, поиск, ACCREDITED, обработка «неподвязанных».',
    highlights: ['Claude AI parsing', 'Folder hierarchy', 'Smart linking'],
    color: 'indigo',
  },
  {
    icon: Bot,
    title: 'Telegram бот',
    subtitle: 'Учёт + напоминания',
    description: 'Webhook-бот принимает транзакции в свободной форме. Ежедневная сводка по финансам. Напоминания в 09:30 о плановых платежах (просроченных, сегодняшних, завтрашних).',
    highlights: ['Webhook integration', 'Free-form input', 'Daily reminders'],
    color: 'sky',
  },
  {
    icon: Cloud,
    title: 'Google Sheets + Drive',
    subtitle: 'Автобэкап и отчёты',
    description: 'Ежедневная выгрузка данных в Google Sheets. Автоматический бэкап БД в Google Drive (ежедневно + полный еженедельно с uploads). Ротация 7 дней. Уведомления в Telegram.',
    highlights: ['Daily Sheets sync', 'DB to Drive', '7-day retention'],
    color: 'teal',
  },
  {
    icon: Smartphone,
    title: 'Mobile-first главная',
    subtitle: 'Быстрые действия',
    description: 'Отдельная мобильная стартовая страница с крупными кнопками «Доход / Расход / Перевод». Последние операции, быстрый ввод в bottom sheet. Десктоп автоматически переходит на дашборд.',
    highlights: ['Responsive', 'Bottom sheet UI', 'Quick entry'],
    color: 'pink',
  },
];

const colorClasses = {
  blue:    'border-blue-500/30 bg-blue-500/5 text-blue-500',
  amber:   'border-amber-500/30 bg-amber-500/5 text-amber-500',
  rose:    'border-rose-500/30 bg-rose-500/5 text-rose-500',
  emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500',
  purple:  'border-purple-500/30 bg-purple-500/5 text-purple-500',
  indigo:  'border-indigo-500/30 bg-indigo-500/5 text-indigo-500',
  sky:     'border-sky-500/30 bg-sky-500/5 text-sky-500',
  teal:    'border-teal-500/30 bg-teal-500/5 text-teal-500',
  pink:    'border-pink-500/30 bg-pink-500/5 text-pink-500',
};

const techStack = [
  { category: 'Frontend', items: ['React 19', 'Tailwind CSS', 'shadcn/ui', 'Recharts', 'React Router'] },
  { category: 'Backend',  items: ['FastAPI', 'Python 3.11', 'Motor (async MongoDB)', 'APScheduler', 'JWT auth'] },
  { category: 'AI & APIs', items: ['Claude Sonnet 4.5', 'Telegram Bot API', 'Google Sheets API', 'Google Drive API', 'NBP exchange rates'] },
  { category: 'DevOps',   items: ['Docker Compose', 'Nginx reverse proxy', 'Let\'s Encrypt SSL', 'Self-hosted VPS', 'GitHub CI'] },
];

const DemoPage = () => {
  const navigate = useNavigate();
  const { loginAsDemo } = useAuth();
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemoLogin = async () => {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      await loginAsDemo();
      toast.success('Вы вошли в демо-режим', {
        description: 'Просмотр данных доступен, изменения отключены.',
      });
      navigate('/dashboard');
    } catch (e) {
      toast.error('Не удалось войти в демо', {
        description: e?.response?.data?.detail || e.message || 'Попробуйте ещё раз',
      });
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-emerald-500/5 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32">
          <div className="flex items-center gap-2 mb-6">
            <Badge variant="outline" className="text-xs">Case Study</Badge>
            <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/40">Production</Badge>
            <Badge variant="outline" className="text-xs">2026</Badge>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
            WM Finance
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-4 max-w-3xl leading-relaxed">
            Кастомная ERP-система для управления финансами польского бизнеса с несколькими направлениями.
          </p>
          <p className="text-base md:text-lg text-muted-foreground max-w-3xl mb-10 leading-relaxed">
            Мультивалютный учёт, управленческий дашборд, AI-парсинг банковских выписок, Telegram-бот, автобэкап в Google Drive. Self-hosted на VPS с Docker + Let's Encrypt.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="https://wm-finance.pl" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2" data-testid="visit-live-btn">
                <Globe className="h-4 w-4" />
                Открыть приложение
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
            <Button
              size="lg"
              variant="outline"
              className="gap-2"
              onClick={handleDemoLogin}
              disabled={demoLoading}
              data-testid="demo-login-btn"
            >
              {demoLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Входим...
                </>
              ) : (
                <>
                  Войти в демо
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-500" />
              Self-hosted
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              MongoDB + FastAPI
            </div>
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-purple-500" />
              React 19 + shadcn/ui
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              AI-powered
            </div>
          </div>
        </div>
      </section>

      {/* Screenshot: Dashboard */}
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <div className="flex items-start gap-3 mb-8">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Flame className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Dashboard</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Управленческий дашборд</h2>
          </div>
        </div>
        <p className="text-lg text-muted-foreground max-w-3xl mb-10 leading-relaxed">
          Все ключевые метрики на одном экране: доходы / расходы / прибыль, остаток на счетах, виджет <strong>Runway</strong> («на сколько хватит денег»), постоянные расходы месяца, ФОТ, прибыль по направлениям.
        </p>
        <div className="rounded-xl overflow-hidden border border-border shadow-2xl bg-card">
          <img
            src="/demo-dashboard.jpg"
            alt="WM Finance Dashboard"
            className="w-full h-auto"
            loading="lazy"
          />
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 border-t border-border">
        <div className="mb-12">
          <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">Modules</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">9 модулей из коробки</h2>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Каждый модуль спроектирован под реальный сценарий польского бизнеса с несколькими направлениями (Теплицы, Сауны, Купели) и валютами (EUR + PLN).
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, idx) => {
            const Icon = f.icon;
            return (
              <Card key={idx} className={`border-l-4 ${colorClasses[f.color]} transition-all hover:translate-y-[-2px]`}>
                <CardContent className="pt-6 pb-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-6 w-6 ${colorClasses[f.color].split(' ').pop()}`} />
                    <div className="flex-1">
                      <h3 className="font-bold text-lg leading-tight">{f.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {f.highlights.map((h, i) => (
                      <Badge key={i} variant="outline" className="text-xs font-normal">
                        {h}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Screenshot: Transactions */}
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 border-t border-border">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">Transactions</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">Операции</h2>
            <p className="text-base text-muted-foreground leading-relaxed mb-6">
              Полноценная работа с транзакциями: приход / расход / перевод между счетами с разными валютами. Умные фильтры по периоду, направлению, статье, счёту, статусу. Пагинация, инлайн-редактирование, экспорт.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                'Cross-currency переводы с корректной аналитикой',
                '8 фильтров в одной панели',
                'Статус «нужна проверка» для AI-импорта',
                'Привязка контрагента, категории, направления',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl overflow-hidden border border-border shadow-xl bg-card">
            <img src="/demo-transactions.jpg" alt="Transactions" className="w-full h-auto" loading="lazy" />
          </div>
        </div>
      </section>

      {/* Screenshot: Salaries */}
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 border-t border-border">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="rounded-xl overflow-hidden border border-border shadow-xl bg-card order-2 md:order-1">
            <img src="/demo-salaries.jpg" alt="Salaries" className="w-full h-auto" loading="lazy" />
          </div>
          <div className="order-1 md:order-2">
            <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">Salaries</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">Зарплаты и ФОТ</h2>
            <p className="text-base text-muted-foreground leading-relaxed mb-6">
              Отдельная расчётная сущность без дублирования фактических выплат. Начисления за месяц, сверка с реальной операцией, виджет ФОТ на дашборде с процентом от выручки.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                'Сотрудники: должность, оклад, направление',
                'Начисления: оклад + премия − удержания',
                'Массовое создание по окладам одной кнопкой',
                'Сверка с операцией без дублирования',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 border-t border-border">
        <div className="mb-12">
          <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">Stack</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Технологии</h2>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Современный стек с упором на DX, производительность и self-hosted развёртывание. Никаких vendor-lock-ins.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {techStack.map((group, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.category}
              </h3>
              <div className="space-y-1">
                {group.items.map((item, i) => (
                  <div key={i} className="text-sm font-medium">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 border-t border-border">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: '17', label: 'Коллекций в БД' },
            { value: '60+', label: 'API endpoints' },
            { value: '9', label: 'Модулей' },
            { value: '3', label: 'Внешних интеграции' },
          ].map((stat, i) => (
            <div key={i} className="border-l-2 border-border pl-4">
              <div className="text-4xl md:text-5xl font-bold tracking-tight">{stat.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-20 md:py-28 text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
            Хотите похожее решение для своего бизнеса?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Это приложение построено под конкретные задачи. Могу сделать похожую систему под ваши процессы — от идеи до production-деплоя на VPS.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="https://t.me/king_saas" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2">
                Написать в Telegram
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <a href="https://wm-finance.pl" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="gap-2">
                Открыть приложение
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap justify-between items-center gap-4 text-sm text-muted-foreground">
          <div>© 2026 WM Finance · Custom ERP case study</div>
          <div className="flex gap-6">
            <a href="https://wm-finance.pl" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Live</a>
            <Link to="/login" className="hover:text-foreground transition-colors">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DemoPage;
