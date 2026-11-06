import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  MapPin,
  LayoutDashboard,
  CalendarCheck,
  Car,
  Briefcase,
  ShieldCheck,
  Zap,
  Info,
  X,
  QrCode,
  Sparkles,
  LifeBuoy,
  Crown,
  Ticket,
  Award,
  Bell,
  BarChart2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();

  const navItemClass = ({ isActive }) =>
    `d-flex align-items-center gap-2.5 px-3 py-2.5 rounded-3 text-sm fw-medium transition-all text-decoration-none ${
      isActive
        ? 'bg-primary text-white shadow-xs'
        : 'text-slate-600 hover-bg-slate-100 hover-text-dark'
    }`;

  const sidebarContent = (
    <div className="d-flex flex-column h-100 p-3">
      {/* Mobile close button */}
      <div className="d-flex d-lg-none justify-content-between align-items-center mb-3 pb-2 border-bottom">
        <span className="fw-bold text-dark fs-6">Navigation</span>
        <button onClick={onClose} className="btn btn-sm btn-light rounded-circle p-1">
          <X size={18} />
        </button>
      </div>

      {/* Group: Customer Navigation (Visible to Customer or Admin) */}
      {(!user || user.role === 'customer' || user.role === 'admin') && (
        <div className="mb-4">
          <span className="text-2xs text-uppercase fw-bold text-muted px-3 mb-2 d-block tracking-wider">
            {user?.role === 'admin' ? 'Customer Portal' : 'Smart Parking'}
          </span>
          <nav className="nav flex-column gap-1">
            <NavLink to="/recommendations" className={navItemClass} onClick={onClose}>
              <Sparkles size={18} className="text-warning" /> Smart Recommender
            </NavLink>
            <NavLink to="/lots" className={navItemClass} onClick={onClose}>
              <MapPin size={18} /> Find Parking Lots
            </NavLink>
            <NavLink to="/customer" className={navItemClass} onClick={onClose}>
              <LayoutDashboard size={18} /> Customer Dashboard
            </NavLink>
            <NavLink to="/bookings" className={navItemClass} onClick={onClose}>
              <CalendarCheck size={18} /> My Bookings
            </NavLink>
            <NavLink to="/memberships/plans" className={navItemClass} onClick={onClose}>
              <Crown size={18} className="text-warning" /> Membership Plans
            </NavLink>
            <NavLink to="/memberships/my" className={navItemClass} onClick={onClose}>
              <ShieldCheck size={18} /> My Memberships
            </NavLink>
            <NavLink to="/passes" className={navItemClass} onClick={onClose}>
              <Ticket size={18} className="text-primary" /> Monthly Passes
            </NavLink>
            <NavLink to="/rewards" className={navItemClass} onClick={onClose}>
              <Award size={18} className="text-emerald-500" /> Loyalty Rewards
            </NavLink>
            <NavLink to="/vehicles" className={navItemClass} onClick={onClose}>
              <Car size={18} /> My Vehicles
            </NavLink>
            <NavLink to="/support" className={navItemClass} onClick={onClose}>
              <LifeBuoy size={18} /> Help & Support
            </NavLink>
            <NavLink to="/refunds" className={navItemClass} onClick={onClose}>
              <RotateCcw size={18} /> Refunds &amp; Disputes
            </NavLink>
            <NavLink to="/notifications" className={navItemClass} onClick={onClose}>
              <Bell size={18} /> Notification Center
            </NavLink>
          </nav>
        </div>
      )}

      {/* Group: Staff Gate Operations (Visible to Staff or Admin) */}
      {(user?.role === 'staff' || user?.role === 'admin') && (
        <div className="mb-4">
          <span className="text-2xs text-uppercase fw-bold text-muted px-3 mb-2 d-block tracking-wider">
            Staff Gate Operations
          </span>
          <nav className="nav flex-column gap-1">
            <NavLink to="/staff" className={navItemClass} onClick={onClose}>
              <Briefcase size={18} /> Gate Monitor & Check-In
            </NavLink>
            <NavLink to="/staff/scan" className={navItemClass} onClick={onClose}>
              <QrCode size={18} /> QR Ticket Scanner
            </NavLink>
            <NavLink to="/staff/tickets" className={navItemClass} onClick={onClose}>
              <LifeBuoy size={18} /> Support Queue
            </NavLink>
            {user?.role === 'staff' && (
              <NavLink to="/lots" className={navItemClass} onClick={onClose}>
                <MapPin size={18} /> View Parking Lots
              </NavLink>
            )}
          </nav>
        </div>
      )}

      {/* Group: System Admin (Visible strictly to Admin) */}
      {user?.role === 'admin' && (
        <div className="mb-4">
          <span className="text-2xs text-uppercase fw-bold text-muted px-3 mb-2 d-block tracking-wider">
            Administration
          </span>
          <nav className="nav flex-column gap-1">
            <NavLink to="/admin" className={navItemClass} onClick={onClose}>
              <ShieldCheck size={18} /> Analytics & Revenue
            </NavLink>
            <NavLink to="/admin/bi" className={navItemClass} onClick={onClose}>
              <BarChart2 size={18} className="text-emerald-500" /> Business Intelligence
            </NavLink>
            <NavLink to="/admin/predictions" className={navItemClass} onClick={onClose}>
              <Sparkles size={18} /> AI Demand Prediction
            </NavLink>
            <NavLink to="/admin/tickets" className={navItemClass} onClick={onClose}>
              <LifeBuoy size={18} /> Support Analytics
            </NavLink>
            <NavLink to="/admin/memberships" className={navItemClass} onClick={onClose}>
              <Crown size={18} className="text-warning" /> Plans &amp; Rewards Admin
            </NavLink>
            <NavLink to="/admin/refunds" className={navItemClass} onClick={onClose}>
              <RotateCcw size={18} className="text-indigo-500" /> Refund Management
            </NavLink>
            <NavLink to="/admin/disputes" className={navItemClass} onClick={onClose}>
              <AlertTriangle size={18} className="text-amber-500" /> Payment Disputes
            </NavLink>
          </nav>
        </div>
      )}

      {/* Bottom Mode Status Card */}
      <div className="mt-auto p-3 rounded-4 bg-slate-50 border border-slate-200">
        <div className="d-flex align-items-center gap-2 mb-1">
          <span className="status-indicator-dot bg-success animate-pulse" />
          <span className="text-xs fw-bold text-slate-700">Sensor-Free Engine</span>
        </div>
        <p className="text-2xs text-slate-500 mb-2">
          Real-time slot availability derived via timestamp interval intersections.
        </p>
        <div className="d-flex align-items-center justify-content-between text-2xs text-slate-500 pt-2 border-top border-slate-200">
          <span>Logged Role:</span>
          <span className={`badge text-uppercase px-2 py-0.5 ${
            user?.role === 'admin'
              ? 'bg-danger-subtle text-danger'
              : user?.role === 'staff'
              ? 'bg-warning-subtle text-warning-emphasis'
              : 'bg-primary-subtle text-primary'
          }`}>
            {user?.role || 'Guest'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar-desktop d-none d-lg-block bg-white border-end border-slate-200 vh-100 sticky-top">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          className="sidebar-backdrop d-lg-none position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50"
          style={{ zIndex: 1040 }}
          onClick={onClose}
        />
      )}

      {/* Mobile Offcanvas Drawer */}
      <aside
        className={`sidebar-mobile d-lg-none position-fixed top-0 start-0 h-100 bg-white shadow-lg transition-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '280px', zIndex: 1050 }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

export default Sidebar;
