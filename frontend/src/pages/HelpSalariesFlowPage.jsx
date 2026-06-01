import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  ArrowLeft, Users, Briefcase, Calendar, Receipt, CheckCircle2, AlertCircle,
  ArrowRight, Banknote, Wallet, Plus, Link2, Send, BadgeCheck,
} from 'lucide-react';

const StepCard = ({ num, icon: Icon, title, children, accent = 'primary' }) => (
  <Card className="relative overflow-hidden">
    <div className={`absolute left-0 top-0 bottom-0 w-1 bg-${accent}`} />
    <CardHeader className="pb-2">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-${accent}/10 text-${accent} font-mono font-bold`}>
          {num}
        </div>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent className="text-sm space-y-2 leading-relaxed">{children}</CardContent>
  </Card>
);

const Pill = ({ children, color = 'border-border bg-muted text-foreground' }) => (
  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${color}`}>
    {children}
  </span>
);

const HelpSalariesFlowPage = () => {
  return (
    <div className="container max-w-5xl py-8 space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link to="/planning/salaries"><ArrowLeft className="h-4 w-4 mr-1" />Назад к зарплатам</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Как работает связка «Контрагент → Сотрудник → Зарплата → Операции»</h1>
          <p className="text-muted-foreground mt-1">
            Один контрагент = один сотрудник = N начислений = M фактических выплат. Без двойного учёта.
          </p>
        </div>
      </div>

      {/* DIAGRAM */}
      <Card className="overflow-hidden">
        <CardContent className="p-6 md:p-8 bg-gradient-to-br from-slate-900/40 to-slate-800/30">
          <h3 className="text-xl font-bold text-center mb-1">Цепочка данных</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-2xl mx-auto">
            Одна операция связана с одним контрагентом, может быть привязана к начислению,
            а начисление знает своего сотрудника через employee_id
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-1" data-testid="salary-flow-diagram">
            {[
              { color: 'sky',     label: 'Контрагент',  sub: 'Иван Иванов',     icon: '🏢', link: 'linked' },
              { color: 'emerald', label: 'Сотрудник',   sub: 'HR-карточка',     icon: '👤', link: 'employee_id' },
              { color: 'amber',   label: 'Начисление',  sub: 'План на месяц',   icon: '📅', link: 'linked_transaction_ids[]' },
              { color: 'rose',    label: 'Операция',    sub: 'Факт. выплата',   icon: '💸', link: null },
            ].map((b, i, arr) => (
              <React.Fragment key={i}>
                <div
                  className={`relative rounded-xl border-2 border-${b.color}-500 bg-${b.color}-500/15 px-4 py-5 text-center shadow-lg`}
                >
                  <div className="text-3xl mb-2" aria-hidden>{b.icon}</div>
                  <div className="font-bold text-base text-white">{b.label}</div>
                  <div className="text-xs text-slate-300 mt-0.5">{b.sub}</div>
                </div>
                {i < arr.length - 1 && (
                  <div className="hidden md:flex items-center justify-center text-slate-400" aria-hidden>
                    <div className="flex flex-col items-center w-full">
                      <code className="text-[10px] text-slate-500 mb-1">{b.link}</code>
                      <ArrowRight className="h-6 w-6" />
                    </div>
                  </div>
                )}
                {i < arr.length - 1 && (
                  <div className="md:hidden flex flex-col items-center text-slate-400 py-1">
                    <code className="text-[10px] text-slate-500">{b.link}</code>
                    <ArrowRight className="h-5 w-5 rotate-90" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-300">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Привязано → выплачено по плану</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Не привязано → нужно создать начисление</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" />Связь one-to-one (Контр. ↔ Сотр.)</span>
          </div>
        </CardContent>
      </Card>

      {/* STEPS */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Пошагово</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <StepCard num={1} icon={Users} title="Заведение сотрудника (один раз)" accent="emerald-500">
            <p>Два равноценных пути:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>В <strong>Контрагентах</strong>: меню «⋯» → <Pill>+ Сделать сотрудником</Pill></li>
              <li>В <strong>Зарплатах → Сотрудники</strong>: <Pill>Из контрагента</Pill> → поиск</li>
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Создаётся карточка `Employee` с `contractor_id` = контрагент. Связь one-to-one.
            </p>
          </StepCard>

          <StepCard num={2} icon={Calendar} title="План на месяц" accent="amber-500">
            <p>В <strong>Начислениях</strong>:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Выбираете месяц через календарь</li>
              <li><Pill>Начислить всем</Pill> — массово по дефолтному окладу</li>
              <li>Или вручную: оклад + бонус − налог = <code>total_due</code></li>
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Статус: <Pill color="border-amber-500/40 text-amber-500 bg-amber-500/10">К выплате</Pill>
            </p>
          </StepCard>

          <StepCard num={3} icon={Link2} title="Привязка к существующей операции" accent="sky-500">
            <p>Если зарплата уже прошла в банке (бухгалтер сделал перевод и пометил контрагентом):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>На строке начисления → <Pill>Связать</Pill></li>
              <li>Кандидаты ищутся по: контрагенту (макс. буст), сумме (10–120%), окну дат (±10 дней)</li>
              <li>Уже привязанные операции — исключаются</li>
            </ul>
          </StepCard>

          <StepCard num={4} icon={Send} title="Создать выплату прямо из плана" accent="emerald-500">
            <p>Если платите наличными или в моменте:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>На строке → <Pill color="border-emerald-500/40 text-emerald-500 bg-emerald-500/10">В операции</Pill></li>
              <li>Выбираете счёт (касса/банк) — сумма по умолчанию = остаток</li>
              <li>За один клик создаётся `expense` + автоматически линкуется к начислению</li>
            </ul>
          </StepCard>

          <StepCard num={5} icon={Wallet} title="Частичные выплаты" accent="sky-500">
            <p>Зарплата 3 000 zł = 1 500 банк + 1 500 наличными. Без проблем:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Связали банковский → <Pill color="border-sky-500/40 text-sky-500 bg-sky-500/10">Частично 50%</Pill></li>
              <li>Кнопка превращается в <Pill>Ещё выплата</Pill> — добавляете кассовый</li>
              <li>Статус: <Pill color="border-emerald-500/40 text-emerald-500 bg-emerald-500/10">Выплачено 100%</Pill></li>
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Прогресс-бар и список всех выплат с кнопкой «отвязать» — на каждой строке начисления.
            </p>
          </StepCard>

          <StepCard num={6} icon={Briefcase} title="Карточка сотрудника" accent="primary">
            <p>Клик по сотруднику → выезжает панель справа со всей картиной:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Сводка</strong>: Начислено / Выплачено по плану / Остаток</li>
              <li><strong>История начислений</strong> по месяцам с бейджами и прогресс-барами</li>
              <li><strong>Фактические выплаты по контрагенту</strong> — все операции с пометкой «привязано/не привязано»</li>
            </ul>
          </StepCard>
        </div>
      </section>

      {/* IMPORTANT RULES */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Важные правила</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Привязка ≠ дублирование
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Операция всегда живёт в Операциях как обычный расход и списывается с баланса один раз.
              Привязка — это просто пометка «эта оплата покрывает план Х». Двойного учёта не будет.
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Контроль «утечек»
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Если «Выплачено по плану» меньше «Фактических выплат по контрагенту» — значит часть
              операций идёт мимо планирования. В карточке такие операции помечены янтарным «не привязано».
            </CardContent>
          </Card>

          <Card className="border-sky-500/30 bg-sky-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-sky-500" />
                Один контрагент = один сотрудник
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Защита от дублей: попытка повторно «продвинуть» того же контрагента → ошибка
              «Сотрудник X уже привязан». Связь one-to-one.
            </CardContent>
          </Card>

          <Card className="border-rose-500/30 bg-rose-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-5 w-5 text-rose-500" />
                Можно работать и без планов
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Если просто платите зарплату через Операции с контрагентом-сотрудником —
              сумма всё равно появится в карточке сотрудника (блок «Фактические выплаты»).
              Начисления нужны только для план/факт анализа.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Example scenario */}
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Пример</h2>
        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            <p>
              <Badge variant="outline" className="mr-2">Май 2026</Badge>
              План Ивану — 3 000 zł. Реально выплачено:
            </p>
            <div className="space-y-2 pl-4 border-l-2 border-border">
              <div className="flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-emerald-500" />
                <span className="font-mono">15.05</span>
                <span>—</span>
                <span>банк PKO, 1 500 zł</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Pill color="border-sky-500/40 text-sky-500 bg-sky-500/10">Частично 50%</Pill>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4 text-emerald-500" />
                <span className="font-mono">22.05</span>
                <span>—</span>
                <span>касса, 1 500 zł</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Pill color="border-emerald-500/40 text-emerald-500 bg-emerald-500/10">Выплачено 100%</Pill>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              В карточке Ивана: Начислено 3 000 / Выплачено по плану 3 000 / Остаток 0.
              В блоке «Фактические выплаты по контрагенту» — 2 операции, обе с бейджем «привязано».
              Совпало → утечек нет.
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="flex justify-center pt-2">
        <Button asChild size="lg">
          <Link to="/planning/salaries"><ArrowRight className="h-4 w-4 mr-2" />Перейти к зарплатам</Link>
        </Button>
      </div>
    </div>
  );
};

export default HelpSalariesFlowPage;
