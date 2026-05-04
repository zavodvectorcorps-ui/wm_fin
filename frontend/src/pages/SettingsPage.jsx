import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Switch } from '../components/ui/switch';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Plus, Wallet, Tags, Compass, Wand2, Users, Key, Trash2, Pencil, AlertTriangle, RefreshCw, Download, Upload, Database
} from 'lucide-react';
import { formatCurrency, getDirectionClass, getAccountTypeLabel } from '../lib/utils';
import { toast } from 'sonner';

export const SettingsPage = () => {
  const { api, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [dbStats, setDbStats] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [driveBackupLoading, setDriveBackupLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('accounts');
  
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [directions, setDirections] = useState([]);
  const [autoRules, setAutoRules] = useState([]);
  
  const [dialogType, setDialogType] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  
  const [accountForm, setAccountForm] = useState({ name: '', type: 'checking', currency: 'PLN', bank: '', initial_balance: '' });
  const [categoryForm, setCategoryForm] = useState({ name: '', type: 'expense', group: '', default_direction: '', is_fixed_cost: false });
  const [directionForm, setDirectionForm] = useState({ name: '', color: 'blue', description: '' });
  const [ruleForm, setRuleForm] = useState({ pattern: '', category_id: '', direction_id: '', contractor_id: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, categoriesRes, directionsRes, rulesRes] = await Promise.all([
        api().get('/accounts'),
        api().get('/categories'),
        api().get('/directions'),
        api().get('/auto-rules')
      ]);
      
      setAccounts(accountsRes.data);
      setCategories(categoriesRes.data);
      setDirections(directionsRes.data);
      setAutoRules(rulesRes.data);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDialog = (type, item = null) => {
    setDialogType(type);
    setEditingItem(item);
    
    if (type === 'account') {
      setAccountForm(item ? {
        name: item.name,
        type: item.type,
        currency: item.currency,
        bank: item.bank || '',
        initial_balance: item.initial_balance?.toString() || ''
      } : { name: '', type: 'checking', currency: 'PLN', bank: '', initial_balance: '' });
    } else if (type === 'category') {
      setCategoryForm(item ? {
        name: item.name,
        type: item.type,
        group: item.group,
        default_direction: item.default_direction || '',
        is_fixed_cost: !!item.is_fixed_cost
      } : { name: '', type: 'expense', group: '', default_direction: '', is_fixed_cost: false });
    } else if (type === 'direction') {
      setDirectionForm(item ? {
        name: item.name,
        color: item.color,
        description: item.description || ''
      } : { name: '', color: 'blue', description: '' });
    } else if (type === 'rule') {
      setRuleForm(item ? {
        pattern: item.pattern,
        category_id: item.category_id || '',
        direction_id: item.direction_id || '',
        contractor_id: item.contractor_id || ''
      } : { pattern: '', category_id: '', direction_id: '', contractor_id: '' });
    }
  };

  const handleSave = async () => {
    try {
      let endpoint, payload;
      
      if (dialogType === 'account') {
        endpoint = '/accounts';
        payload = { ...accountForm, initial_balance: parseFloat(accountForm.initial_balance) || 0 };
      } else if (dialogType === 'category') {
        endpoint = '/categories';
        payload = categoryForm;
      } else if (dialogType === 'direction') {
        endpoint = '/directions';
        payload = directionForm;
      } else if (dialogType === 'rule') {
        endpoint = '/auto-rules';
        payload = {
          ...ruleForm,
          category_id: ruleForm.category_id === 'none' ? null : ruleForm.category_id,
          direction_id: ruleForm.direction_id === 'none' ? null : ruleForm.direction_id
        };
      }
      
      if (editingItem) {
        await api().put(`${endpoint}/${editingItem.id}`, payload);
        toast.success('Сохранено');
      } else {
        await api().post(endpoint, payload);
        toast.success('Создано');
      }
      
      setDialogType(null);
      fetchData();
    } catch (error) {
      toast.error('Ошибка сохранения');
    }
  };

  const handleDelete = async (type, id) => {
    const endpoints = {
      account: '/accounts',
      category: '/categories',
      direction: '/directions',
      rule: '/auto-rules'
    };
    
    try {
      await api().delete(`${endpoints[type]}/${id}`);
      toast.success('Удалено');
      fetchData();
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  const colorOptions = [
    { value: 'blue', label: 'Синий', class: 'bg-blue-500' },
    { value: 'orange', label: 'Оранжевый', class: 'bg-orange-500' },
    { value: 'green', label: 'Зелёный', class: 'bg-green-500' },
    { value: 'gray', label: 'Серый', class: 'bg-gray-500' },
    { value: 'red', label: 'Красный', class: 'bg-red-500' },
    { value: 'purple', label: 'Фиолетовый', class: 'bg-purple-500' },
  ];

  const loadDbStats = async () => {
    try {
      const res = await api().get('/admin/db/stats');
      setDbStats(res.data);
    } catch (error) {
      toast.error('Ошибка загрузки статистики БД');
    }
  };

  const downloadBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await api().get('/admin/db/export', { responseType: 'blob' });
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : `wmfinance-db-${Date.now()}.tar.gz`;
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/gzip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Архив скачан');
    } catch (error) {
      toast.error('Ошибка экспорта БД');
    } finally {
      setBackupLoading(false);
    }
  };

  const driveBackup = async (full = false) => {
    setDriveBackupLoading(true);
    try {
      const res = await api().post(`/admin/drive-backup/now?full=${full}&notify=true`);
      toast.success(`Загружено в Drive: ${res.data.filename} (${res.data.size_mb} MB). Удалено старых: ${res.data.old_files_deleted}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка бэкапа в Drive');
    } finally {
      setDriveBackupLoading(false);
    }
  };


  const uploadBackup = async () => {
    if (!importFile) {
      toast.error('Выберите файл архива');
      return;
    }
    if (!confirm(
      `ВНИМАНИЕ! Текущая база будет полностью заменена данными из архива "${importFile.name}".\n\n` +
      `Все существующие коллекции будут перезаписаны. Продолжить?`
    )) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await api().post('/admin/db/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(`Импортировано: ${res.data.total_documents} документов`);
      setImportFile(null);
      loadDbStats();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка импорта');
    } finally {
      setImporting(false);
    }
  };

  const resetAllData = async () => {
    if (!confirm('ВНИМАНИЕ! Будут удалены ВСЕ данные:\n- Транзакции\n- Плановые платежи\n- Проекты\n- Контрагенты\n- Документы\n- Импортированные категории\n- Импортированные направления\n- Импортированные счета\n\nОставшиеся счета будут обнулены.\n\nПродолжить?')) return;
    
    setResetting(true);
    try {
      const res = await api().delete('/settings/reset-all');
      const d = res.data.deleted;
      toast.success(`Удалено: транзакций ${d.transactions}, контрагентов ${d.contractors}, проектов ${d.projects}`);
      fetchData();
    } catch (error) {
      toast.error('Ошибка сброса');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Настройки</h1>
        <p className="text-muted-foreground">Управление справочниками и параметрами</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 lg:grid-cols-7 w-full lg:w-auto">
          <TabsTrigger value="accounts" data-testid="tab-accounts">
            <Wallet className="h-4 w-4 mr-2" />
            Счета
          </TabsTrigger>
          <TabsTrigger value="categories" data-testid="tab-categories">
            <Tags className="h-4 w-4 mr-2" />
            Статьи
          </TabsTrigger>
          <TabsTrigger value="directions" data-testid="tab-directions">
            <Compass className="h-4 w-4 mr-2" />
            Направления
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">
            <Wand2 className="h-4 w-4 mr-2" />
            Автоматизация
          </TabsTrigger>
          <TabsTrigger value="api" data-testid="tab-api">
            <Key className="h-4 w-4 mr-2" />
            API
          </TabsTrigger>
          <TabsTrigger value="backup" data-testid="tab-backup">
            <Database className="h-4 w-4 mr-2" />
            Бэкап
          </TabsTrigger>
          <TabsTrigger value="danger" data-testid="tab-danger" className="text-destructive">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Сброс
          </TabsTrigger>
        </TabsList>

        {/* Accounts Tab */}
        <TabsContent value="accounts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Счета</CardTitle>
                <CardDescription>Банковские счета и кассы</CardDescription>
              </div>
              <Button onClick={() => openDialog('account')} data-testid="add-account-btn">
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Валюта</TableHead>
                      <TableHead>Банк</TableHead>
                      <TableHead>Баланс</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((a) => (
                      <TableRow key={a.id} data-testid={`account-row-${a.id}`}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell>{getAccountTypeLabel(a.type)}</TableCell>
                        <TableCell>{a.currency}</TableCell>
                        <TableCell className="text-muted-foreground">{a.bank || '-'}</TableCell>
                        <TableCell className="font-mono">{formatCurrency(a.current_balance, a.currency)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openDialog('account', a)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete('account', a.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Статьи операций</CardTitle>
                <CardDescription>Категории доходов и расходов</CardDescription>
              </div>
              <Button onClick={() => openDialog('category')} data-testid="add-category-btn">
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium mb-3 text-emerald-500">Доходы</h4>
                    <div className="space-y-2">
                      {categories.filter(c => c.type === 'income').map(c => (
                        <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.group}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openDialog('category', c)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete('category', c.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3 text-rose-500">Расходы</h4>
                    <div className="space-y-2">
                      {categories.filter(c => c.type === 'expense').map(c => (
                        <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{c.name}</p>
                              {c.is_fixed_cost && (
                                <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                                  Постоянный
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{c.group}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openDialog('category', c)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete('category', c.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Directions Tab */}
        <TabsContent value="directions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Направления бизнеса</CardTitle>
                <CardDescription>Теплицы, сауны, купели и другие</CardDescription>
              </div>
              <Button onClick={() => openDialog('direction')} data-testid="add-direction-btn">
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {directions.map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-4 rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full bg-${d.color}-500`} />
                        <div>
                          <p className="font-medium">{d.name}</p>
                          {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openDialog('direction', d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete('direction', d.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Auto Rules Tab */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Правила автоматизации</CardTitle>
                <CardDescription>Автоматическая категоризация при импорте</CardDescription>
              </div>
              <Button onClick={() => openDialog('rule')} data-testid="add-rule-btn">
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : autoRules.length === 0 ? (
                <div className="text-center py-8">
                  <Wand2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Нет правил автоматизации</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Добавьте правила для автоматической категоризации операций при импорте банковских выписок
                  </p>
                  <Button onClick={() => openDialog('rule')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить правило
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Паттерн</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Направление</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {autoRules.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono">{r.pattern}</TableCell>
                        <TableCell>{categories.find(c => c.id === r.category_id)?.name || '-'}</TableCell>
                        <TableCell>{directions.find(d => d.id === r.direction_id)?.name || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openDialog('rule', r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete('rule', r.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Tab */}
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API и интеграции</CardTitle>
              <CardDescription>Ключи доступа для внешних сервисов</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-2">Telegram Bot API</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Используйте этот токен для создания операций через Telegram бота
                  </p>
                  <div className="flex gap-2">
                    <Input 
                      value={localStorage.getItem('wm_token') || ''} 
                      readOnly 
                      className="font-mono text-sm"
                    />
                    <Button variant="outline" onClick={() => {
                      navigator.clipboard.writeText(localStorage.getItem('wm_token') || '');
                      toast.success('Токен скопирован');
                    }}>
                      Копировать
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-2">REST API</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Документация API для интеграции с внешними системами
                  </p>
                  <div className="space-y-2 text-sm font-mono">
                    <p>POST /api/bot/transaction - создать операцию</p>
                    <p>GET /api/bot/report - получить отчёт</p>
                    <p>GET /api/transactions - список операций</p>
                    <p>GET /api/accounts - список счетов</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backup Tab */}
        <TabsContent value="backup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Резервное копирование БД
              </CardTitle>
              <CardDescription>
                Скачайте полный архив базы данных (все коллекции) и восстановите на другом сервере
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Экспорт базы данных
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Создаёт tar.gz архив со всеми коллекциями MongoDB. Используйте для переноса на VPS.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={loadDbStats}
                      data-testid="db-stats-btn"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Статистика
                    </Button>
                    <Button
                      onClick={downloadBackup}
                      disabled={backupLoading}
                      data-testid="download-backup-btn"
                    >
                      {backupLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Скачать архив
                    </Button>
                  </div>
                </div>

                {dbStats && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                    <p className="font-medium">
                      База: <span className="font-mono">{dbStats.db_name}</span> · Всего документов: {dbStats.total_documents}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 mt-2 font-mono text-xs">
                      {Object.entries(dbStats.collections).map(([name, count]) => (
                        <div key={name} className="flex justify-between border-b border-border/50 py-0.5">
                          <span>{name}</span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border rounded-lg space-y-3 border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Upload className="h-4 w-4 text-emerald-500" />
                      Бэкап в Google Drive
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Авто: ежедневно в 03:00 UTC (БД), по воскресеньям в 03:30 UTC (БД + uploads).
                      Хранятся 7 дней, потом удаляются. Папка «WM Finance Backups» в корне Drive.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={() => driveBackup(false)}
                      disabled={driveBackupLoading}
                      data-testid="drive-backup-db-btn"
                    >
                      {driveBackupLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Только БД
                    </Button>
                    <Button
                      onClick={() => driveBackup(true)}
                      disabled={driveBackupLoading}
                      data-testid="drive-backup-full-btn"
                    >
                      {driveBackupLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Полный (БД + uploads)
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Подключите Google Drive через <strong>OAuth</strong> в Интеграциях
                  (Google с 2022 г. не даёт Service Accounts хранилище).
                </p>
              </div>


              <div className="p-4 border rounded-lg space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Импорт базы данных
                </h3>
                <p className="text-sm text-muted-foreground">
                  Восстановление из ранее скачанного tar.gz архива. Текущие данные будут перезаписаны.
                </p>
                <div className="flex gap-2 flex-wrap items-center">
                  <Input
                    type="file"
                    accept=".tar.gz,.tgz,application/gzip"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="max-w-sm"
                    data-testid="backup-file-input"
                  />
                  <Button
                    variant="destructive"
                    onClick={uploadBackup}
                    disabled={!importFile || importing}
                    data-testid="upload-backup-btn"
                  >
                    {importing ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Восстановить
                  </Button>
                </div>
                {importFile && (
                  <p className="text-xs text-muted-foreground">
                    Выбран: <span className="font-mono">{importFile.name}</span> ({(importFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Архив содержит все данные: пользователей, транзакции, счета, документы, интеграции.
                  Храните его в безопасном месте — он даёт полный доступ к вашему аккаунту.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Danger Zone Tab */}
        <TabsContent value="danger">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Опасная зона
              </CardTitle>
              <CardDescription>Необратимые действия с данными</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="border-destructive bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-destructive">
                  Внимание! Действия в этом разделе необратимы. Данные будут удалены без возможности восстановления.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-4">
                <div className="p-4 border rounded-lg space-y-3">
                  <h3 className="font-semibold">Полный сброс данных</h3>
                  <p className="text-sm text-muted-foreground">
                    Удаляет все транзакции, плановые платежи, проекты, контрагенты, документы,
                    импортированные категории/направления/счета. Оставшиеся счета обнуляются.
                  </p>
                  <Button 
                    variant="destructive" 
                    onClick={resetAllData}
                    disabled={resetting}
                    data-testid="reset-all-btn"
                  >
                    {resetting ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Удалить все данные
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account Dialog */}
      <Dialog open={dialogType === 'account'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Редактировать счёт' : 'Новый счёт'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input 
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder="Cash PL, mBank PLN..."
                data-testid="account-form-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Тип</Label>
                <Select value={accountForm.type} onValueChange={(v) => setAccountForm({ ...accountForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Расчётный</SelectItem>
                    <SelectItem value="cash">Наличные</SelectItem>
                    <SelectItem value="card">Карта</SelectItem>
                    <SelectItem value="savings">Накопительный</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={accountForm.currency} onValueChange={(v) => setAccountForm({ ...accountForm, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Банк</Label>
                <Input 
                  value={accountForm.bank}
                  onChange={(e) => setAccountForm({ ...accountForm, bank: e.target.value })}
                  placeholder="mBank, PKO BP..."
                />
              </div>
              <div className="space-y-2">
                <Label>Начальный остаток</Label>
                <Input 
                  type="number"
                  value={accountForm.initial_balance}
                  onChange={(e) => setAccountForm({ ...accountForm, initial_balance: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Отмена</Button>
            <Button onClick={handleSave} data-testid="save-account-btn">Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={dialogType === 'category'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Редактировать статью' : 'Новая статья'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input 
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="Название статьи"
                data-testid="category-form-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Тип</Label>
                <Select value={categoryForm.type} onValueChange={(v) => setCategoryForm({ ...categoryForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Доход</SelectItem>
                    <SelectItem value="expense">Расход</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Группа</Label>
                <Input 
                  value={categoryForm.group}
                  onChange={(e) => setCategoryForm({ ...categoryForm, group: e.target.value })}
                  placeholder="Выручка, Себестоимость..."
                />
              </div>
            </div>
            {categoryForm.type === 'expense' && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <input
                  type="checkbox"
                  id="is-fixed-cost"
                  checked={categoryForm.is_fixed_cost}
                  onChange={(e) => setCategoryForm({ ...categoryForm, is_fixed_cost: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                  data-testid="category-fixed-cost"
                />
                <div className="flex-1">
                  <Label htmlFor="is-fixed-cost" className="cursor-pointer">Постоянный расход</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Аренда, зарплаты, абонплаты, налоги. Учитывается в виджете «Runway» (на сколько хватит денег).
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Отмена</Button>
            <Button onClick={handleSave} data-testid="save-category-btn">Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direction Dialog */}
      <Dialog open={dialogType === 'direction'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Редактировать направление' : 'Новое направление'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input 
                value={directionForm.name}
                onChange={(e) => setDirectionForm({ ...directionForm, name: e.target.value })}
                placeholder="Название направления"
                data-testid="direction-form-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Цвет</Label>
              <div className="flex gap-2">
                {colorOptions.map(c => (
                  <button
                    key={c.value}
                    className={`w-8 h-8 rounded-full ${c.class} ${directionForm.color === c.value ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                    onClick={() => setDirectionForm({ ...directionForm, color: c.value })}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Описание</Label>
              <Input 
                value={directionForm.description}
                onChange={(e) => setDirectionForm({ ...directionForm, description: e.target.value })}
                placeholder="Описание направления"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Отмена</Button>
            <Button onClick={handleSave} data-testid="save-direction-btn">Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Rule Dialog */}
      <Dialog open={dialogType === 'rule'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Редактировать правило' : 'Новое правило'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Паттерн *</Label>
              <Input 
                value={ruleForm.pattern}
                onChange={(e) => setRuleForm({ ...ruleForm, pattern: e.target.value })}
                placeholder="Текст для поиска в описании"
                data-testid="rule-form-pattern"
              />
              <p className="text-xs text-muted-foreground">
                Если текст операции содержит этот паттерн, будут применены настройки ниже
              </p>
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={ruleForm.category_id} onValueChange={(v) => setRuleForm({ ...ruleForm, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не задавать</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Направление</Label>
              <Select value={ruleForm.direction_id} onValueChange={(v) => setRuleForm({ ...ruleForm, direction_id: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите направление" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не задавать</SelectItem>
                  {directions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Отмена</Button>
            <Button onClick={handleSave} data-testid="save-rule-btn">Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
