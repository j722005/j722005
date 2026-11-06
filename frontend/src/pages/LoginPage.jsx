import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, User, Briefcase, Shield, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

export function LoginPage() {
  // Portal types: 'customer' | 'staff' | 'admin'
  const [activePortal, setActivePortal] = useState('customer');
  const [username, setUsername] = useState('rahul_driver');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  const handlePortalSwitch = (portal) => {
    setActivePortal(portal);
    setError('');
    if (portal === 'customer') {
      setUsername('rahul_driver');
      setPassword('password123');
    } else if (portal === 'staff') {
      setUsername('staff_karthik');
      setPassword('password123');
    } else if (portal === 'admin') {
      setUsername('admin_priya');
      setPassword('password123');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      const user = await login({ username: username.trim(), password });

      // Verify if user's role matches the selected portal
      if (activePortal === 'staff' && user.role === 'customer') {
        setError('Access Restricted: This account is a Customer. Please switch to the "Customer Login" tab.');
        showError('Permission denied: Customer account cannot access Staff Gate Terminal.');
        return;
      }

      if (activePortal === 'admin' && user.role !== 'admin') {
        setError('Access Restricted: This account does not have Administrator privileges.');
        showError('Permission denied: Administrator account required.');
        return;
      }

      showSuccess(`Authenticated as ${user.name || user.username} (${user.role.toUpperCase()})`);

      // Route directly to respective portal dashboard
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'staff') {
        navigate('/staff');
      } else {
        navigate('/customer');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const portalConfig = {
    customer: {
      title: 'Customer Login',
      badge: 'Driver & User Portal',
      badgeClass: 'bg-primary-subtle text-primary border-primary-subtle',
      desc: 'Book parking slots, pay online & manage digital QR passes.',
      icon: User,
      colorClass: 'text-primary',
      demoUser: 'rahul_driver',
    },
    staff: {
      title: 'Staff Gate Login',
      badge: 'Security & Gate Station',
      badgeClass: 'bg-warning-subtle text-warning-emphasis border-warning-subtle',
      desc: 'Gate verification, ticket scanner & vehicle check-in/out.',
      icon: Briefcase,
      colorClass: 'text-warning-emphasis',
      demoUser: 'staff_karthik',
    },
    admin: {
      title: 'Administrator Login',
      badge: 'Management & Analytics',
      badgeClass: 'bg-danger-subtle text-danger border-danger-subtle',
      desc: 'Revenue insights, slot configurations & AI demand forecasts.',
      icon: Shield,
      colorClass: 'text-danger',
      demoUser: 'admin_priya',
    },
  };

  const currentConfig = portalConfig[activePortal];
  const IconComponent = currentConfig.icon;

  return (
    <div>
      {/* 3 Dedicated Portal Tabs */}
      <div className="d-flex p-1 bg-slate-100 rounded-3 mb-4 border border-slate-200">
        <button
          type="button"
          onClick={() => handlePortalSwitch('customer')}
          className={`btn btn-sm flex-fill py-2 rounded-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 transition-all ${
            activePortal === 'customer'
              ? 'btn-white shadow-xs text-primary'
              : 'text-slate-600 border-0 bg-transparent'
          }`}
        >
          <User size={15} />
          <span>Customer</span>
        </button>

        <button
          type="button"
          onClick={() => handlePortalSwitch('staff')}
          className={`btn btn-sm flex-fill py-2 rounded-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 transition-all ${
            activePortal === 'staff'
              ? 'btn-white shadow-xs text-warning-emphasis'
              : 'text-slate-600 border-0 bg-transparent'
          }`}
        >
          <Briefcase size={15} />
          <span>Staff Gate</span>
        </button>

        <button
          type="button"
          onClick={() => handlePortalSwitch('admin')}
          className={`btn btn-sm flex-fill py-2 rounded-2 fw-semibold d-flex align-items-center justify-content-center gap-1.5 transition-all ${
            activePortal === 'admin'
              ? 'btn-white shadow-xs text-danger'
              : 'text-slate-600 border-0 bg-transparent'
          }`}
        >
          <Shield size={15} />
          <span>Admin</span>
        </button>
      </div>

      {/* Header for Active Portal */}
      <div className="text-center mb-3">
        <div className="d-inline-flex p-2.5 rounded-circle bg-slate-100 mb-2">
          <IconComponent size={24} className={currentConfig.colorClass} />
        </div>
        <h4 className="fw-bold text-dark tracking-tight mb-1">{currentConfig.title}</h4>
        <span className={`badge border text-xs px-2.5 py-1 rounded-pill mb-2 ${currentConfig.badgeClass}`}>
          {currentConfig.badge}
        </span>
        <p className="text-muted small mb-0 px-2">{currentConfig.desc}</p>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3" role="alert">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <label className="form-label small fw-medium text-dark mb-0" htmlFor="username">
              Username or Email
            </label>
            <button
              type="button"
              onClick={() => {
                setUsername(currentConfig.demoUser);
                setPassword('password123');
              }}
              className="btn btn-link p-0 text-2xs text-muted text-decoration-none"
            >
              Fill Demo: <strong className="text-dark">{currentConfig.demoUser}</strong>
            </button>
          </div>
          <div className="input-group">
            <span className="input-group-text bg-light border-slate-300 text-muted">
              <IconComponent size={16} />
            </span>
            <input
              id="username"
              type="text"
              className="form-control border-slate-300"
              placeholder={`Enter ${activePortal} username`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium text-dark" htmlFor="password">
            Password
          </label>
          <div className="input-group">
            <span className="input-group-text bg-light border-slate-300 text-muted">
              <KeyRound size={16} />
            </span>
            <input
              id="password"
              type="password"
              className="form-control border-slate-300"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`btn w-100 py-2.5 rounded-3 fw-medium d-flex align-items-center justify-content-center gap-2 shadow-sm mb-3 ${
            activePortal === 'admin'
              ? 'btn-danger'
              : activePortal === 'staff'
              ? 'btn-warning text-dark'
              : 'btn-primary'
          }`}
        >
          {loading ? (
            <span className="spinner-border spinner-border-sm" role="status" />
          ) : (
            <>
              <LogIn size={18} /> Sign In to {currentConfig.title}
            </>
          )}
        </button>

        {activePortal === 'customer' && (
          <p className="text-center text-muted small mb-0">
            Don't have a customer account?{' '}
            <Link to="/register" className="text-primary fw-semibold text-decoration-none">
              Register Here
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}

export default LoginPage;
