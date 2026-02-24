import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

export const LoginPage = () => {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginData.email || !loginData.password) {
      toast.error('Заполните все поля');
      return;
    }
    setLoading(true);
    try {
      await login(loginData.email, loginData.password);
      toast.success('Добро пожаловать!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <span className="text-primary-foreground font-bold text-2xl">WM</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">WM Finance</h1>
          <p className="text-muted-foreground mt-2">Финансовый учёт для вашего бизнеса</p>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Вход в систему</CardTitle>
            <CardDescription>Введите данные для входа</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Логин или Email</Label>
                <Input
                  id="login-email"
                  type="text"
                  placeholder="email@example.com"
                  value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  data-testid="login-email-input"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Пароль</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  data-testid="login-password-input"
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit-btn">
                {loading ? 'Вход...' : 'Войти'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground mt-6">
          <p>Теплицы • Сауны • Купели</p>
          <p className="mt-1 flex items-center justify-center gap-1.5">
            <img src="/logo.png" alt="WM" className="h-4 w-4 opacity-60" />
            <span>Made by Knyazev</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
