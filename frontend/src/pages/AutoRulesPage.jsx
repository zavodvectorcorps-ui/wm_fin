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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Switch } from '../components/ui/switch';
import { 
  Plus, Wand2, Trash2, Pencil, Zap, Search, Sparkles, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export const AutoRulesPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [directions, setDirections] = useState([]);
  const [contractors, setContractors] = useState([]);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [totalUncategorized, setTotalUncategorized] = useState(0);
  const [creatingFor, setCreatingFor] = useState(null);  // pattern currently being saved
  const [suggDraft, setSuggDraft] = useState({});  // {pattern: {category_id, direction_id}}
  
  const [formData, setFormData] = useState({
    pattern: '',
    category_id: '',
    direction_id: '',
    contractor_id: '',
    is_active: true
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, categoriesRes, directionsRes, contractorsRes] = await Promise.all([
        api().get('/auto-rules'),
        api().get('/categories'),
        api().get('/directions'),
        api().get('/contractors')
      ]);
      
      setRules(rulesRes.data);
      setCategories(categoriesRes.data);
      setDirections(directionsRes.data);
      setContractors(contractorsRes.data);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await api().get('/auto-rules/suggestions?limit=8');
      setSuggestions(res.data?.suggestions || []);
      setTotalUncategorized(res.data?.total_uncategorized || 0);
    } catch {
      // silently ignore
    } finally {
      setSuggestionsLoading(false);
    }
  }, [api]);

  const createRuleFromSuggestion = async (sugg) => {
    const draft = suggDraft[sugg.pattern_raw] || {};
    if (!draft.category_id && !draft.direction_id) {
      toast.error('Выберите Статью и/или Направление');
      return;
    }
    setCreatingFor(sugg.pattern_raw);
    try {
      const payload = { pattern: sugg.pattern, is_active: true };
      if (draft.category_id) payload.category_id = draft.category_id;
      if (draft.direction_id) payload.direction_id = draft.direction_id;
      await api().post('/auto-rules', payload);

      // Apply to existing matching operations
      const resp = await api().get('/transactions', { params: { search: sugg.pattern, per_page: 500 } });
      const items = (resp.data?.items || resp.data || []);
      const ids = items.map(x => x.id);
      let applied = 0;
      if (ids.length > 0) {
        const r = await api().post('/transactions/bulk-apply-rules', { ids, overwrite: false });
        applied = r.data?.updated || 0;
      }
      toast.success(applied > 0
        ? `Правило «${sugg.pattern}» создано · обновлено ${applied} операций`
        : `Правило «${sugg.pattern}» создано`);
      await Promise.all([fetchData(), fetchSuggestions()]);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка создания правила');
    } finally {
      setCreatingFor(null);
    }
  };

  useEffect(() => {
    fetchData();
    fetchSuggestions();
  }, [fetchData, fetchSuggestions]);

  const openNewRule = () => {
    setEditingRule(null);
    setFormData({
      pattern: '',
      category_id: '',
      direction_id: '',
      contractor_id: '',
      is_active: true
    });
    setDialogOpen(true);
  };

  const openEditRule = (rule) => {
    setEditingRule(rule);
    setFormData({
      pattern: rule.pattern,
      category_id: rule.category_id || '',
      direction_id: rule.direction_id || '',
      contractor_id: rule.contractor_id || '',
      is_active: rule.is_active
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.pattern) {
      toast.error('Укажите шаблон для поиска');
      return;
    }

    try {
      const payload = {
        pattern: formData.pattern,
        category_id: formData.category_id === 'none' ? null : formData.category_id || null,
        direction_id: formData.direction_id === 'none' ? null : formData.direction_id || null,
        contractor_id: formData.contractor_id === 'none' ? null : formData.contractor_id || null
      };

      if (editingRule) {
        await api().put(`/auto-rules/${editingRule.id}`, payload);
        toast.success('Правило обновлено');
      } else {
        await api().post('/auto-rules', payload);
        toast.success('Правило создано');
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Ошибка сохранения');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить это правило?')) return;
    
    try {
      await api().delete(`/auto-rules/${id}`);
      toast.success('Правило удалено');
      fetchData();
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  const getCategoryName = (id) => categories.find(c => c.id === id)?.name || '-';
  const getDirectionName = (id) => directions.find(d => d.id === id)?.name || '-';
  const getContractorName = (id) => contractors.find(c => c.id === id)?.name || '-';

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Правила автоматизации</h1>
          <p className="text-muted-foreground">Автоматическая категоризация операций при импорте</p>
        </div>
        
        <Button onClick={openNewRule} data-testid="add-rule-btn">
          <Plus className="h-4 w-4 mr-2" />
          Новое правило
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Wand2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Как работают правила?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                При импорте банковских выписок система проверяет описание каждой операции. 
                Если описание содержит указанный шаблон (без учёта регистра), операция автоматически 
                получает выбранную категорию, направление или контрагента.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Smart Suggestions */}
      <Card className="border-violet-500/30 bg-violet-500/5" data-testid="suggestions-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Умные предложения
            {!suggestionsLoading && suggestions.length > 0 && (
              <Badge variant="secondary" className="ml-1">{suggestions.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {totalUncategorized > 0
              ? `Найдено ${totalUncategorized} операций без статьи. Часто встречающиеся паттерны — кандидаты на правило:`
              : 'Все операции уже размечены. Новые предложения появятся после импорта или создания новых операций без категории.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {suggestionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Нет подходящих кандидатов</p>
          ) : (
            <div className="space-y-2">
              {suggestions.map(s => {
                const draft = suggDraft[s.pattern_raw] || {};
                const isLoading = creatingFor === s.pattern_raw;
                return (
                  <div key={s.pattern_raw} className="rounded-md border border-violet-500/20 bg-background p-3 space-y-2"
                       data-testid={`suggestion-${s.pattern_raw}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="font-mono">{s.pattern}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {s.count} операций · {s.total_amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Примеры: {s.samples.slice(0, 2).join(' • ')}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Select
                        value={draft.category_id || 'none'}
                        onValueChange={(v) => setSuggDraft(prev => ({
                          ...prev, [s.pattern_raw]: { ...draft, category_id: v === 'none' ? '' : v }
                        }))}
                      >
                        <SelectTrigger className="h-9" data-testid={`sugg-cat-${s.pattern_raw}`}>
                          <SelectValue placeholder="Статья..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не назначать</SelectItem>
                          {categories.filter(c => c.is_active !== false).map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={draft.direction_id || 'none'}
                        onValueChange={(v) => setSuggDraft(prev => ({
                          ...prev, [s.pattern_raw]: { ...draft, direction_id: v === 'none' ? '' : v }
                        }))}
                      >
                        <SelectTrigger className="h-9" data-testid={`sugg-dir-${s.pattern_raw}`}>
                          <SelectValue placeholder="Направление..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не назначать</SelectItem>
                          {directions.filter(d => d.is_active !== false).map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={isLoading}
                        onClick={() => createRuleFromSuggestion(s)}
                        data-testid={`sugg-create-${s.pattern_raw}`}
                      >
                        {isLoading
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <Sparkles className="h-4 w-4 mr-2" />}
                        Создать правило
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Активные правила ({rules.filter(r => r.is_active).length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">Нет правил автоматизации</p>
              <Button onClick={openNewRule}>
                <Plus className="h-4 w-4 mr-2" />
                Создать первое правило
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Шаблон</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Направление</TableHead>
                  <TableHead>Контрагент</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} data-testid={`rule-row-${rule.id}`}>
                    <TableCell>
                      <code className="px-2 py-1 rounded bg-muted text-sm">{rule.pattern}</code>
                    </TableCell>
                    <TableCell>{getCategoryName(rule.category_id)}</TableCell>
                    <TableCell>{getDirectionName(rule.direction_id)}</TableCell>
                    <TableCell>{getContractorName(rule.contractor_id)}</TableCell>
                    <TableCell>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                        {rule.is_active ? 'Активно' : 'Выкл'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => openEditRule(rule)}
                          data-testid={`edit-rule-${rule.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(rule.id)}
                          data-testid={`delete-rule-${rule.id}`}
                        >
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

      {/* Rule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Редактировать правило' : 'Новое правило'}</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Шаблон для поиска *</Label>
              <Input 
                placeholder="например: BIEDRONKA или ALLEGRO"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                data-testid="rule-pattern"
              />
              <p className="text-xs text-muted-foreground">
                Текст, который будет искаться в описании операции (без учёта регистра)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Присвоить категорию</Label>
              <Select value={formData.category_id} onValueChange={(v) => setFormData({ ...formData, category_id: v })}>
                <SelectTrigger data-testid="rule-category">
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не менять</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.type === 'income' ? '↑' : '↓'} {c.group} → {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Присвоить направление</Label>
              <Select value={formData.direction_id} onValueChange={(v) => setFormData({ ...formData, direction_id: v })}>
                <SelectTrigger data-testid="rule-direction">
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не менять</SelectItem>
                  {directions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Присвоить контрагента</Label>
              <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
                <SelectTrigger data-testid="rule-contractor">
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не менять</SelectItem>
                  {contractors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmit} data-testid="rule-submit-btn">
              {editingRule ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AutoRulesPage;
