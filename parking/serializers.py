import os
from decimal import Decimal, ROUND_HALF_UP
from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.conf import settings
from rest_framework import serializers

from .models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle, Notification, AdminAnnouncement,
    PricingRule, PricingRuleAuditLog, SupportTicket, TicketMessage, TicketAuditLog,
    MembershipPlan, CustomerMembership, MonthlyPass, LoyaltyProgramConfig,
    LoyaltyAccount, LoyaltyTransaction,
    RefundRequest, RefundTransaction, RefundAuditLog,
    PaymentDispute, DisputeMessage, DisputeAuditLog
)

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'name', 'role', 'is_staff', 'is_superuser')

    def get_name(self, obj):
        full = f"{obj.first_name} {obj.last_name}".strip()
        return full or obj.username

    def get_role(self, obj):
        if obj.is_superuser:
            return 'admin'
        if obj.is_staff:
            return 'staff'
        return 'customer'


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'first_name')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
        )
        return user


class ParkingLotListSerializer(serializers.ModelSerializer):
    total_slots = serializers.ReadOnlyField()
    active_slots_count = serializers.ReadOnlyField()
    available_slots_count = serializers.ReadOnlyField()
    occupied_slots_count = serializers.ReadOnlyField()
    future_reserved_slots_count = serializers.ReadOnlyField()
    occupancy_percent = serializers.ReadOnlyField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ParkingLot
        fields = (
            'id', 'name', 'location', 'description', 'price_per_hour', 'latitude', 'longitude', 'is_active',
            'image_url', 'total_slots', 'active_slots_count', 'available_slots_count',
            'occupied_slots_count', 'future_reserved_slots_count', 'occupancy_percent'
        )

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.image.url) if request else obj.image.url
        return None


class ParkingSlotSerializer(serializers.ModelSerializer):
    lot_name = serializers.ReadOnlyField(source='lot.name')
    status = serializers.SerializerMethodField()
    current_booking = serializers.SerializerMethodField()

    class Meta:
        model = ParkingSlot
        fields = (
            'id', 'lot', 'lot_name', 'slot_number', 'slot_type', 'floor', 'is_covered', 'is_active',
            'status', 'current_booking'
        )

    def get_status(self, obj):
        if not obj.is_active:
            return 'maintenance'

        # Check for requested time interval in request query params
        request = self.context.get('request')
        if request:
            start_str = request.query_params.get('start_time')
            end_str = request.query_params.get('end_time')
            if start_str and end_str:
                try:
                    from django.utils.dateparse import parse_datetime
                    start = parse_datetime(start_str)
                    end = parse_datetime(end_str)
                    if start and end and end > start:
                        if timezone.is_naive(start):
                            start = timezone.make_aware(start)
                        if timezone.is_naive(end):
                            end = timezone.make_aware(end)
                        if obj.is_interval_blocked(start, end):
                            return 'occupied'
                        return 'available'
                except Exception:
                    pass

        now = timezone.now()
        # Check if occupied right now
        if not obj.is_available(now):
            return 'occupied'
        # Check if has upcoming reservation
        hold_minutes = getattr(settings, 'BOOKING_HOLD_MINUTES', 10)
        valid_hold_threshold = now - timezone.timedelta(minutes=hold_minutes)
        has_future = obj.bookings.filter(
            models.Q(status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE]) |
            models.Q(status=Booking.STATUS_PENDING, created_at__gt=valid_hold_threshold),
            start_time__gt=now
        ).exists()
        if has_future:
            return 'reserved'
        return 'available'

    def get_current_booking(self, obj):
        now = timezone.now()
        booking = obj.current_booking(now)
        if booking:
            return {
                'booking_id': str(booking.booking_id),
                'vehicle_number': booking.vehicle_number,
                'end_time': booking.end_time.isoformat(),
            }
        return None


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ('transaction_id', 'amount', 'method', 'status', 'paid_at')


class BookingSerializer(serializers.ModelSerializer):
    lot_id = serializers.ReadOnlyField(source='slot.lot.id')
    lot_name = serializers.ReadOnlyField(source='slot.lot.name')
    slot_number = serializers.ReadOnlyField(source='slot.slot_number')
    slot_type = serializers.ReadOnlyField(source='slot.slot_type')
    duration_hours = serializers.ReadOnlyField()
    is_upcoming = serializers.ReadOnlyField()
    is_ongoing = serializers.ReadOnlyField()
    is_hold_expired = serializers.ReadOnlyField()
    hold_expires_at = serializers.SerializerMethodField()
    payment = PaymentSerializer(read_only=True)

    class Meta:
        model = Booking
        fields = (
            'id', 'booking_id', 'lot_id', 'lot_name', 'slot', 'slot_number', 'slot_type',
            'vehicle_number', 'start_time', 'end_time', 'status', 'amount',
            'membership', 'monthly_pass', 'points_redeemed', 'points_discount_amount', 'points_awarded',
            'duration_hours', 'is_upcoming', 'is_ongoing', 'is_hold_expired',
            'hold_expires_at', 'pricing_rule', 'price_snapshot', 'created_at', 'payment'
        )

    def get_hold_expires_at(self, obj):
        expires = obj.hold_expires_at
        return expires.isoformat() if expires else None


class BookingCreateSerializer(serializers.Serializer):
    lot_id = serializers.IntegerField(required=True)
    slot_id = serializers.IntegerField(required=True)
    vehicle_number = serializers.CharField(max_length=20, required=True)
    vehicle_type = serializers.CharField(max_length=10, required=False, default='car')
    start_time = serializers.DateTimeField(required=True)
    end_time = serializers.DateTimeField(required=True)
    pass_id = serializers.IntegerField(required=False, allow_null=True)
    membership_id = serializers.IntegerField(required=False, allow_null=True)
    redeem_points = serializers.IntegerField(required=False, default=0)

    def validate_vehicle_number(self, value):
        cleaned = value.strip().upper()
        if not cleaned:
            raise serializers.ValidationError('Vehicle license plate is required.')
        return cleaned

    def validate(self, attrs):
        start = attrs.get('start_time')
        end = attrs.get('end_time')
        now = timezone.now()

        if start <= now:
            raise serializers.ValidationError({'start_time': 'Start time must be in the future.'})

        if end <= start:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})

        min_hours = getattr(settings, 'PARKING_MIN_BOOKING_HOURS', 0.5)
        max_hours = getattr(settings, 'PARKING_MAX_BOOKING_HOURS', 24)
        duration_hours = (end - start).total_seconds() / 3600

        if duration_hours < min_hours:
            raise serializers.ValidationError(f'Booking duration must be at least {min_hours} hour(s).')

        if duration_hours > max_hours:
            raise serializers.ValidationError(f'Booking duration cannot exceed {max_hours} hours.')

        return attrs


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ('id', 'license_plate', 'vehicle_type', 'nickname', 'is_default', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_license_plate(self, value):
        cleaned = value.strip().upper()
        if not cleaned:
            raise serializers.ValidationError('License plate number is required.')
        return cleaned


class NotificationSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = Notification
        fields = (
            'id', 'title', 'message', 'category', 'category_display',
            'notification_type', 'is_read', 'read_at', 'is_archived',
            'link', 'metadata', 'email_sent', 'created_at'
        )
        read_only_fields = ('id', 'created_at', 'read_at', 'email_sent')


class AdminAnnouncementSerializer(serializers.ModelSerializer):
    created_by_username = serializers.ReadOnlyField(source='created_by.username')
    target_role_display = serializers.CharField(source='get_target_role_display', read_only=True)

    class Meta:
        model = AdminAnnouncement
        fields = (
            'id', 'title', 'message', 'target_role', 'target_role_display',
            'created_by', 'created_by_username', 'send_email',
            'total_recipients', 'emails_sent', 'emails_failed', 'created_at'
        )
        read_only_fields = ('id', 'created_by', 'created_by_username', 'total_recipients', 'emails_sent', 'emails_failed', 'created_at')


class PricingRuleSerializer(serializers.ModelSerializer):
    lot_name = serializers.ReadOnlyField(source='lot.name')
    created_by_username = serializers.ReadOnlyField(source='created_by.username')

    class Meta:
        model = PricingRule
        fields = (
            'id', 'name', 'description', 'lot', 'lot_name', 'is_active',
            'base_hourly_rate', 'car_multiplier', 'bike_multiplier', 'ev_multiplier',
            'peak_start_hour_1', 'peak_end_hour_1', 'peak_start_hour_2', 'peak_end_hour_2',
            'peak_multiplier', 'off_peak_multiplier', 'weekend_multiplier',
            'duration_discount_threshold_hours', 'duration_discount_percent',
            'enable_demand_pricing', 'demand_surge_threshold_percent', 'demand_surge_multiplier',
            'demand_discount_threshold_percent', 'demand_discount_multiplier',
            'min_historical_bookings_threshold', 'min_hourly_rate', 'max_hourly_rate',
            'tax_percent', 'created_by', 'created_by_username', 'created_at', 'updated_at'
        )
        read_only_fields = ('id', 'created_at', 'updated_at', 'created_by')

    def validate(self, attrs):
        min_rate = attrs.get('min_hourly_rate', getattr(self.instance, 'min_hourly_rate', None))
        max_rate = attrs.get('max_hourly_rate', getattr(self.instance, 'max_hourly_rate', None))
        if min_rate is not None and max_rate is not None and min_rate > max_rate:
            raise serializers.ValidationError({'max_hourly_rate': 'Maximum rate cannot be less than minimum rate.'})
        return attrs


class PricingRuleAuditLogSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')
    rule_name = serializers.ReadOnlyField(source='rule.name')

    class Meta:
        model = PricingRuleAuditLog
        fields = ('id', 'rule', 'rule_name', 'user', 'username', 'action', 'changes', 'timestamp')


class PriceCalculationRequestSerializer(serializers.Serializer):
    lot_id = serializers.IntegerField(required=True)
    start_time = serializers.DateTimeField(required=True)
    end_time = serializers.DateTimeField(required=True)
    vehicle_type = serializers.CharField(required=False, default='car')
    vehicle_number = serializers.CharField(required=False, allow_blank=True, default='')
    rule_id = serializers.IntegerField(required=False, allow_null=True)
    pass_id = serializers.IntegerField(required=False, allow_null=True)
    membership_id = serializers.IntegerField(required=False, allow_null=True)
    redeem_points = serializers.IntegerField(required=False, default=0)



# ==============================================================================
# SUPPORT TICKET & COMPLAINT SERIALIZERS
# ==============================================================================

class TicketMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')
    sender_name = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketMessage
        fields = (
            'id', 'ticket', 'sender', 'sender_username', 'sender_name',
            'sender_role', 'message', 'attachment', 'attachment_url',
            'attachment_name', 'is_internal_note', 'created_at'
        )
        read_only_fields = ('id', 'ticket', 'sender', 'created_at')

    def get_sender_name(self, obj):
        full = f"{obj.sender.first_name} {obj.sender.last_name}".strip()
        return full or obj.sender.username

    def get_sender_role(self, obj):
        if obj.sender.is_superuser:
            return 'admin'
        if obj.sender.is_staff:
            return 'staff'
        return 'customer'

    def get_attachment_url(self, obj):
        if obj.attachment:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.attachment.url) if request else obj.attachment.url
        return None

    def get_attachment_name(self, obj):
        if obj.attachment:
            return os.path.basename(obj.attachment.name)
        return None


class TicketAuditLogSerializer(serializers.ModelSerializer):
    performed_by_username = serializers.ReadOnlyField(source='performed_by.username')
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketAuditLog
        fields = (
            'id', 'ticket', 'performed_by', 'performed_by_username',
            'performed_by_name', 'action', 'old_value', 'new_value', 'notes', 'created_at'
        )

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            full = f"{obj.performed_by.first_name} {obj.performed_by.last_name}".strip()
            return full or obj.performed_by.username
        return 'System'


class SupportTicketListSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    user_username = serializers.ReadOnlyField(source='user.username')
    user_name = serializers.SerializerMethodField()
    assigned_to_username = serializers.ReadOnlyField(source='assigned_to.username')
    assigned_to_name = serializers.SerializerMethodField()
    booking_id = serializers.CharField(source='booking.booking_id', read_only=True)
    lot_name = serializers.CharField(source='booking.slot.lot.name', read_only=True)
    messages_count = serializers.SerializerMethodField()
    latest_message = serializers.SerializerMethodField()
    has_attachment = serializers.SerializerMethodField()
    is_reopenable = serializers.ReadOnlyField()

    class Meta:
        model = SupportTicket
        fields = (
            'id', 'ticket_id', 'category', 'category_display', 'priority', 'priority_display',
            'status', 'status_display', 'subject', 'user', 'user_username', 'user_name',
            'assigned_to', 'assigned_to_username', 'assigned_to_name',
            'booking', 'booking_id', 'lot_name', 'messages_count', 'latest_message',
            'has_attachment', 'is_reopenable', 'created_at', 'updated_at'
        )

    def get_user_name(self, obj):
        full = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return full or obj.user.username

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            full = f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
            return full or obj.assigned_to.username
        return None

    def get_messages_count(self, obj):
        request = self.context.get('request')
        is_staff = request and (request.user.is_staff or request.user.is_superuser)
        if is_staff:
            return obj.messages.count()
        return obj.messages.filter(is_internal_note=False).count()

    def get_latest_message(self, obj):
        request = self.context.get('request')
        is_staff = request and (request.user.is_staff or request.user.is_superuser)
        qs = obj.messages.all() if is_staff else obj.messages.filter(is_internal_note=False)
        last_msg = qs.last()
        if last_msg:
            return {
                'sender_username': last_msg.sender.username,
                'sender_role': 'admin' if last_msg.sender.is_superuser else 'staff' if last_msg.sender.is_staff else 'customer',
                'message': last_msg.message[:80] + ('...' if len(last_msg.message) > 80 else ''),
                'created_at': last_msg.created_at.isoformat(),
            }
        return None

    def get_has_attachment(self, obj):
        return bool(obj.attachment)


class SupportTicketDetailSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    user_username = serializers.ReadOnlyField(source='user.username')
    user_name = serializers.SerializerMethodField()
    user_email = serializers.ReadOnlyField(source='user.email')
    assigned_to_username = serializers.ReadOnlyField(source='assigned_to.username')
    assigned_to_name = serializers.SerializerMethodField()
    booking_details = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()
    messages = serializers.SerializerMethodField()
    audit_logs = serializers.SerializerMethodField()
    is_reopenable = serializers.ReadOnlyField()

    class Meta:
        model = SupportTicket
        fields = (
            'id', 'ticket_id', 'category', 'category_display', 'priority', 'priority_display',
            'status', 'status_display', 'subject', 'description', 'user', 'user_username',
            'user_name', 'user_email', 'assigned_to', 'assigned_to_username', 'assigned_to_name',
            'booking', 'booking_details', 'attachment', 'attachment_url', 'attachment_name',
            'resolution_notes', 'resolved_at', 'closed_at', 'is_reopenable',
            'messages', 'audit_logs', 'created_at', 'updated_at'
        )

    def get_user_name(self, obj):
        full = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return full or obj.user.username

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            full = f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
            return full or obj.assigned_to.username
        return None

    def get_attachment_url(self, obj):
        if obj.attachment:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.attachment.url) if request else obj.attachment.url
        return None

    def get_attachment_name(self, obj):
        if obj.attachment:
            return os.path.basename(obj.attachment.name)
        return None

    def get_booking_details(self, obj):
        if not obj.booking:
            return None
        b = obj.booking
        return {
            'booking_id': str(b.booking_id),
            'lot_name': b.slot.lot.name if b.slot and b.slot.lot else None,
            'slot_number': b.slot.slot_number if b.slot else None,
            'slot_type': b.slot.slot_type if b.slot else None,
            'vehicle_number': b.vehicle_number,
            'start_time': b.start_time.isoformat() if b.start_time else None,
            'end_time': b.end_time.isoformat() if b.end_time else None,
            'amount': str(b.amount),
            'status': b.status,
        }

    def get_messages(self, obj):
        request = self.context.get('request')
        is_staff = request and (request.user.is_staff or request.user.is_superuser)
        # CRITICAL SECURITY: Regular customers must NEVER see internal staff notes!
        qs = obj.messages.all() if is_staff else obj.messages.filter(is_internal_note=False)
        return TicketMessageSerializer(qs, many=True, context=self.context).data

    def get_audit_logs(self, obj):
        request = self.context.get('request')
        if request and (request.user.is_staff or request.user.is_superuser):
            return TicketAuditLogSerializer(obj.audit_logs.all(), many=True).data
        return []


class SupportTicketCreateSerializer(serializers.ModelSerializer):
    booking_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = SupportTicket
        fields = ('category', 'priority', 'subject', 'description', 'booking_id', 'attachment')

    def validate_booking_id(self, value):
        if not value:
            return None
        value = str(value).strip()
        request = self.context.get('request')
        if not request or not request.user:
            return None
        try:
            booking = Booking.objects.get(booking_id=value)
        except (Booking.DoesNotExist, ValueError):
            raise serializers.ValidationError('Invalid booking reference ID provided.')

        # Ensure user can only link their own bookings!
        if booking.user != request.user and not (request.user.is_staff or request.user.is_superuser):
            raise serializers.ValidationError('You can only link support tickets to your own bookings.')

        return booking

    def create(self, validated_data):
        booking = validated_data.pop('booking_id', None)
        request = self.context.get('request')
        ticket = SupportTicket.objects.create(
            user=request.user,
            booking=booking,
            **validated_data
        )
        TicketAuditLog.objects.create(
            ticket=ticket,
            performed_by=request.user,
            action='created',
            new_value=ticket.status,
            notes='Support ticket created.'
        )
        return ticket


class TicketReplySerializer(serializers.Serializer):
    message = serializers.CharField(required=True, min_length=1)
    attachment = serializers.FileField(required=False, allow_null=True)
    is_internal_note = serializers.BooleanField(required=False, default=False)
    status = serializers.CharField(required=False, allow_blank=True)


class TicketStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=SupportTicket.STATUS_CHOICES)
    resolution_notes = serializers.CharField(required=False, allow_blank=True, default='')


class TicketAssignSerializer(serializers.Serializer):
    assigned_to_id = serializers.IntegerField(required=False, allow_null=True)


# ==============================================================================
# FEATURE 4: MEMBERSHIP, MONTHLY PASS & LOYALTY SERIALIZERS
# ==============================================================================

class MembershipPlanSerializer(serializers.ModelSerializer):
    eligible_lot_names = serializers.SerializerMethodField()

    class Meta:
        model = MembershipPlan
        fields = (
            'id', 'name', 'description', 'duration_type', 'duration_days',
            'price', 'currency', 'discount_type', 'discount_value',
            'max_discount_per_booking', 'min_booking_amount',
            'eligible_lots', 'eligible_lot_names', 'eligible_vehicle_types',
            'max_discounted_bookings', 'perks_description',
            'is_active', 'allow_auto_renewal', 'created_at', 'updated_at'
        )
        read_only_fields = ('id', 'created_at', 'updated_at')

    def get_eligible_lot_names(self, obj):
        return [lot.name for lot in obj.eligible_lots.all()]

    def validate(self, attrs):
        price = attrs.get('price', getattr(self.instance, 'price', None))
        if price is not None and price < 0:
            raise serializers.ValidationError({'price': 'Price cannot be negative.'})

        d_type = attrs.get('discount_type', getattr(self.instance, 'discount_type', MembershipPlan.DISCOUNT_PERCENTAGE))
        d_val = attrs.get('discount_value', getattr(self.instance, 'discount_value', None))
        if d_val is not None:
            if d_val < 0:
                raise serializers.ValidationError({'discount_value': 'Discount value cannot be negative.'})
            if d_type == MembershipPlan.DISCOUNT_PERCENTAGE and d_val > 100:
                raise serializers.ValidationError({'discount_value': 'Percentage discount cannot exceed 100%.'})

        d_days = attrs.get('duration_days', getattr(self.instance, 'duration_days', None))
        if d_days is not None and d_days <= 0:
            raise serializers.ValidationError({'duration_days': 'Duration days must be greater than zero.'})

        return attrs


class CustomerMembershipSerializer(serializers.ModelSerializer):
    plan_details = MembershipPlanSerializer(source='plan', read_only=True)
    user_username = serializers.ReadOnlyField(source='user.username')
    remaining_usage = serializers.ReadOnlyField()
    is_renewable = serializers.ReadOnlyField()
    is_valid = serializers.SerializerMethodField()

    class Meta:
        model = CustomerMembership
        fields = (
            'id', 'user', 'user_username', 'plan', 'plan_details',
            'status', 'start_date', 'end_date', 'auto_renew',
            'cancelled_at', 'usage_count', 'remaining_usage',
            'is_renewable', 'is_valid', 'payment_method',
            'amount_paid', 'transaction_id', 'is_simulated_payment',
            'created_at', 'updated_at'
        )
        read_only_fields = (
            'id', 'user', 'status', 'start_date', 'end_date',
            'cancelled_at', 'usage_count', 'amount_paid',
            'transaction_id', 'is_simulated_payment', 'created_at', 'updated_at'
        )

    def get_is_valid(self, obj):
        return obj.is_currently_valid()


class CustomerMembershipPurchaseSerializer(serializers.Serializer):
    plan_id = serializers.IntegerField(required=True)
    payment_method = serializers.ChoiceField(choices=['upi', 'card', 'netbanking', 'wallet'], default='upi')
    auto_renew = serializers.BooleanField(required=False, default=False)


class MonthlyPassSerializer(serializers.ModelSerializer):
    user_username = serializers.ReadOnlyField(source='user.username')
    lot_name = serializers.SerializerMethodField()
    vehicle_details = VehicleSerializer(source='vehicle', read_only=True)
    remaining_usage = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = MonthlyPass
        fields = (
            'id', 'pass_code', 'user', 'user_username', 'vehicle',
            'vehicle_details', 'vehicle_license_plate', 'lot', 'lot_name',
            'pass_name', 'pass_type', 'discount_percent', 'price',
            'status', 'start_date', 'end_date', 'max_bookings',
            'usage_count', 'remaining_usage', 'is_expired',
            'payment_method', 'amount_paid', 'transaction_id',
            'is_simulated_payment', 'created_at', 'updated_at'
        )
        read_only_fields = (
            'id', 'pass_code', 'user', 'vehicle_license_plate',
            'status', 'start_date', 'end_date', 'usage_count',
            'amount_paid', 'transaction_id', 'is_simulated_payment',
            'created_at', 'updated_at'
        )

    def get_lot_name(self, obj):
        return obj.lot.name if obj.lot else 'All Locations'

    def get_remaining_usage(self, obj):
        if obj.max_bookings == 0:
            return None
        return max(0, obj.max_bookings - obj.usage_count)

    def get_is_expired(self, obj):
        return obj.end_date < timezone.now() if obj.end_date else False


class MonthlyPassPurchaseSerializer(serializers.Serializer):
    vehicle_id = serializers.IntegerField(required=True)
    lot_id = serializers.IntegerField(required=False, allow_null=True)
    pass_type = serializers.ChoiceField(choices=MonthlyPass.PASS_TYPE_CHOICES, default=MonthlyPass.PASS_TYPE_FULL)
    payment_method = serializers.ChoiceField(choices=['upi', 'card', 'netbanking', 'wallet'], default='upi')


class LoyaltyProgramConfigSerializer(serializers.ModelSerializer):
    updated_by_username = serializers.ReadOnlyField(source='updated_by.username')

    class Meta:
        model = LoyaltyProgramConfig
        fields = (
            'id', 'is_enabled', 'points_per_currency_unit', 'min_spending_to_earn',
            'points_redemption_rate', 'min_points_to_redeem',
            'max_redemption_percentage', 'updated_by', 'updated_by_username', 'updated_at'
        )
        read_only_fields = ('id', 'updated_by', 'updated_at')

    def validate(self, attrs):
        unit = attrs.get('points_per_currency_unit', getattr(self.instance, 'points_per_currency_unit', None))
        if unit is not None and unit < 0:
            raise serializers.ValidationError({'points_per_currency_unit': 'Must be positive.'})
        rate = attrs.get('points_redemption_rate', getattr(self.instance, 'points_redemption_rate', None))
        if rate is not None and rate <= 0:
            raise serializers.ValidationError({'points_redemption_rate': 'Redemption rate must be greater than zero.'})
        max_pct = attrs.get('max_redemption_percentage', getattr(self.instance, 'max_redemption_percentage', None))
        if max_pct is not None and (max_pct < 0 or max_pct > 100):
            raise serializers.ValidationError({'max_redemption_percentage': 'Max redemption percent must be between 0 and 100.'})
        return attrs


class LoyaltyAccountSerializer(serializers.ModelSerializer):
    user_username = serializers.ReadOnlyField(source='user.username')
    user_email = serializers.ReadOnlyField(source='user.email')
    current_discount_value = serializers.SerializerMethodField()

    class Meta:
        model = LoyaltyAccount
        fields = (
            'id', 'user', 'user_username', 'user_email',
            'points_balance', 'lifetime_earned', 'lifetime_redeemed',
            'tier', 'current_discount_value', 'created_at', 'updated_at'
        )
        read_only_fields = ('id', 'user', 'points_balance', 'lifetime_earned', 'lifetime_redeemed', 'tier', 'created_at', 'updated_at')

    def get_current_discount_value(self, obj):
        config = LoyaltyProgramConfig.get_config()
        return float((Decimal(str(obj.points_balance)) * config.points_redemption_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


class LoyaltyTransactionSerializer(serializers.ModelSerializer):
    user_username = serializers.ReadOnlyField(source='account.user.username')
    booking_uuid = serializers.ReadOnlyField(source='booking.booking_id')
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)

    class Meta:
        model = LoyaltyTransaction
        fields = (
            'id', 'account', 'user_username', 'transaction_type',
            'transaction_type_display', 'points', 'balance_after',
            'booking', 'booking_uuid', 'reference_id', 'description',
            'created_at'
        )
        read_only_fields = fields


class LoyaltyAdminAdjustSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=True)
    points = serializers.IntegerField(required=True, min_value=1)
    adjustment_type = serializers.ChoiceField(choices=['credit', 'debit'])
    reason = serializers.CharField(required=True, min_length=3, max_length=255)


# ==============================================================================
# FEATURE 8: REFUND & DISPUTE SERIALIZERS
# ==============================================================================

class RefundAuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RefundAuditLog
        fields = ('id', 'performed_by_name', 'action', 'old_status', 'new_status', 'notes', 'created_at')

    def get_performed_by_name(self, obj):
        if not obj.performed_by:
            return 'System'
        full = f"{obj.performed_by.first_name} {obj.performed_by.last_name}".strip()
        return full or obj.performed_by.username


class RefundTransactionSerializer(serializers.ModelSerializer):
    processed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RefundTransaction
        fields = (
            'id', 'transaction_reference', 'original_payment_reference',
            'amount', 'payment_channel', 'status', 'is_simulation',
            'gateway_provider', 'gateway_response', 'processed_by_name', 'processed_at'
        )

    def get_processed_by_name(self, obj):
        if not obj.processed_by:
            return 'Automated Engine'
        return obj.processed_by.username


class RefundRequestListSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    booking_id = serializers.CharField(source='booking.booking_id', read_only=True)
    vehicle_number = serializers.CharField(source='booking.vehicle_number', read_only=True)
    lot_name = serializers.SerializerMethodField()
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    has_attachment = serializers.SerializerMethodField()
    transaction_reference = serializers.SerializerMethodField()

    class Meta:
        model = RefundRequest
        fields = (
            'refund_id', 'user_name', 'booking_id', 'vehicle_number', 'lot_name',
            'amount', 'approved_amount', 'reason', 'reason_display',
            'status', 'status_display', 'has_attachment', 'transaction_reference',
            'created_at', 'updated_at'
        )

    def get_user_name(self, obj):
        full = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return full or obj.user.username

    def get_lot_name(self, obj):
        if obj.booking and obj.booking.slot and obj.booking.slot.lot:
            return obj.booking.slot.lot.name
        return 'N/A'

    def get_has_attachment(self, obj):
        return bool(obj.attachment)

    def get_transaction_reference(self, obj):
        if hasattr(obj, 'transaction') and obj.transaction:
            return obj.transaction.transaction_reference
        return None


class RefundRequestDetailSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    booking = serializers.SerializerMethodField()
    payment = serializers.SerializerMethodField()
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    attachment_url = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    transaction = RefundTransactionSerializer(read_only=True)
    audit_logs = RefundAuditLogSerializer(many=True, read_only=True)

    class Meta:
        model = RefundRequest
        fields = (
            'refund_id', 'user', 'booking', 'payment', 'amount', 'approved_amount',
            'reason', 'reason_display', 'explanation', 'attachment_url',
            'status', 'status_display', 'rejection_reason', 'admin_notes', 'customer_notes',
            'reviewed_by_name', 'reviewed_at', 'transaction', 'audit_logs',
            'created_at', 'updated_at'
        )

    def get_user(self, obj):
        return {
            'id': obj.user.id,
            'username': obj.user.username,
            'email': obj.user.email,
            'name': f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username,
        }

    def get_booking(self, obj):
        b = obj.booking
        lot_name = b.slot.lot.name if b.slot and b.slot.lot else 'N/A'
        slot_number = b.slot.slot_number if b.slot else 'N/A'
        return {
            'booking_id': str(b.booking_id),
            'lot_name': lot_name,
            'slot_number': slot_number,
            'vehicle_number': b.vehicle_number,
            'start_time': b.start_time.isoformat() if b.start_time else '',
            'end_time': b.end_time.isoformat() if b.end_time else '',
            'status': b.status,
            'status_display': b.get_status_display(),
            'amount': float(b.amount),
        }

    def get_payment(self, obj):
        p = obj.payment
        return {
            'transaction_id': p.transaction_id,
            'amount': float(p.amount),
            'method': p.method,
            'method_display': p.get_method_display(),
            'status': p.status,
            'paid_at': p.paid_at.isoformat() if p.paid_at else '',
        }

    def get_attachment_url(self, obj):
        if obj.attachment:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.attachment.url)
            return obj.attachment.url
        return None

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None
        return obj.reviewed_by.username

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Privacy & Security: Hide admin_notes from non-staff customers!
        request = self.context.get('request')
        if request and not (request.user.is_staff or request.user.is_superuser):
            ret.pop('admin_notes', None)
        return ret


class RefundRequestCreateSerializer(serializers.Serializer):
    booking_id = serializers.CharField(required=True)
    amount = serializers.DecimalField(required=True, max_digits=8, decimal_places=2, min_value=Decimal('0.01'))
    reason = serializers.ChoiceField(choices=RefundRequest.REASON_CHOICES, required=True)
    explanation = serializers.CharField(required=False, allow_blank=True, default='')
    attachment = serializers.FileField(required=False, allow_null=True)


class RefundActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['review', 'request_info', 'approve', 'reject', 'process'], required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default='')
    approved_amount = serializers.DecimalField(required=False, max_digits=8, decimal_places=2, min_value=Decimal('0.01'))


class DisputeMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = DisputeMessage
        fields = ('id', 'sender_name', 'sender_role', 'message', 'attachment_url', 'is_internal_note', 'created_at')

    def get_sender_name(self, obj):
        full = f"{obj.sender.first_name} {obj.sender.last_name}".strip()
        return full or obj.sender.username

    def get_sender_role(self, obj):
        if obj.sender.is_superuser:
            return 'admin'
        if obj.sender.is_staff:
            return 'staff'
        return 'customer'

    def get_attachment_url(self, obj):
        if obj.attachment:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.attachment.url)
            return obj.attachment.url
        return None


class DisputeAuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DisputeAuditLog
        fields = ('id', 'performed_by_name', 'action', 'old_status', 'new_status', 'notes', 'created_at')

    def get_performed_by_name(self, obj):
        if not obj.performed_by:
            return 'System'
        return obj.performed_by.username


class PaymentDisputeListSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    booking_id = serializers.CharField(source='booking.booking_id', read_only=True, default='')
    assigned_to_name = serializers.SerializerMethodField()
    messages_count = serializers.SerializerMethodField()

    class Meta:
        model = PaymentDispute
        fields = (
            'dispute_id', 'user_name', 'category', 'category_display',
            'status', 'status_display', 'subject', 'disputed_amount',
            'booking_id', 'payment_reference', 'assigned_to_name',
            'messages_count', 'created_at', 'updated_at'
        )

    def get_user_name(self, obj):
        full = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return full or obj.user.username

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to:
            return 'Unassigned'
        full = f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
        return full or obj.assigned_to.username

    def get_messages_count(self, obj):
        # Exclude internal notes from count if caller is a customer
        request = self.context.get('request')
        if request and not (request.user.is_staff or request.user.is_superuser):
            return obj.messages.filter(is_internal_note=False).count()
        return obj.messages.count()


class PaymentDisputeDetailSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    booking = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    attachment_url = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    refund_request_id = serializers.CharField(source='refund_request.refund_id', read_only=True, default=None)
    messages = serializers.SerializerMethodField()
    audit_logs = DisputeAuditLogSerializer(many=True, read_only=True)

    class Meta:
        model = PaymentDispute
        fields = (
            'dispute_id', 'user', 'booking', 'refund_request_id',
            'category', 'category_display', 'status', 'status_display',
            'subject', 'description', 'disputed_amount', 'payment_reference',
            'attachment_url', 'assigned_to_name', 'resolution_summary',
            'resolved_at', 'messages', 'audit_logs', 'created_at', 'updated_at'
        )

    def get_user(self, obj):
        return {
            'id': obj.user.id,
            'username': obj.user.username,
            'email': obj.user.email,
            'name': f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username,
        }

    def get_booking(self, obj):
        if not obj.booking:
            return None
        b = obj.booking
        lot_name = b.slot.lot.name if b.slot and b.slot.lot else 'N/A'
        return {
            'booking_id': str(b.booking_id),
            'lot_name': lot_name,
            'slot_number': b.slot.slot_number if b.slot else 'N/A',
            'vehicle_number': b.vehicle_number,
            'amount': float(b.amount),
            'status': b.status,
            'status_display': b.get_status_display(),
        }

    def get_attachment_url(self, obj):
        if obj.attachment:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.attachment.url)
            return obj.attachment.url
        return None

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to:
            return 'Unassigned'
        full = f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
        return full or obj.assigned_to.username

    def get_messages(self, obj):
        request = self.context.get('request')
        msgs = obj.messages.all().select_related('sender')
        # Privacy & Security: Strictly filter out internal notes for regular customer!
        if request and not (request.user.is_staff or request.user.is_superuser):
            msgs = msgs.filter(is_internal_note=False)
        return DisputeMessageSerializer(msgs, many=True, context=self.context).data


class PaymentDisputeCreateSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=PaymentDispute.CATEGORY_CHOICES, required=True)
    subject = serializers.CharField(max_length=160, required=True)
    description = serializers.CharField(required=True)
    booking_id = serializers.CharField(required=False, allow_blank=True, default='')
    payment_reference = serializers.CharField(required=False, allow_blank=True, default='')
    disputed_amount = serializers.DecimalField(required=False, max_digits=8, decimal_places=2, allow_null=True)
    attachment = serializers.FileField(required=False, allow_null=True)


class DisputeReplySerializer(serializers.Serializer):
    message = serializers.CharField(required=True)
    attachment = serializers.FileField(required=False, allow_null=True)
    is_internal_note = serializers.BooleanField(required=False, default=False)


class DisputeStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PaymentDispute.STATUS_CHOICES, required=True)
    resolution_summary = serializers.CharField(required=False, allow_blank=True, default='')
    linked_refund_id = serializers.CharField(required=False, allow_blank=True, default='')


class DisputeAssignSerializer(serializers.Serializer):
    staff_user_id = serializers.IntegerField(required=False, allow_null=True)




