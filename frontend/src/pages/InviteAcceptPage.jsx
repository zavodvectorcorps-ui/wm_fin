import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Loader2, Crown, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const InviteAcceptPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    axios.get(`${API}/auth/invite-info/${token}`)
      .then(res => {
        setInfo(res.data);
        setName(res.data.invited_name || '');
      })
      .catch(e => setError(e.response?.data?.detail || 'Приглашение недоступно'))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Укажите имя'); return; }
    if (password.length < 6) { toast.error('Пароль не короче 6 символов'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/auth/accept-invite`, {
        token,
        name: name.trim(),
        password,
      });
      localStorage.setItem('wm_token', res.data.token);
      toast.success(`Добро пожаловать в «${res.data.workspace_name}»`);
      window.location.href = '/dashboard';
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Не удалось принять приглашение');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Приглашение недоступно
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Перейти ко входу</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Приглашение в «{info.workspace_name}»
          </CardTitle>
          <CardDescription>
            {info.created_by_name ? `${info.created_by_name} ` : ''}
            пригласил(а) вас как <strong>{info.role}</strong>.
            Создайте пароль и войдите.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" data-testid="invite-accept-form">
            <Alert className="border-emerald-500/30 bg-emerald-500/5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <AlertDescription className="text-xs">
                Email: <strong>{info.invited_email}</strong>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Ваше имя</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван Иванов"
                required
                data-testid="invite-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Пароль (от 6 символов)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                data-testid="invite-password"
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full" data-testid="invite-submit">
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <>
                  Принять и войти
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default InviteAcceptPage;
