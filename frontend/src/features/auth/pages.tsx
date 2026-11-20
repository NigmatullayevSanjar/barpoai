import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Eye, EyeOff, KeyRound, Phone, UserRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { isChallenge, useAuth, type Me } from '@/lib/auth';
import { errorMessage, useT } from '@/lib/i18n';
import { homeFor } from '@/lib/permissions';
import { Alert, Button, Input } from '@/components/ui';

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      icon={<KeyRound />}
      suffix={
        <Button
          variant="ghost"
          size="sm"
          aria-label={show ? 'hide' : 'show'}
          onClick={() => setShow((v) => !v)}
          icon={show ? <EyeOff /> : <Eye />}
          tabIndex={-1}
        />
      }
    />
  );
}
const hashParam = (name: string) =>
  new URLSearchParams(location.hash.replace(/^#/, '')).get(name) ??
  new URLSearchParams(location.search).get(name);
/** Login sahifasiga bir martalik xabar: sessiya tozalanganda route state yo'qolishi mumkin. */
const NOTICE_KEY = 'barpo.login-notice';
const setNotice = (text: string) => {
  try {
    sessionStorage.setItem(NOTICE_KEY, text);
  } catch {
    /* private mode */
  }
};
const takeNotice = () => {
  try {
    const v = sessionStorage.getItem(NOTICE_KEY);
    if (v) sessionStorage.removeItem(NOTICE_KEY);
    return v;
  } catch {
    return null;
  }
};

/** D43: oxirgi kiritilgan kompaniya domeni — keyingi kirishda qayta yozmaslik uchun (faqat qulaylik). */
const DOMAIN_KEY = 'barpo.login-domain';
const readDomain = () => {
  try {
    return localStorage.getItem(DOMAIN_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveDomain = (value: string) => {
  try {
    if (value) localStorage.setItem(DOMAIN_KEY, value);
    else localStorage.removeItem(DOMAIN_KEY);
  } catch {
    /* private mode */
  }
};

export function LoginPage() {
  const { t } = useT();
  const { login, verifyCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as {
    state?: { from?: string; notice?: string };
  };
  const schema = z.object({
    // D43: bo'sh — platforma xodimi; aks holda kompaniya domeni formati.
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => !v || /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(v), t('auth.domain_invalid')),
    login: z.string().trim().min(3, t('common.required')),
    password: z.string().min(1, t('common.required')),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { domain: hashParam('domain') ?? readDomain(), login: '', password: '' },
  });
  const [error, setError] = useState('');
  const [notice] = useState(() => takeNotice() ?? location.state?.notice ?? '');
  const [step, setStep] = useState<{ challenge: string; expiresAt: number } | null>(null);
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(0);
  const [verifying, setVerifying] = useState(false);
  useEffect(() => {
    if (!step) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((step.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [step]);
  const done = (me: Me) => {
    const from = location.state?.from;
    navigate(
      from && from !== '/change-password' && !me.must_change_password
        ? from
        : homeFor(me.role, me.must_change_password),
      { replace: true },
    );
  };
  const submit = form.handleSubmit(async (values) => {
    setError('');
    try {
      const result = await login(values.login, values.password, values.domain || undefined);
      saveDomain(values.domain);
      if (isChallenge(result)) {
        setCode('');
        setStep({ challenge: result.challenge, expiresAt: Date.now() + result.expires_in * 1000 });
        return;
      }
      done(result);
    } catch (e) {
      setError(errorMessage(t, (e as ApiError).code, (e as ApiError).status));
    }
  });
  const backToLogin = () => {
    setStep(null);
    setCode('');
    setError('');
  };
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step || code.length !== 6) return;
    setError('');
    setVerifying(true);
    try {
      done(await verifyCode(step.challenge, code));
    } catch (err) {
      const apiError = err as ApiError;
      const message = errorMessage(t, apiError.code, apiError.status);
      if (apiError.code === 'LOGIN_CODE_EXPIRED') backToLogin();
      setError(message);
    } finally {
      setVerifying(false);
    }
  };
  if (step)
    return (
      <>
        <h2>{t('auth.code_title')}</h2>
        <p className="sub">{t('auth.code_sub')}</p>
        {left > 0 ? (
          <form onSubmit={submitCode} noValidate>
            <Input
              label={t('auth.code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <p className="muted text-sm">
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </p>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" block loading={verifying} disabled={code.length !== 6}>
              {t('auth.verify')}
            </Button>
          </form>
        ) : (
          <Alert tone="danger">{t('auth.code_expired')}</Alert>
        )}
        <div className="auth-links">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              backToLogin();
            }}
          >
            {t('auth.code_back')}
          </a>
        </div>
      </>
    );
  return (
    <>
      <h2>{t('auth.login_title')}</h2>
      <p className="sub">{t('auth.login_sub')}</p>
      {notice && <Alert tone="success">{notice}</Alert>}
      <form onSubmit={submit} noValidate>
        <Input
          label={t('auth.domain')}
          placeholder={t('auth.domain_placeholder')}
          hint={t('auth.domain_hint')}
          autoComplete="organization"
          autoCapitalize="none"
          spellCheck={false}
          icon={<Building2 />}
          error={form.formState.errors.domain?.message}
          {...form.register('domain')}
        />
        <Input
          label={t('auth.identifier')}
          placeholder={t('auth.identifier_placeholder')}
          autoComplete="username"
          icon={<UserRound />}
          error={form.formState.errors.login?.message}
          {...form.register('login')}
        />
        <PasswordInput
          label={t('auth.password')}
          autoComplete="current-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block loading={form.formState.isSubmitting}>
          {t('auth.sign_in')}
        </Button>
      </form>
      <div className="auth-links">
        <Link to="/forgot-password">{t('auth.forgot')}</Link>
        <span>
          {t('auth.have_invite')} <Link to="/register">{t('auth.register')}</Link>
        </span>
      </div>
    </>
  );
}

export function RegisterPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const token = hashParam('token') ?? '';
  const [preview, setPreview] = useState<{ legal_name: string; domain: string; expires_at: string } | null | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!token || token.length < 32) {
      setPreview(null);
      return;
    }
    api<{ legal_name: string; domain: string; expires_at: string }>('/v1/auth/invites/preview', {
      method: 'POST',
      body: { token },
    })
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [token]);
  const schema = z
    .object({
      display_name: z.string().trim().min(2, t('common.required')).max(120),
      login: z.string().regex(/^[a-zA-Z0-9._-]{3,64}$/, t('auth.login_name')),
      phone: z.string().trim().optional(),
      password: z.string().min(6, t('auth.password_rules')).max(128),
      repeat: z.string(),
    })
    .refine((v) => v.password === v.repeat, {
      message: t('auth.password_mismatch'),
      path: ['repeat'],
    });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });
  const [error, setError] = useState('');
  const submit = form.handleSubmit(async (v) => {
    setError('');
    try {
      await api('/v1/auth/register', {
        method: 'POST',
        body: {
          token,
          login: v.login,
          password: v.password,
          display_name: v.display_name,
          ...(v.phone ? { phone: v.phone } : {}),
        },
      });
      await refresh();
      navigate('/app', { replace: true });
    } catch (e) {
      const err = e as ApiError;
      const field = err.fields?.[0]?.path?.[0];
      if (field === 'phone') form.setError('phone', { message: t('error.VALIDATION_ERROR') });
      setError(errorMessage(t, err.code, err.status));
    }
  });
  if (preview === undefined) return <p className="muted">{t('auth.register_loading')}</p>;
  if (preview === null)
    return (
      <>
        <h2>{t('auth.register_title')}</h2>
        <p className="sub">{t('auth.register_invalid')}</p>
        <Link to="/login">{t('auth.to_login')}</Link>
      </>
    );
  return (
    <>
      <h2>{t('auth.register_title')}</h2>
      <p className="sub">{t('auth.register_sub', { company: preview.legal_name })}</p>
      <Alert tone="info">{t('auth.register_domain', { domain: preview.domain })}</Alert>
      <form onSubmit={submit} noValidate>
        <Input
          label={t('auth.display_name')}
          required
          autoComplete="name"
          error={form.formState.errors.display_name?.message}
          {...form.register('display_name')}
        />
        <Input
          label={t('auth.login_name')}
          required
          autoComplete="username"
          error={form.formState.errors.login?.message}
          {...form.register('login')}
        />
        <Input
          label={`${t('common.phone')} (${t('common.optional')})`}
          placeholder="+998 90 123 45 67"
          autoComplete="tel"
          icon={<Phone />}
          error={form.formState.errors.phone?.message}
          {...form.register('phone')}
        />
        <PasswordInput
          label={t('auth.password')}
          hint={t('auth.password_rules')}
          required
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        <PasswordInput
          label={t('auth.password_repeat')}
          required
          autoComplete="new-password"
          error={form.formState.errors.repeat?.message}
          {...form.register('repeat')}
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block loading={form.formState.isSubmitting}>
          {t('auth.create_account')}
        </Button>
        <p className="muted text-sm">{t('auth.trial_note')}</p>
      </form>
    </>
  );
}

export function ChangePasswordPage() {
  const { t } = useT();
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const schema = z
    .object({
      current_password: z.string().min(1, t('common.required')),
      new_password: z.string().min(6, t('auth.password_rules')).max(128),
      repeat: z.string(),
    })
    .refine((v) => v.new_password === v.repeat, {
      message: t('auth.password_mismatch'),
      path: ['repeat'],
    });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });
  const [error, setError] = useState('');
  const submit = form.handleSubmit(async (v) => {
    setError('');
    try {
      await api('/v1/auth/password', {
        method: 'POST',
        body: {
          current_password: v.current_password,
          new_password: v.new_password,
        },
      });
      setNotice(t('auth.change_done'));
      await logout();
      navigate('/login', { replace: true });
    } catch (e) {
      setError(errorMessage(t, (e as ApiError).code, (e as ApiError).status));
    }
  });
  return (
    <>
      <h2>{me?.must_change_password ? t('auth.change_title') : t('profile.change_password')}</h2>
      <p className="sub">{t('auth.change_sub')}</p>
      <form onSubmit={submit} noValidate>
        <PasswordInput
          label={t('auth.current_password')}
          autoComplete="current-password"
          error={form.formState.errors.current_password?.message}
          {...form.register('current_password')}
        />
        <PasswordInput
          label={t('auth.new_password')}
          hint={t('auth.password_rules')}
          autoComplete="new-password"
          error={form.formState.errors.new_password?.message}
          {...form.register('new_password')}
        />
        <PasswordInput
          label={t('auth.password_repeat')}
          autoComplete="new-password"
          error={form.formState.errors.repeat?.message}
          {...form.register('repeat')}
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block loading={form.formState.isSubmitting}>
          {t('common.save')}
        </Button>
        <Button variant="ghost" block onClick={() => void logout()}>
          {t('nav.logout')}
        </Button>
      </form>
    </>
  );
}

export function ResetPasswordPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const token = hashParam('token') ?? '';
  const schema = z
    .object({
      new_password: z.string().min(6, t('auth.password_rules')).max(128),
      repeat: z.string(),
    })
    .refine((v) => v.new_password === v.repeat, {
      message: t('auth.password_mismatch'),
      path: ['repeat'],
    });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });
  const [error, setError] = useState('');
  if (!token || token.length < 32)
    return (
      <>
        <h2>{t('auth.reset_title')}</h2>
        <p className="sub">{t('auth.reset_no_token')}</p>
        <Link to="/login">{t('auth.to_login')}</Link>
      </>
    );
  const submit = form.handleSubmit(async (v) => {
    setError('');
    try {
      await api('/v1/auth/reset', {
        method: 'POST',
        body: { token, new_password: v.new_password },
      });
      setNotice(t('auth.reset_done'));
      navigate('/login', { replace: true });
    } catch (e) {
      setError(errorMessage(t, (e as ApiError).code, (e as ApiError).status));
    }
  });
  return (
    <>
      <h2>{t('auth.reset_title')}</h2>
      <p className="sub">{t('auth.reset_sub')}</p>
      <form onSubmit={submit} noValidate>
        <PasswordInput
          label={t('auth.new_password')}
          hint={t('auth.password_rules')}
          autoComplete="new-password"
          error={form.formState.errors.new_password?.message}
          {...form.register('new_password')}
        />
        <PasswordInput
          label={t('auth.password_repeat')}
          autoComplete="new-password"
          error={form.formState.errors.repeat?.message}
          {...form.register('repeat')}
        />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block loading={form.formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </form>
    </>
  );
}

export function ForgotPasswordPage() {
  const { t } = useT();
  return (
    <>
      <h2>{t('auth.forgot_title')}</h2>
      <p className="sub">{t('auth.forgot_sub')}</p>
      <Link to="/login">{t('auth.to_login')}</Link>
    </>
  );
}
