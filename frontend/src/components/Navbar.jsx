import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, Shield, Briefcase, Car, Calendar, Menu, LifeBuoy, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import NotificationCenter from './NotificationCenter';

export function Navbar({ onToggleSidebar }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-navy sticky-top shadow-sm py-2.5">
      <div className="container-fluid px-3 px-lg-4">
        {/* Mobile menu toggle button */}
        <button
          className="btn btn-outline-light btn-sm d-lg-none me-2 p-1.5 rounded-3 border-0"
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation sidebar"
        >
          <Menu size={20} />
        </button>

        {/* Brand */}
        <Link to="/" className="navbar-brand fw-bold d-flex align-items-center gap-2 m-0 text-white">
          <span className="p-1.5 bg-primary text-white rounded-3 shadow-xs fs-6">🅿️</span>
          <span className="tracking-tight">Smart Parking</span>
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle d-none d-sm-inline-block text-2xs py-1 px-2 rounded-pill">
            Live v2.0
          </span>
        </Link>

        {/* Center / Right controls */}
        <div className="d-flex align-items-center ms-auto gap-2 gap-md-3">
          {/* Active Role Badge (Read-only role display; no manual switcher) */}
          {isAuthenticated && (
            <span
              className={`badge rounded-pill px-2.5 py-1 text-xs d-none d-sm-inline-flex align-items-center gap-1.5 ${
                user?.role === 'admin'
                  ? 'bg-danger bg-opacity-25 text-white border border-danger border-opacity-50'
                  : user?.role === 'staff'
                  ? 'bg-warning bg-opacity-25 text-white border border-warning border-opacity-50'
                  : 'bg-primary bg-opacity-25 text-white border border-primary border-opacity-50'
              }`}
            >
              {user?.role === 'admin' && <Shield size={12} />}
              {user?.role === 'staff' && <Briefcase size={12} />}
              {user?.role === 'customer' && <User size={12} />}
              <span className="text-capitalize">{user?.role || 'Customer'} Portal</span>
            </span>
          )}

          {/* Real-time Notification Center */}
          <NotificationCenter />

          {isAuthenticated ? (
            <div className="dropdown">
              <button
                className="btn btn-sm btn-light rounded-pill px-3 py-1.5 d-flex align-items-center gap-2 shadow-xs text-dark fw-medium border-0"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <div
                  className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold text-xs"
                  style={{ width: '24px', height: '24px' }}
                >
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="d-none d-sm-inline small text-truncate" style={{ maxWidth: '120px' }}>
                  {user?.name || user?.username}
                </span>
              </button>
              <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 mt-1 py-1 text-sm">
                <li className="px-3 py-2 border-bottom border-light">
                  <div className="fw-semibold text-dark text-truncate">{user?.name}</div>
                  <div className="text-muted text-xs text-truncate">{user?.email}</div>
                  <span className="badge bg-primary-subtle text-primary text-2xs mt-1 text-capitalize">
                    {user?.role}
                  </span>
                </li>
                <li>
                  <Link to="/customer" className="dropdown-item py-2 d-flex align-items-center gap-2">
                    <User size={15} /> Customer Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/bookings" className="dropdown-item py-2 d-flex align-items-center gap-2">
                    <Calendar size={15} /> My Bookings
                  </Link>
                </li>
                <li>
                  <Link to="/vehicles" className="dropdown-item py-2 d-flex align-items-center gap-2">
                    <Car size={15} /> My Vehicles
                  </Link>
                </li>
                <li>
                  <Link to="/support" className="dropdown-item py-2 d-flex align-items-center gap-2">
                    <LifeBuoy size={15} /> Support & Complaints
                  </Link>
                </li>
                <li>
                  <Link to="/notifications" className="dropdown-item py-2 d-flex align-items-center gap-2">
                    <Bell size={15} /> Notifications & Alerts
                  </Link>
                </li>
                {user?.role === 'staff' && (
                  <li>
                    <Link to="/staff" className="dropdown-item py-2 d-flex align-items-center gap-2 text-primary fw-medium">
                      <Briefcase size={15} /> Staff Gate Monitor
                    </Link>
                  </li>
                )}
                {user?.role === 'admin' && (
                  <li>
                    <Link to="/admin" className="dropdown-item py-2 d-flex align-items-center gap-2 text-primary fw-medium">
                      <Shield size={15} /> Admin Dashboard
                    </Link>
                  </li>
                )}
                <li><hr className="dropdown-divider my-1" /></li>
                <li>
                  <button
                    onClick={handleLogout}
                    className="dropdown-item py-2 text-danger d-flex align-items-center gap-2"
                  >
                    <LogOut size={15} /> Sign Out
                  </button>
                </li>
              </ul>
            </div>
          ) : (
            <div className="d-flex align-items-center gap-2">
              <Link to="/login" className="btn btn-outline-light btn-sm rounded-3 px-3 py-1.5 text-xs">
                Log In
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm rounded-3 px-3 py-1.5 text-xs shadow-xs">
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
