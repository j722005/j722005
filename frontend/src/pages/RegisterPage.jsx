import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, User, Mail, Phone, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

export function RegisterPage() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { register } = useAuth();
  const { showSuccess } = useNotification();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.username.trim() || !formData.email.trim() || !formData.password.trim()) {
      setError('Please fill out all required fields.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await register({
        username: formData.username.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,
      });
      showSuccess('Account created successfully! Welcome to Smart Parking.');
      navigate('/customer');
    } catch (err) {
      setError(err?.response?.data?.message || 'Registration failed. Try a different username.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-4">
        <h3 className="fw-bold text-dark tracking-tight">Create Account</h3>
        <p className="text-muted small">Sign up to reserve slots and manage vehicles</p>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3" role="alert">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <label className="form-label small fw-medium text-dark" htmlFor="username">
            Username *
          </label>
          <div className="input-group">
            <span className="input-group-text bg-light border-slate-300 text-muted">
              <User size={16} />
            </span>
            <input
              id="username"
              name="username"
              type="text"
              className="form-control border-slate-300"
              placeholder="e.g. rahul_driver"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium text-dark" htmlFor="email">
            Email Address *
          </label>
          <div className="input-group">
            <span className="input-group-text bg-light border-slate-300 text-muted">
              <Mail size={16} />
            </span>
            <input
              id="email"
              name="email"
              type="email"
              className="form-control border-slate-300"
              placeholder="name@example.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium text-dark" htmlFor="phone">
            Phone Number (Optional)
          </label>
          <div className="input-group">
            <span className="input-group-text bg-light border-slate-300 text-muted">
              <Phone size={16} />
            </span>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="form-control border-slate-300"
              placeholder="+91 98765 43210"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="row g-2 mb-3">
          <div className="col-sm-6">
            <label className="form-label small fw-medium text-dark" htmlFor="password">
              Password *
            </label>
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted">
                <Lock size={16} />
              </span>
              <input
                id="password"
                name="password"
                type="password"
                className="form-control border-slate-300"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
          </div>
          <div className="col-sm-6">
            <label className="form-label small fw-medium text-dark" htmlFor="confirmPassword">
              Confirm *
            </label>
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted">
                <Lock size={16} />
              </span>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                className="form-control border-slate-300"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-100 py-2.5 rounded-3 fw-medium d-flex align-items-center justify-content-center gap-2 shadow-sm mb-3"
        >
          {loading ? (
            <span className="spinner-border spinner-border-sm" role="status" />
          ) : (
            <>
              <UserPlus size={18} /> Register
            </>
          )}
        </button>

        <p className="text-center text-muted small mb-0">
          Already registered?{' '}
          <Link to="/login" className="text-primary fw-semibold text-decoration-none">
            Sign In here
          </Link>
        </p>
      </form>
    </div>
  );
}

export default RegisterPage;
