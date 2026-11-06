import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ShieldCheck, Zap, Clock } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="min-vh-100 d-flex flex-column justify-content-center py-5 bg-gradient-navy position-relative">
      <div className="container" style={{ maxWidth: '480px' }}>
        {/* Brand header */}
        <div className="text-center mb-4">
          <Link to="/" className="text-decoration-none d-inline-flex align-items-center gap-2 mb-2">
            <span className="p-2 bg-primary text-white rounded-4 shadow-sm fs-4">🅿️</span>
            <span className="fs-3 fw-bold text-white tracking-tight">Smart Parking</span>
          </Link>
          <p className="text-slate-300 small mb-0">
            Intelligent, sensor-free parking reservation and management platform
          </p>
        </div>

        {/* Card containing child forms */}
        <div className="card border-0 shadow-xl rounded-4 overflow-hidden p-4 p-md-5 bg-white">
          <Outlet />
        </div>

        {/* Trust Badges */}
        <div className="d-flex justify-content-center align-items-center gap-4 mt-4 text-slate-400 text-xs text-center">
          <span className="d-flex align-items-center gap-1">
            <ShieldCheck size={14} className="text-accent-blue" /> Instant Confirmation
          </span>
          <span className="d-flex align-items-center gap-1">
            <Clock size={14} className="text-accent-blue" /> 10-Min Payment Hold
          </span>
          <span className="d-flex align-items-center gap-1">
            <Zap size={14} className="text-accent-blue" /> Real-time Sync
          </span>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
