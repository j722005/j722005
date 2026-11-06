import math
import uuid
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction, models
from django.utils import timezone

from .models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle, Notification,
    MembershipPlan, CustomerMembership, MonthlyPass, LoyaltyProgramConfig,
    LoyaltyAccount, LoyaltyTransaction
)
from .notification_service import notify_loyalty_transaction


def get_or_create_loyalty_account(user):
    """Retrieves or safely creates a LoyaltyAccount for a given user."""
    account, created = LoyaltyAccount.objects.get_or_create(
        user=user,
        defaults={'points_balance': 0, 'lifetime_earned': 0, 'lifetime_redeemed': 0, 'tier': 'Bronze'}
    )
    return account


def calculate_booking_benefits(
    user,
    lot,
    vehicle_number,
    vehicle_type,
    start_time,
    end_time,
    raw_dynamic_total,
    requested_pass_id=None,
    requested_membership_id=None,
    points_to_redeem=0,
):
    """
    Computes applicable discounts from Monthly Passes, Active Memberships,
    and Loyalty Points redemption.
    Returns:
        final_payable_amount (Decimal),
        benefits_breakdown (dict),
        applied_pass (MonthlyPass or None),
        applied_membership (CustomerMembership or None),
        validated_points_redeemed (int),
        points_discount_amount (Decimal)
    """
    original_amount = Decimal(str(raw_dynamic_total)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    current_payable = original_amount

    applied_pass = None
    pass_discount_amount = Decimal('0.00')
    pass_status_info = None

    applied_membership = None
    membership_discount_amount = Decimal('0.00')
    membership_status_info = None

    validated_points = 0
    points_discount_amount = Decimal('0.00')
    points_status_info = None

    now = timezone.now()

    # --------------------------------------------------------------------------
    # 1. MONTHLY PARKING PASS EVALUATION
    # --------------------------------------------------------------------------
    candidate_pass = None
    if requested_pass_id:
        candidate_pass = MonthlyPass.objects.filter(pk=requested_pass_id, user=user).first()
    elif user and user.is_authenticated:
        # Auto-check for active pass linked to this user and vehicle plate
        clean_plate = vehicle_number.strip().upper()
        candidate_pass = MonthlyPass.objects.filter(
            user=user,
            vehicle_license_plate=clean_plate,
            status=MonthlyPass.STATUS_ACTIVE,
            start_date__lte=start_time,
            end_date__gte=end_time,
        ).first()

    if candidate_pass:
        is_valid, msg = candidate_pass.is_valid_for_booking(
            lot=lot,
            vehicle_number=vehicle_number,
            start_time=start_time,
            end_time=end_time
        )
        if is_valid:
            # Check conflicting overlapping bookings using this pass
            conflicting_booking = Booking.objects.filter(
                monthly_pass=candidate_pass,
                status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE, Booking.STATUS_PENDING],
                start_time__lt=end_time,
                end_time__gt=start_time,
            ).exists()

            if conflicting_booking:
                pass_status_info = {
                    'applied': False,
                    'pass_code': candidate_pass.pass_code,
                    'reason': 'Conflicting active booking already exists using this monthly pass for the requested interval.'
                }
            else:
                applied_pass = candidate_pass
                if candidate_pass.pass_type == MonthlyPass.PASS_TYPE_FULL:
                    pass_discount_amount = current_payable
                    current_payable = Decimal('0.00')
                else:
                    pct = Decimal(str(candidate_pass.discount_percent)) / Decimal('100.00')
                    pass_discount_amount = (current_payable * pct).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    current_payable = max(Decimal('0.00'), current_payable - pass_discount_amount)

                pass_status_info = {
                    'applied': True,
                    'pass_id': candidate_pass.id,
                    'pass_code': candidate_pass.pass_code,
                    'pass_type': candidate_pass.pass_type,
                    'discount_amount': float(pass_discount_amount),
                    'remaining_usage': candidate_pass.max_bookings - candidate_pass.usage_count if candidate_pass.max_bookings > 0 else 'unlimited',
                }
        else:
            pass_status_info = {
                'applied': False,
                'pass_code': candidate_pass.pass_code,
                'reason': msg,
            }

    # --------------------------------------------------------------------------
    # 2. CUSTOMER MEMBERSHIP DISCOUNT EVALUATION (If balance remaining)
    # --------------------------------------------------------------------------
    if current_payable > Decimal('0.00') and user and user.is_authenticated:
        candidate_sub = None
        if requested_membership_id:
            candidate_sub = CustomerMembership.objects.filter(pk=requested_membership_id, user=user).first()
        else:
            # Pick the user's active membership with the best discount
            candidate_sub = CustomerMembership.objects.filter(
                user=user,
                status=CustomerMembership.STATUS_ACTIVE,
                start_date__lte=now,
                end_date__gte=now,
            ).select_related('plan').order_by('-plan__discount_value').first()

        if candidate_sub:
            plan = candidate_sub.plan
            if not candidate_sub.is_currently_valid():
                membership_status_info = {
                    'applied': False,
                    'plan_name': plan.name,
                    'reason': 'Membership is expired or maximum usage limit reached.'
                }
            elif plan.eligible_lots.exists() and not plan.eligible_lots.filter(pk=lot.pk).exists():
                membership_status_info = {
                    'applied': False,
                    'plan_name': plan.name,
                    'reason': f'Membership is not eligible for {lot.name}.'
                }
            elif plan.eligible_vehicle_types != 'all' and plan.eligible_vehicle_types != vehicle_type:
                membership_status_info = {
                    'applied': False,
                    'plan_name': plan.name,
                    'reason': f'Membership is only eligible for {plan.get_eligible_vehicle_types_display()} vehicles.'
                }
            elif original_amount < plan.min_booking_amount:
                membership_status_info = {
                    'applied': False,
                    'plan_name': plan.name,
                    'reason': f'Booking total does not meet minimum membership requirement of ₹{plan.min_booking_amount}.'
                }
            else:
                # Calculate discount
                if plan.discount_type == MembershipPlan.DISCOUNT_PERCENTAGE:
                    pct = Decimal(str(plan.discount_value)) / Decimal('100.00')
                    calculated_disc = (current_payable * pct).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    if plan.max_discount_per_booking and calculated_disc > plan.max_discount_per_booking:
                        calculated_disc = plan.max_discount_per_booking
                else:
                    calculated_disc = min(current_payable, Decimal(str(plan.discount_value)))

                membership_discount_amount = min(current_payable, calculated_disc)
                current_payable = max(Decimal('0.00'), current_payable - membership_discount_amount)
                applied_membership = candidate_sub

                membership_status_info = {
                    'applied': True,
                    'membership_id': candidate_sub.id,
                    'plan_name': plan.name,
                    'discount_type': plan.discount_type,
                    'discount_value': float(plan.discount_value),
                    'discount_amount': float(membership_discount_amount),
                    'remaining_usage': candidate_sub.remaining_usage,
                }

    # --------------------------------------------------------------------------
    # 3. LOYALTY POINTS REDEMPTION EVALUATION
    # --------------------------------------------------------------------------
    if current_payable > Decimal('0.00') and points_to_redeem and points_to_redeem > 0 and user and user.is_authenticated:
        config = LoyaltyProgramConfig.get_config()
        if not config.is_enabled:
            points_status_info = {'applied': False, 'reason': 'Loyalty program is currently disabled.'}
        elif points_to_redeem < config.min_points_to_redeem:
            points_status_info = {
                'applied': False,
                'reason': f'Minimum {config.min_points_to_redeem} points required for redemption.'
            }
        else:
            account = get_or_create_loyalty_account(user)
            available_balance = account.points_balance

            if available_balance < points_to_redeem:
                points_status_info = {
                    'applied': False,
                    'reason': f'Insufficient points. You requested {points_to_redeem} points but balance is {available_balance}.'
                }
            else:
                # Calculate max allowed discount percentage on current_payable
                max_pct = Decimal(str(config.max_redemption_percentage)) / Decimal('100.00')
                max_allowed_discount = (current_payable * max_pct).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                rate = Decimal(str(config.points_redemption_rate))

                # Max points that can be converted
                max_points_from_cap = int(max_allowed_discount / rate)
                actual_points_to_use = min(points_to_redeem, available_balance, max_points_from_cap)

                if actual_points_to_use > 0:
                    disc = (Decimal(str(actual_points_to_use)) * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    disc = min(current_payable, disc)
                    validated_points = actual_points_to_use
                    points_discount_amount = disc
                    current_payable = max(Decimal('0.00'), current_payable - points_discount_amount)

                    points_status_info = {
                        'applied': True,
                        'points_redeemed': validated_points,
                        'discount_amount': float(points_discount_amount),
                        'remaining_balance_after': available_balance - validated_points,
                    }
                else:
                    points_status_info = {
                        'applied': False,
                        'reason': 'Points redemption cap reached for this booking amount.'
                    }

    final_payable = current_payable.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    benefits_breakdown = {
        'original_total': float(original_amount),
        'pass_status': pass_status_info,
        'pass_discount_amount': float(pass_discount_amount),
        'membership_status': membership_status_info,
        'membership_discount_amount': float(membership_discount_amount),
        'points_status': points_status_info,
        'points_discount_amount': float(points_discount_amount),
        'total_discounts': float(pass_discount_amount + membership_discount_amount + points_discount_amount),
        'final_payable_amount': float(final_payable),
    }

    return (
        final_payable,
        benefits_breakdown,
        applied_pass,
        applied_membership,
        validated_points,
        points_discount_amount
    )


def award_booking_loyalty_points(booking, payment_amount=None):
    """
    Awards loyalty points for an eligible, verified paid booking.
    Protected by idempotency keys against duplicate awards.
    """
    config = LoyaltyProgramConfig.get_config()
    if not config.is_enabled:
        return 0

    user = booking.user
    paid_amt = payment_amount if payment_amount is not None else booking.amount
    paid_amt = Decimal(str(paid_amt))

    if paid_amt < config.min_spending_to_earn:
        return 0

    ref_id = f"EARN-BOOKING-{booking.booking_id}"
    if LoyaltyTransaction.objects.filter(reference_id=ref_id).exists():
        # Already awarded
        return 0

    # Calculate points earned (floor of amount * points_per_currency_unit)
    points_to_add = int(paid_amt * Decimal(str(config.points_per_currency_unit)))
    if points_to_add <= 0:
        return 0

    with transaction.atomic():
        # Re-check idempotency inside lock
        if LoyaltyTransaction.objects.filter(reference_id=ref_id).exists():
            return 0

        account, _ = LoyaltyAccount.objects.select_for_update().get_or_create(
            user=user,
            defaults={'points_balance': 0, 'lifetime_earned': 0, 'lifetime_redeemed': 0, 'tier': 'Bronze'}
        )

        account.points_balance += points_to_add
        account.lifetime_earned += points_to_add
        account.recalculate_tier()
        account.save(update_fields=['points_balance', 'lifetime_earned', 'tier', 'updated_at'])

        txn = LoyaltyTransaction.objects.create(
            account=account,
            transaction_type=LoyaltyTransaction.TYPE_EARNED,
            points=points_to_add,
            balance_after=account.points_balance,
            booking=booking,
            reference_id=ref_id,
            description=f"Earned {points_to_add} points for completed reservation #{str(booking.booking_id)[:8]} (₹{paid_amt})",
        )

        booking.points_awarded = points_to_add
        booking.save(update_fields=['points_awarded'])

        # Feature 6: Trigger loyalty points earned notification & email
        notify_loyalty_transaction(account, txn)

    return points_to_add


def reverse_booking_loyalty_and_benefits(booking):
    """
    Reverses or refunds points and benefits when a booking is cancelled:
    - Refunds redeemed points back to customer.
    - Reverses points earned on this booking.
    - Decrements monthly pass / membership usage counts.
    """
    user = booking.user
    with transaction.atomic():
        account, _ = LoyaltyAccount.objects.select_for_update().get_or_create(
            user=user,
            defaults={'points_balance': 0, 'lifetime_earned': 0, 'lifetime_redeemed': 0, 'tier': 'Bronze'}
        )

        # 1. Reverse earned points
        if booking.points_awarded > 0:
            earn_ref = f"REV-EARN-{booking.booking_id}"
            if not LoyaltyTransaction.objects.filter(reference_id=earn_ref).exists():
                deduct = min(account.points_balance, booking.points_awarded)
                account.points_balance -= deduct
                account.lifetime_earned = max(0, account.lifetime_earned - deduct)
                account.recalculate_tier()
                account.save(update_fields=['points_balance', 'lifetime_earned', 'tier', 'updated_at'])

                rev_txn = LoyaltyTransaction.objects.create(
                    account=account,
                    transaction_type=LoyaltyTransaction.TYPE_REVERSED,
                    points=-deduct,
                    balance_after=account.points_balance,
                    booking=booking,
                    reference_id=earn_ref,
                    description=f"Reversed {deduct} points due to cancelled booking #{str(booking.booking_id)[:8]}",
                )
                notify_loyalty_transaction(account, rev_txn)

        # 2. Refund redeemed points back
        if booking.points_redeemed > 0:
            refund_ref = f"REF-REDEEM-{booking.booking_id}"
            if not LoyaltyTransaction.objects.filter(reference_id=refund_ref).exists():
                account.points_balance += booking.points_redeemed
                account.lifetime_redeemed = max(0, account.lifetime_redeemed - booking.points_redeemed)
                account.save(update_fields=['points_balance', 'lifetime_redeemed', 'updated_at'])

                ref_txn = LoyaltyTransaction.objects.create(
                    account=account,
                    transaction_type=LoyaltyTransaction.TYPE_REFUNDED,
                    points=booking.points_redeemed,
                    balance_after=account.points_balance,
                    booking=booking,
                    reference_id=refund_ref,
                    description=f"Refunded {booking.points_redeemed} redeemed points for cancelled booking #{str(booking.booking_id)[:8]}",
                )
                notify_loyalty_transaction(account, ref_txn)

        # 3. Restore Pass usage
        if booking.monthly_pass:
            pass_obj = MonthlyPass.objects.select_for_update().get(pk=booking.monthly_pass.pk)
            pass_obj.usage_count = max(0, pass_obj.usage_count - 1)
            pass_obj.save(update_fields=['usage_count'])

        # 4. Restore Membership usage
        if booking.membership:
            mem_obj = CustomerMembership.objects.select_for_update().get(pk=booking.membership.pk)
            mem_obj.usage_count = max(0, mem_obj.usage_count - 1)
            mem_obj.save(update_fields=['usage_count'])
