import { useState } from 'react';
import { checkAuth, setPass } from './api';
import { errMsg } from './format';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Logo } from './ui/Logo';
import { FIELD, LABEL } from './ui/styles';

export default function Gate({ onOk }: { onOk: () => void }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      if (await checkAuth(value)) {
        setPass(value);
        onOk();
      } else setErr('Passcode salah');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={96} />
        <h1 className="text-2xl font-bold tracking-tight">OmniVoice Studio</h1>
        <p className="text-sm text-muted">Masukkan passcode untuk memakai aplikasi.</p>
      </div>
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (value && !busy) void submit();
          }}
        >
          <div>
            <label htmlFor="passcode" className={LABEL}>
              Passcode
            </label>
            <input
              id="passcode"
              type="password"
              className={FIELD}
              placeholder="Passcode"
              autoComplete="current-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
          {err && (
            <p role="alert" className="text-sm text-bad">
              {err}
            </p>
          )}
          <Button type="submit" className="w-full" loading={busy} disabled={!value}>
            {busy ? 'Memeriksa...' : 'Masuk'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
