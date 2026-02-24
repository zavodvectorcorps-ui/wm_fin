import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import { 
  Plus, Search, Users, Phone, Mail, MoreHorizontal, Pencil, Trash2, Building2
} from 'lucide-react';
import { formatCurrency, formatDate, getContractorTypeLabel } from '../lib/utils';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';

export const ContractorsPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contractors, setContractors] = useState([]);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingContractor, setEditingContractor] = useState(null);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [filters, setFilters] = useState({ type: 'all', search: '' });
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'client',
    group: '',
    email: '',
    phone: '',
    comment: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = filters.type && filters.type !== 'all' ? { type: filters.type } : {};
      const res = await api().get('/contractors', { params });
      setContractors(res.data);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchContractorDetails = async (id) => {
    try {
      const res = await api().get(`/contractors/${id}`);
      setSelectedContractor(res.data);
      setDetailOpen(true);
    } catch (error) {
      toast.error('Ошибка загрузки');
    }
  };

  const openNewContractor = () => {
    setEditingContractor(null);
    setFormData({
      name: '',
      type: 'client',
      group: '',
      email: '',
      phone: '',
      comment: ''
    });
    setDialogOpen(true);
  };

  const openEditContractor = (contractor) => {
    setEditingContractor(contractor);
    setFormData({
      name: contractor.name,
      type: contractor.type,
      group: contractor.group || '',
      email: contractor.email || '',
      phone: contractor.phone || '',
      comment: contractor.comment || ''
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error('Введите название');
      return;
    }

    try {
      if (editingContractor) {
        await api().put(`/contractors/${editingContractor.id}`, formData);
        toast.success('Контрагент обновлён');
      } else {
        await api().post('/contractors', formData);
        toast.success('Контрагент создан');
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Ошибка сохранения');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api().delete(`/contractors/${id}`);
      toast.success('Контрагент удалён');
      fetchData();
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  const filteredContractors = contractors.filter(c => 
    !filters.search || c.name.toLowerCase().includes(filters.search.toLowerCase())
  );

  const getTypeColor = (type) => {
    const colors = {
      client: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      supplier: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      employee: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      other: 'bg-gray-500/10 text-gray-400 border-gray-500/20'
    };
    return colors[type] || colors.other;
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Контрагенты</h1>
          <p className="text-muted-foreground">Клиенты, поставщики и партнёры</p>
        </div>
        
        <Button onClick={openNewContractor} data-testid="add-contractor-btn">
          <Plus className="h-4 w-4 mr-2" />
          Добавить
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
              <SelectTrigger data-testid="filter-type">
                <SelectValue placeholder="Тип контрагента" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="client">Клиенты</SelectItem>
                <SelectItem value="supplier">Поставщики</SelectItem>
                <SelectItem value="employee">Сотрудники</SelectItem>
                <SelectItem value="other">Прочие</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Поиск по названию..." 
                className="pl-9"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                data-testid="filter-search"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contractors Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filteredContractors.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">Нет контрагентов</p>
              <Button onClick={openNewContractor}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить контрагента
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Группа</TableHead>
                  <TableHead>Контакты</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContractors.map((c) => (
                  <TableRow 
                    key={c.id} 
                    className="table-row-hover cursor-pointer" 
                    onClick={() => fetchContractorDetails(c.id)}
                    data-testid={`contractor-row-${c.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.comment && <p className="text-sm text-muted-foreground truncate max-w-48">{c.comment}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getTypeColor(c.type)}>
                        {getContractorTypeLabel(c.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.group || '-'}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {c.email && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {c.email}
                          </div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" data-testid={`contractor-menu-${c.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditContractor(c); }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Удалить
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить контрагента?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Это действие нельзя отменить.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(c.id)}>
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Contractor Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-lg">
          {selectedContractor && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedContractor.name}</SheetTitle>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className={getTypeColor(selectedContractor.type)}>
                    {getContractorTypeLabel(selectedContractor.type)}
                  </Badge>
                  {selectedContractor.group && (
                    <span className="text-sm text-muted-foreground">{selectedContractor.group}</span>
                  )}
                </div>

                <div className="space-y-2">
                  {selectedContractor.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {selectedContractor.email}
                    </div>
                  )}
                  {selectedContractor.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {selectedContractor.phone}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm text-muted-foreground">Получено</p>
                    <p className="text-lg font-mono font-semibold text-emerald-500">
                      {formatCurrency(selectedContractor.total_income || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Заплачено</p>
                    <p className="text-lg font-mono font-semibold text-rose-500">
                      {formatCurrency(selectedContractor.total_expense || 0)}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">История операций</h4>
                  {selectedContractor.transactions?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedContractor.transactions.map((t) => (
                        <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                          <div>
                            <p className="text-sm">{t.category_name || 'Без категории'}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                          </div>
                          <span className={`font-mono text-sm ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Нет операций</p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Contractor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContractor ? 'Редактировать контрагента' : 'Новый контрагент'}</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input 
                placeholder="Название или имя"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="contractor-form-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Тип</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger data-testid="contractor-form-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Клиент</SelectItem>
                    <SelectItem value="supplier">Поставщик</SelectItem>
                    <SelectItem value="employee">Сотрудник</SelectItem>
                    <SelectItem value="other">Прочее</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Группа</Label>
                <Input 
                  placeholder="Группа контрагентов"
                  value={formData.group}
                  onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                  data-testid="contractor-form-group"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="contractor-form-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input 
                  placeholder="+48 XXX XXX XXX"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  data-testid="contractor-form-phone"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea 
                placeholder="Заметки о контрагенте..."
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                data-testid="contractor-form-comment"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmit} data-testid="contractor-form-submit">
              {editingContractor ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContractorsPage;
