import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Upload, Loader2, FileText, ChevronDown, ChevronRight,
  Check, X, AlertTriangle, Layers, ArrowUpRight, ArrowDownLeft, Pencil, Users, Zap
} from 'lucide-react';
import { toast } from 'sonner';

const fmtMoney = (val, currency = 'PLN') => {
  const sym = { PLN: 'zł', EUR: '€', USD: '$' }[currency] || currency;
  return `${Number(val || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${sym}`;
};

export default function BankImportModal({ open, onOpenChange, onImported }) {
  const { api } = useAuth();

  // Step management
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: file + settings
  const [accounts, setAccounts] = useState([]);
  const [directions, setDirections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedDirection, setSelectedDirection] = useState('');

  // Parse result
  const [parseResult, setParseResult] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(new Set());

  // Group editing
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupEdit, setGroupEdit] = useState({});
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Individual editing
  const [editingIdx, setEditingIdx] = useState(null);
  const [itemEdit, setItemEdit] = useState({});

  // Importing
  const [importing, setImporting] = useState(false);

  // New counterparties
  const [newCounterparties, setNewCounterparties] = useState([]);
  const [selectedNewContractors, setSelectedNewContractors] = useState(new Set());
  const [showNewContractors, setShowNewContractors] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const [accRes, dirRes, catRes, conRes] = await Promise.all([
        api().get('/accounts'),
        api().get('/directions'),
        api().get('/categories'),
        api().get('/contractors'),
      ]);
      setAccounts(accRes.data || []);
      setDirections(dirRes.data || []);
      setCategories(catRes.data || []);
      setContractors(conRes.data || []);
      if (accRes.data?.length > 0) setSelectedAccount(accRes.data[0].id);
      if (dirRes.data?.length > 0) setSelectedDirection(dirRes.data[0].id);
    } catch (e) {
      console.error(e);
    }
  }, [api]);

  useEffect(() => {
    if (open) {
      fetchSettings();
      setStep(1);
      setParseResult(null);
      setTransactions([]);
      setGroups([]);
      setSelected(new Set());
      setNewCounterparties([]);
      setSelectedNewContractors(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFileParse = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Поддерживаются только PDF файлы');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api().post('/bank-import/parse', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setParseResult(res.data);
      const txs = (res.data.transactions || []).map(t => ({
        ...t,
        category_id: t.auto_category_id || null,
        direction_id: t.auto_direction_id || null,
        contractor_id: t.auto_contractor_id || t.matched_contractor_id || null,
        needs_review: false,
      }));
      setTransactions(txs);
      setGroups(res.data.groups || []);
      setNewCounterparties(res.data.new_counterparties || []);
      setSelectedNewContractors(new Set(res.data.new_counterparties || []));
      // Select all non-duplicate by default
      const sel = new Set();
      txs.forEach((t, i) => { if (!t.is_duplicate) sel.add(i); });
      setSelected(sel);
      setStep(2);
      const rulesMatched = res.data.auto_rules_matched || 0;
      const autoCategories = txs.filter(t => t.category_id).length;
      toast.success(`Распознано ${txs.length} операций` + 
        (rulesMatched > 0 ? `, ${rulesMatched} авто-категоризировано правилами` : '') +
        (autoCategories > rulesMatched ? `, ${autoCategories - rulesMatched} по контрагентам` : '')
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка парсинга PDF');
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((_, i) => i)));
    }
  };

  const toggleOne = (idx) => {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelected(next);
  };

  const toggleGroup = (groupKey) => {
    const next = new Set(expandedGroups);
    if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
    setExpandedGroups(next);
  };

  // Apply group edit to all transactions in the group
  const applyGroupEdit = (group) => {
    const updated = [...transactions];
    for (const idx of group.indices) {
      if (groupEdit.direction_id) updated[idx] = { ...updated[idx], direction_id: groupEdit.direction_id };
      if (groupEdit.category_id) updated[idx] = { ...updated[idx], category_id: groupEdit.category_id };
      if (groupEdit.contractor_id) updated[idx] = { ...updated[idx], contractor_id: groupEdit.contractor_id };
    }
    setTransactions(updated);
    setEditingGroup(null);
    setGroupEdit({});
    toast.success(`Обновлено ${group.indices.length} операций`);
  };

  // Save individual edit
  const saveItemEdit = (idx) => {
    const updated = [...transactions];
    updated[idx] = { ...updated[idx], ...itemEdit };
    setTransactions(updated);
    setEditingIdx(null);
    setItemEdit({});
  };

  const toggleNeedsReview = (idx) => {
    const updated = [...transactions];
    updated[idx] = { ...updated[idx], needs_review: !updated[idx].needs_review };
    setTransactions(updated);
  };

  const toggleNewContractor = (name) => {
    const next = new Set(selectedNewContractors);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelectedNewContractors(next);
  };

  const createRuleFromTransaction = async (t) => {
    const pattern = t.counterparty || t.operation_type || '';
    if (!pattern) { toast.error('Нет данных для создания правила'); return; }
    if (!t.category_id) { toast.error('Сначала назначьте категорию'); return; }
    try {
      await api().post('/auto-rules', {
        pattern: pattern,
        category_id: t.category_id,
        direction_id: t.direction_id || null,
        contractor_id: t.contractor_id || t.matched_contractor_id || null,
      });
      toast.success(`Правило создано: "${pattern}"`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка создания правила');
    }
  };

  const handleImport = async () => {
    if (!selectedAccount) { toast.error('Выберите счёт'); return; }
    if (!selectedDirection) { toast.error('Выберите направление по умолчанию'); return; }
    if (selected.size === 0) { toast.error('Выберите операции для импорта'); return; }

    setImporting(true);
    try {
      const txsToImport = transactions
        .filter((_, i) => selected.has(i))
        .map(t => ({
          date: t.date,
          type: t.type,
          amount: t.amount,
          currency: t.currency,
          description: t.payment_purpose || t.description,
          counterparty: t.counterparty,
          contractor_id: t.contractor_id || t.matched_contractor_id || null,
          category_id: t.category_id || null,
          direction_id: t.direction_id || null,
          direction_name: t.direction_name || null,
          payment_purpose: t.payment_purpose,
          needs_review: t.needs_review || false,
        }));

      const res = await api().post('/bank-import/confirm', {
        account_id: selectedAccount,
        direction_id: selectedDirection,
        transactions: txsToImport,
        new_contractors: [...selectedNewContractors],
      });

      toast.success(`Импортировано ${res.data.imported} операций на счёт "${res.data.account_name}"`);
      onImported?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка импорта');
    } finally {
      setImporting(false);
    }
  };

  const dirName = (id) => directions.find(d => d.id === id)?.name || '';
  const catName = (id) => categories.find(c => c.id === id)?.name || '';

  const totalSelected = [...selected].reduce((s, i) => {
    const t = transactions[i];
    return t ? s + (t.type === 'income' ? t.amount : -t.amount) : s;
  }, 0);

  const selectedIncome = [...selected].reduce((s, i) => {
    const t = transactions[i];
    return t && t.type === 'income' ? s + t.amount : s;
  }, 0);

  const selectedExpense = [...selected].reduce((s, i) => {
    const t = transactions[i];
    return t && t.type === 'expense' ? s + t.amount : s;
  }, 0);

  const [showGroups, setShowGroups] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col" data-testid="bank-import-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {step === 1 ? 'Импорт банковской выписки' : `Проверка операций — ${parseResult?.period || ''}`}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6 py-4">
            {/* File upload */}
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Анализ выписки...</p>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-3" data-testid="pdf-upload-area">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">Выберите PDF файл банковской выписки</p>
                  <p className="text-sm text-muted-foreground">PKO BP, mBank или другой банк (формат PDF)</p>
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileParse} data-testid="pdf-file-input" />
                  <Button variant="outline" size="sm" className="mt-2 text-foreground border-border" asChild>
                    <span>Выбрать файл</span>
                  </Button>
                </label>
              )}
            </div>

            {/* Account & Direction pre-select */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Счёт для импорта</label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger data-testid="import-account-select" className="text-foreground border-border bg-card">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => a.is_active).map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Направление по умолчанию</label>
                <Select value={selectedDirection} onValueChange={setSelectedDirection}>
                  <SelectTrigger data-testid="import-direction-select" className="text-foreground border-border bg-card">
                    <SelectValue placeholder="Выберите направление" />
                  </SelectTrigger>
                  <SelectContent>
                    {directions.filter(d => d.is_active).map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0" style={{ maxHeight: 'calc(90vh - 160px)' }}>
            {/* Summary bar */}
            <div className="flex flex-wrap gap-3 items-center text-sm sticky top-0 bg-background z-10 py-2">
              <Badge variant="outline" className="text-foreground">
                {parseResult?.account_number} ({parseResult?.currency})
              </Badge>
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                <ArrowDownLeft className="h-3 w-3 mr-1" />Доходы: {fmtMoney(selectedIncome, parseResult?.currency)}
              </Badge>
              <Badge variant="outline" className="text-rose-500 border-rose-500/30">
                <ArrowUpRight className="h-3 w-3 mr-1" />Расходы: {fmtMoney(selectedExpense, parseResult?.currency)}
              </Badge>
              <Badge variant={totalSelected >= 0 ? 'default' : 'destructive'}>
                Выбрано: {selected.size} из {transactions.length}
              </Badge>
              {parseResult?.auto_rules_matched > 0 && (
                <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                  <Zap className="h-3 w-3 mr-1" />Авто-правила: {parseResult.auto_rules_matched}
                </Badge>
              )}
            </div>

            {/* Groups - collapsible */}
            {groups.length > 0 && (
              <Card className="border-amber-500/20">
                <CardContent className="py-2 px-4">
                  <button className="flex items-center gap-2 w-full text-left"
                    onClick={() => setShowGroups(!showGroups)} data-testid="toggle-groups-btn">
                    {showGroups ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Layers className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Группы ({groups.length}) — пакетное назначение</span>
                  </button>
                  {showGroups && (
                    <div className="space-y-1 mt-2 max-h-[200px] overflow-y-auto">
                      {groups.map(g => (
                        <div key={g.group_key} className="rounded-lg bg-muted/30 p-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium flex-1 min-w-[120px]">{g.label}</span>
                            <Badge variant="outline" className="text-xs">{g.count} оп.</Badge>
                            <span className={`text-sm font-mono ${g.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {fmtMoney(g.total_amount, parseResult?.currency)}
                            </span>
                            {editingGroup === g.group_key ? (
                              <div className="flex items-center gap-1.5">
                                <Select value={groupEdit.direction_id || '__none__'}
                                  onValueChange={v => setGroupEdit({ ...groupEdit, direction_id: v === '__none__' ? '' : v })}>
                                  <SelectTrigger className="h-7 w-32 text-xs text-foreground border-border bg-card"><SelectValue placeholder="Направл." /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">— по умолч.</SelectItem>
                                    {directions.filter(d => d.is_active).map(d => (
                                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select value={groupEdit.category_id || '__none__'}
                                  onValueChange={v => setGroupEdit({ ...groupEdit, category_id: v === '__none__' ? '' : v })}>
                                  <SelectTrigger className="h-7 w-32 text-xs text-foreground border-border bg-card"><SelectValue placeholder="Категория" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">— нет</SelectItem>
                                    {categories.filter(c => c.type === g.type).map(c => (
                                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => applyGroupEdit(g)}>
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingGroup(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" className="h-7 text-xs text-foreground border-border"
                                onClick={() => { setEditingGroup(g.group_key); setGroupEdit({}); }}
                                data-testid={`group-edit-${g.group_key}`}>
                                <Pencil className="h-3 w-3 mr-1" /> Назначить
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* New Counterparties — auto-create contractors */}
            {newCounterparties.length > 0 && (
              <Card className="border-blue-500/20">
                <CardContent className="py-2 px-4">
                  <button className="flex items-center gap-2 w-full text-left"
                    onClick={() => setShowNewContractors(!showNewContractors)} data-testid="toggle-new-contractors">
                    {showNewContractors ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Новые контрагенты ({selectedNewContractors.size}/{newCounterparties.length}) — создать автоматически</span>
                  </button>
                  {showNewContractors && (
                    <div className="mt-2 max-h-[150px] overflow-y-auto grid grid-cols-2 gap-1">
                      {newCounterparties.map(cp => (
                        <label key={cp} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/30 cursor-pointer text-sm">
                          <Checkbox
                            checked={selectedNewContractors.has(cp)}
                            onCheckedChange={() => toggleNewContractor(cp)}
                          />
                          <span className="truncate">{cp}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Transactions table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size === transactions.length}
                        onCheckedChange={toggleAll}
                        data-testid="select-all-checkbox"
                      />
                    </TableHead>
                    <TableHead className="w-24">Дата</TableHead>
                    <TableHead className="w-20">Тип</TableHead>
                    <TableHead>Контрагент / Описание</TableHead>
                    <TableHead className="w-28">Направление</TableHead>
                    <TableHead className="w-28">Категория</TableHead>
                    <TableHead className="w-28 text-right">Сумма</TableHead>
                    <TableHead className="w-10" title="Под вопросом">?</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t, idx) => {
                    const isEditing = editingIdx === idx;
                    const isGroupExpanded = groups.some(g =>
                      g.indices.includes(idx) && expandedGroups.has(g.group_key)
                    );

                    // Find if this tx belongs to a group and is not first in group
                    const belongsToGroup = groups.find(g => g.indices.includes(idx));
                    const isFirstInGroup = belongsToGroup && belongsToGroup.indices[0] === idx;
                    const isInCollapsedGroup = belongsToGroup && !expandedGroups.has(belongsToGroup.group_key) && !isFirstInGroup;

                    if (isInCollapsedGroup) return null;

                    return (
                      <TableRow key={idx}
                        className={`group ${t.is_duplicate ? 'opacity-40' : ''} ${isEditing ? 'bg-muted/30' : ''}`}
                        data-testid={`import-tx-${idx}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected.has(idx)}
                            onCheckedChange={() => toggleOne(idx)}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono">{t.original_date || t.date}</TableCell>
                        <TableCell>
                          {t.type === 'income'
                            ? <Badge className="bg-emerald-600/20 text-emerald-500 text-xs">Приход</Badge>
                            : <Badge className="bg-rose-600/20 text-rose-500 text-xs">Расход</Badge>
                          }
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="space-y-1">
                              <Input className="h-7 text-xs" value={itemEdit.counterparty || ''}
                                onChange={e => setItemEdit({ ...itemEdit, counterparty: e.target.value })}
                                placeholder="Контрагент" />
                              <Input className="h-7 text-xs" value={itemEdit.payment_purpose || ''}
                                onChange={e => setItemEdit({ ...itemEdit, payment_purpose: e.target.value })}
                                placeholder="Назначение" />
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm font-medium truncate max-w-[300px]">{t.counterparty || t.operation_type}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[300px]">{t.payment_purpose || t.description}</p>
                              {t.is_duplicate && (
                                <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30 mt-0.5">
                                  <AlertTriangle className="h-3 w-3 mr-1" /> Возможный дубликат
                                </Badge>
                              )}
                              {t.matched_rule_pattern && !isEditing && (
                                <Badge variant="outline" className="text-xs text-blue-500 border-blue-500/30 mt-0.5">
                                  <Zap className="h-3 w-3 mr-1" /> Правило: {t.matched_rule_pattern}
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={itemEdit.direction_id || '__default__'}
                              onValueChange={v => setItemEdit({ ...itemEdit, direction_id: v === '__default__' ? '' : v })}>
                              <SelectTrigger className="h-7 text-xs text-foreground border-border bg-card"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__default__">По умолч.</SelectItem>
                                {directions.filter(d => d.is_active).map(d => (
                                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{dirName(t.direction_id) || '—'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select value={itemEdit.category_id || '__none__'}
                              onValueChange={v => setItemEdit({ ...itemEdit, category_id: v === '__none__' ? '' : v })}>
                              <SelectTrigger className="h-7 text-xs text-foreground border-border bg-card"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— нет</SelectItem>
                                {categories.filter(c => c.type === t.type).map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{catName(t.category_id) || '—'}</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {t.type === 'income' ? '+' : '-'}{fmtMoney(t.amount, t.currency)}
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant={t.needs_review ? 'default' : 'ghost'}
                            className={`h-6 w-6 ${t.needs_review ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'opacity-40 hover:opacity-100'}`}
                            onClick={() => toggleNeedsReview(idx)}
                            title="Под вопросом — требует уточнения"
                            data-testid={`review-toggle-${idx}`}>
                            <AlertTriangle className="h-3 w-3" />
                          </Button>
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-0.5">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveItemEdit(idx)}>
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingIdx(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                              <Button size="icon" variant="ghost" className="h-6 w-6"
                                onClick={() => { setEditingIdx(idx); setItemEdit({ ...t }); }}
                                title="Редактировать">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {t.category_id && (
                                <Button size="icon" variant="ghost" className="h-6 w-6"
                                  onClick={() => createRuleFromTransaction(t)}
                                  title="Создать автоправило из этой операции"
                                  data-testid={`create-rule-${idx}`}>
                                  <Zap className="h-3 w-3 text-amber-500" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          {step === 2 && (
            <div className="flex items-center justify-between w-full">
              <Button variant="outline" onClick={() => setStep(1)} className="text-foreground border-border" data-testid="back-to-upload">
                Назад
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {selected.size} операций на {fmtMoney(Math.abs(totalSelected), parseResult?.currency)}
                </span>
                <Button onClick={handleImport} disabled={importing || selected.size === 0} data-testid="confirm-import-btn">
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Импортировать {selected.size} операций
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
