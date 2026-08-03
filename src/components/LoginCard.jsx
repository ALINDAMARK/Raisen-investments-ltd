import { useState } from 'react';
import FormField from './FormField.jsx';

export default function LoginCard({ roles, onLogin }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const result = await window.factoryAuth.login({ name, role, password });
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">FACTORY<span>OS</span></div>
        <p className="login-sub">Polythene Bag Factory — Management System</p>
        <form onSubmit={submit}>
          <FormField field={{ label: 'Your Name', type: 'text' }} value={name} onChange={setName} />
          <FormField field={{ label: 'Your Role', type: 'select', options: roles.map((r) => ({ value: r.key, label: r.label })) }} value={role} onChange={setRole} />
          <FormField field={{ label: 'Password', type: 'password' }} value={password} onChange={setPassword} />
          <button className="btn-primary btn-full" type="submit">Enter</button>
        </form>
        {error && <p className="login-error">{error}</p>}
        <p className="login-note">Everyone who opens this link and enters shares the same live data — perfect for the factory floor and the head office alike.</p>
      </div>
    </div>
  );
}
