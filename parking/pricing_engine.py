import math
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from .models import ParkingLot, ParkingSlot, Booking, PricingRule


def get_active_pricing_rule_for_lot(lot):
    """
    Finds the most specific active PricingRule for a given ParkingLot.
    1. Per-lot active rule
    2. Global active rule (lot=None)
    3. If neither exists, creates or returns a default fallback rule object (in-memory or DB).
    """
    if lot:
        rule = PricingRule.objects.filter(lot=lot, is_active=True).first()
        if rule:
            return rule

    global_rule = PricingRule.objects.filter(lot__isnull=True, is_active=True).first()
    if global_rule:
        return global_rule

    # Return a transient default PricingRule instance if no DB rule configured yet
    return PricingRule(
        name="Default System Dynamic Pricing",
        lot=None,
        is_active=True,
        base_hourly_rate=getattr(lot, 'price_per_hour', Decimal('20.00')),
        car_multiplier=Decimal('1.00'),
        bike_multiplier=Decimal('0.60'),
        ev_multiplier=Decimal('1.20'),
        peak_start_hour_1=9,
        peak_end_hour_1=12,
        peak_start_hour_2=17,
        peak_end_hour_2=21,
        peak_multiplier=Decimal('1.25'),
        off_peak_multiplier=Decimal('1.00'),
        weekend_multiplier=Decimal('1.15'),
        duration_discount_threshold_hours=Decimal('4.00'),
        duration_discount_percent=Decimal('10.00'),
        enable_demand_pricing=True,
        demand_surge_threshold_percent=Decimal('70.00'),
        demand_surge_multiplier=Decimal('1.20'),
        demand_discount_threshold_percent=Decimal('30.00'),
        demand_discount_multiplier=Decimal('0.90'),
        min_historical_bookings_threshold=3,
        min_hourly_rate=Decimal('10.00'),
        max_hourly_rate=Decimal('150.00'),
        tax_percent=Decimal('18.00'),
    )


def calculate_historical_demand(lot, start_time, end_time, rule):
    """
    Calculates demand using ACTUAL historical booking and reservation data.
    Strictly avoids hardcoded fake data.
    If historical data is insufficient (< min_historical_bookings_threshold),
    returns status='insufficient_data' with demand_multiplier=1.0 and clear rationale.
    """
    if not rule.enable_demand_pricing:
        return {
            'status': 'disabled',
            'multiplier': Decimal('1.00'),
            'adjustment_factor': Decimal('0.00'),
            'applied': False,
            'historical_count': 0,
            'avg_occupancy_percent': 0.0,
            'explanation': 'Demand-based pricing is disabled by administrator policy.',
        }

    active_slots_count = lot.active_slots_count if lot else 1
    if active_slots_count <= 0:
        active_slots_count = 1

    # Analysis window: Same day of week in past 60 days
    now = timezone.now()
    target_weekday = start_time.weekday()  # Monday=0 ... Sunday=6
    past_cutoff = now - timedelta(days=60)

    # Fetch completed, confirmed, or active historical bookings on this lot
    historical_qs = Booking.objects.filter(
        slot__lot=lot,
        created_at__gte=past_cutoff,
        created_at__lte=now,
        status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE, Booking.STATUS_COMPLETED]
    )

    # Filter bookings matching the target weekday and overlapping time window
    matching_bookings = [
        b for b in historical_qs
        if b.start_time.weekday() == target_weekday and
        b.start_time.hour <= end_time.hour and b.end_time.hour >= start_time.hour
    ]
    historical_count = len(matching_bookings)

    min_threshold = rule.min_historical_bookings_threshold
    if historical_count < min_threshold:
        return {
            'status': 'insufficient_data',
            'multiplier': Decimal('1.00'),
            'adjustment_factor': Decimal('0.00'),
            'applied': False,
            'historical_count': historical_count,
            'avg_occupancy_percent': 0.0,
            'explanation': f"Insufficient historical booking data ({historical_count} records found, minimum {min_threshold} required). Standard base pricing applied.",
        }

    # Calculate average occupancy across sampled historical days
    # Unique historical dates in matching set
    unique_dates = len(set(b.start_time.date() for b in matching_bookings))
    if unique_dates == 0:
        unique_dates = 1

    avg_concurrent_occupancy = historical_count / unique_dates
    occupancy_percent = min(100.0, round((avg_concurrent_occupancy / active_slots_count) * 100.0, 1))

    surge_threshold = float(rule.demand_surge_threshold_percent)
    discount_threshold = float(rule.demand_discount_threshold_percent)

    if occupancy_percent >= surge_threshold:
        multiplier = rule.demand_surge_multiplier
        adj_factor = multiplier - Decimal('1.00')
        percent_label = round(float(adj_factor) * 100)
        return {
            'status': 'surge',
            'multiplier': multiplier,
            'adjustment_factor': adj_factor,
            'applied': True,
            'historical_count': historical_count,
            'avg_occupancy_percent': occupancy_percent,
            'explanation': f"High historical demand ({occupancy_percent}% avg occupancy). Applied +{percent_label}% surge adjustment.",
        }
    elif occupancy_percent <= discount_threshold:
        multiplier = rule.demand_discount_multiplier
        adj_factor = multiplier - Decimal('1.00')
        percent_label = round(float(abs(adj_factor)) * 100)
        return {
            'status': 'discount',
            'multiplier': multiplier,
            'adjustment_factor': adj_factor,
            'applied': True,
            'historical_count': historical_count,
            'avg_occupancy_percent': occupancy_percent,
            'explanation': f"Low historical demand ({occupancy_percent}% avg occupancy). Applied -{percent_label}% off-peak incentive discount.",
        }
    else:
        return {
            'status': 'normal',
            'multiplier': Decimal('1.00'),
            'adjustment_factor': Decimal('0.00'),
            'applied': False,
            'historical_count': historical_count,
            'avg_occupancy_percent': occupancy_percent,
            'explanation': f"Moderate historical demand ({occupancy_percent}% avg occupancy). Standard rates applied.",
        }


def calculate_dynamic_price(
    lot,
    start_time,
    end_time,
    vehicle_type='car',
    rule=None,
    enforce_future=True,
):
    """
    Core Dynamic Pricing Engine.
    Computes precise price breakdown with:
    1. Base rate per location
    2. Vehicle type multiplier (car, bike, ev)
    3. Peak-hour and off-peak hour slicing
    4. Weekday vs Weekend pricing
    5. Booking duration and long-stay discounts
    6. Real historical demand adjustments
    7. Admin-configurable min and max bounds
    8. Tax / GST computation
    """
    # Timezone-aware date/time handling
    current_tz = timezone.get_current_timezone()
    if timezone.is_naive(start_time):
        start_time = timezone.make_aware(start_time, current_tz)
    else:
        start_time = start_time.astimezone(current_tz)

    if timezone.is_naive(end_time):
        end_time = timezone.make_aware(end_time, current_tz)
    else:
        end_time = end_time.astimezone(current_tz)

    now = timezone.now()

    # Time validation: Reject past dates/times unless bypassed for simulation/preview
    if enforce_future:
        # 5 minutes grace period for clock skew between client and server
        min_start = now - timedelta(minutes=5)
        if start_time < min_start:
            raise ValidationError({'start_time': 'Start time must be in the future.'})

    if end_time <= start_time:
        raise ValidationError({'end_time': 'End time must be strictly after start time.'})

    duration_seconds = (end_time - start_time).total_seconds()
    duration_hours = Decimal(str(duration_seconds / 3600.0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    min_hours = Decimal(str(getattr(settings, 'PARKING_MIN_BOOKING_HOURS', 0.5)))
    max_hours = Decimal(str(getattr(settings, 'PARKING_MAX_BOOKING_HOURS', 24.0)))

    if duration_hours < min_hours:
        raise ValidationError({'duration': f'Booking duration must be at least {min_hours} hour(s).'})
    if duration_hours > max_hours:
        raise ValidationError({'duration': f'Booking duration cannot exceed {max_hours} hour(s).'})

    # Validate and normalize vehicle type
    vehicle_type = (vehicle_type or 'car').lower().strip()
    if vehicle_type not in ('car', 'bike', 'ev'):
        vehicle_type = 'car'

    # Retrieve applicable rule
    if not rule:
        rule = get_active_pricing_rule_for_lot(lot)

    base_rate = rule.base_hourly_rate if rule.base_hourly_rate is not None else lot.price_per_hour
    base_rate = Decimal(str(base_rate))

    # Vehicle multiplier
    if vehicle_type == 'bike':
        vehicle_mult = Decimal(str(rule.bike_multiplier))
    elif vehicle_type == 'ev':
        vehicle_mult = Decimal(str(rule.ev_multiplier))
    else:
        vehicle_mult = Decimal(str(rule.car_multiplier))

    # Segmented time slicing: Slice the interval into 15-minute segments for exact calculation
    step_minutes = 15
    step_hours = Decimal(str(step_minutes / 60.0))
    current_slice = start_time
    total_time_rate_sum = Decimal('0.00')

    peak_minutes = 0
    off_peak_minutes = 0
    weekend_minutes = 0
    weekday_minutes = 0

    p_start_1 = rule.peak_start_hour_1
    p_end_1 = rule.peak_end_hour_1
    p_start_2 = rule.peak_start_hour_2
    p_end_2 = rule.peak_end_hour_2

    peak_mult = Decimal(str(rule.peak_multiplier))
    off_peak_mult = Decimal(str(rule.off_peak_multiplier))
    weekend_mult = Decimal(str(rule.weekend_multiplier))

    while current_slice < end_time:
        next_slice = min(current_slice + timedelta(minutes=step_minutes), end_time)
        slice_seconds = (next_slice - current_slice).total_seconds()
        fraction_of_hour = Decimal(str(slice_seconds / 3600.0))

        # Check peak hours
        hour = current_slice.hour
        is_peak = (p_start_1 <= hour < p_end_1) or (p_start_2 <= hour < p_end_2)
        if is_peak:
            peak_minutes += int(slice_seconds / 60)
            t_multiplier = peak_mult
        else:
            off_peak_minutes += int(slice_seconds / 60)
            t_multiplier = off_peak_mult

        # Check weekend (Saturday=5, Sunday=6)
        is_weekend_slice = current_slice.weekday() in (5, 6)
        if is_weekend_slice:
            weekend_minutes += int(slice_seconds / 60)
            day_multiplier = weekend_mult
        else:
            weekday_minutes += int(slice_seconds / 60)
            day_multiplier = Decimal('1.00')

        # Slice subtotal
        slice_rate = base_rate * vehicle_mult * t_multiplier * day_multiplier * fraction_of_hour
        total_time_rate_sum += slice_rate

        current_slice = next_slice

    peak_hours = round(peak_minutes / 60.0, 2)
    off_peak_hours = round(off_peak_minutes / 60.0, 2)
    is_primarily_weekend = weekend_minutes > weekday_minutes

    time_adjusted_subtotal = total_time_rate_sum.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    base_subtotal = (base_rate * duration_hours).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    # Demand adjustment
    demand_info = calculate_historical_demand(lot, start_time, end_time, rule)
    demand_multiplier = demand_info['multiplier']

    demand_adjusted_subtotal = (time_adjusted_subtotal * demand_multiplier).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    demand_adjustment_amount = (demand_adjusted_subtotal - time_adjusted_subtotal).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    # Duration discount
    duration_threshold = Decimal(str(rule.duration_discount_threshold_hours))
    duration_discount_pct = Decimal(str(rule.duration_discount_percent))
    duration_discount_applied = False
    duration_discount_amount = Decimal('0.00')

    if duration_hours >= duration_threshold and duration_discount_pct > Decimal('0.00'):
        duration_discount_applied = True
        duration_discount_amount = (demand_adjusted_subtotal * (duration_discount_pct / Decimal('100.00'))).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    subtotal_after_discount = demand_adjusted_subtotal - duration_discount_amount

    # Price Limit Enforcements (min & max rate bounds)
    min_hourly = Decimal(str(rule.min_hourly_rate))
    max_hourly = Decimal(str(rule.max_hourly_rate))
    min_total = (min_hourly * duration_hours).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    max_total = (max_hourly * duration_hours).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    price_cap_applied = None
    taxable_amount = subtotal_after_discount

    if taxable_amount < min_total:
        price_cap_applied = 'minimum_floor'
        taxable_amount = min_total
    elif taxable_amount > max_total:
        price_cap_applied = 'maximum_ceiling'
        taxable_amount = max_total

    # Taxes (GST)
    tax_percent = Decimal(str(rule.tax_percent))
    tax_amount = (taxable_amount * (tax_percent / Decimal('100.00'))).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    final_total = (taxable_amount + tax_amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    # Transparent, fully itemized breakdown dictionary
    breakdown = {
        'lot_id': lot.id if lot else None,
        'lot_name': lot.name if lot else 'Selected Location',
        'vehicle_type': vehicle_type,
        'vehicle_multiplier': float(vehicle_mult),
        'start_time': start_time.isoformat(),
        'end_time': end_time.isoformat(),
        'duration_hours': float(duration_hours),
        'base_hourly_rate': float(base_rate),
        'base_subtotal': float(base_subtotal),
        'time_breakdown': {
            'peak_hours': peak_hours,
            'off_peak_hours': off_peak_hours,
            'peak_multiplier': float(peak_mult),
            'off_peak_multiplier': float(off_peak_mult),
            'is_weekend': is_primarily_weekend,
            'weekend_multiplier': float(weekend_mult),
            'time_adjusted_subtotal': float(time_adjusted_subtotal),
        },
        'demand_breakdown': {
            'status': demand_info['status'],
            'multiplier': float(demand_multiplier),
            'applied': demand_info['applied'],
            'adjustment_amount': float(demand_adjustment_amount),
            'historical_records_analyzed': demand_info['historical_count'],
            'avg_occupancy_percent': demand_info['avg_occupancy_percent'],
            'explanation': demand_info['explanation'],
        },
        'duration_discount': {
            'applied': duration_discount_applied,
            'threshold_hours': float(duration_threshold),
            'discount_percent': float(duration_discount_pct),
            'discount_amount': float(duration_discount_amount),
        },
        'price_limits': {
            'min_hourly_rate': float(min_hourly),
            'max_hourly_rate': float(max_hourly),
            'min_total_limit': float(min_total),
            'max_total_limit': float(max_total),
            'cap_applied': price_cap_applied,
        },
        'tax': {
            'tax_percent': float(tax_percent),
            'tax_amount': float(tax_amount),
        },
        'subtotal_before_tax': float(taxable_amount),
        'total_amount': float(final_total),
        'rule_id': rule.id if getattr(rule, 'id', None) else None,
        'rule_name': rule.name,
    }

    return final_total, breakdown
