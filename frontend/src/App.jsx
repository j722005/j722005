import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CustomerDashboard from './pages/CustomerDashboard';
import ParkingLotsPage from './pages/ParkingLotsPage';
import LotDetailPage from './pages/LotDetailPage';
import VehiclesPage from './pages/VehiclesPage';
import BookingsPage from './pages/BookingsPage';
import StaffDashboard from './pages/StaffDashboard';
import StaffScannerPage from './pages/StaffScannerPage';
import AdminDashboard from './pages/AdminDashboard';
import DemandPredictionPage from './pages/DemandPredictionPage';
import RecommendationsPage from './pages/RecommendationsPage';
import MyTicketsPage from './pages/MyTicketsPage';
import CreateTicketPage from './pages/CreateTicketPage';
import TicketDetailPage from './pages/TicketDetailPage';
import StaffTicketQueuePage from './pages/StaffTicketQueuePage';
import AdminSupportDashboardPage from './pages/AdminSupportDashboardPage';

// Feature 4: Membership, Monthly Passes & Loyalty Rewards Pages
import MembershipPlansPage from './pages/MembershipPlansPage';
import MembershipCheckoutPage from './pages/MembershipCheckoutPage';
import MyMembershipsPage from './pages/MyMembershipsPage';
import MonthlyPassesPage from './pages/MonthlyPassesPage';
import LoyaltyRewardsPage from './pages/LoyaltyRewardsPage';
import LoyaltyHistoryPage from './pages/LoyaltyHistoryPage';
import AdminMembershipRewardsPage from './pages/AdminMembershipRewardsPage';

// Feature 6: Centralized Notification & Alert Center Page
import NotificationHistoryPage from './pages/NotificationHistoryPage';

// Feature 7: Advanced Business Intelligence Dashboard
import BusinessIntelligenceDashboard from './pages/BusinessIntelligenceDashboard';

// Feature 8: Advanced Refund & Dispute Management System
import MyRefundsPage from './pages/MyRefundsPage';
import AdminRefundsPage from './pages/AdminRefundsPage';
import AdminDisputesPage from './pages/AdminDisputesPage';

export function App() {
  return (
    <Routes>
      {/* Public Landing Page */}
      <Route path="/" element={<LandingPage />} />

      {/* Auth Flow (Centered Cards) */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Authenticated / Core Platform Routes (With Sidebar + Navbar) */}
      <Route element={<MainLayout />}>
        <Route path="/customer" element={<CustomerDashboard />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/lots" element={<ParkingLotsPage />} />
        <Route path="/lots/:id" element={<LotDetailPage />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        <Route path="/bookings" element={<BookingsPage />} />

        {/* Feature 4: Memberships, Passes & Loyalty Rewards Routes */}
        <Route path="/memberships/plans" element={<MembershipPlansPage />} />
        <Route path="/memberships/checkout/:planId" element={<MembershipCheckoutPage />} />
        <Route path="/memberships/my" element={<MyMembershipsPage />} />
        <Route path="/passes" element={<MonthlyPassesPage />} />
        <Route path="/rewards" element={<LoyaltyRewardsPage />} />
        <Route path="/rewards/history" element={<LoyaltyHistoryPage />} />
        <Route path="/admin/memberships" element={<AdminMembershipRewardsPage />} />

        {/* Feature 6: Centralized Notification & Alert Center */}
        <Route path="/notifications" element={<NotificationHistoryPage />} />

        {/* Feature 8: Advanced Refund & Dispute Management Routes */}
        <Route path="/refunds" element={<MyRefundsPage />} />
        <Route path="/admin/refunds" element={<AdminRefundsPage />} />
        <Route path="/admin/disputes" element={<AdminDisputesPage />} />

        {/* Feature 3: Complaint & Support Ticket System Routes */}
        <Route path="/support" element={<MyTicketsPage />} />
        <Route path="/support/new" element={<CreateTicketPage />} />
        <Route path="/support/:ticketId" element={<TicketDetailPage />} />
        <Route path="/staff/tickets" element={<StaffTicketQueuePage />} />
        <Route path="/admin/tickets" element={<AdminSupportDashboardPage />} />

        <Route path="/staff" element={<StaffDashboard />} />
        <Route path="/staff/scan" element={<StaffScannerPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/bi" element={<BusinessIntelligenceDashboard />} />
        <Route path="/admin/predictions" element={<DemandPredictionPage />} />
      </Route>

      {/* 404 / Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
