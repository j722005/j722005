import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-vh-100 d-flex flex-column bg-body-tertiary">
      <Navbar onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

      <div className="d-flex flex-grow-1 position-relative">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main Content Area */}
        <main className="flex-grow-1 p-3 p-md-4 p-xl-5 overflow-x-hidden" style={{ minWidth: 0 }}>
          <div className="container-fluid max-w-7xl px-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-top border-slate-200 py-3 text-center text-muted small mt-auto">
        <div className="container d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2">
          <span>&copy; {new Date().getFullYear()} Smart Parking Management System. All rights reserved.</span>
          <span className="badge bg-light text-slate-500 border border-slate-200">
            Software-Only Real-time Occupancy
          </span>
        </div>
      </footer>
    </div>
  );
}

export default MainLayout;
