import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Plus, Users, Shield, User, Pencil, Trash2, Key, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';

const ROLE_LABELS = {
  superadmin: { label: 'Супер-админ', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  owner: { label: 'Владелец', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  accountant: { label: 'Бухгалтер', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  manager: { label: 'Менеджер', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' }
};

export const UsersPage = () => {
  const { api, user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'owner'
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api().get('/admin/users');
      setUsers(res.data);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error('Доступ запрещён. Только для супер-администратора.');
      } else {
        toast.error('Ошибка загрузки пользователей');
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openNewUser = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      password: '',
      name: '',
      role: 'owner'
    });
    setDialogOpen(true);
  };

  const openEditUser = (user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      role: user.role
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.name) {
      toast.error('Заполните Email и Имя');
      return;
    }

    if (!editingUser && !formData.password) {
      toast.error('Укажите пароль для нового пользователя');
      return;
    }

    try {
      if (editingUser) {
        await api().put(`/admin/users/${editingUser.id}`, {
          email: formData.email,
          name: formData.name,
          role: formData.role,
          password: formData.password || undefined
        });
        toast.success('Пользователь обновлён');
      } else {
        await api().post('/admin/users', formData);
        toast.success('Пользователь создан');
      }
      
      setDialogOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка сохранения');
    }
  };

  const confirmDelete = (user) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    
    try {
      await api().delete(`/admin/users/${userToDelete.id}`);
      toast.success('Пользователь удалён');
      setDeleteDialogOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка удаления');
    }
  };

  // Check if current user is superadmin
  if (currentUser?.role !== 'superadmin') {
    return (
      <div className="p-6 md:p-8">
        <Alert className="bg-rose-500/10 border-rose-500/20">
          <AlertTriangle className="h-4 w-4 text-rose-500" />
          <AlertDescription className="text-rose-500">
            Доступ запрещён. Управление пользователями доступно только супер-администратору.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Пользователи</h1>
          <p className="text-muted-foreground">Управление доступом к системе</p>
        </div>
        
        <Button onClick={openNewUser} data-testid="add-user-btn">
          <Plus className="h-4 w-4 mr-2" />
          Добавить пользователя
        </Button>
      </div>

      {/* Info */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Роли пользователей</h3>
              <div className="grid gap-2 mt-2 text-sm text-muted-foreground">
                <p><strong>Владелец</strong> — полный доступ к финансовым данным</p>
                <p><strong>Бухгалтер</strong> — доступ к операциям, отчётам, документам</p>
                <p><strong>Менеджер</strong> — просмотр дашборда и своих операций</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Список пользователей ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">Нет пользователей</p>
              <Button onClick={openNewUser}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить первого пользователя
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Создан</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const roleInfo = ROLE_LABELS[user.role] || ROLE_LABELS.owner;
                  const isSuperadmin = user.role === 'superadmin';
                  
                  return (
                    <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {isSuperadmin ? (
                              <Shield className="h-5 w-5 text-purple-500" />
                            ) : (
                              <User className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={roleInfo.color}>
                          {roleInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.created_at ? formatDate(user.created_at) : '-'}
                      </TableCell>
                      <TableCell>
                        {!isSuperadmin && (
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => openEditUser(user)}
                              data-testid={`edit-user-${user.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => confirmDelete(user)}
                              data-testid={`delete-user-${user.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Измените данные пользователя' : 'Создайте нового пользователя системы'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Имя *</Label>
              <Input
                placeholder="Иван Иванов"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="user-name-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="ivan@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="user-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label>{editingUser ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль *'}</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                data-testid="user-password-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger data-testid="user-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Владелец</SelectItem>
                  <SelectItem value="accountant">Бухгалтер</SelectItem>
                  <SelectItem value="manager">Менеджер</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmit} data-testid="user-submit-btn">
              {editingUser ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить пользователя?</DialogTitle>
            <DialogDescription>
              Пользователь <strong>{userToDelete?.name}</strong> ({userToDelete?.email}) будет удалён.
              Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Отмена</Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-user-btn">
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
