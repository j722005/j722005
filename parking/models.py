import os
import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.urls import reverse
from django.utils import timezone


class ParkingLot(models.Model):
    """A physical parking location (e.g. 'City Mall Parking')."""

    name = models.CharField(max_length=120)
    location = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='lots/', blank=True, null=True)
    price_per_hour = models.DecimalField(max_digits=6, decimal_places=2, default=20)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text='Geographic latitude')
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text='Geographic longitude')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse('lot_detail', args=[self.pk])

    @property
    def total_slots(self):
        return self.slots.count()

    @property
    def active_slots_count(self):
        return self.slots.filter(is_active=True).count()

    @property
    def inactive_slots_count(self):
        return self.slots.filter(is_active=False).count()

    @property
    def available_slots_count(self):
        now = timezone.now()
        return sum(1 for slot in self.slots.filter(is_active=True) if slot.is_available(now))

    @property
    def occupied_slots_count(self):
        now = timezone.now()
        return sum(1 for slot in self.slots.filter(is_active=True) if not slot.is_available(now))

    @property
    def future_reserved_slots_count(self):
        now = timezone.now()
        hold_minutes = getattr(settings, 'BOOKING_HOLD_MINUTES', 10)
        valid_hold_threshold = now - timezone.timedelta(minutes=hold_minutes)
        return self.slots.filter(
            is_active=True,
            bookings__start_time__gt=now,
        ).filter(
            models.Q(bookings__status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE]) |
            models.Q(bookings__status=Booking.STATUS_PENDING, bookings__created_at__gt=valid_hold_threshold)
        ).distinct().count()

    @property
    def occupancy_percent(self):
        active = self.active_slots_count
        if active == 0:
            return 0
        return round((self.occupied_slots_count / active) * 100)


class ParkingSlot(models.Model):
    """A single slot inside a lot. Availability is derived from bookings —
    real-time calculation via time intervals, zero hardware sensor requirement."""

    SLOT_TYPE_CHOICES = [
        ('car', 'Car'),
        ('bike', 'Bike / Two-wheeler'),
        ('ev', 'EV Charging'),
    ]

    lot = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, related_name='slots')
    slot_number = models.CharField(max_length=10)
    slot_type = models.CharField(max_length=10, choices=SLOT_TYPE_CHOICES, default='car')
    floor = models.CharField(max_length=10, default='Ground', blank=True, help_text='Floor level (e.g. B1, Ground, Floor 1, Floor 2)')
    is_covered = models.BooleanField(default=True, help_text='Whether the slot is covered / sheltered')
    is_active = models.BooleanField(default=True, help_text='Uncheck to take a slot out of service (maintenance).')

    class Meta:
        ordering = ['slot_number']
        unique_together = ('lot', 'slot_number')

    def __str__(self):
        return f"{self.lot.name} - {self.slot_number}"

    def is_available(self, at_time=None):
        """A slot is available if active and no CONFIRMED/ACTIVE/valid-PENDING booking overlaps at_time."""
        if not self.is_active:
            return False
        at_time = at_time or timezone.now()
        hold_minutes = getattr(settings, 'BOOKING_HOLD_MINUTES', 10)
        valid_hold_threshold = at_time - timezone.timedelta(minutes=hold_minutes)
        return not self.bookings.filter(
            models.Q(status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE]) |
            models.Q(status=Booking.STATUS_PENDING, created_at__gt=valid_hold_threshold),
            start_time__lte=at_time,
            end_time__gt=at_time,
        ).exists()

    def is_occupied(self, at_time=None):
        if not self.is_active:
            return False
        return not self.is_available(at_time)

    def current_booking(self, at_time=None):
        if not self.is_active:
            return None
        at_time = at_time or timezone.now()
        hold_minutes = getattr(settings, 'BOOKING_HOLD_MINUTES', 10)
        valid_hold_threshold = at_time - timezone.timedelta(minutes=hold_minutes)
        return self.bookings.filter(
            models.Q(status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE]) |
            models.Q(status=Booking.STATUS_PENDING, created_at__gt=valid_hold_threshold),
            start_time__lte=at_time,
            end_time__gt=at_time,
        ).first()

    def is_interval_blocked(self, start_time, end_time, exclude_booking_id=None):
        """
        Check if an interval [start_time, end_time] is blocked on this slot.
        Interval overlap rule: existing_start < requested_end AND existing_end > requested_start
        """
        if not self.is_active:
            return True
        now = timezone.now()
        hold_minutes = getattr(settings, 'BOOKING_HOLD_MINUTES', 10)
        valid_hold_threshold = now - timezone.timedelta(minutes=hold_minutes)

        qs = self.bookings.filter(
            start_time__lt=end_time,
            end_time__gt=start_time,
        )
        if exclude_booking_id:
            qs = qs.exclude(booking_id=exclude_booking_id)

        blocking_qs = qs.filter(
            models.Q(status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE]) |
            models.Q(status=Booking.STATUS_PENDING, created_at__gt=valid_hold_threshold)
        )
        return blocking_qs.exists()


class Booking(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_ACTIVE = 'active'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Payment'),
        (STATUS_CONFIRMED, 'Confirmed / Upcoming'),
        (STATUS_ACTIVE, 'Active (parked now)'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    booking_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='bookings')
    slot = models.ForeignKey(ParkingSlot, on_delete=models.CASCADE, related_name='bookings')
    vehicle_number = models.CharField(max_length=20)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING)
    pricing_rule = models.ForeignKey(
        'PricingRule',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='bookings',
        help_text='The pricing rule active at the time this booking was quoted'
    )
    membership = models.ForeignKey(
        'CustomerMembership',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='bookings',
        help_text='Membership benefit applied to this booking'
    )
    monthly_pass = models.ForeignKey(
        'MonthlyPass',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='bookings',
        help_text='Monthly pass used for this booking'
    )
    points_redeemed = models.PositiveIntegerField(default=0, help_text='Loyalty points redeemed')
    points_discount_amount = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('0.00'))
    points_awarded = models.PositiveIntegerField(default=0, help_text='Loyalty points awarded upon payment')
    price_snapshot = models.JSONField(
        default=dict,
        blank=True,
        help_text='Immutable breakdown of dynamic pricing calculated at booking reservation'
    )
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F('start_time')),
                name='booking_end_time_after_start_time',
            )
        ]

    def __str__(self):
        return f"{self.vehicle_number} @ {self.slot} ({self.start_time:%d %b %H:%M})"

    def clean(self):
        super().clean()
        if self.start_time and self.end_time:
            if self.end_time <= self.start_time:
                raise ValidationError('End time must be after start time.')

    @property
    def hold_expires_at(self):
        hold_minutes = getattr(settings, 'BOOKING_HOLD_MINUTES', 10)
        if not self.created_at:
            return timezone.now() + timezone.timedelta(minutes=hold_minutes)
        return self.created_at + timezone.timedelta(minutes=hold_minutes)

    @property
    def is_hold_expired(self):
        if self.status != self.STATUS_PENDING:
            return False
        return timezone.now() > self.hold_expires_at

    @property
    def duration_hours(self):
        seconds = (self.end_time - self.start_time).total_seconds()
        return round(seconds / 3600, 2)

    @property
    def is_upcoming(self):
        return self.status == self.STATUS_CONFIRMED and self.start_time > timezone.now()

    @property
    def is_ongoing(self):
        now = timezone.now()
        return self.status in (self.STATUS_CONFIRMED, self.STATUS_ACTIVE) and self.start_time <= now < self.end_time


class Payment(models.Model):
    METHOD_CHOICES = [
        ('upi', 'UPI'),
        ('card', 'Debit / Credit Card'),
        ('netbanking', 'Net Banking'),
        ('wallet', 'Wallet'),
    ]
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='payment')
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    method = models.CharField(max_length=12, choices=METHOD_CHOICES, default='upi')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='success')
    transaction_id = models.CharField(max_length=40, unique=True)
    paid_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.transaction_id} ({self.status})"


class Vehicle(models.Model):
    """Registered customer vehicles."""
    TYPE_CHOICES = [
        ('car', 'Car / 4-Wheeler'),
        ('bike', 'Bike / Two-Wheeler'),
        ('ev', 'EV Charging Vehicle'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='vehicles')
    license_plate = models.CharField(max_length=20)
    vehicle_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='car')
    nickname = models.CharField(max_length=80, blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_default', '-created_at']
        unique_together = ('user', 'license_plate')

    def __str__(self):
        return f"{self.license_plate} ({self.user.username})"

    def save(self, *args, **kwargs):
        self.license_plate = self.license_plate.strip().upper()
        if self.is_default:
            # Set other vehicles of this user to not default
            Vehicle.objects.filter(user=self.user, is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class Notification(models.Model):
    """User notifications for booking alerts, hold expiries, memberships, passes, etc."""

    CATEGORY_BOOKING = 'booking'
    CATEGORY_PAYMENT = 'payment'
    CATEGORY_HOLD_EXPIRY = 'hold_expiry'
    CATEGORY_GATE_PASS = 'gate_pass'
    CATEGORY_MEMBERSHIP = 'membership'
    CATEGORY_MONTHLY_PASS = 'monthly_pass'
    CATEGORY_LOYALTY = 'loyalty'
    CATEGORY_SUPPORT = 'support_ticket'
    CATEGORY_ANNOUNCEMENT = 'announcement'
    CATEGORY_SYSTEM = 'system'
    CATEGORY_REFUND = 'refund'
    CATEGORY_DISPUTE = 'payment_dispute'

    CATEGORY_CHOICES = [
        (CATEGORY_BOOKING, 'Booking'),
        (CATEGORY_PAYMENT, 'Payment'),
        (CATEGORY_HOLD_EXPIRY, 'Hold Expiry'),
        (CATEGORY_GATE_PASS, 'Gate Pass / QR'),
        (CATEGORY_MEMBERSHIP, 'Membership'),
        (CATEGORY_MONTHLY_PASS, 'Monthly Pass'),
        (CATEGORY_LOYALTY, 'Loyalty Rewards'),
        (CATEGORY_SUPPORT, 'Support Ticket'),
        (CATEGORY_ANNOUNCEMENT, 'Announcement'),
        (CATEGORY_SYSTEM, 'System Alert'),
        (CATEGORY_REFUND, 'Refund'),
        (CATEGORY_DISPUTE, 'Payment Dispute'),
    ]

    TYPE_INFO = 'info'
    TYPE_SUCCESS = 'success'
    TYPE_WARNING = 'warning'
    TYPE_DANGER = 'danger'

    TYPE_CHOICES = [
        (TYPE_INFO, 'Info'),
        (TYPE_SUCCESS, 'Success'),
        (TYPE_WARNING, 'Warning'),
        (TYPE_DANGER, 'Danger'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=160)
    message = models.TextField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default=CATEGORY_SYSTEM, db_index=True)
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_INFO)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    link = models.CharField(max_length=255, blank=True, help_text='In-app navigation URL (e.g. /bookings, /support/TKT-1)')
    dedup_key = models.CharField(max_length=120, null=True, blank=True, db_index=True, help_text='Unique idempotency key to prevent duplicate notifications')
    metadata = models.JSONField(default=dict, blank=True)
    email_sent = models.BooleanField(default=False)
    email_error = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.category}] {self.title} - {self.user.username}"

    def mark_as_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])


class AdminAnnouncement(models.Model):
    """Broadcast announcement sent by administrators to system users."""
    ROLE_ALL = 'all'
    ROLE_CUSTOMER = 'customer'
    ROLE_STAFF = 'staff'
    ROLE_ADMIN = 'admin'

    ROLE_CHOICES = [
        (ROLE_ALL, 'All Users'),
        (ROLE_CUSTOMER, 'Customers Only'),
        (ROLE_STAFF, 'Staff Only'),
        (ROLE_ADMIN, 'Administrators Only'),
    ]

    title = models.CharField(max_length=160)
    message = models.TextField()
    target_role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_ALL)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='announcements_created')
    send_email = models.BooleanField(default=False)
    total_recipients = models.PositiveIntegerField(default=0)
    emails_sent = models.PositiveIntegerField(default=0)
    emails_failed = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_target_role_display()})"



class PricingRule(models.Model):
    """
    Configurable dynamic pricing rule for parking lots.
    Supports base rates, vehicle multipliers, peak/off-peak, weekend surge,
    duration discounts, real historical demand adjustments, and min/max limits.
    """
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    lot = models.ForeignKey(
        ParkingLot,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='pricing_rules',
        help_text='Leave blank to apply as global default rule for all lots without specific rules.'
    )
    is_active = models.BooleanField(default=True)

    # Base pricing
    base_hourly_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Base rate per hour. If blank, lot.price_per_hour is used.'
    )

    # Vehicle type multipliers
    car_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal('1.00'))
    bike_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal('0.60'))
    ev_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal('1.20'))

    # Peak hours configuration
    peak_start_hour_1 = models.IntegerField(default=9, help_text='Morning peak start (0-23)')
    peak_end_hour_1 = models.IntegerField(default=12, help_text='Morning peak end (0-23)')
    peak_start_hour_2 = models.IntegerField(default=17, help_text='Evening peak start (0-23)')
    peak_end_hour_2 = models.IntegerField(default=21, help_text='Evening peak end (0-23)')
    peak_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('1.25'),
        help_text='Multiplier applied during peak hours (e.g. 1.25 = +25%)'
    )
    off_peak_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('1.00'),
        help_text='Multiplier applied during off-peak hours'
    )

    # Weekend rate multiplier
    weekend_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('1.15'),
        help_text='Multiplier applied on Saturdays and Sundays (e.g. 1.15 = +15%)'
    )

    # Duration discounts
    duration_discount_threshold_hours = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('4.00'),
        help_text='Minimum hours to qualify for long duration discount'
    )
    duration_discount_percent = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('10.00'),
        help_text='Discount percentage for long stays (e.g. 10.0 = 10% off)'
    )

    # Demand-based pricing (Real historical analysis)
    enable_demand_pricing = models.BooleanField(
        default=True,
        help_text='Enable demand adjustments derived from actual historical occupancy'
    )
    demand_surge_threshold_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('70.00'),
        help_text='Historical occupancy percentage threshold to trigger surge (e.g. 70%)'
    )
    demand_surge_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('1.20'),
        help_text='Surge multiplier when historical occupancy exceeds surge threshold'
    )
    demand_discount_threshold_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('30.00'),
        help_text='Historical occupancy percentage threshold for low-demand discount'
    )
    demand_discount_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('0.90'),
        help_text='Discount multiplier when historical occupancy is below discount threshold'
    )
    min_historical_bookings_threshold = models.IntegerField(
        default=3,
        help_text='Minimum historical bookings required for demand adjustment; else standard rate is used'
    )

    # Price Limits (Admin bounds)
    min_hourly_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal('10.00'),
        help_text='Absolute minimum hourly rate floor'
    )
    max_hourly_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal('150.00'),
        help_text='Absolute maximum hourly rate ceiling'
    )

    # Taxes
    tax_percent = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal('18.00'),
        help_text='Government tax/GST percentage (e.g. 18.00 for 18% GST)'
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_pricing_rules'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['lot__name', '-is_active', 'name']

    def __str__(self):
        target = self.lot.name if self.lot else 'Global (All Lots)'
        status = 'Active' if self.is_active else 'Disabled'
        return f"{self.name} [{target}] ({status})"


class PricingRuleAuditLog(models.Model):
    """Audit log tracking who changed pricing rules and the exact field diffs."""
    rule = models.ForeignKey(PricingRule, on_delete=models.CASCADE, related_name='audit_logs')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=20)  # created, updated, enabled, disabled
    changes = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        username = self.user.username if self.user else 'System'
        return f"{self.rule.name} - {self.action} by {username} at {self.timestamp:%Y-%m-%d %H:%M}"


def validate_support_attachment(file):
    """
    Validate ticket attachment:
    - Maximum size 5MB
    - Strictly reject executables and dangerous scripts
    - Allow safe image and document extensions (JPG, PNG, WEBP, PDF, GIF)
    """
    max_size_mb = 5
    if file.size > max_size_mb * 1024 * 1024:
        raise ValidationError(f'Attachment size exceeds maximum limit of {max_size_mb}MB.')

    name = getattr(file, 'name', '')
    ext = os.path.splitext(name)[1].lower() if name else ''
    disallowed_extensions = {
        '.exe', '.bat', '.cmd', '.sh', '.php', '.py', '.js', '.vbs',
        '.scr', '.pif', '.msi', '.com', '.reg', '.wsf', '.hta', '.jar'
    }
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.pdf', '.gif'}

    if ext in disallowed_extensions:
        raise ValidationError(f'Executable file type "{ext}" is prohibited.')
    if ext and ext not in allowed_extensions:
        raise ValidationError(f'Unsupported file format "{ext}". Permitted: JPG, PNG, WEBP, PDF, GIF.')


class SupportTicket(models.Model):
    """
    Smart Parking Complaint & Support Ticket Model.
    Tracks user complaints, inquiries, refund requests, and support issues.
    """
    CATEGORY_BOOKING = 'booking_issue'
    CATEGORY_PAYMENT = 'payment_issue'
    CATEGORY_SLOT = 'slot_availability'
    CATEGORY_QR = 'qr_ticket'
    CATEGORY_REFUND = 'refund_request'
    CATEGORY_ACCOUNT = 'account_issue'
    CATEGORY_OTHER = 'other'

    CATEGORY_CHOICES = [
        (CATEGORY_BOOKING, 'Booking Issue'),
        (CATEGORY_PAYMENT, 'Payment Issue'),
        (CATEGORY_SLOT, 'Slot Availability'),
        (CATEGORY_QR, 'QR Ticket'),
        (CATEGORY_REFUND, 'Refund Request'),
        (CATEGORY_ACCOUNT, 'Account Issue'),
        (CATEGORY_OTHER, 'Other'),
    ]

    PRIORITY_LOW = 'low'
    PRIORITY_MEDIUM = 'medium'
    PRIORITY_HIGH = 'high'

    PRIORITY_CHOICES = [
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MEDIUM, 'Medium'),
        (PRIORITY_HIGH, 'High'),
    ]

    STATUS_OPEN = 'open'
    STATUS_ASSIGNED = 'assigned'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_WAITING_USER = 'waiting_user'
    STATUS_RESOLVED = 'resolved'
    STATUS_CLOSED = 'closed'

    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_ASSIGNED, 'Assigned'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_WAITING_USER, 'Waiting for User'),
        (STATUS_RESOLVED, 'Resolved'),
        (STATUS_CLOSED, 'Closed'),
    ]

    ticket_id = models.CharField(max_length=24, unique=True, db_index=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='support_tickets')
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, db_index=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True)
    subject = models.CharField(max_length=160)
    description = models.TextField()
    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, null=True, blank=True, related_name='support_tickets')
    attachment = models.FileField(upload_to='support_attachments/', null=True, blank=True, validators=[validate_support_attachment])
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_support_tickets')
    resolution_notes = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def __str__(self):
        return f"{self.ticket_id} - {self.subject} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.ticket_id:
            today_str = timezone.now().strftime('%Y%m%d')
            rand_code = uuid.uuid4().hex[:6].upper()
            candidate = f"TKT-{today_str}-{rand_code}"
            while SupportTicket.objects.filter(ticket_id=candidate).exists():
                rand_code = uuid.uuid4().hex[:6].upper()
                candidate = f"TKT-{today_str}-{rand_code}"
            self.ticket_id = candidate
        super().save(*args, **kwargs)

    @property
    def is_reopenable(self):
        """Ticket can only be reopened by the user if it is in resolved status."""
        return self.status == self.STATUS_RESOLVED


class TicketMessage(models.Model):
    """
    Conversation message/reply for a support ticket.
    Supports regular messages and internal staff-only notes.
    """
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='ticket_messages')
    message = models.TextField()
    attachment = models.FileField(upload_to='support_attachments/', null=True, blank=True, validators=[validate_support_attachment])
    is_internal_note = models.BooleanField(default=False, help_text='Internal staff note, strictly hidden from regular customer')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        type_lbl = " [Internal Note]" if self.is_internal_note else ""
        return f"Msg #{self.pk} by {self.sender.username} on {self.ticket.ticket_id}{type_lbl}"


class TicketAuditLog(models.Model):
    """
    Audit log tracking lifecycle transitions, status updates, priority adjustments, and assignments.
    """
    ticket = models.ForeignKey(SupportTicket, on_delete=models.CASCADE, related_name='audit_logs')
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=50)  # created, status_updated, assigned, priority_updated, resolved, reopened, closed
    old_value = models.CharField(max_length=120, blank=True)
    new_value = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        username = self.performed_by.username if self.performed_by else 'System'
        return f"{self.ticket.ticket_id}: {self.action} by {username} at {self.created_at:%Y-%m-%d %H:%M}"


class MembershipPlan(models.Model):
    """
    Configurable membership plan (Monthly / Yearly) with discount rules,
    eligible locations, vehicle types, usage limits, and renewal options.
    """
    DURATION_MONTHLY = 'monthly'
    DURATION_YEARLY = 'yearly'
    DURATION_CHOICES = [
        (DURATION_MONTHLY, 'Monthly'),
        (DURATION_YEARLY, 'Yearly'),
    ]

    DISCOUNT_PERCENTAGE = 'percentage'
    DISCOUNT_FIXED = 'fixed'
    DISCOUNT_TYPE_CHOICES = [
        (DISCOUNT_PERCENTAGE, 'Percentage (%)'),
        (DISCOUNT_FIXED, 'Fixed Discount (INR)'),
    ]

    VEHICLE_ALL = 'all'
    VEHICLE_CAR = 'car'
    VEHICLE_BIKE = 'bike'
    VEHICLE_EV = 'ev'
    VEHICLE_CHOICES = [
        (VEHICLE_ALL, 'All Vehicles'),
        (VEHICLE_CAR, 'Car Only'),
        (VEHICLE_BIKE, 'Bike / Two-Wheeler Only'),
        (VEHICLE_EV, 'EV Charging Vehicle Only'),
    ]

    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    duration_type = models.CharField(max_length=10, choices=DURATION_CHOICES, default=DURATION_MONTHLY)
    duration_days = models.PositiveIntegerField(default=30, help_text='Duration in days')
    price = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('0.00'))
    currency = models.CharField(max_length=10, default='INR')
    discount_type = models.CharField(max_length=12, choices=DISCOUNT_TYPE_CHOICES, default=DISCOUNT_PERCENTAGE)
    discount_value = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('10.00'), help_text='Percentage or fixed discount value')
    max_discount_per_booking = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, help_text='Maximum discount per booking in currency')
    min_booking_amount = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'), help_text='Minimum booking amount required to apply discount')
    eligible_lots = models.ManyToManyField(ParkingLot, blank=True, related_name='membership_plans', help_text='Leave empty to make eligible for all lots')
    eligible_vehicle_types = models.CharField(max_length=10, choices=VEHICLE_CHOICES, default=VEHICLE_ALL)
    max_discounted_bookings = models.PositiveIntegerField(default=0, help_text='Max bookings that can use this discount in the duration. 0 for unlimited.')
    perks_description = models.TextField(blank=True, help_text='Description of member perks')
    is_active = models.BooleanField(default=True)
    allow_auto_renewal = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['price', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_duration_type_display()} - ₹{self.price})"

    def clean(self):
        super().clean()
        if self.price is not None and self.price < 0:
            raise ValidationError({'price': 'Price cannot be negative.'})
        if self.discount_value is not None and self.discount_value < 0:
            raise ValidationError({'discount_value': 'Discount value cannot be negative.'})
        if self.discount_type == self.DISCOUNT_PERCENTAGE and self.discount_value is not None and self.discount_value > 100:
            raise ValidationError({'discount_value': 'Percentage discount cannot exceed 100%.'})
        if self.duration_days is not None and self.duration_days <= 0:
            raise ValidationError({'duration_days': 'Duration days must be greater than zero.'})


class CustomerMembership(models.Model):
    """
    Subscribed membership for a customer.
    Activated only upon confirmed payment.
    """
    STATUS_PENDING = 'pending_payment'
    STATUS_ACTIVE = 'active'
    STATUS_EXPIRED = 'expired'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Payment'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='memberships')
    plan = models.ForeignKey(MembershipPlan, on_delete=models.PROTECT, related_name='subscriptions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    auto_renew = models.BooleanField(default=False)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    usage_count = models.PositiveIntegerField(default=0)
    payment_method = models.CharField(max_length=20, default='upi')
    amount_paid = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('0.00'))
    transaction_id = models.CharField(max_length=50, blank=True)
    is_simulated_payment = models.BooleanField(default=True, help_text='Simulated payment gateway transaction')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.plan.name} ({self.status})"

    def is_currently_valid(self):
        now = timezone.now()
        if self.status != self.STATUS_ACTIVE:
            return False
        if not self.start_date or not self.end_date:
            return False
        if not (self.start_date <= now <= self.end_date):
            return False
        if self.plan.max_discounted_bookings > 0 and self.usage_count >= self.plan.max_discounted_bookings:
            return False
        return True

    @property
    def remaining_usage(self):
        if self.plan.max_discounted_bookings == 0:
            return None
        return max(0, self.plan.max_discounted_bookings - self.usage_count)

    @property
    def is_renewable(self):
        return self.status in (self.STATUS_ACTIVE, self.STATUS_EXPIRED)


class MonthlyPass(models.Model):
    """
    Monthly parking pass linking a customer to an eligible vehicle and parking facilities.
    Validates interval coverage, remaining usage, and prevents duplicate reservations.
    """
    STATUS_PENDING = 'pending_payment'
    STATUS_ACTIVE = 'active'
    STATUS_EXPIRED = 'expired'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Payment'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    PASS_TYPE_FULL = 'full_coverage'
    PASS_TYPE_DISCOUNT = 'discounted'
    PASS_TYPE_CHOICES = [
        (PASS_TYPE_FULL, '100% Free Parking'),
        (PASS_TYPE_DISCOUNT, 'Discounted Parking'),
    ]

    pass_code = models.CharField(max_length=30, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='monthly_passes')
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='monthly_passes')
    vehicle_license_plate = models.CharField(max_length=20)
    lot = models.ForeignKey(ParkingLot, on_delete=models.CASCADE, null=True, blank=True, related_name='monthly_passes', help_text='Leave empty to cover all parking locations')
    pass_name = models.CharField(max_length=120, default='Monthly Parking Pass')
    pass_type = models.CharField(max_length=20, choices=PASS_TYPE_CHOICES, default=PASS_TYPE_FULL)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('100.00'))
    price = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('999.00'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    max_bookings = models.PositiveIntegerField(default=0, help_text='Max bookings allowed. 0 = unlimited')
    usage_count = models.PositiveIntegerField(default=0)
    payment_method = models.CharField(max_length=20, default='upi')
    amount_paid = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('0.00'))
    transaction_id = models.CharField(max_length=50, blank=True)
    is_simulated_payment = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        lot_str = self.lot.name if self.lot else 'All Locations'
        return f"{self.pass_code} - {self.vehicle_license_plate} [{lot_str}] ({self.status})"

    def save(self, *args, **kwargs):
        if not self.pass_code:
            today_str = timezone.now().strftime('%Y%m')
            rand_code = uuid.uuid4().hex[:6].upper()
            candidate = f"PASS-{today_str}-{rand_code}"
            while MonthlyPass.objects.filter(pass_code=candidate).exists():
                rand_code = uuid.uuid4().hex[:6].upper()
                candidate = f"PASS-{today_str}-{rand_code}"
            self.pass_code = candidate
        if self.vehicle and not self.vehicle_license_plate:
            self.vehicle_license_plate = self.vehicle.license_plate
        super().save(*args, **kwargs)

    def is_valid_for_booking(self, lot, vehicle_number, start_time, end_time):
        """
        Validates pass eligibility for a requested booking.
        """
        now = timezone.now()
        if self.status != self.STATUS_ACTIVE:
            return False, 'Pass is not active.'
        if self.end_date < now:
            return False, 'Pass has expired.'
        if start_time < self.start_date or end_time > self.end_date:
            return False, 'Booking interval falls outside the pass validity window.'
        if self.lot and self.lot != lot:
            return False, f'Pass is valid only for {self.lot.name}.'
        if self.vehicle_license_plate.upper().strip() != vehicle_number.upper().strip():
            return False, f'Pass is linked to vehicle {self.vehicle_license_plate}, not {vehicle_number}.'
        if self.max_bookings > 0 and self.usage_count >= self.max_bookings:
            return False, 'Pass maximum booking usage limit has been reached.'
        return True, 'Pass is valid.'


class LoyaltyProgramConfig(models.Model):
    """Configurable global loyalty rules."""
    is_enabled = models.BooleanField(default=True)
    points_per_currency_unit = models.DecimalField(
        max_digits=6,
        decimal_places=4,
        default=Decimal('0.1000'),
        help_text='Points earned per 1 INR spent (e.g. 0.1000 = 1 point per 10 INR)'
    )
    min_spending_to_earn = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal('20.00'),
        help_text='Minimum booking or pass payment required to earn points'
    )
    points_redemption_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal('0.50'),
        help_text='Value of 1 point in INR (e.g. 0.50 = 100 points give 50 INR discount)'
    )
    min_points_to_redeem = models.PositiveIntegerField(
        default=50,
        help_text='Minimum points required to redeem'
    )
    max_redemption_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('50.00'),
        help_text='Maximum percentage of booking total that can be discounted using points'
    )
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        status = 'Enabled' if self.is_enabled else 'Disabled'
        return f"Loyalty Program ({status})"

    @classmethod
    def get_config(cls):
        cfg = cls.objects.first()
        if not cfg:
            cfg = cls.objects.create()
        return cfg


class LoyaltyAccount(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='loyalty_account')
    points_balance = models.PositiveIntegerField(default=0)
    lifetime_earned = models.PositiveIntegerField(default=0)
    lifetime_redeemed = models.PositiveIntegerField(default=0)
    tier = models.CharField(max_length=20, default='Bronze')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(points_balance__gte=0),
                name='loyalty_points_non_negative',
            )
        ]

    def __str__(self):
        return f"{self.user.username} - {self.points_balance} pts ({self.tier})"

    def recalculate_tier(self):
        """Update tier based on lifetime earned points."""
        earned = self.lifetime_earned
        if earned >= 5000:
            self.tier = 'Platinum'
        elif earned >= 1500:
            self.tier = 'Gold'
        elif earned >= 500:
            self.tier = 'Silver'
        else:
            self.tier = 'Bronze'


class LoyaltyTransaction(models.Model):
    TYPE_EARNED = 'earned'
    TYPE_REDEEMED = 'redeemed'
    TYPE_REVERSED = 'reversed'
    TYPE_REFUNDED = 'refunded'
    TYPE_ADJUSTED = 'adjusted_admin'
    TYPE_BONUS = 'bonus'

    TYPE_CHOICES = [
        (TYPE_EARNED, 'Points Earned'),
        (TYPE_REDEEMED, 'Points Redeemed'),
        (TYPE_REVERSED, 'Points Reversed (Booking Cancelled)'),
        (TYPE_REFUNDED, 'Points Refunded (Booking Cancelled)'),
        (TYPE_ADJUSTED, 'Admin Adjustment'),
        (TYPE_BONUS, 'Promotional Bonus'),
    ]

    account = models.ForeignKey(LoyaltyAccount, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=25, choices=TYPE_CHOICES)
    points = models.IntegerField(help_text='Points delta: positive for credit, negative for debit')
    balance_after = models.PositiveIntegerField()
    booking = models.ForeignKey('Booking', null=True, blank=True, on_delete=models.SET_NULL, related_name='loyalty_transactions')
    reference_id = models.CharField(max_length=64, unique=True, help_text='Unique idempotency key')
    description = models.CharField(max_length=255)
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.account.user.username}: {self.points:+d} pts ({self.transaction_type}) [{self.reference_id}]"


# ==============================================================================
# FEATURE 8: ADVANCED REFUND & DISPUTE MANAGEMENT MODELS
# ==============================================================================

class RefundRequest(models.Model):
    """
    Customer refund request linked to a specific booking and payment.
    Enforces status workflows, idempotency, role-based state transitions,
    and refund amount ceiling validation.
    """
    REASON_BOOKING_CANCELLED = 'booking_cancelled'
    REASON_DUPLICATE_PAYMENT = 'duplicate_payment'
    REASON_INCORRECT_AMOUNT = 'incorrect_amount'
    REASON_SERVICE_UNAVAILABLE = 'service_unavailable'
    REASON_TECHNICAL_ISSUE = 'technical_issue'
    REASON_OTHER = 'other'

    REASON_CHOICES = [
        (REASON_BOOKING_CANCELLED, 'Booking Cancelled'),
        (REASON_DUPLICATE_PAYMENT, 'Duplicate Payment'),
        (REASON_INCORRECT_AMOUNT, 'Incorrect Payment Amount'),
        (REASON_SERVICE_UNAVAILABLE, 'Parking Service Unavailable'),
        (REASON_TECHNICAL_ISSUE, 'Technical Issue'),
        (REASON_OTHER, 'Other'),
    ]

    STATUS_REQUESTED = 'requested'
    STATUS_UNDER_REVIEW = 'under_review'
    STATUS_INFO_REQUIRED = 'info_required'
    STATUS_APPROVED = 'approved'
    STATUS_PROCESSING = 'processing'
    STATUS_COMPLETED = 'completed'
    STATUS_REJECTED = 'rejected'
    STATUS_FAILED = 'failed'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_REQUESTED, 'Requested'),
        (STATUS_UNDER_REVIEW, 'Under Review'),
        (STATUS_INFO_REQUIRED, 'Additional Information Required'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_PROCESSING, 'Processing'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    VALID_TRANSITIONS = {
        STATUS_REQUESTED: [STATUS_UNDER_REVIEW, STATUS_INFO_REQUIRED, STATUS_APPROVED, STATUS_REJECTED, STATUS_CANCELLED],
        STATUS_UNDER_REVIEW: [STATUS_INFO_REQUIRED, STATUS_APPROVED, STATUS_REJECTED],
        STATUS_INFO_REQUIRED: [STATUS_UNDER_REVIEW, STATUS_REJECTED, STATUS_CANCELLED],
        STATUS_APPROVED: [STATUS_PROCESSING, STATUS_REJECTED],
        STATUS_PROCESSING: [STATUS_COMPLETED, STATUS_FAILED],
        STATUS_FAILED: [STATUS_PROCESSING, STATUS_REJECTED],
        STATUS_COMPLETED: [],
        STATUS_REJECTED: [],
        STATUS_CANCELLED: [],
    }

    refund_id = models.CharField(max_length=24, unique=True, db_index=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='refund_requests')
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='refund_requests')
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='refund_requests')
    amount = models.DecimalField(max_digits=8, decimal_places=2, help_text='Requested refund amount in INR')
    approved_amount = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, help_text='Actual approved refund amount')
    reason = models.CharField(max_length=32, choices=REASON_CHOICES, db_index=True)
    explanation = models.TextField(blank=True)
    attachment = models.FileField(upload_to='refund_attachments/', null=True, blank=True, validators=[validate_support_attachment])
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_REQUESTED, db_index=True)
    rejection_reason = models.TextField(blank=True, help_text='Mandatory reason when rejected')
    admin_notes = models.TextField(blank=True, help_text='Internal notes for staff/admin')
    customer_notes = models.TextField(blank=True, help_text='Additional explanation provided by customer')
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_refunds')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.refund_id} - ₹{self.amount} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.refund_id:
            today_str = timezone.now().strftime('%Y%m%d')
            rand_code = uuid.uuid4().hex[:6].upper()
            candidate = f"REF-{today_str}-{rand_code}"
            while RefundRequest.objects.filter(refund_id=candidate).exists():
                rand_code = uuid.uuid4().hex[:6].upper()
                candidate = f"REF-{today_str}-{rand_code}"
            self.refund_id = candidate
        super().save(*args, **kwargs)

    @property
    def is_terminal(self):
        return self.status in (self.STATUS_COMPLETED, self.STATUS_REJECTED, self.STATUS_CANCELLED)

    def can_transition_to(self, new_status, is_staff=False):
        """Validate whether the status transition is allowable given user role."""
        if self.status == new_status:
            return True
        allowed = self.VALID_TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            return False
        # Customers can only cancel or respond to info_required
        if not is_staff:
            if new_status == self.STATUS_CANCELLED:
                return self.status in (self.STATUS_REQUESTED, self.STATUS_INFO_REQUIRED)
            if new_status == self.STATUS_UNDER_REVIEW:
                return self.status == self.STATUS_INFO_REQUIRED
            return False
        return True


class RefundTransaction(models.Model):
    """
    Financial record of executed refund.
    Explicitly tracks simulation flag vs real gateway provider to prevent
    misrepresenting test refunds as real settlements.
    """
    STATUS_PENDING = 'pending'
    STATUS_COMPLETED = 'completed'
    STATUS_FAILED = 'failed'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_FAILED, 'Failed'),
    ]

    refund_request = models.OneToOneField(RefundRequest, on_delete=models.CASCADE, related_name='transaction')
    transaction_reference = models.CharField(max_length=64, unique=True, db_index=True)
    original_payment_reference = models.CharField(max_length=64, db_index=True)
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    payment_channel = models.CharField(max_length=24, default='upi')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_COMPLETED)
    is_simulation = models.BooleanField(default=True, help_text='True if processed in simulated / sandbox mode')
    gateway_provider = models.CharField(max_length=80, default='Simulated Payment Provider (Test Mode)')
    gateway_response = models.JSONField(default=dict, blank=True)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-processed_at']

    def __str__(self):
        mode_str = " (Simulated)" if self.is_simulation else " (Live)"
        return f"{self.transaction_reference} - ₹{self.amount}{mode_str}"


class RefundAuditLog(models.Model):
    """
    Immutable audit trail for all refund events, status transitions, and administrative reviews.
    """
    refund_request = models.ForeignKey(RefundRequest, on_delete=models.CASCADE, related_name='audit_logs')
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=60)
    old_status = models.CharField(max_length=30, blank=True)
    new_status = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        user_name = self.performed_by.username if self.performed_by else 'System'
        return f"{self.refund_request.refund_id} - {self.action} by {user_name} at {self.created_at:%d %b %H:%M}"


class PaymentDispute(models.Model):
    """
    Payment Dispute Model for handling customer payment discrepancies,
    double charges, refund delays, and failed payment chargebacks.
    """
    CAT_PAYMENT_DEDUCTED = 'payment_deducted_no_booking'
    CAT_DUPLICATE_PAYMENT = 'duplicate_payment'
    CAT_INCORRECT_AMOUNT = 'incorrect_amount'
    CAT_REFUND_NOT_RECEIVED = 'refund_not_received'
    CAT_PAYMENT_FAILED = 'payment_marked_failed'
    CAT_OTHER = 'other'

    CATEGORY_CHOICES = [
        (CAT_PAYMENT_DEDUCTED, 'Payment Deducted But Booking Not Confirmed'),
        (CAT_DUPLICATE_PAYMENT, 'Duplicate Payment'),
        (CAT_INCORRECT_AMOUNT, 'Incorrect Amount Deducted'),
        (CAT_REFUND_NOT_RECEIVED, 'Refund Not Received'),
        (CAT_PAYMENT_FAILED, 'Payment Marked Failed in App'),
        (CAT_OTHER, 'Other'),
    ]

    STATUS_OPENED = 'opened'
    STATUS_UNDER_INVESTIGATION = 'under_investigation'
    STATUS_INFO_REQUESTED = 'info_requested'
    STATUS_RESOLVED = 'resolved'
    STATUS_REJECTED = 'rejected'
    STATUS_CLOSED = 'closed'

    STATUS_CHOICES = [
        (STATUS_OPENED, 'Opened'),
        (STATUS_UNDER_INVESTIGATION, 'Under Investigation'),
        (STATUS_INFO_REQUESTED, 'Information Requested'),
        (STATUS_RESOLVED, 'Resolved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CLOSED, 'Closed'),
    ]

    dispute_id = models.CharField(max_length=24, unique=True, db_index=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='payment_disputes')
    booking = models.ForeignKey(Booking, null=True, blank=True, on_delete=models.SET_NULL, related_name='payment_disputes')
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.SET_NULL, related_name='payment_disputes')
    refund_request = models.ForeignKey(RefundRequest, null=True, blank=True, on_delete=models.SET_NULL, related_name='linked_disputes')
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES, db_index=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_OPENED, db_index=True)
    subject = models.CharField(max_length=160)
    description = models.TextField()
    disputed_amount = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    payment_reference = models.CharField(max_length=64, blank=True, help_text='Bank / UPI reference or Transaction ID')
    attachment = models.FileField(upload_to='dispute_attachments/', null=True, blank=True, validators=[validate_support_attachment])
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='assigned_disputes')
    resolution_summary = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def __str__(self):
        return f"{self.dispute_id} - {self.subject} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.dispute_id:
            today_str = timezone.now().strftime('%Y%m%d')
            rand_code = uuid.uuid4().hex[:6].upper()
            candidate = f"DSP-{today_str}-{rand_code}"
            while PaymentDispute.objects.filter(dispute_id=candidate).exists():
                rand_code = uuid.uuid4().hex[:6].upper()
                candidate = f"DSP-{today_str}-{rand_code}"
            self.dispute_id = candidate
        super().save(*args, **kwargs)


class DisputeMessage(models.Model):
    """
    Message / reply in dispute conversation thread.
    Internal notes are strictly protected from customer visibility.
    """
    dispute = models.ForeignKey(PaymentDispute, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='dispute_messages')
    message = models.TextField()
    attachment = models.FileField(upload_to='dispute_attachments/', null=True, blank=True, validators=[validate_support_attachment])
    is_internal_note = models.BooleanField(default=False, help_text='Internal staff note, strictly hidden from regular customer')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        type_lbl = " [Internal Note]" if self.is_internal_note else ""
        return f"DisputeMsg #{self.pk} by {self.sender.username} on {self.dispute.dispute_id}{type_lbl}"


class DisputeAuditLog(models.Model):
    """
    Audit log tracking lifecycle transitions, status updates, assignments, and resolution.
    """
    dispute = models.ForeignKey(PaymentDispute, on_delete=models.CASCADE, related_name='audit_logs')
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=60)
    old_status = models.CharField(max_length=30, blank=True)
    new_status = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        user_name = self.performed_by.username if self.performed_by else 'System'
        return f"{self.dispute.dispute_id} - {self.action} by {user_name} at {self.created_at:%d %b %H:%M}"



