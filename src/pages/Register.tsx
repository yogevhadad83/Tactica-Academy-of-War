import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import './Auth.css';

const Register = () => {
  const navigate = useNavigate();
  const { register } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    const result = register(username.trim(), password);
    if (!result.success && result.message) {
      setError(result.message);
      return;
    }
    setError('');
    navigate('/');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create Commander</h1>
        <p>Register to start building your Tactica forces.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <label htmlFor="confirm">Confirm Password</label>
          <input
            type="password"
            id="confirm"
            name="confirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />

          {error && <div className="auth-error">{error}</div>}

          <button type="submit">Register</button>
        </form>
        <div className="auth-helper">
          Already registered? <Link to="/login">Login instead</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
