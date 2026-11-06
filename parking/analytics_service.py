import csv
import io
from decimal import Decimal
from datetime import datetime, timedelta, date
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Sum, Count, Avg, F, Q
from django.utils import timezone

from .models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle,
    CustomerMembership, MonthlyPass, LoyaltyAccount, LoyaltyTransaction
)

User = get_user_model()


def parse_date_range_filters(range_param='last_30_days', start_date_str=None, end_date_str=None):
    """
    Parses date range presets and custom dates with timezone awareness.
    Returns: (start_dt, end_dt, prev_start_dt, prev_end_dt, range_label)
    """
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)

    range_param = (range_param or 'last_30_days').lower()

    if range_param == 'today':
        start_dt = today_start
        end_dt = today_end
        prev_start_dt = start_dt - timedelta(days=1)
        prev_end_dt = today_end - timedelta(days=1)
        range_label = 'Today'

    elif range_param == 'yesterday':
        start_dt = today_start - timedelta(days=1)
        end_dt = today_end - timedelta(days=1)
        prev_start_dt = start_dt - timedelta(days=1)
        prev_end_dt = end_dt - timedelta(days=1)
        range_label = 'Yesterday'

    elif range_param == 'last_7_days':
        start_dt = today_start - timedelta(days=6)
        end_dt = today_end
        prev_start_dt = start_dt - timedelta(days=7)
        prev_end_dt = start_dt - timedelta(microseconds=1)
        range_label = 'Last 7 Days'

    elif range_param == 'this_month':
        start_dt = today_start.replace(day=1)
        end_dt = today_end
        duration = end_dt - start_dt
        prev_end_dt = start_dt - timedelta(microseconds=1)
        prev_start_dt = prev_end_dt - duration
        range_label = 'This Month'

    elif range_param == 'previous_month':
        first_of_this_month = today_start.replace(day=1)
        end_dt = first_of_this_month - timedelta(microseconds=1)
        start_dt = end_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        duration = end_dt - start_dt
        prev_end_dt = start_dt - timedelta(microseconds=1)
        prev_start_dt = prev_end_dt - duration
        range_label = 'Previous Month'

    elif range_param == 'this_year':
        start_dt = today_start.replace(month=1, day=1)
        end_dt = today_end
        duration = end_dt - start_dt
        prev_end_dt = start_dt - timedelta(microseconds=1)
        prev_start_dt = prev_end_dt - duration
        range_label = 'This Year'

    elif range_param == 'custom' and start_date_str and end_date_str:
        try:
            s_date = datetime.strptime(start_date_str.strip(), '%Y-%m-%d').date()
            e_date = datetime.strptime(end_date_str.strip(), '%Y-%m-%d').date()
            if e_date < s_date:
                s_date, e_date = e_date, s_date

            tz = timezone.get_current_timezone()
            start_dt = timezone.make_aware(datetime.combine(s_date, datetime.min.time()), tz)
            end_dt = timezone.make_aware(datetime.combine(e_date, datetime.max.time()), tz)
            duration = end_dt - start_dt
            prev_end_dt = start_dt - timedelta(microseconds=1)
            prev_start_dt = prev_end_dt - duration
            range_label = f"{s_date.strftime('%d %b %Y')} - {e_date.strftime('%d %b %Y')}"
        except Exception:
            start_dt = today_start - timedelta(days=29)
            end_dt = today_end
            prev_start_dt = start_dt - timedelta(days=30)
            prev_end_dt = start_dt - timedelta(microseconds=1)
            range_label = 'Last 30 Days'
    else:
        # Default: last_30_days
        start_dt = today_start - timedelta(days=29)
        end_dt = today_end
        prev_start_dt = start_dt - timedelta(days=30)
        prev_end_dt = start_dt - timedelta(microseconds=1)
        range_label = 'Last 30 Days'

    return start_dt, end_dt, prev_start_dt, prev_end_dt, range_label


def calculate_bi_analytics(filters=None):
    """
    Computes all Advanced Business Intelligence & Analytics metrics
    from actual database records without fabricated data or IoT dependencies.
    """
    if filters is None:
        filters = {}

    range_param = filters.get('range', 'last_30_days')
    start_date_str = filters.get('start_date')
    end_date_str = filters.get('end_date')
    lot_id = filters.get('lot_id')
    payment_method = filters.get('payment_method')

    start_dt, end_dt, prev_start_dt, prev_end_dt, range_label = parse_date_range_filters(
        range_param, start_date_str, end_date_str
    )

    # 1. Base Querysets with Lot and Method Filters
    lots_qs = ParkingLot.objects.all()
    if lot_id and str(lot_id).lower() != 'all':
        try:
            lot_id_int = int(lot_id)
            lots_qs = lots_qs.filter(id=lot_id_int)
        except (ValueError, TypeError):
            pass

    bookings_qs = Booking.objects.filter(
        created_at__gte=start_dt,
        created_at__lte=end_dt
    ).select_related('slot', 'slot__lot', 'user')

    prev_bookings_qs = Booking.objects.filter(
        created_at__gte=prev_start_dt,
        created_at__lte=prev_end_dt
    )

    payments_qs = Payment.objects.filter(
        paid_at__gte=start_dt,
        paid_at__lte=end_dt
    ).select_related('booking', 'booking__slot', 'booking__slot__lot')

    prev_payments_qs = Payment.objects.filter(
        paid_at__gte=prev_start_dt,
        paid_at__lte=prev_end_dt
    )

    if lot_id and str(lot_id).lower() != 'all':
        try:
            lot_id_int = int(lot_id)
            bookings_qs = bookings_qs.filter(slot__lot_id=lot_id_int)
            prev_bookings_qs = prev_bookings_qs.filter(slot__lot_id=lot_id_int)
            payments_qs = payments_qs.filter(booking__slot__lot_id=lot_id_int)
            prev_payments_qs = prev_payments_qs.filter(booking__slot__lot_id=lot_id_int)
        except (ValueError, TypeError):
            pass

    if payment_method and str(payment_method).lower() != 'all':
        payments_qs = payments_qs.filter(method=payment_method.lower())
        prev_payments_qs = prev_payments_qs.filter(method=payment_method.lower())

    # =========================================================================
    # MODULE A: REVENUE ANALYTICS
    # =========================================================================
    success_payments = payments_qs.filter(status='success')
    total_revenue = float(success_payments.aggregate(tot=Sum('amount'))['tot'] or 0.0)

    prev_success = prev_payments_qs.filter(status='success')
    prev_revenue = float(prev_success.aggregate(tot=Sum('amount'))['tot'] or 0.0)

    if prev_revenue > 0:
        revenue_growth_pct = round(((total_revenue - prev_revenue) / prev_revenue) * 100, 2)
    elif total_revenue > 0:
        revenue_growth_pct = 100.0
    else:
        revenue_growth_pct = 0.0

    # Period revenue snapshots
    now = timezone.now()
    daily_rev = float(Payment.objects.filter(
        status='success', paid_at__date=now.date()
    ).aggregate(tot=Sum('amount'))['tot'] or 0.0)

    week_start = now - timedelta(days=7)
    weekly_rev = float(Payment.objects.filter(
        status='success', paid_at__gte=week_start
    ).aggregate(tot=Sum('amount'))['tot'] or 0.0)

    month_start = now - timedelta(days=30)
    monthly_rev = float(Payment.objects.filter(
        status='success', paid_at__gte=month_start
    ).aggregate(tot=Sum('amount'))['tot'] or 0.0)

    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0)
    yearly_rev = float(Payment.objects.filter(
        status='success', paid_at__gte=year_start
    ).aggregate(tot=Sum('amount'))['tot'] or 0.0)

    # Payment statistics
    successful_count = success_payments.count()
    failed_count = payments_qs.filter(status='failed').count()
    failed_amount = float(payments_qs.filter(status='failed').aggregate(tot=Sum('amount'))['tot'] or 0.0)
    pending_bookings_count = bookings_qs.filter(status=Booking.STATUS_PENDING).count()
    pending_amount = float(bookings_qs.filter(status=Booking.STATUS_PENDING).aggregate(tot=Sum('amount'))['tot'] or 0.0)

    # Revenue trend series
    # Determine step: daily if span <= 45 days, weekly if <= 180 days, else monthly
    span_days = max(1, (end_dt.date() - start_dt.date()).days + 1)
    trend_labels = []
    trend_revenue = []
    trend_bookings = []

    if span_days <= 45:
        # Group by Day
        curr = start_dt.date()
        while curr <= end_dt.date():
            trend_labels.append(curr.strftime('%d %b'))
            day_rev = float(payments_qs.filter(status='success', paid_at__date=curr).aggregate(tot=Sum('amount'))['tot'] or 0.0)
            day_bks = bookings_qs.filter(created_at__date=curr).count()
            trend_revenue.append(day_rev)
            trend_bookings.append(day_bks)
            curr += timedelta(days=1)
    else:
        # Group by Week or Month
        step_days = 7 if span_days <= 180 else 30
        curr_s = start_dt
        while curr_s < end_dt:
            curr_e = min(end_dt, curr_s + timedelta(days=step_days))
            trend_labels.append(f"{curr_s.strftime('%d %b')}")
            span_rev = float(payments_qs.filter(status='success', paid_at__gte=curr_s, paid_at__lt=curr_e).aggregate(tot=Sum('amount'))['tot'] or 0.0)
            span_bks = bookings_qs.filter(created_at__gte=curr_s, created_at__lt=curr_e).count()
            trend_revenue.append(span_rev)
            trend_bookings.append(span_bks)
            curr_s = curr_e

    # Revenue breakdown by parking lot
    revenue_by_lot = []
    for lot in lots_qs:
        lot_rev = float(payments_qs.filter(
            status='success',
            booking__slot__lot=lot
        ).aggregate(tot=Sum('amount'))['tot'] or 0.0)
        lot_pct = round((lot_rev / total_revenue * 100), 1) if total_revenue > 0 else 0.0
        revenue_by_lot.append({
            'lot_id': lot.id,
            'lot_name': lot.name,
            'location': lot.location,
            'revenue': lot_rev,
            'percentage': lot_pct,
        })
    revenue_by_lot.sort(key=lambda x: x['revenue'], reverse=True)

    # =========================================================================
    # MODULE B: PARKING OCCUPANCY ANALYTICS
    # =========================================================================
    total_slots = sum(lot.slots.count() for lot in lots_qs)
    active_slots = sum(lot.active_slots_count for lot in lots_qs)
    occupied_slots = sum(lot.occupied_slots_count for lot in lots_qs)
    available_slots = sum(lot.available_slots_count for lot in lots_qs)
    reserved_slots = sum(lot.future_reserved_slots_count for lot in lots_qs)
    current_occupancy_pct = round((occupied_slots / active_slots * 100), 1) if active_slots > 0 else 0.0

    # Historical average occupancy: derived from total booked hours in range / total available slot hours
    range_total_hours = max(1.0, (end_dt - start_dt).total_seconds() / 3600.0)
    capacity_slot_hours = active_slots * range_total_hours

    confirmed_bookings = bookings_qs.filter(status__in=[
        Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE, Booking.STATUS_COMPLETED
    ])

    total_booked_seconds = sum(
        max(0, (b.end_time - b.start_time).total_seconds()) for b in confirmed_bookings
    )
    total_booked_hours = total_booked_seconds / 3600.0

    avg_historical_occupancy_pct = round(
        (total_booked_hours / capacity_slot_hours * 100), 1
    ) if capacity_slot_hours > 0 else 0.0

    occupancy_by_lot = []
    for lot in lots_qs:
        act = lot.active_slots_count
        occ = lot.occupied_slots_count
        avail = lot.available_slots_count
        res = lot.future_reserved_slots_count
        pct = round((occ / act * 100), 1) if act > 0 else 0.0
        occupancy_by_lot.append({
            'lot_id': lot.id,
            'lot_name': lot.name,
            'total_slots': lot.slots.count(),
            'active_slots': act,
            'occupied_slots': occ,
            'available_slots': avail,
            'reserved_slots': res,
            'occupancy_percent': pct,
        })

    # =========================================================================
    # MODULE C: PEAK-HOUR ANALYTICS
    # =========================================================================
    # 24-hour distribution of booking start times
    hourly_distribution = [0] * 24
    for b in confirmed_bookings:
        hour = b.start_time.hour
        hourly_distribution[hour] += 1

    # Weekday vs Weekend distribution
    # Monday=0, Tuesday=1 ... Friday=4 (Weekdays); Saturday=5, Sunday=6 (Weekend)
    weekday_bookings_count = 0
    weekend_bookings_count = 0
    weekday_rev = 0.0
    weekend_rev = 0.0

    # Days of week array (Mon to Sun)
    days_of_week = [
        {'day': 'Monday', 'bookings': 0, 'revenue': 0.0},
        {'day': 'Tuesday', 'bookings': 0, 'revenue': 0.0},
        {'day': 'Wednesday', 'bookings': 0, 'revenue': 0.0},
        {'day': 'Thursday', 'bookings': 0, 'revenue': 0.0},
        {'day': 'Friday', 'bookings': 0, 'revenue': 0.0},
        {'day': 'Saturday', 'bookings': 0, 'revenue': 0.0},
        {'day': 'Sunday', 'bookings': 0, 'revenue': 0.0},
    ]

    for b in confirmed_bookings:
        w_day = b.start_time.weekday()
        days_of_week[w_day]['bookings'] += 1
        days_of_week[w_day]['revenue'] += float(b.amount)
        if w_day < 5:
            weekday_bookings_count += 1
            weekday_rev += float(b.amount)
        else:
            weekend_bookings_count += 1
            weekend_rev += float(b.amount)

    busiest_day_item = max(days_of_week, key=lambda x: x['bookings'], default=days_of_week[0])
    busiest_day_name = busiest_day_item['day'] if confirmed_bookings.exists() else 'N/A'

    # Peak hour windows identification
    morning_peak = sum(hourly_distribution[9:13])
    evening_peak = sum(hourly_distribution[17:21])
    off_peak_total = sum(hourly_distribution) - (morning_peak + evening_peak)

    # Average booking duration
    durations = [
        (b.end_time - b.start_time).total_seconds() / 3600.0 for b in confirmed_bookings
    ]
    avg_duration_hours = round(sum(durations) / len(durations), 2) if durations else 0.0

    # =========================================================================
    # MODULE D: CUSTOMER ANALYTICS
    # =========================================================================
    total_registered_customers = User.objects.filter(is_staff=False, is_superuser=False).count()
    new_customers = User.objects.filter(
        is_staff=False,
        is_superuser=False,
        date_joined__gte=start_dt,
        date_joined__lte=end_dt
    ).count()

    active_customer_ids = bookings_qs.values_list('user_id', flat=True).distinct()
    active_customers_count = len(active_customer_ids)

    # Returning customers: customers who have > 1 lifetime booking
    customer_lifetime_counts = Booking.objects.filter(
        user_id__in=active_customer_ids
    ).values('user_id').annotate(b_count=Count('id'))

    returning_customers_count = sum(1 for c in customer_lifetime_counts if c['b_count'] > 1)
    customer_retention_rate = round(
        (returning_customers_count / active_customers_count * 100), 1
    ) if active_customers_count > 0 else 0.0

    total_valid_bookings = confirmed_bookings.count()
    avg_booking_value = round(
        total_revenue / total_valid_bookings, 2
    ) if total_valid_bookings > 0 else 0.0

    # Privacy-conscious top active customers in range
    top_customers_qs = bookings_qs.values('user__username').annotate(
        bookings_count=Count('id'),
        total_spent=Sum('amount')
    ).order_by('-bookings_count')[:5]

    top_customers = [
        {
            'username': item['user__username'],
            'bookings_count': item['bookings_count'],
            'total_spent': float(item['total_spent'] or 0.0)
        }
        for item in top_customers_qs
    ]

    # =========================================================================
    # MODULE E: PARKING LOT PERFORMANCE
    # =========================================================================
    lot_performance_list = []
    for lot in lots_qs:
        lot_bks = confirmed_bookings.filter(slot__lot=lot)
        bks_count = lot_bks.count()
        l_rev = float(payments_qs.filter(status='success', booking__slot__lot=lot).aggregate(tot=Sum('amount'))['tot'] or 0.0)

        l_durations = [(b.end_time - b.start_time).total_seconds() / 3600.0 for b in lot_bks]
        l_avg_dur = round(sum(l_durations) / len(l_durations), 1) if l_durations else 0.0

        lot_performance_list.append({
            'lot_id': lot.id,
            'lot_name': lot.name,
            'location': lot.location,
            'price_per_hour': float(lot.price_per_hour),
            'total_slots': lot.slots.count(),
            'current_occupancy_percent': lot.occupancy_percent,
            'booking_count': bks_count,
            'revenue': l_rev,
            'avg_duration_hours': l_avg_dur,
        })

    lot_performance_list.sort(key=lambda x: x['revenue'], reverse=True)
    best_performing_lot = lot_performance_list[0]['lot_name'] if lot_performance_list else 'N/A'
    lowest_performing_lot = lot_performance_list[-1]['lot_name'] if lot_performance_list else 'N/A'

    # =========================================================================
    # MODULE F: PAYMENT ANALYTICS
    # =========================================================================
    # Method distribution
    payment_methods_breakdown = []
    method_choices = [('upi', 'UPI'), ('card', 'Card'), ('netbanking', 'Net Banking'), ('wallet', 'Digital Wallet')]

    all_payments_in_period = payments_qs.count()
    for m_key, m_label in method_choices:
        m_qs = payments_qs.filter(method=m_key, status='success')
        m_count = m_qs.count()
        m_amt = float(m_qs.aggregate(tot=Sum('amount'))['tot'] or 0.0)
        m_pct = round((m_count / successful_count * 100), 1) if successful_count > 0 else 0.0
        payment_methods_breakdown.append({
            'method': m_key,
            'label': m_label,
            'count': m_count,
            'amount': m_amt,
            'percentage': m_pct,
        })

    payment_success_rate = round(
        (successful_count / all_payments_in_period * 100), 1
    ) if all_payments_in_period > 0 else 100.0

    # Simulated Payments Transparency:
    # Explicitly distinguish simulated payments from real payment processor integrations
    simulated_transactions_count = payments_qs.count()

    # =========================================================================
    # MODULE G: MEMBERSHIP & LOYALTY ANALYTICS
    # =========================================================================
    now = timezone.now()
    active_memberships_count = CustomerMembership.objects.filter(status=CustomerMembership.STATUS_ACTIVE).count()
    expired_memberships_count = CustomerMembership.objects.filter(status=CustomerMembership.STATUS_EXPIRED).count()

    membership_revenue = float(CustomerMembership.objects.filter(
        created_at__gte=start_dt, created_at__lte=end_dt
    ).aggregate(tot=Sum('amount_paid'))['tot'] or 0.0)

    active_monthly_passes = MonthlyPass.objects.filter(status=MonthlyPass.STATUS_ACTIVE).count()
    expired_monthly_passes = MonthlyPass.objects.filter(status=MonthlyPass.STATUS_EXPIRED).count()
    monthly_pass_revenue = float(MonthlyPass.objects.filter(
        created_at__gte=start_dt, created_at__lte=end_dt
    ).aggregate(tot=Sum('amount_paid'))['tot'] or 0.0)

    # Loyalty points
    loyalty_txns = LoyaltyTransaction.objects.filter(
        created_at__gte=start_dt, created_at__lte=end_dt
    )
    points_earned = loyalty_txns.filter(
        transaction_type=LoyaltyTransaction.TYPE_EARNED
    ).aggregate(tot=Sum('points'))['tot'] or 0

    points_redeemed = abs(loyalty_txns.filter(
        transaction_type=LoyaltyTransaction.TYPE_REDEEMED
    ).aggregate(tot=Sum('points'))['tot'] or 0)

    total_system_points_liability = LoyaltyAccount.objects.aggregate(tot=Sum('points_balance'))['tot'] or 0

    tier_counts = {
        'Bronze': LoyaltyAccount.objects.filter(tier='Bronze').count(),
        'Silver': LoyaltyAccount.objects.filter(tier='Silver').count(),
        'Gold': LoyaltyAccount.objects.filter(tier='Gold').count(),
        'Platinum': LoyaltyAccount.objects.filter(tier='Platinum').count(),
    }

    # Consolidated Results
    return {
        'filters': {
            'range': range_param,
            'range_label': range_label,
            'start_date': start_dt.isoformat(),
            'end_date': end_dt.isoformat(),
            'lot_id': lot_id or 'all',
            'payment_method': payment_method or 'all',
            'currency': 'INR',
            'currency_symbol': '₹',
        },
        'revenue': {
            'total_revenue': total_revenue,
            'previous_period_revenue': prev_revenue,
            'growth_percent': revenue_growth_pct,
            'daily_revenue': daily_rev,
            'weekly_revenue': weekly_rev,
            'monthly_revenue': monthly_rev,
            'yearly_revenue': yearly_rev,
            'successful_count': successful_count,
            'failed_count': failed_count,
            'failed_amount': failed_amount,
            'pending_count': pending_bookings_count,
            'pending_amount': pending_amount,
            'trend': {
                'labels': trend_labels,
                'revenue': trend_revenue,
                'bookings_count': trend_bookings,
            },
            'by_lot': revenue_by_lot,
        },
        'occupancy': {
            'total_slots': total_slots,
            'active_slots': active_slots,
            'occupied_slots': occupied_slots,
            'available_slots': available_slots,
            'reserved_slots': reserved_slots,
            'current_occupancy_percent': current_occupancy_pct,
            'historical_avg_occupancy_percent': avg_historical_occupancy_pct,
            'by_lot': occupancy_by_lot,
        },
        'peak_hours': {
            'hourly_distribution': hourly_distribution,
            'weekday_vs_weekend': {
                'weekday_bookings': weekday_bookings_count,
                'weekend_bookings': weekend_bookings_count,
                'weekday_revenue': round(weekday_rev, 2),
                'weekend_revenue': round(weekend_rev, 2),
            },
            'days_of_week': days_of_week,
            'busiest_day': busiest_day_name,
            'morning_peak_count': morning_peak,
            'evening_peak_count': evening_peak,
            'off_peak_count': off_peak_total,
            'avg_duration_hours': avg_duration_hours,
        },
        'customers': {
            'total_registered': total_registered_customers,
            'new_in_period': new_customers,
            'active_in_period': active_customers_count,
            'returning_customers': returning_customers_count,
            'retention_rate': customer_retention_rate,
            'avg_booking_value': avg_booking_value,
            'top_customers': top_customers,
        },
        'lot_performance': {
            'lots': lot_performance_list,
            'best_performing': best_performing_lot,
            'lowest_performing': lowest_performing_lot,
        },
        'payments': {
            'methods': payment_methods_breakdown,
            'success_rate': payment_success_rate,
            'total_transactions': all_payments_in_period,
            'simulated_transactions_count': simulated_transactions_count,
            'is_simulated_gateway': True,
            'gateway_disclaimer': 'Simulated demonstration gateway. No actual bank transfers or real money debits occur.',
        },
        'membership_loyalty': {
            'active_memberships': active_memberships_count,
            'expired_memberships': expired_memberships_count,
            'membership_revenue': membership_revenue,
            'active_monthly_passes': active_monthly_passes,
            'expired_monthly_passes': expired_monthly_passes,
            'monthly_pass_revenue': monthly_pass_revenue,
            'points_earned': points_earned,
            'points_redeemed': points_redeemed,
            'total_points_liability': total_system_points_liability,
            'tier_distribution': tier_counts,
        },
        'generated_at': now.isoformat(),
    }


# =============================================================================
# EXPORT GENERATORS: CSV, EXCEL, AND PDF
# =============================================================================

def generate_csv_report(data):
    """Generates a structured, clean CSV text document from BI analytics data."""
    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Report Header
    writer.writerow(["SMART PARKING MANAGEMENT SYSTEM — BUSINESS INTELLIGENCE REPORT"])
    writer.writerow(["Date Range", data['filters']['range_label']])
    writer.writerow(["Generated At", data['generated_at']])
    writer.writerow(["Selected Lot Filter", data['filters']['lot_id']])
    writer.writerow(["Selected Payment Filter", data['filters']['payment_method']])
    writer.writerow([])

    # 2. Key Performance Indicators
    writer.writerow(["EXECUTIVE SUMMARY & KPIS"])
    writer.writerow(["Metric", "Value", "Previous Period", "Growth / Change"])
    rev = data['revenue']
    writer.writerow(["Total Revenue (INR)", f"₹{rev['total_revenue']:.2f}", f"₹{rev['previous_period_revenue']:.2f}", f"{rev['growth_percent']:+.1f}%"])
    writer.writerow(["Successful Payments Count", rev['successful_count'], "-", "-"])
    writer.writerow(["Pending Reservations Count", rev['pending_count'], "-", f"₹{rev['pending_amount']:.2f}"])
    writer.writerow(["Failed Payments Count", rev['failed_count'], "-", f"₹{rev['failed_amount']:.2f}"])
    writer.writerow(["Average Historical Occupancy", f"{data['occupancy']['historical_avg_occupancy_percent']}%", "-", "-"])
    writer.writerow(["Active Registered Customers", data['customers']['active_in_period'], "-", "-"])
    writer.writerow(["Customer Retention Rate", f"{data['customers']['retention_rate']}%", "-", "-"])
    writer.writerow(["Average Booking Value", f"₹{data['customers']['avg_booking_value']:.2f}", "-", "-"])
    writer.writerow([])

    # 3. Parking Lot Performance
    writer.writerow(["PARKING LOT PERFORMANCE"])
    writer.writerow(["Lot ID", "Name", "Location", "Hourly Rate (INR)", "Slots", "Occupancy %", "Bookings Count", "Total Revenue (INR)", "Avg Duration (Hrs)"])
    for lot in data['lot_performance']['lots']:
        writer.writerow([
            lot['lot_id'],
            lot['lot_name'],
            lot['location'],
            f"₹{lot['price_per_hour']:.2f}",
            lot['total_slots'],
            f"{lot['current_occupancy_percent']}%",
            lot['booking_count'],
            f"₹{lot['revenue']:.2f}",
            f"{lot['avg_duration_hours']}h"
        ])
    writer.writerow([])

    # 4. Payment Methods Distribution
    writer.writerow(["PAYMENT METHOD BREAKDOWN"])
    writer.writerow(["Method", "Transactions Count", "Amount (INR)", "Share (%)"])
    for m in data['payments']['methods']:
        writer.writerow([m['label'], m['count'], f"₹{m['amount']:.2f}", f"{m['percentage']}%"])
    writer.writerow([])

    # 5. Day of Week Demand Breakdown
    writer.writerow(["WEEKDAY VS WEEKEND DEMAND"])
    writer.writerow(["Day", "Bookings Count", "Revenue (INR)"])
    for d in data['peak_hours']['days_of_week']:
        writer.writerow([d['day'], d['bookings'], f"₹{d['revenue']:.2f}"])
    writer.writerow([])

    # 6. Membership and Loyalty Summary
    writer.writerow(["MEMBERSHIP & LOYALTY METRICS"])
    writer.writerow(["Active Subscribed Memberships", data['membership_loyalty']['active_memberships']])
    writer.writerow(["Expired Memberships", data['membership_loyalty']['expired_memberships']])
    writer.writerow(["Membership Revenue (INR)", f"₹{data['membership_loyalty']['membership_revenue']:.2f}"])
    writer.writerow(["Active Monthly Parking Passes", data['membership_loyalty']['active_monthly_passes']])
    writer.writerow(["Passes Revenue (INR)", f"₹{data['membership_loyalty']['monthly_pass_revenue']:.2f}"])
    writer.writerow(["Loyalty Points Earned in Period", data['membership_loyalty']['points_earned']])
    writer.writerow(["Loyalty Points Redeemed in Period", data['membership_loyalty']['points_redeemed']])
    writer.writerow(["System Total Loyalty Liability", data['membership_loyalty']['total_points_liability']])

    return output.getvalue()


def generate_excel_report(data):
    """
    Generates an Excel workbook (.xlsx) with styled sheets using openpyxl.
    Sheets:
      1. Executive Summary
      2. Lot Performance
      3. Payment & Demand
      4. Memberships & Loyalty
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()

    # Styling palettes
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")  # Navy dark
    sub_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")     # Blue
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")   # Light slate
    white_font_bold = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    title_font = Font(name="Arial", size=14, bold=True, color="1E293B")
    bold_font = Font(name="Arial", size=10, bold=True, color="000000")
    regular_font = Font(name="Arial", size=10, color="000000")
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    # -------------------------------------------------------------
    # Sheet 1: Executive Summary
    # -------------------------------------------------------------
    ws1 = wb.active
    ws1.title = "Executive Summary"

    ws1.append(["SMART PARKING MANAGEMENT SYSTEM — BI REPORT"])
    ws1["A1"].font = title_font
    ws1.append(["Date Range:", data['filters']['range_label']])
    ws1.append(["Generated:", data['generated_at']])
    ws1.append(["Lot Filter:", str(data['filters']['lot_id'])])
    ws1.append(["Payment Filter:", str(data['filters']['payment_method'])])
    ws1.append([])

    # Summary KPIs
    ws1.append(["Key Performance Indicators", "Value", "Previous Period", "Growth / Change"])
    for col_idx in range(1, 5):
        cell = ws1.cell(row=ws1.max_row, column=col_idx)
        cell.fill = header_fill
        cell.font = white_font_bold

    rev = data['revenue']
    kpi_rows = [
        ["Total Revenue", f"₹{rev['total_revenue']:,.2f}", f"₹{rev['previous_period_revenue']:,.2f}", f"{rev['growth_percent']:+.1f}%"],
        ["Successful Payments", rev['successful_count'], "-", "-"],
        ["Pending Bookings", rev['pending_count'], "-", f"₹{rev['pending_amount']:,.2f}"],
        ["Failed Payments", rev['failed_count'], "-", f"₹{rev['failed_amount']:,.2f}"],
        ["Current Occupancy Rate", f"{data['occupancy']['current_occupancy_percent']}%", "-", "-"],
        ["Historical Avg Occupancy", f"{data['occupancy']['historical_avg_occupancy_percent']}%", "-", "-"],
        ["Active Customers in Period", data['customers']['active_in_period'], "-", "-"],
        ["Customer Retention Rate", f"{data['customers']['retention_rate']}%", "-", "-"],
        ["Average Booking Value", f"₹{data['customers']['avg_booking_value']:,.2f}", "-", "-"],
        ["Average Booking Duration", f"{data['peak_hours']['avg_duration_hours']} hours", "-", "-"],
        ["Best Performing Lot", data['lot_performance']['best_performing'], "-", "-"],
    ]

    for row_data in kpi_rows:
        ws1.append(row_data)
        for c in range(1, 5):
            cell = ws1.cell(row=ws1.max_row, column=c)
            cell.font = regular_font
            cell.border = thin_border

    # -------------------------------------------------------------
    # Sheet 2: Lot Performance
    # -------------------------------------------------------------
    ws2 = wb.create_sheet(title="Lot Performance")
    ws2.append(["Lot ID", "Parking Facility Name", "Location", "Hourly Rate (₹)", "Slots", "Occupancy %", "Bookings", "Total Revenue (₹)", "Avg Duration (h)"])
    for col_idx in range(1, 10):
        cell = ws2.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = white_font_bold

    for idx, lot in enumerate(data['lot_performance']['lots'], start=2):
        ws2.append([
            lot['lot_id'],
            lot['lot_name'],
            lot['location'],
            lot['price_per_hour'],
            lot['total_slots'],
            lot['current_occupancy_percent'],
            lot['booking_count'],
            lot['revenue'],
            lot['avg_duration_hours'],
        ])
        fill = zebra_fill if idx % 2 == 0 else PatternFill(fill_type=None)
        for c in range(1, 10):
            cell = ws2.cell(row=ws2.max_row, column=c)
            cell.font = regular_font
            cell.fill = fill
            cell.border = thin_border

    # -------------------------------------------------------------
    # Sheet 3: Payment & Demand
    # -------------------------------------------------------------
    ws3 = wb.create_sheet(title="Payment & Demand")
    ws3.append(["Payment Method", "Transactions Count", "Amount (₹)", "Share (%)"])
    for col_idx in range(1, 5):
        cell = ws3.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = white_font_bold

    for m in data['payments']['methods']:
        ws3.append([m['label'], m['count'], m['amount'], m['percentage']])
        for c in range(1, 5):
            cell = ws3.cell(row=ws3.max_row, column=c)
            cell.font = regular_font
            cell.border = thin_border

    ws3.append([])
    ws3.append(["Day of Week", "Bookings Count", "Revenue (₹)"])
    for col_idx in range(1, 4):
        cell = ws3.cell(row=ws3.max_row, column=col_idx)
        cell.fill = sub_fill
        cell.font = white_font_bold

    for d in data['peak_hours']['days_of_week']:
        ws3.append([d['day'], d['bookings'], d['revenue']])
        for c in range(1, 4):
            cell = ws3.cell(row=ws3.max_row, column=c)
            cell.font = regular_font
            cell.border = thin_border

    # -------------------------------------------------------------
    # Sheet 4: Memberships & Loyalty
    # -------------------------------------------------------------
    ws4 = wb.create_sheet(title="Memberships & Loyalty")
    ws4.append(["Metric", "Count / Value"])
    for col_idx in range(1, 3):
        cell = ws4.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = white_font_bold

    ml = data['membership_loyalty']
    ml_rows = [
        ["Active Memberships", ml['active_memberships']],
        ["Expired Memberships", ml['expired_memberships']],
        ["Membership Subscriptions Revenue", f"₹{ml['membership_revenue']:,.2f}"],
        ["Active Monthly Passes", ml['active_monthly_passes']],
        ["Expired Monthly Passes", ml['expired_monthly_passes']],
        ["Monthly Pass Revenue", f"₹{ml['monthly_pass_revenue']:,.2f}"],
        ["Loyalty Points Earned (Period)", ml['points_earned']],
        ["Loyalty Points Redeemed (Period)", ml['points_redeemed']],
        ["Total Unredeemed Loyalty Liability", ml['total_points_liability']],
        ["Bronze Tier Accounts", ml['tier_distribution']['Bronze']],
        ["Silver Tier Accounts", ml['tier_distribution']['Silver']],
        ["Gold Tier Accounts", ml['tier_distribution']['Gold']],
        ["Platinum Tier Accounts", ml['tier_distribution']['Platinum']],
    ]
    for row in ml_rows:
        ws4.append(row)
        for c in range(1, 3):
            cell = ws4.cell(row=ws4.max_row, column=c)
            cell.font = regular_font
            cell.border = thin_border

    # Auto-adjust column widths across all sheets
    for ws in [ws1, ws2, ws3, ws4]:
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def generate_pdf_report(data):
    """
    Generates a PDF analytics document using ReportLab Platypus.
    Includes branded header, KPI matrix, lot performance table, and payment charts.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A')
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#64748B')
    )
    heading_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=10,
        spaceAfter=6
    )
    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#0F172A')
    )
    cell_text = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#334155')
    )
    th_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    story = []

    # 1. Header
    story.append(Paragraph("Smart Parking Management System", title_style))
    story.append(Paragraph(
        f"<b>Business Intelligence & Executive Analytics Report</b><br/>"
        f"Date Range: <b>{data['filters']['range_label']}</b> &nbsp;|&nbsp; "
        f"Generated: {data['generated_at'][:19].replace('T', ' ')} &nbsp;|&nbsp; "
        f"Lot Filter: {data['filters']['lot_id']} &nbsp;|&nbsp; "
        f"Payment Filter: {data['filters']['payment_method']}",
        subtitle_style
    ))
    story.append(Spacer(1, 14))

    # 2. Executive KPI Summary Table
    story.append(Paragraph("Executive Summary KPIs", heading_style))
    rev = data['revenue']
    kpi_data = [
        [
            Paragraph("Total Revenue", cell_bold),
            Paragraph(f"₹{rev['total_revenue']:,.2f}", cell_bold),
            Paragraph(f"Growth: {rev['growth_percent']:+.1f}%", cell_text),
            Paragraph("Occupancy Rate", cell_bold),
            Paragraph(f"{data['occupancy']['current_occupancy_percent']}%", cell_bold),
        ],
        [
            Paragraph("Successful Payments", cell_bold),
            Paragraph(str(rev['successful_count']), cell_text),
            Paragraph(f"Failed: {rev['failed_count']}", cell_text),
            Paragraph("Active Customers", cell_bold),
            Paragraph(str(data['customers']['active_in_period']), cell_text),
        ],
        [
            Paragraph("Pending Holds Amount", cell_bold),
            Paragraph(f"₹{rev['pending_amount']:,.2f}", cell_text),
            Paragraph(f"{rev['pending_count']} pending", cell_text),
            Paragraph("Customer Retention", cell_bold),
            Paragraph(f"{data['customers']['retention_rate']}%", cell_text),
        ],
        [
            Paragraph("Avg Booking Value", cell_bold),
            Paragraph(f"₹{data['customers']['avg_booking_value']:,.2f}", cell_text),
            Paragraph(f"{data['peak_hours']['busiest_day']} busiest", cell_text),
            Paragraph("Avg Booking Duration", cell_bold),
            Paragraph(f"{data['peak_hours']['avg_duration_hours']} hrs", cell_text),
        ]
    ]

    t_kpi = Table(kpi_data, colWidths=[110, 85, 110, 115, 120])
    t_kpi.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_kpi)
    story.append(Spacer(1, 14))

    # 3. Parking Lot Performance
    story.append(Paragraph("Parking Lot Utilization & Revenue Matrix", heading_style))
    lot_headers = [
        Paragraph("Facility", th_style),
        Paragraph("Location", th_style),
        Paragraph("Rate", th_style),
        Paragraph("Slots", th_style),
        Paragraph("Occupancy", th_style),
        Paragraph("Bookings", th_style),
        Paragraph("Revenue", th_style),
    ]
    lot_rows = [lot_headers]
    for lot in data['lot_performance']['lots']:
        lot_rows.append([
            Paragraph(lot['lot_name'], cell_bold),
            Paragraph(lot['location'], cell_text),
            Paragraph(f"₹{lot['price_per_hour']:.0f}/h", cell_text),
            Paragraph(str(lot['total_slots']), cell_text),
            Paragraph(f"{lot['current_occupancy_percent']}%", cell_text),
            Paragraph(str(lot['booking_count']), cell_text),
            Paragraph(f"₹{lot['revenue']:,.2f}", cell_bold),
        ])

    t_lots = Table(lot_rows, colWidths=[110, 125, 45, 40, 60, 60, 100])
    t_lots.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_lots)
    story.append(Spacer(1, 14))

    # 4. Payment Methods & Loyalty Breakdown (Side-by-side or stacked)
    story.append(Paragraph("Payment Channels & Loyalty Program Metrics", heading_style))
    pm_headers = [
        Paragraph("Payment Method", th_style),
        Paragraph("Transactions", th_style),
        Paragraph("Total Amount", th_style),
        Paragraph("Share (%)", th_style),
    ]
    pm_rows = [pm_headers]
    for m in data['payments']['methods']:
        pm_rows.append([
            Paragraph(m['label'], cell_text),
            Paragraph(str(m['count']), cell_text),
            Paragraph(f"₹{m['amount']:,.2f}", cell_text),
            Paragraph(f"{m['percentage']}%", cell_text),
        ])

    t_pm = Table(pm_rows, colWidths=[150, 90, 150, 150])
    t_pm.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#334155')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_pm)
    story.append(Spacer(1, 12))

    # Disclaimer & Watermark
    story.append(Paragraph(
        "<i>Notice: Analytics computed from sensor-free booking and transaction records in compliance with "
        "Smart Parking software-only architecture. Payment statistics include simulated demonstration records.</i>",
        subtitle_style
    ))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()

