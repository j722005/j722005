from django.urls import path
from . import api_views
from . import refund_views

urlpatterns = [
    # Auth & Profile
    path('auth/register/', api_views.RegisterAPIView.as_view(), name='api_register'),
    path('auth/login/', api_views.LoginAPIView.as_view(), name='api_login'),
    path('auth/user/', api_views.UserProfileAPIView.as_view(), name='api_user_profile'),
    path('auth/logout/', api_views.LogoutAPIView.as_view(), name='api_logout'),

    # Parking Lots & Slots
    path('lots/', api_views.ParkingLotListAPIView.as_view(), name='api_lot_list'),
    path('lots/recommend/', api_views.SmartParkingRecommendationAPIView.as_view(), name='api_lot_recommend'),
    path('lots/<int:pk>/', api_views.ParkingLotDetailAPIView.as_view(), name='api_lot_detail'),
    path('lots/<int:pk>/slots/', api_views.ParkingLotSlotsAPIView.as_view(), name='api_lot_slots'),
    path('slots/<int:pk>/status/', api_views.ParkingSlotStatusUpdateAPIView.as_view(), name='api_slot_status_update'),

    # Vehicles CRUD
    path('vehicles/', api_views.VehicleListCreateAPIView.as_view(), name='api_vehicles'),
    path('vehicles/<int:pk>/', api_views.VehicleDetailAPIView.as_view(), name='api_vehicle_detail'),
    path('vehicles/<int:pk>/set-default/', api_views.VehicleSetDefaultAPIView.as_view(), name='api_vehicle_set_default'),

    # Bookings & Payment
    path('my-bookings/', api_views.MyBookingsAPIView.as_view(), name='api_my_bookings'),
    path('bookings/create/', api_views.BookingCreateAPIView.as_view(), name='api_booking_create'),
    path('bookings/<uuid:booking_id>/', api_views.BookingDetailAPIView.as_view(), name='api_booking_detail'),
    path('bookings/<uuid:booking_id>/cancel/', api_views.BookingCancelAPIView.as_view(), name='api_booking_cancel'),
    path('bookings/<uuid:booking_id>/payment/', api_views.BookingPaymentAPIView.as_view(), name='api_booking_payment'),

    # Dashboards & Business Intelligence (Feature 7)
    path('customer/dashboard/', api_views.CustomerDashboardAPIView.as_view(), name='api_customer_dashboard'),
    path('staff/overview/', api_views.StaffOverviewAPIView.as_view(), name='api_staff_overview'),
    path('staff/verify-plate/', api_views.StaffVerifyPlateAPIView.as_view(), name='api_staff_verify_plate'),
    path('staff/gate-action/', api_views.StaffGateActionAPIView.as_view(), name='api_staff_gate_action'),
    path('admin/stats/', api_views.AdminStatsAPIView.as_view(), name='api_admin_stats'),
    path('analytics/bi/', api_views.BusinessIntelligenceAPIView.as_view(), name='api_analytics_bi'),
    path('analytics/export/', api_views.AnalyticsExportAPIView.as_view(), name='api_analytics_export'),
    path('admin/export-csv/', api_views.AnalyticsExportAPIView.as_view(), name='api_admin_export_csv'),

    # Dynamic Pricing Engine
    path('pricing/calculate/', api_views.PriceCalculateAPIView.as_view(), name='api_price_calculate'),
    path('pricing/preview/', api_views.PricingPreviewAPIView.as_view(), name='api_price_preview'),
    path('pricing/rules/', api_views.PricingRuleListCreateAPIView.as_view(), name='api_pricing_rules'),
    path('pricing/rules/<int:pk>/', api_views.PricingRuleDetailAPIView.as_view(), name='api_pricing_rule_detail'),
    path('pricing/audit-logs/', api_views.PricingRuleAuditLogAPIView.as_view(), name='api_pricing_audit_logs'),

    # Feature 6: Centralized Notification & Alert Center
    path('notifications/', api_views.NotificationListAPIView.as_view(), name='api_notifications'),
    path('notifications/unread-count/', api_views.NotificationUnreadCountAPIView.as_view(), name='api_notifications_unread_count'),
    path('notifications/<int:pk>/read/', api_views.NotificationMarkReadAPIView.as_view(), name='api_notification_read'),
    path('notifications/mark-all-read/', api_views.NotificationMarkAllReadAPIView.as_view(), name='api_notification_mark_all_read'),
    path('notifications/<int:pk>/archive/', api_views.NotificationArchiveAPIView.as_view(), name='api_notification_archive'),
    path('notifications/<int:pk>/', api_views.NotificationDeleteAPIView.as_view(), name='api_notification_delete'),
    path('notifications/clear-all/', api_views.NotificationClearAllAPIView.as_view(), name='api_notification_clear_all'),
    path('notifications/announce/', api_views.AdminAnnouncementCreateAPIView.as_view(), name='api_notifications_announce'),
    path('notifications/admin-announcements/', api_views.AdminAnnouncementListAPIView.as_view(), name='api_notifications_admin_announcements'),
    path('notifications/email-status/', api_views.NotificationEmailStatusAPIView.as_view(), name='api_notifications_email_status'),
    path('notifications/run-expiry-check/', api_views.NotificationRunExpiryCheckAPIView.as_view(), name='api_notifications_run_expiry_check'),

    # Complaint & Support Ticket System
    path('support/tickets/', api_views.SupportTicketListCreateAPIView.as_view(), name='api_support_tickets'),
    path('support/tickets/<str:ticket_id>/', api_views.SupportTicketDetailAPIView.as_view(), name='api_support_ticket_detail'),
    path('support/tickets/<str:ticket_id>/reply/', api_views.TicketReplyAPIView.as_view(), name='api_support_ticket_reply'),
    path('support/tickets/<str:ticket_id>/status/', api_views.TicketStatusUpdateAPIView.as_view(), name='api_support_ticket_status'),
    path('support/tickets/<str:ticket_id>/priority/', api_views.TicketPriorityUpdateAPIView.as_view(), name='api_support_ticket_priority'),
    path('support/tickets/<str:ticket_id>/assign/', api_views.TicketAssignAPIView.as_view(), name='api_support_ticket_assign'),
    path('support/tickets/<str:ticket_id>/reopen/', api_views.TicketReopenAPIView.as_view(), name='api_support_ticket_reopen'),
    path('support/tickets/<str:ticket_id>/close/', api_views.TicketCloseAPIView.as_view(), name='api_support_ticket_close'),
    path('support/analytics/', api_views.SupportAnalyticsAPIView.as_view(), name='api_support_analytics'),
    path('support/staff-list/', api_views.SupportStaffListAPIView.as_view(), name='api_support_staff_list'),
    path('support/my-eligible-bookings/', api_views.UserEligibleBookingsAPIView.as_view(), name='api_support_eligible_bookings'),

    # Feature 4: Membership Plans & Subscriptions
    path('memberships/plans/', api_views.MembershipPlanListCreateAPIView.as_view(), name='api_membership_plans'),
    path('memberships/plans/<int:pk>/', api_views.MembershipPlanDetailAPIView.as_view(), name='api_membership_plan_detail'),
    path('memberships/my/', api_views.MyMembershipsAPIView.as_view(), name='api_my_memberships'),
    path('memberships/purchase/', api_views.MembershipPurchaseAPIView.as_view(), name='api_membership_purchase'),
    path('memberships/<int:pk>/cancel-renewal/', api_views.MembershipCancelRenewalAPIView.as_view(), name='api_membership_cancel_renewal'),
    path('memberships/<int:pk>/renew/', api_views.MembershipRenewAPIView.as_view(), name='api_membership_renew'),

    # Feature 4: Monthly Parking Passes
    path('passes/my/', api_views.MyMonthlyPassesAPIView.as_view(), name='api_my_passes'),
    path('passes/purchase/', api_views.MonthlyPassPurchaseAPIView.as_view(), name='api_pass_purchase'),
    path('passes/<int:pk>/', api_views.MonthlyPassDetailAPIView.as_view(), name='api_pass_detail'),
    path('passes/<int:pk>/cancel/', api_views.MonthlyPassCancelAPIView.as_view(), name='api_pass_cancel'),

    # Feature 4: Loyalty Points & Rewards
    path('loyalty/me/', api_views.LoyaltyAccountAPIView.as_view(), name='api_loyalty_account'),
    path('loyalty/history/', api_views.LoyaltyTransactionHistoryAPIView.as_view(), name='api_loyalty_history'),
    path('loyalty/config/', api_views.LoyaltyConfigAPIView.as_view(), name='api_loyalty_config'),
    path('loyalty/admin/adjust/', api_views.LoyaltyAdminAdjustAPIView.as_view(), name='api_loyalty_admin_adjust'),
    path('loyalty/admin/accounts/', api_views.LoyaltyAdminAccountsListAPIView.as_view(), name='api_loyalty_admin_accounts'),
    path('admin/memberships/overview/', api_views.AdminMembershipRewardsOverviewAPIView.as_view(), name='api_admin_membership_overview'),

    # Feature 8: Advanced Refund & Dispute Management System
    # Customer Refund Endpoints
    path('refunds/eligible-bookings/', refund_views.EligibleRefundBookingsAPIView.as_view(), name='api_refunds_eligible_bookings'),
    path('refunds/request/', refund_views.RefundRequestCreateAPIView.as_view(), name='api_refunds_request'),
    path('refunds/my-refunds/', refund_views.MyRefundsListAPIView.as_view(), name='api_refunds_my'),
    path('refunds/<str:refund_id>/', refund_views.RefundDetailAPIView.as_view(), name='api_refund_detail'),
    path('refunds/<str:refund_id>/provide-info/', refund_views.RefundProvideInfoAPIView.as_view(), name='api_refund_provide_info'),
    path('refunds/<str:refund_id>/cancel/', refund_views.RefundCancelAPIView.as_view(), name='api_refund_cancel'),

    # Admin Refund Endpoints
    path('admin/refunds/', refund_views.AdminRefundListAPIView.as_view(), name='api_admin_refunds_list'),
    path('admin/refunds/summary/', refund_views.AdminRefundSummaryAPIView.as_view(), name='api_admin_refunds_summary'),
    path('admin/refunds/<str:refund_id>/', refund_views.RefundDetailAPIView.as_view(), name='api_admin_refund_detail'),
    path('admin/refunds/<str:refund_id>/action/', refund_views.AdminRefundActionAPIView.as_view(), name='api_admin_refund_action'),

    # Customer Dispute Endpoints
    path('disputes/raise/', refund_views.PaymentDisputeCreateAPIView.as_view(), name='api_disputes_raise'),
    path('disputes/my-disputes/', refund_views.MyDisputesListAPIView.as_view(), name='api_disputes_my'),
    path('disputes/<str:dispute_id>/', refund_views.PaymentDisputeDetailAPIView.as_view(), name='api_dispute_detail'),
    path('disputes/<str:dispute_id>/reply/', refund_views.PaymentDisputeReplyAPIView.as_view(), name='api_dispute_reply'),

    # Admin Dispute Endpoints
    path('admin/disputes/', refund_views.AdminDisputeListAPIView.as_view(), name='api_admin_disputes_list'),
    path('admin/disputes/summary/', refund_views.AdminDisputeSummaryAPIView.as_view(), name='api_admin_disputes_summary'),
    path('admin/disputes/<str:dispute_id>/', refund_views.PaymentDisputeDetailAPIView.as_view(), name='api_admin_dispute_detail'),
    path('admin/disputes/<str:dispute_id>/reply/', refund_views.PaymentDisputeReplyAPIView.as_view(), name='api_admin_dispute_reply'),
    path('admin/disputes/<str:dispute_id>/status/', refund_views.AdminDisputeStatusAPIView.as_view(), name='api_admin_dispute_status'),
    path('admin/disputes/<str:dispute_id>/assign/', refund_views.AdminDisputeAssignAPIView.as_view(), name='api_admin_dispute_assign'),
]


