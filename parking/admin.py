from django.contrib import admin

from .models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle, Notification, AdminAnnouncement,
    PricingRule, PricingRuleAuditLog, SupportTicket, TicketMessage, TicketAuditLog,
    MembershipPlan, CustomerMembership, MonthlyPass, LoyaltyProgramConfig,
    LoyaltyAccount, LoyaltyTransaction,
    RefundRequest, RefundTransaction, RefundAuditLog,
    PaymentDispute, DisputeMessage, DisputeAuditLog
)


class ParkingSlotInline(admin.TabularInline):
    model = ParkingSlot
    extra = 1


@admin.register(ParkingLot)
class ParkingLotAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'total_slots', 'available_slots_count', 'occupied_slots_count', 'price_per_hour', 'is_active')
    search_fields = ('name', 'location')
    inlines = [ParkingSlotInline]


@admin.register(ParkingSlot)
class ParkingSlotAdmin(admin.ModelAdmin):
    list_display = ('lot', 'slot_number', 'slot_type', 'is_active')
    list_filter = ('lot', 'slot_type', 'is_active')


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('booking_id', 'user', 'slot', 'vehicle_number', 'start_time', 'end_time', 'status', 'amount')
    list_filter = ('status',)
    search_fields = ('vehicle_number', 'user__username', 'booking_id')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('transaction_id', 'booking', 'amount', 'method', 'status', 'paid_at')
    list_filter = ('method', 'status')


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ('license_plate', 'user', 'vehicle_type', 'nickname', 'is_default', 'created_at')
    list_filter = ('vehicle_type', 'is_default')
    search_fields = ('license_plate', 'user__username', 'nickname')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'category', 'notification_type', 'is_read', 'email_sent', 'created_at')
    list_filter = ('category', 'is_read', 'notification_type', 'email_sent')
    search_fields = ('title', 'message', 'user__username', 'dedup_key')


@admin.register(AdminAnnouncement)
class AdminAnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'target_role', 'created_by', 'total_recipients', 'emails_sent', 'created_at')
    list_filter = ('target_role', 'send_email', 'created_at')
    search_fields = ('title', 'message', 'created_by__username')


@admin.register(PricingRule)
class PricingRuleAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'lot', 'is_active', 'base_hourly_rate', 'peak_multiplier',
        'weekend_multiplier', 'enable_demand_pricing', 'min_hourly_rate',
        'max_hourly_rate', 'updated_at'
    )
    list_filter = ('is_active', 'enable_demand_pricing', 'lot')
    search_fields = ('name', 'description', 'lot__name')


@admin.register(PricingRuleAuditLog)
class PricingRuleAuditLogAdmin(admin.ModelAdmin):
    list_display = ('rule', 'action', 'user', 'timestamp')
    list_filter = ('action', 'timestamp')
    search_fields = ('rule__name', 'user__username')


class TicketMessageInline(admin.TabularInline):
    model = TicketMessage
    extra = 0
    readonly_fields = ('created_at',)


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ('ticket_id', 'subject', 'user', 'category', 'priority', 'status', 'assigned_to', 'created_at')
    list_filter = ('status', 'priority', 'category', 'created_at')
    search_fields = ('ticket_id', 'subject', 'description', 'user__username', 'booking__booking_id')
    readonly_fields = ('ticket_id', 'created_at', 'updated_at')
    inlines = [TicketMessageInline]


@admin.register(TicketAuditLog)
class TicketAuditLogAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'action', 'performed_by', 'old_value', 'new_value', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('ticket__ticket_id', 'performed_by__username')


@admin.register(MembershipPlan)
class MembershipPlanAdmin(admin.ModelAdmin):
    list_display = ('name', 'duration_type', 'price', 'discount_type', 'discount_value', 'is_active', 'created_at')
    list_filter = ('duration_type', 'discount_type', 'is_active', 'eligible_vehicle_types')
    search_fields = ('name', 'description')


@admin.register(CustomerMembership)
class CustomerMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'plan', 'status', 'start_date', 'end_date', 'usage_count', 'auto_renew')
    list_filter = ('status', 'auto_renew', 'plan')
    search_fields = ('user__username', 'transaction_id', 'plan__name')


@admin.register(MonthlyPass)
class MonthlyPassAdmin(admin.ModelAdmin):
    list_display = ('pass_code', 'user', 'vehicle_license_plate', 'lot', 'pass_type', 'status', 'start_date', 'end_date', 'usage_count')
    list_filter = ('status', 'pass_type', 'lot')
    search_fields = ('pass_code', 'user__username', 'vehicle_license_plate')


@admin.register(LoyaltyProgramConfig)
class LoyaltyProgramConfigAdmin(admin.ModelAdmin):
    list_display = ('id', 'is_enabled', 'points_per_currency_unit', 'points_redemption_rate', 'min_points_to_redeem', 'updated_at')


@admin.register(LoyaltyAccount)
class LoyaltyAccountAdmin(admin.ModelAdmin):
    list_display = ('user', 'points_balance', 'lifetime_earned', 'lifetime_redeemed', 'tier', 'updated_at')
    search_fields = ('user__username', 'user__email')
    list_filter = ('tier',)


@admin.register(LoyaltyTransaction)
class LoyaltyTransactionAdmin(admin.ModelAdmin):
    list_display = ('account', 'transaction_type', 'points', 'balance_after', 'reference_id', 'created_at')
    list_filter = ('transaction_type', 'created_at')
    search_fields = ('account__user__username', 'reference_id', 'description')


# Feature 8: Refund & Dispute Management
class RefundAuditLogInline(admin.TabularInline):
    model = RefundAuditLog
    extra = 0
    readonly_fields = ('performed_by', 'action', 'old_status', 'new_status', 'notes', 'created_at')


class RefundTransactionInline(admin.StackedInline):
    model = RefundTransaction
    extra = 0
    readonly_fields = ('transaction_reference', 'original_payment_reference', 'amount', 'payment_channel', 'status', 'is_simulation', 'gateway_provider', 'processed_by', 'processed_at')


@admin.register(RefundRequest)
class RefundRequestAdmin(admin.ModelAdmin):
    list_display = ('refund_id', 'user', 'booking', 'amount', 'approved_amount', 'reason', 'status', 'created_at')
    list_filter = ('status', 'reason', 'created_at')
    search_fields = ('refund_id', 'user__username', 'user__email', 'booking__booking_id', 'payment__transaction_id')
    readonly_fields = ('refund_id', 'created_at', 'updated_at')
    inlines = [RefundTransactionInline, RefundAuditLogInline]


@admin.register(RefundTransaction)
class RefundTransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction_reference', 'refund_request', 'amount', 'payment_channel', 'status', 'is_simulation', 'processed_at')
    list_filter = ('status', 'is_simulation', 'payment_channel')
    search_fields = ('transaction_reference', 'original_payment_reference', 'refund_request__refund_id')


class DisputeMessageInline(admin.TabularInline):
    model = DisputeMessage
    extra = 0
    readonly_fields = ('sender', 'message', 'attachment', 'is_internal_note', 'created_at')


class DisputeAuditLogInline(admin.TabularInline):
    model = DisputeAuditLog
    extra = 0
    readonly_fields = ('performed_by', 'action', 'old_status', 'new_status', 'notes', 'created_at')


@admin.register(PaymentDispute)
class PaymentDisputeAdmin(admin.ModelAdmin):
    list_display = ('dispute_id', 'user', 'category', 'status', 'disputed_amount', 'assigned_to', 'created_at')
    list_filter = ('status', 'category', 'created_at')
    search_fields = ('dispute_id', 'user__username', 'subject', 'payment_reference')
    readonly_fields = ('dispute_id', 'created_at', 'updated_at')
    inlines = [DisputeMessageInline, DisputeAuditLogInline]




