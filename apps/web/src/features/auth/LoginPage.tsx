import type { AuthUser } from '@ajay/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

export function LoginPage() {
  const nav = useNavigate(), { user, setSession, setTokens } = useAuth();
  const [mobile, setMobile] = useState(''), [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: async () => {
      const t = await api<{ accessToken: string; refreshToken: string }>('/auth/login', { body: { mobile, password } });
      setTokens(t);
      const me = await api<AuthUser>('/auth/me');
      setSession(t, me);
    },
    onSuccess: () => nav('/', { replace: true }),
  });
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="counter flex min-h-full items-center justify-center bg-canvas p-6 text-ink">
      <form onSubmit={e => { e.preventDefault(); login.mutate(); }} className="w-full max-w-sm">
        <h1 className="font-display text-4xl leading-tight">Ajay Jewellers</h1>
        <p className="mt-1 text-sm text-muted">Sign in to the shop</p>
        <div className="mt-8 space-y-4">
          <Field label="Mobile number"><Input autoFocus inputMode="numeric" autoComplete="username" maxLength={10} value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
          {login.error && <p className="text-sm text-danger">{(login.error as Error).message}</p>}
          <Button type="submit" variant="primary" className="w-full" busy={login.isPending} disabled={mobile.length !== 10 || !password}>Sign in</Button>
        </div>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Looking for jewellery? <Link to="/catalog" className="text-gold-deep underline">Browse our collection</Link></p>
    </div>
  );
}
