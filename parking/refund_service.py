import logging
import uuid
from decimal import Decimal
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone

from .models import (
    Booking, Payment, RefundRequest, RefundTransaction, RefundAuditLog,
    PaymentDispute, DisputeMessage, DisputeAuditLog
)
from .notification_service import (
    notify_refund_submitted,
    notify_refund_status_changed,
    notify_refund_completed,
    notify_dispute_submitted,
    notify_dispute_reply,
    notify_dispute_resolved,
)

logger = logging.getLogger(__name__)
User = get_user_model()


# ==============================================================================
# REFUND ELIGIBILITY & COMPUTATION HELPERS
# ==============================================================================

def get_remaining_refundable_amount(booking, exclude_refund_id=None):
    """
    Computes remaining refundable amount for a given booking.
    Formula: Paid Amount - Sum(Approved, Completed, Requested, Under Review, or Processing Refunds).
    Excludes Rejected, Cancelled, and Failed refunds.
    """
    if not hasattr(booking, 'payment') or booking.payment.status != 'success':
        return Decimal('0.00')

    paid_amount = booking.payment.amount

    qs = RefundRequest.objects.filter(booking=booking).exclude(
        status__in=[
            RefundRequest.STATUS_REJECTED,
            RefundRequest.STATUS_CANCELLED,
            RefundRequest.STATUS_FAILED,
        ]
    )
    if exclude_refund_id:
        qs = qs.exclude(refund_id=exclude_refund_id)

    allocated_refunds = qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    remaining = paid_amount - allocated_refunds
    return max(Decimal('0.00'), remaining)


def get_eligible_bookings_for_refund(user):
    """
    Returns list of bookings belonging to user that have successful payments
    and a positive remaining refundable balance.
    """
    bookings = Booking.objects.filter(
        user=user,
        payment__status='success'
    ).select_related('slot__lot', 'payment').order_by('-created_at')

    eligible_list = []
    for b in bookings:
        remaining = get_remaining_refundable_amount(b)
        if remaining > Decimal('0.00'):
            eligible_list.append({
                'booking_id': str(b.booking_id),
                'lot_name': b.slot.lot.name if b.slot and b.slot.lot else 'Unknown Lot',
                'slot_number': b.slot.slot_number if b.slot else '',
                'vehicle_number': b.vehicle_number,
                'start_time': b.start_time.isoformat() if b.start_time else '',
                'end_time': b.end_time.isoformat() if b.end_time else '',
                'booking_status': b.status,
                'booking_status_display': b.get_status_display(),
                'paid_amount': float(b.payment.amount),
                'remaining_refundable': float(remaining),
                'payment_method': b.payment.method,
                'payment_method_display': b.payment.get_method_display(),
                'payment_transaction_id': b.payment.transaction_id,
                'paid_at': b.payment.paid_at.isoformat() if b.payment.paid_at else '',
            })
    return eligible_list


# ==============================================================================
# REFUND REQUEST OPERATIONS
# ==============================================================================

def create_refund_request(user, booking_id, amount, reason, explanation='', attachment=None):
    """
    Creates a new customer refund request.
    Validates ownership, paid payment presence, positive amount, and remaining balance.
    Enforces idempotency and logs audit history.
    """
    booking = Booking.objects.filter(booking_id=booking_id, user=user).select_related('payment').first()
    if not booking:
        raise ValidationError('Booking not found or does not belong to your account.')

    if not hasattr(booking, 'payment') or booking.payment.status != 'success':
        raise ValidationError('This booking has no successful payment eligible for a refund.')

    try:
        req_amount = Decimal(str(amount))
    except Exception:
        raise ValidationError('Invalid refund amount.')

    if req_amount <= Decimal('0.00'):
        raise ValidationError('Refund amount must be strictly greater than zero.')

    with transaction.atomic():
        # Lock booking to prevent concurrent double submissions
        b = Booking.objects.select_for_update().get(pk=booking.pk)
        remaining = get_remaining_refundable_amount(b)

        if remaining <= Decimal('0.00'):
            raise ValidationError('This booking has already been fully refunded or has a pending refund request.')

        if req_amount > remaining:
            raise ValidationError(f'Requested refund amount ₹{req_amount} exceeds maximum eligible amount of ₹{remaining}.')

        refund_req = RefundRequest.objects.create(
            user=user,
            booking=b,
            payment=b.payment,
            amount=req_amount,
            reason=reason,
            explanation=explanation,
            attachment=attachment,
            status=RefundRequest.STATUS_REQUESTED,
        )

        RefundAuditLog.objects.create(
            refund_request=refund_req,
            performed_by=user,
            action='created',
            old_status='',
            new_status=RefundRequest.STATUS_REQUESTED,
            notes=f'Refund request created for ₹{req_amount}. Reason: {refund_req.get_reason_display()}',
        )

        # Feature 6 notification trigger
        notify_refund_submitted(refund_req)

    return refund_req


def update_refund_status(refund_req, new_status, performed_by, notes='', rejection_reason='', approved_amount=None):
    """
    Performs validated status transition on a RefundRequest.
    Ensures role permissions, validates mandatory rejection reason, and audits transition.
    """
    is_staff = performed_by.is_staff or performed_by.is_superuser

    with transaction.atomic():
        req = RefundRequest.objects.select_for_update().get(pk=refund_req.pk)
        old_status = req.status

        if not req.can_transition_to(new_status, is_staff=is_staff):
            raise ValidationError(
                f'Invalid status transition from "{req.get_status_display()}" to "{new_status}". '
                f'Operation not permitted for your user role.'
            )

        if new_status == RefundRequest.STATUS_REJECTED:
            if not rejection_reason or not rejection_reason.strip():
                raise ValidationError('A mandatory rejection reason is required when rejecting a refund request.')
            req.rejection_reason = rejection_reason.strip()

        if new_status == RefundRequest.STATUS_APPROVED:
            if approved_amount is not None:
                try:
                    appr_dec = Decimal(str(approved_amount))
                    if appr_dec <= Decimal('0.00') or appr_dec > req.amount:
                        raise ValidationError(f'Approved amount must be between ₹0.01 and requested ₹{req.amount}.')
                    req.approved_amount = appr_dec
                except Exception:
                    raise ValidationError('Invalid approved amount.')
            else:
                req.approved_amount = req.amount

        if new_status == RefundRequest.STATUS_UNDER_REVIEW:
            req.reviewed_by = performed_by
            req.reviewed_at = timezone.now()

        if notes:
            if is_staff:
                req.admin_notes = notes.strip()
            else:
                req.customer_notes = notes.strip()

        req.status = new_status
        req.save()

        RefundAuditLog.objects.create(
            refund_request=req,
            performed_by=performed_by,
            action='status_updated',
            old_status=old_status,
            new_status=new_status,
            notes=notes or rejection_reason,
        )

        # Notify customer of status change
        notify_refund_status_changed(req, old_status, new_status)

        # If approved and admin requested auto-processing or moved directly to processing
        if new_status == RefundRequest.STATUS_PROCESSING:
            process_refund_execution(req, performed_by)

    return req


def customer_provide_additional_info(refund_req, customer_user, notes, attachment=None):
    """
    Allows customer to respond when refund status is 'info_required'.
    Transitions status back to 'under_review'.
    """
    if refund_req.user != customer_user:
        raise ValidationError('Permission denied.')

    if refund_req.status != RefundRequest.STATUS_INFO_REQUIRED:
        raise ValidationError('This refund request is not currently awaiting additional information.')

    if not notes or not notes.strip():
        raise ValidationError('Explanation notes are required.')

    with transaction.atomic():
        req = RefundRequest.objects.select_for_update().get(pk=refund_req.pk)
        old_status = req.status
        req.customer_notes = notes.strip()
        if attachment:
            req.attachment = attachment
        req.status = RefundRequest.STATUS_UNDER_REVIEW
        req.save()

        RefundAuditLog.objects.create(
            refund_request=req,
            performed_by=customer_user,
            action='info_provided',
            old_status=old_status,
            new_status=req.status,
            notes=f'Customer provided additional info: {notes.strip()[:100]}',
        )

        notify_refund_status_changed(req, old_status, req.status)

    return req


def customer_cancel_refund_request(refund_req, customer_user, reason=''):
    """
    Allows customer to cancel their own pending refund request if not yet approved.
    """
    if refund_req.user != customer_user and not (customer_user.is_staff or customer_user.is_superuser):
        raise ValidationError('Permission denied.')

    if refund_req.status not in (RefundRequest.STATUS_REQUESTED, RefundRequest.STATUS_INFO_REQUIRED):
        raise ValidationError('This refund request cannot be cancelled at its current status.')

    return update_refund_status(
        refund_req,
        new_status=RefundRequest.STATUS_CANCELLED,
        performed_by=customer_user,
        notes=f'Cancelled by user. {reason}'.strip()
    )


# ==============================================================================
# REFUND PROCESSING ENGINE (SIMULATED & GATEWAY INTEGRATION)
# ==============================================================================

def process_refund_execution(refund_req, performed_by, is_simulation=True):
    """
    Executes the refund transaction.
    Uses atomic DB locking and idempotency to prevent duplicate refunds.
    Explicitly tracks simulation flag vs real gateway provider to ensure transparency.
    """
    with transaction.atomic():
        req = RefundRequest.objects.select_for_update().get(pk=refund_req.pk)

        # Idempotency check: if transaction already exists and completed, return it
        if hasattr(req, 'transaction') and req.transaction.status == RefundTransaction.STATUS_COMPLETED:
            logger.info(f"Refund {req.refund_id} already has completed transaction {req.transaction.transaction_reference}.")
            return req.transaction

        if req.status not in (RefundRequest.STATUS_APPROVED, RefundRequest.STATUS_PROCESSING):
            raise ValidationError(
                f'Refund request must be in Approved or Processing status to execute. Current status: "{req.get_status_display()}".'
            )

        refund_amount = req.approved_amount or req.amount

        # Re-verify that total refunds do not exceed paid amount
        remaining = get_remaining_refundable_amount(req.booking, exclude_refund_id=req.refund_id)
        if refund_amount > remaining:
            req.status = RefundRequest.STATUS_FAILED
            req.save(update_fields=['status'])
            RefundAuditLog.objects.create(
                refund_request=req,
                performed_by=performed_by,
                action='failed',
                old_status='processing',
                new_status=RefundRequest.STATUS_FAILED,
                notes=f'Execution failed: Approved amount ₹{refund_amount} exceeds remaining eligible ₹{remaining}.'
            )
            notify_refund_status_changed(req, 'processing', RefundRequest.STATUS_FAILED)
            raise ValidationError('Refund amount exceeds remaining paid balance.')

        # Generate unique documented simulation transaction reference
        today_str = timezone.now().strftime('%Y%m%d')
        rand_hex = uuid.uuid4().hex[:8].upper()
        txn_ref = f"REF-SIM-{today_str}-{rand_hex}"

        gateway_resp = {
            'status': 'SUCCESS',
            'gateway': 'SIMULATED_GATEWAY_V1',
            'is_simulation': True,
            'message': 'Simulated sandbox refund processed successfully. Not an actual banking settlement.',
            'original_payment_ref': req.payment.transaction_id,
            'refund_reference': txn_ref,
            'amount': str(refund_amount),
            'currency': 'INR',
            'channel': req.payment.method,
            'timestamp': timezone.now().isoformat(),
        }

        # Create or update RefundTransaction
        refund_txn, created = RefundTransaction.objects.update_or_create(
            refund_request=req,
            defaults={
                'transaction_reference': txn_ref,
                'original_payment_reference': req.payment.transaction_id,
                'amount': refund_amount,
                'payment_channel': req.payment.method,
                'status': RefundTransaction.STATUS_COMPLETED,
                'is_simulation': is_simulation,
                'gateway_provider': 'Simulated Payment Provider (Test Mode)',
                'gateway_response': gateway_resp,
                'processed_by': performed_by,
            }
        )

        req.status = RefundRequest.STATUS_COMPLETED
        req.save(update_fields=['status'])

        RefundAuditLog.objects.create(
            refund_request=req,
            performed_by=performed_by,
            action='completed',
            old_status='processing',
            new_status=RefundRequest.STATUS_COMPLETED,
            notes=f'Simulated refund of ₹{refund_amount} completed successfully. Reference: {txn_ref}',
        )

        notify_refund_completed(req, refund_txn)

    return refund_txn


# ==============================================================================
# PAYMENT DISPUTE OPERATIONS
# ==============================================================================

def create_payment_dispute(
    user,
    category,
    subject,
    description,
    booking_id=None,
    payment_reference='',
    disputed_amount=None,
    attachment=None,
    linked_refund_id=None
):
    """
    Creates a payment dispute raised by customer.
    Links optional booking, payment, and refund request if found.
    """
    booking = None
    payment = None
    refund_req = None

    if booking_id:
        booking = Booking.objects.filter(booking_id=booking_id).first()
        if booking and hasattr(booking, 'payment'):
            payment = booking.payment

    if linked_refund_id:
        refund_req = RefundRequest.objects.filter(refund_id=linked_refund_id).first()

    if not payment and payment_reference:
        payment = Payment.objects.filter(transaction_id__iexact=payment_reference.strip()).first()
        if payment and not booking:
            booking = payment.booking

    dispute_dec = None
    if disputed_amount is not None:
        try:
            dispute_dec = Decimal(str(disputed_amount))
        except Exception:
            pass

    if not dispute_dec and booking:
        dispute_dec = booking.amount

    with transaction.atomic():
        dispute = PaymentDispute.objects.create(
            user=user,
            booking=booking,
            payment=payment,
            refund_request=refund_req,
            category=category,
            status=PaymentDispute.STATUS_OPENED,
            subject=subject.strip(),
            description=description.strip(),
            disputed_amount=dispute_dec,
            payment_reference=payment_reference.strip(),
            attachment=attachment,
        )

        DisputeAuditLog.objects.create(
            dispute=dispute,
            performed_by=user,
            action='opened',
            old_status='',
            new_status=PaymentDispute.STATUS_OPENED,
            notes=f'Dispute opened for: {dispute.get_category_display()}',
        )

        notify_dispute_submitted(dispute)

    return dispute


def add_dispute_message(dispute, sender, message, attachment=None, is_internal_note=False):
    """
    Adds a message/reply to a dispute thread.
    Validates internal note privileges (staff only).
    """
    is_staff = sender.is_staff or sender.is_superuser

    if is_internal_note and not is_staff:
        raise ValidationError('Only staff members can post internal notes.')

    if not is_staff and dispute.user != sender:
        raise ValidationError('Permission denied.')

    if not message or not message.strip():
        raise ValidationError('Message cannot be empty.')

    with transaction.atomic():
        msg = DisputeMessage.objects.create(
            dispute=dispute,
            sender=sender,
            message=message.strip(),
            attachment=attachment,
            is_internal_note=is_internal_note,
        )

        # If customer replied while dispute was 'info_requested', move back to 'under_investigation'
        if not is_staff and dispute.status == PaymentDispute.STATUS_INFO_REQUESTED:
            old_s = dispute.status
            dispute.status = PaymentDispute.STATUS_UNDER_INVESTIGATION
            dispute.save(update_fields=['status'])
            DisputeAuditLog.objects.create(
                dispute=dispute,
                performed_by=sender,
                action='customer_replied',
                old_status=old_s,
                new_status=PaymentDispute.STATUS_UNDER_INVESTIGATION,
                notes='Customer provided evidence/reply.'
            )

        if not is_internal_note:
            notify_dispute_reply(dispute, msg)

    return msg


def update_dispute_status(dispute, new_status, performed_by, resolution_summary='', linked_refund_id=None):
    """
    Updates the status and resolution summary of a payment dispute.
    Optionally links an approved or existing refund request.
    """
    if not (performed_by.is_staff or performed_by.is_superuser):
        raise ValidationError('Only staff members can update dispute status.')

    if new_status not in dict(PaymentDispute.STATUS_CHOICES):
        raise ValidationError(f'Invalid status "{new_status}".')

    with transaction.atomic():
        disp = PaymentDispute.objects.select_for_update().get(pk=dispute.pk)
        old_status = disp.status

        disp.status = new_status
        if resolution_summary:
            disp.resolution_summary = resolution_summary.strip()

        if new_status in (PaymentDispute.STATUS_RESOLVED, PaymentDispute.STATUS_CLOSED):
            disp.resolved_at = timezone.now()

        if linked_refund_id:
            rf = RefundRequest.objects.filter(refund_id=linked_refund_id).first()
            if rf:
                disp.refund_request = rf

        disp.save()

        DisputeAuditLog.objects.create(
            dispute=disp,
            performed_by=performed_by,
            action='status_updated',
            old_status=old_status,
            new_status=new_status,
            notes=resolution_summary,
        )

        if new_status == PaymentDispute.STATUS_RESOLVED:
            notify_dispute_resolved(disp)
        elif new_status == PaymentDispute.STATUS_INFO_REQUESTED:
            notify_dispute_reply(
                disp,
                DisputeMessage(
                    dispute=disp,
                    sender=performed_by,
                    message=f"Additional evidence requested: {resolution_summary}",
                    is_internal_note=False
                )
            )

    return disp


def assign_dispute_staff(dispute, staff_user, performed_by):
    """
    Assigns a payment dispute to a specific staff user.
    """
    if not (performed_by.is_staff or performed_by.is_superuser):
        raise ValidationError('Only staff/admin can assign disputes.')

    with transaction.atomic():
        disp = PaymentDispute.objects.select_for_update().get(pk=dispute.pk)
        old_staff = disp.assigned_to
        disp.assigned_to = staff_user
        disp.save(update_fields=['assigned_to'])

        DisputeAuditLog.objects.create(
            dispute=disp,
            performed_by=performed_by,
            action='assigned',
            old_status=old_staff.username if old_staff else 'Unassigned',
            new_status=staff_user.username if staff_user else 'Unassigned',
            notes=f'Dispute assigned to {staff_user.username if staff_user else "none"}.'
        )

    return disp

