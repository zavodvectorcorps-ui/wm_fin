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
import { 
  Plus, Wallet, Tags, Compass, Wand2, Users, Key, Trash2, Pencil
} from 'lucide-react';
import { formatCurrency, getDirectionClass, getAccountTypeLabel } from '../lib/utils';
import { toast } from 'sonner';

export const SettingsPage = () => {
  const { api, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('accounts');
  
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [directions, setDirections] = useState([]);
  const [autoRules, setAutoRules] = useState([]);
  
  const [dialogType, setDialogType] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  
  const [accountForm, setAccountForm] = useState({ name: '', type: 'checking', currency: 'PLN', bank: '', initial_balance: '' });
  const [categoryForm, setCategoryForm] = useState({ name: '', type: 'expense', group: '', default_direction: '' });
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
        default_direction: item.default_direction || ''
      } : { name: '', type: 'expense', group: '', default_direction: '' });
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
        payload = ruleForm;
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

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Настройки</h1>
        <p className="text-muted-foreground">Управление справочниками и параметрами</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 lg:grid-cols-5 w-full lg:w-auto">
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
                  <SelectItem value="">Не задавать</SelectItem>
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
                  <SelectItem value="">Не задавать</SelectItem>
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
