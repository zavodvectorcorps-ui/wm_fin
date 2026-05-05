import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  Users, UserPlus, Mail, Trash2, Crown, Shield, Eye, Wrench, ClipboardCheck,
  Copy, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_META = {
  owner:      { label: 'Владелец',      Icon: Crown,           color: 'text-amber-500',    desc: 'Полный доступ + биллинг' },
  admin:      { label: 'Администратор', Icon: Shield,          color: 'text-rose-500',     desc: 'Полные права кроме передачи владения' },
  manager:    { label: 'Менеджер',      Icon: Wrench,          color: 'text-blue-500',     desc: 'Может вносить операции, контрагентов, проекты' },
  accountant: { label: 'Бухгалтер',     Icon: ClipboardCheck,  color: 'text-emerald-500',  desc: 'Просмотр + экспорты' },
  viewer:     { label: 'Просмотр',      Icon: Eye,             color: 'text-zinc-400',     desc: 'Только дашборд' },
};

const RoleBadge = ({ role }) => {
  const meta = ROLE_META[role] || ROLE_META.viewer;
  const Icon = meta.Icon;
  return (
    <Badge variant="outline" className="gap-1">
      <Icon className={`h-3 w-3 ${meta.color}`} />
      {meta.label}
    </Badge>
  );
};

const TeamPage = () => {
  const { api, user: me } = useAuth();
  const [info, setInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  const [inviteDialog, setInviteDialog] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'manager' });
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [createdInvite, setCreatedInvite] = useState(null);

  const myRole = info?.your_role || 'viewer';
  const canManage = ['owner', 'admin'].includes(myRole);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const reqs = [
        api().get('/workspace/info'),
        api().get('/workspace/members'),
      ];
      if (['owner', 'admin'].includes(me?.workspace_role || 'owner')) {
        reqs.push(api().get('/workspace/invites').catch(() => ({ data: [] })));
      }
      const results = await Promise.all(reqs);
      setInfo(results[0].data);
      setMembers(results[1].data);
      if (results[2]) setInvites(results[2].data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка загрузки команды');
    } finally {
      setLoading(false);
    }
  }, [api, me]);

  useEffect(() => { load(); }, [load]);

  const createInvite = async () => {
    if (!inviteForm.email.trim()) {
      toast.error('Укажите email');
      return;
    }
    setCreatingInvite(true);
    try {
      const res = await api().post('/workspace/invites', {
        email: inviteForm.email.trim(),
        name: inviteForm.name.trim() || null,
        role: inviteForm.role,
      });
      setCreatedInvite(res.data);
      setInviteForm({ email: '', name: '', role: 'manager' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка создания приглашения');
    } finally {
      setCreatingInvite(false);
    }
  };

  const inviteLink = (token) => `${window.location.origin}/invite/${token}`;

  const copyInviteLink = (token) => {
    navigator.clipboard.writeText(inviteLink(token));
    toast.success('Ссылка скопирована');
  };

  const revokeInvite = async (id) => {
    if (!window.confirm('Отозвать приглашение?')) return;
    try {
      await api().delete(`/workspace/invites/${id}`);
      toast.success('Отозвано');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    }
  };

  const changeRole = async (loginId, newRole) => {
    try {
      await api().put(`/workspace/members/${loginId}/role`, { workspace_role: newRole });
      toast.success('Роль изменена');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    }
  };

  const removeMember = async (loginId, email) => {
    if (!window.confirm(`Удалить ${email} из команды? Они потеряют доступ к данным.`)) return;
    try {
      await api().delete(`/workspace/members/${loginId}`);
      toast.success('Удалён');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    }
  };

  const pendingInvites = invites.filter(i => !i.accepted);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7" />
            Команда
          </h1>
          <p className="text-muted-foreground mt-1">
            Пригласите коллег к совместной работе с финансовыми данными
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => { setCreatedInvite(null); setInviteDialog(true); }}
            data-testid="invite-member-btn"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Пригласить участника
          </Button>
        )}
      </div>

      {info && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              {info.workspace_name}
            </CardTitle>
            <CardDescription>
              Ваша роль: <RoleBadge role={info.your_role} /> &nbsp;·&nbsp; Участников: {info.members_count}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Участники ({members.length})</CardTitle>
              <CardDescription>Все эти люди работают с одной общей базой</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {members.map(m => {
                const meta = ROLE_META[m.workspace_role] || ROLE_META.viewer;
                const Icon = meta.Icon;
                const isMe = m.id === me?.id;
                const isOwner = m.is_owner;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors flex-wrap"
                    data-testid={`member-row-${m.email}`}
                  >
                    <div className={`h-9 w-9 rounded-full bg-muted flex items-center justify-center ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {m.name}
                        {isMe && <span className="ml-2 text-xs text-muted-foreground">(вы)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    {canManage && !isOwner && !isMe ? (
                      <Select value={m.workspace_role} onValueChange={(v) => changeRole(m.id, v)}>
                        <SelectTrigger className="w-40 h-8" data-testid={`role-select-${m.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_META).filter(([k]) => k !== 'owner').map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <RoleBadge role={m.workspace_role} />
                    )}
                    {canManage && !isOwner && !isMe && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive h-8 w-8"
                        onClick={() => removeMember(m.id, m.email)}
                        data-testid={`remove-member-${m.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Активные приглашения ({pendingInvites.length})</CardTitle>
                <CardDescription>Ссылки действительны 7 дней</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingInvites.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Нет активных приглашений</p>
                ) : (
                  pendingInvites.map(inv => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-dashed flex-wrap"
                    >
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{inv.invited_email}</p>
                        <p className="text-xs text-muted-foreground">
                          Истекает {new Date(inv.expires_at).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                      <RoleBadge role={inv.role} />
                      <Button variant="outline" size="sm" onClick={() => copyInviteLink(inv.token)}>
                        <Copy className="h-3 w-3 mr-1.5" />
                        Скопировать ссылку
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive h-8 w-8"
                        onClick={() => revokeInvite(inv.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Что может каждая роль</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(ROLE_META).map(([k, v]) => {
                const Icon = v.Icon;
                return (
                  <div key={k} className="flex items-start gap-3 text-sm">
                    <Icon className={`h-4 w-4 mt-0.5 ${v.color}`} />
                    <div>
                      <p className="font-medium">{v.label}</p>
                      <p className="text-xs text-muted-foreground">{v.desc}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteDialog} onOpenChange={setInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Пригласить участника</DialogTitle>
            <DialogDescription>
              Создаём одноразовую ссылку. Пришлите её человеку любым удобным способом —
              он перейдёт по ней, придумает пароль и сразу попадёт в вашу базу.
            </DialogDescription>
          </DialogHeader>

          {createdInvite ? (
            <div className="space-y-3 py-2">
              <Alert className="border-emerald-500/30 bg-emerald-500/5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <AlertDescription>Приглашение создано. Скопируйте ссылку и отправьте получателю.</AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label>Ссылка-приглашение</Label>
                <div className="flex gap-2">
                  <Input value={inviteLink(createdInvite.token)} readOnly data-testid="invite-link" />
                  <Button onClick={() => copyInviteLink(createdInvite.token)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Срок действия: 7 дней. Email: <strong>{createdInvite.invited_email}</strong>,
                  роль: <strong>{ROLE_META[createdInvite.role]?.label}</strong>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="manager@company.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  data-testid="invite-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Имя (необязательно)</Label>
                <Input
                  placeholder="Иван Иванов"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Роль</Label>
                <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                  <SelectTrigger data-testid="invite-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_META).filter(([k]) => k !== 'owner').map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label} — <span className="text-xs text-muted-foreground">{v.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            {createdInvite ? (
              <Button onClick={() => { setInviteDialog(false); setCreatedInvite(null); }}>
                Готово
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setInviteDialog(false)}>Отмена</Button>
                <Button onClick={createInvite} disabled={creatingInvite} data-testid="create-invite-btn">
                  {creatingInvite ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  Создать ссылку
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamPage;
