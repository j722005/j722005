import logging
from decimal import Decimal
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .models import (
    Notification, AdminAnnouncement, Booking,
    CustomerMembership, MonthlyPass, LoyaltyTransaction
)

logger = logging.getLogger(__name__)
User = get_user_model()


def send_email_alert(user, subject, message, link=None):
    """
    Sends an email alert to the user if SMTP is configured.
    Gracefully handles missing configuration or network/SMTP errors.
    Returns (success: bool, error_msg: str).
    """
    host = getattr(settings, 'EMAIL_HOST', '')
    if not host or not host.strip():
        return False, "SMTP is not configured (EMAIL_HOST empty). In-app notification delivered."

    user_email = getattr(user, 'email', '')
    if not user_email or not user_email.strip():
        return False, "User has no email address configured."

    try:
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
        full_message = f"Hello {user.first_name or user.username},\n\n{message}\n"
        if link:
            full_message += f"\nView details in Smart Parking: {frontend_url}{link}\n"
        full_message += "\n--\nSmart Parking Management System\nThis is an automated notification."

        send_mail(
            subject=f"[Smart Parking] {subject}",
            message=full_message,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@smartparking.local'),
            recipient_list=[user_email],
            fail_silently=False,
        )
        return True, ""
    except Exception as exc:
        logger.warning(f"Failed to send email alert to {user_email}: {exc}")
        return False, str(exc)


def create_notification(
    user,
    title,
    message,
    category=Notification.CATEGORY_SYSTEM,
    notification_type=Notification.TYPE_INFO,
    link='',
    dedup_key=None,
    metadata=None,
    send_email=True
):
    """
    Centralized factory for creating user notifications.
    Supports deduplication, metadata, linking, and optional email dispatch.
    """
    if metadata is None:
        metadata = {}

    # Deduplication check
    if dedup_key:
        existing = Notification.objects.filter(user=user, dedup_key=dedup_key).first()
        if existing:
            return existing

    email_sent = False
    email_error = ""

    if send_email:
        email_sent, email_error = send_email_alert(user, title, message, link=link)

    with transaction.atomic():
        notif = Notification.objects.create(
            user=user,
            title=title,
            message=message,
            category=category,
            notification_type=notification_type,
            link=link or '',
            dedup_key=dedup_key,
            metadata=metadata,
            email_sent=email_sent,
            email_error=email_error or '',
        )

    return notif


# ==============================================================================
# SPECIFIC EVENT TRIGGER HELPERS
# ==============================================================================

def notify_booking_confirmed(booking):
    """Triggered when a booking is confirmed (via payment or pass/benefit coverage)."""
    lot_name = booking.slot.lot.name if booking.slot and booking.slot.lot else 'Parking Lot'
    slot_num = booking.slot.slot_number if booking.slot else 'Slot'
    start_str = booking.start_time.strftime('%d %b %Y, %I:%M %p')
    end_str = booking.end_time.strftime('%I:%M %p')

    title = f"Booking Confirmed: {slot_num} @ {lot_name}"
    message = (
        f"Your parking reservation #{str(booking.booking_id)[:8]} is confirmed. "
        f"Assigned slot: {slot_num} ({lot_name}). "
        f"Window: {start_str} - {end_str}. Your Gate Pass QR code is ready."
    )
    return create_notification(
        user=booking.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_BOOKING,
        notification_type=Notification.TYPE_SUCCESS,
        link="/bookings",
        dedup_key=f"booking-confirmed-{booking.booking_id}",
        metadata={"booking_id": str(booking.booking_id), "amount": float(booking.amount)},
        send_email=True,
    )


def notify_booking_cancelled(booking, reason=''):
    """Triggered when a booking is cancelled."""
    lot_name = booking.slot.lot.name if booking.slot and booking.slot.lot else 'Parking Lot'
    slot_num = booking.slot.slot_number if booking.slot else 'Slot'

    title = f"Booking Cancelled: {slot_num} @ {lot_name}"
    reason_text = f" Reason: {reason}." if reason else ""
    message = (
        f"Your parking reservation #{str(booking.booking_id)[:8]} at {lot_name} ({slot_num}) "
        f"has been cancelled.{reason_text} Any loyalty points or eligible refunds have been processed."
    )
    return create_notification(
        user=booking.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_BOOKING,
        notification_type=Notification.TYPE_WARNING,
        link="/bookings",
        dedup_key=f"booking-cancelled-{booking.booking_id}",
        metadata={"booking_id": str(booking.booking_id)},
        send_email=True,
    )


def notify_payment_success(payment):
    """Triggered when a payment succeeds."""
    booking = getattr(payment, 'booking', None)
    title = f"Payment Successful: ₹{payment.amount}"
    method_str = payment.get_method_display() if hasattr(payment, 'get_method_display') else payment.method.upper()
    booking_ref = f" for Booking #{str(booking.booking_id)[:8]}" if booking else ""
    message = (
        f"Your payment of ₹{payment.amount} via {method_str} was completed successfully{booking_ref}. "
        f"Transaction Reference: {payment.transaction_id}."
    )
    user = booking.user if booking else None
    if not user:
        return None

    return create_notification(
        user=user,
        title=title,
        message=message,
        category=Notification.CATEGORY_PAYMENT,
        notification_type=Notification.TYPE_SUCCESS,
        link="/bookings",
        dedup_key=f"payment-success-{payment.transaction_id}",
        metadata={"transaction_id": payment.transaction_id, "amount": float(payment.amount)},
        send_email=True,
    )


def notify_payment_failed(user, amount, method, reason='', booking=None):
    """Triggered when a payment attempt fails."""
    title = "Payment Failed"
    booking_ref = f" for Booking #{str(booking.booking_id)[:8]}" if booking else ""
    message = (
        f"Your payment of ₹{amount} via {method.upper()}{booking_ref} could not be processed. "
        f"{reason or 'Please check your payment method and try again.'}"
    )
    now_min = int(timezone.now().timestamp() // 60)
    return create_notification(
        user=user,
        title=title,
        message=message,
        category=Notification.CATEGORY_PAYMENT,
        notification_type=Notification.TYPE_DANGER,
        link="/bookings",
        dedup_key=f"payment-failed-{user.id}-{booking.booking_id if booking else now_min}",
        metadata={"amount": float(amount), "reason": reason},
        send_email=True,
    )


def notify_hold_expired(booking):
    """Triggered when a 10-minute reservation hold expires."""
    lot_name = booking.slot.lot.name if booking.slot and booking.slot.lot else 'Parking Lot'
    slot_num = booking.slot.slot_number if booking.slot else 'Slot'

    title = f"Payment Hold Expired: Slot {slot_num}"
    message = (
        f"Your temporary 10-minute hold for Slot {slot_num} at {lot_name} has expired. "
        f"The slot has been released back into available inventory."
    )
    return create_notification(
        user=booking.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_HOLD_EXPIRY,
        notification_type=Notification.TYPE_WARNING,
        link="/lots",
        dedup_key=f"hold-expired-{booking.booking_id}",
        metadata={"booking_id": str(booking.booking_id)},
        send_email=True,
    )


def notify_qr_checkin(booking):
    """Triggered when a customer pass is scanned for check-in at gate entry."""
    lot_name = booking.slot.lot.name if booking.slot and booking.slot.lot else 'Parking Lot'
    slot_num = booking.slot.slot_number if booking.slot else 'Slot'
    time_str = timezone.now().strftime('%I:%M %p')

    title = "Gate Entry Authorized (Check-In)"
    message = (
        f"Welcome! Vehicle {booking.vehicle_number} has checked in at {lot_name} (Slot {slot_num}) "
        f"at {time_str}. Barrier opened successfully."
    )
    return create_notification(
        user=booking.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_GATE_PASS,
        notification_type=Notification.TYPE_SUCCESS,
        link="/bookings",
        dedup_key=f"gate-in-{booking.booking_id}",
        metadata={"booking_id": str(booking.booking_id), "status": "active"},
        send_email=True,
    )


def notify_qr_checkout(booking):
    """Triggered when a customer pass is scanned for check-out at gate exit."""
    lot_name = booking.slot.lot.name if booking.slot and booking.slot.lot else 'Parking Lot'
    time_str = timezone.now().strftime('%I:%M %p')

    title = "Gate Exit Recorded (Check-Out)"
    message = (
        f"Vehicle {booking.vehicle_number} checked out from {lot_name} at {time_str}. "
        f"Thank you for parking with us! Your parking session is complete."
    )
    return create_notification(
        user=booking.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_GATE_PASS,
        notification_type=Notification.TYPE_INFO,
        link="/bookings",
        dedup_key=f"gate-out-{booking.booking_id}",
        metadata={"booking_id": str(booking.booking_id), "status": "completed"},
        send_email=True,
    )


def notify_membership_activated(membership):
    """Triggered when customer membership is activated upon payment."""
    plan_name = membership.plan.name
    end_str = membership.end_date.strftime('%d %b %Y') if membership.end_date else 'Active'

    title = f"Membership Activated: {plan_name}"
    message = (
        f"Your subscription to {plan_name} is active through {end_str}. "
        f"Enjoy discounted parking rates and priority bay allocations."
    )
    return create_notification(
        user=membership.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_MEMBERSHIP,
        notification_type=Notification.TYPE_SUCCESS,
        link="/memberships/my",
        dedup_key=f"mem-active-{membership.id}",
        metadata={"membership_id": membership.id, "plan": plan_name},
        send_email=True,
    )


def notify_membership_expired(membership):
    """Triggered when membership expires."""
    plan_name = membership.plan.name
    title = f"Membership Expired: {plan_name}"
    message = (
        f"Your {plan_name} subscription expired on {membership.end_date.strftime('%d %b %Y') if membership.end_date else 'today'}. "
        f"Renew your plan today to continue enjoying member benefits and discounts."
    )
    return create_notification(
        user=membership.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_MEMBERSHIP,
        notification_type=Notification.TYPE_WARNING,
        link="/memberships/plans",
        dedup_key=f"mem-expired-{membership.id}",
        metadata={"membership_id": membership.id},
        send_email=True,
    )


def notify_monthly_pass_activated(pass_obj):
    """Triggered when a monthly parking pass is purchased and activated."""
    end_str = pass_obj.end_date.strftime('%d %b %Y')
    lot_name = pass_obj.lot.name if pass_obj.lot else 'All Lots'

    title = f"Monthly Pass Issued: {pass_obj.pass_code}"
    message = (
        f"Monthly pass {pass_obj.pass_code} for vehicle {pass_obj.vehicle_license_plate} "
        f"is active until {end_str} at {lot_name}. Use this pass when reserving slots."
    )
    return create_notification(
        user=pass_obj.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_MONTHLY_PASS,
        notification_type=Notification.TYPE_SUCCESS,
        link="/passes",
        dedup_key=f"pass-active-{pass_obj.id}",
        metadata={"pass_code": pass_obj.pass_code, "vehicle": pass_obj.vehicle_license_plate},
        send_email=True,
    )


def notify_monthly_pass_expired(pass_obj):
    """Triggered when a monthly parking pass expires."""
    title = f"Monthly Pass Expired: {pass_obj.pass_code}"
    message = (
        f"Your monthly parking pass {pass_obj.pass_code} for vehicle {pass_obj.vehicle_license_plate} "
        f"expired on {pass_obj.end_date.strftime('%d %b %Y')}. Purchase a new pass to resume unlimited parking."
    )
    return create_notification(
        user=pass_obj.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_MONTHLY_PASS,
        notification_type=Notification.TYPE_WARNING,
        link="/passes",
        dedup_key=f"pass-expired-{pass_obj.id}",
        metadata={"pass_code": pass_obj.pass_code},
        send_email=True,
    )


def notify_loyalty_transaction(account, txn):
    """Triggered when loyalty points are earned, redeemed, reversed, or refunded."""
    type_display = txn.get_transaction_type_display() if hasattr(txn, 'get_transaction_type_display') else txn.transaction_type
    points_val = txn.points
    sign = "+" if points_val > 0 else ""
    title = f"Loyalty Update: {sign}{points_val} Points ({type_display})"
    message = (
        f"{sign}{points_val} points. {txn.description}. "
        f"Your new balance is {txn.balance_after} points ({account.tier} Tier)."
    )
    notif_type = Notification.TYPE_SUCCESS if points_val > 0 else Notification.TYPE_INFO
    return create_notification(
        user=account.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_LOYALTY,
        notification_type=notif_type,
        link="/rewards",
        dedup_key=f"loyalty-txn-{txn.reference_id}",
        metadata={"points": points_val, "balance": txn.balance_after, "tier": account.tier},
        send_email=True,
    )


def notify_ticket_created(ticket):
    """Triggered when a support complaint or inquiry ticket is submitted."""
    # 1. To customer
    create_notification(
        user=ticket.user,
        title=f"Support Ticket Opened: #{ticket.ticket_id}",
        message=f"We received your support request '{ticket.subject}'. Our support staff will review and respond shortly.",
        category=Notification.CATEGORY_SUPPORT,
        notification_type=Notification.TYPE_INFO,
        link=f"/support/{ticket.ticket_id}",
        dedup_key=f"ticket-created-user-{ticket.ticket_id}",
        metadata={"ticket_id": ticket.ticket_id},
        send_email=True,
    )

    # 2. To staff if assigned, or staff pool
    if ticket.assigned_to:
        create_notification(
            user=ticket.assigned_to,
            title=f"New Ticket Assigned: #{ticket.ticket_id}",
            message=f"You have been assigned ticket '{ticket.subject}' from {ticket.user.username}.",
            category=Notification.CATEGORY_SUPPORT,
            notification_type=Notification.TYPE_INFO,
            link=f"/support/{ticket.ticket_id}",
            dedup_key=f"ticket-assigned-staff-{ticket.ticket_id}-{ticket.assigned_to_id}",
            metadata={"ticket_id": ticket.ticket_id},
            send_email=True,
        )


def notify_ticket_status_change(ticket, old_status, new_status, changed_by=None):
    """Triggered when ticket status is changed."""
    status_display = ticket.get_status_display()
    title = f"Ticket Status Updated: #{ticket.ticket_id} ({status_display})"
    by_text = f" by {changed_by.username}" if changed_by else ""
    message = f"Your support ticket '{ticket.subject}' is now marked as '{status_display}'{by_text}."

    notif_type = Notification.TYPE_SUCCESS if new_status in ('resolved', 'closed') else Notification.TYPE_INFO

    return create_notification(
        user=ticket.user,
        title=title,
        message=message,
        category=Notification.CATEGORY_SUPPORT,
        notification_type=notif_type,
        link=f"/support/{ticket.ticket_id}",
        dedup_key=f"ticket-status-{ticket.ticket_id}-{new_status}-{int(timezone.now().timestamp() // 60)}",
        metadata={"ticket_id": ticket.ticket_id, "status": new_status},
        send_email=True,
    )


def notify_ticket_reply(message_obj):
    """Triggered when a reply is added to a support ticket."""
    ticket = message_obj.ticket
    sender = message_obj.sender

    # If sender is staff, notify customer
    if sender.is_staff or sender.is_superuser:
        if not message_obj.is_internal_note:
            return create_notification(
                user=ticket.user,
                title=f"Staff Replied to Ticket #{ticket.ticket_id}",
                message=f"Support agent {sender.first_name or sender.username} responded: \"{message_obj.message[:120]}...\"",
                category=Notification.CATEGORY_SUPPORT,
                notification_type=Notification.TYPE_INFO,
                link=f"/support/{ticket.ticket_id}",
                dedup_key=f"ticket-reply-{message_obj.id}",
                metadata={"ticket_id": ticket.ticket_id},
                send_email=True,
            )
    else:
        # Sender is customer -> notify assigned staff member if present
        if ticket.assigned_to and ticket.assigned_to != sender:
            return create_notification(
                user=ticket.assigned_to,
                title=f"Customer Replied to Ticket #{ticket.ticket_id}",
                message=f"User {sender.username} posted a reply on '{ticket.subject}'.",
                category=Notification.CATEGORY_SUPPORT,
                notification_type=Notification.TYPE_INFO,
                link=f"/support/{ticket.ticket_id}",
                dedup_key=f"ticket-reply-{message_obj.id}",
                metadata={"ticket_id": ticket.ticket_id},
                send_email=True,
            )
    return None


def broadcast_admin_announcement(announcement, sender_user):
    """
    Broadcasts an announcement created by an administrator to eligible users.
    Tracks total recipients and email delivery statistics.
    """
    role = announcement.target_role
    qs = User.objects.filter(is_active=True)

    if role == AdminAnnouncement.ROLE_CUSTOMER:
        qs = qs.filter(is_staff=False, is_superuser=False)
    elif role == AdminAnnouncement.ROLE_STAFF:
        qs = qs.filter(is_staff=True, is_superuser=False)
    elif role == AdminAnnouncement.ROLE_ADMIN:
        qs = qs.filter(is_superuser=True)

    users = list(qs)
    total = len(users)
    emails_sent = 0
    emails_failed = 0

    for u in users:
        notif = create_notification(
            user=u,
            title=f"Announcement: {announcement.title}",
            message=announcement.message,
            category=Notification.CATEGORY_ANNOUNCEMENT,
            notification_type=Notification.TYPE_INFO,
            link="/notifications",
            dedup_key=f"announcement-{announcement.id}-user-{u.id}",
            metadata={"announcement_id": announcement.id, "sender": sender_user.username},
            send_email=announcement.send_email,
        )
        if announcement.send_email:
            if notif.email_sent:
                emails_sent += 1
            else:
                emails_failed += 1

    announcement.total_recipients = total
    announcement.emails_sent = emails_sent
    announcement.emails_failed = emails_failed
    announcement.save(update_fields=['total_recipients', 'emails_sent', 'emails_failed'])

    return {
        'total_recipients': total,
        'emails_sent': emails_sent,
        'emails_failed': emails_failed,
    }


def run_expiry_checks():
    """
    Maintenance task to check and notify expired holds, memberships, and passes.
    Idempotent and safe to invoke frequently.
    """
    now = timezone.now()
    hold_minutes = getattr(settings, 'BOOKING_HOLD_MINUTES', 10)
    cutoff = now - timezone.timedelta(minutes=hold_minutes)

    # 1. Expire pending bookings past hold window
    expired_bookings = Booking.objects.filter(
        status=Booking.STATUS_PENDING,
        created_at__lte=cutoff
    )
    expired_count = 0
    for b in expired_bookings:
        b.status = Booking.STATUS_CANCELLED
        b.save(update_fields=['status'])
        from .loyalty_membership_service import reverse_booking_loyalty_and_benefits
        reverse_booking_loyalty_and_benefits(b)
        notify_hold_expired(b)
        expired_count += 1

    # 2. Expire active customer memberships
    expired_memberships = CustomerMembership.objects.filter(
        status=CustomerMembership.STATUS_ACTIVE,
        end_date__lt=now
    )
    expired_mem_count = 0
    for m in expired_memberships:
        m.status = CustomerMembership.STATUS_EXPIRED
        m.save(update_fields=['status'])
        notify_membership_expired(m)
        expired_mem_count += 1

    # 3. Expire active monthly passes
    expired_passes = MonthlyPass.objects.filter(
        status=MonthlyPass.STATUS_ACTIVE,
        end_date__lt=now
    )
    expired_pass_count = 0
    for p in expired_passes:
        p.status = MonthlyPass.STATUS_EXPIRED
        p.save(update_fields=['status'])
        notify_monthly_pass_expired(p)
        expired_pass_count += 1

    return {
        'expired_bookings_cancelled': expired_count,
        'expired_memberships': expired_mem_count,
        'expired_passes': expired_pass_count,
    }


# ==============================================================================
# FEATURE 8: REFUND & DISPUTE NOTIFICATION TRIGGERS
# ==============================================================================

def notify_refund_submitted(refund_req):
    """Triggered when a customer submits a refund request."""
    return create_notification(
        user=refund_req.user,
        title=f"Refund Request Submitted: #{refund_req.refund_id}",
        message=(
            f"Your refund request for ₹{refund_req.amount} on booking #{str(refund_req.booking.booking_id)[:8]} "
            f"has been submitted. Our billing team will review it shortly."
        ),
        category=Notification.CATEGORY_REFUND,
        notification_type=Notification.TYPE_INFO,
        link=f"/refunds",
        dedup_key=f"refund-submitted-{refund_req.refund_id}",
        metadata={
            "refund_id": refund_req.refund_id,
            "amount": float(refund_req.amount),
            "booking_id": str(refund_req.booking.booking_id)
        },
        send_email=True,
    )


def notify_refund_status_changed(refund_req, old_status, new_status):
    """Triggered when refund status transitions."""
    status_display = refund_req.get_status_display()
    notes = refund_req.admin_notes or refund_req.rejection_reason or ""

    type_map = {
        'under_review': (Notification.TYPE_INFO, "Under Review", "Your refund request is currently being reviewed by our finance team."),
        'info_required': (Notification.TYPE_WARNING, "Additional Information Required", f"Action required: Our team requested further info for your refund: {notes}"),
        'approved': (Notification.TYPE_SUCCESS, "Refund Approved", f"Your refund request for ₹{refund_req.approved_amount or refund_req.amount} has been approved and queued for processing."),
        'rejected': (Notification.TYPE_DANGER, "Refund Rejected", f"Your refund request was declined. Reason: {refund_req.rejection_reason or 'Eligibility criteria not met.'}"),
        'failed': (Notification.TYPE_DANGER, "Refund Processing Failed", f"Processing failed for refund #{refund_req.refund_id}. Our team is investigating."),
        'cancelled': (Notification.TYPE_INFO, "Refund Request Cancelled", f"Refund request #{refund_req.refund_id} has been cancelled."),
    }

    n_type, title_suffix, msg = type_map.get(
        new_status,
        (Notification.TYPE_INFO, status_display, f"Refund request #{refund_req.refund_id} updated to {status_display}.")
    )

    return create_notification(
        user=refund_req.user,
        title=f"Refund #{refund_req.refund_id}: {title_suffix}",
        message=msg,
        category=Notification.CATEGORY_REFUND,
        notification_type=n_type,
        link="/refunds",
        dedup_key=f"refund-status-{refund_req.refund_id}-{new_status}",
        metadata={"refund_id": refund_req.refund_id, "status": new_status},
        send_email=True,
    )


def notify_refund_completed(refund_req, refund_txn):
    """Triggered when refund transaction is executed and completed."""
    mode_text = "simulated transfer" if refund_txn.is_simulation else "payment gateway"
    return create_notification(
        user=refund_req.user,
        title=f"Refund Processed: ₹{refund_txn.amount}",
        message=(
            f"Your refund of ₹{refund_txn.amount} for booking #{str(refund_req.booking.booking_id)[:8]} "
            f"has been completed successfully via {refund_txn.payment_channel.upper()} ({mode_text}). "
            f"Transaction Ref: {refund_txn.transaction_reference}."
        ),
        category=Notification.CATEGORY_REFUND,
        notification_type=Notification.TYPE_SUCCESS,
        link="/refunds",
        dedup_key=f"refund-completed-{refund_req.refund_id}",
        metadata={
            "refund_id": refund_req.refund_id,
            "transaction_reference": refund_txn.transaction_reference,
            "amount": float(refund_txn.amount),
            "is_simulation": refund_txn.is_simulation,
        },
        send_email=True,
    )


def notify_dispute_submitted(dispute):
    """Triggered when a customer submits a payment dispute."""
    return create_notification(
        user=dispute.user,
        title=f"Payment Dispute Opened: #{dispute.dispute_id}",
        message=(
            f"We have received your payment dispute #{dispute.dispute_id} regarding '{dispute.subject}'. "
            f"Our resolution desk will investigate and update you here."
        ),
        category=Notification.CATEGORY_DISPUTE,
        notification_type=Notification.TYPE_INFO,
        link="/refunds",
        dedup_key=f"dispute-submitted-{dispute.dispute_id}",
        metadata={"dispute_id": dispute.dispute_id, "category": dispute.category},
        send_email=True,
    )


def notify_dispute_reply(dispute, message):
    """Triggered when a new public message is posted to a dispute thread."""
    # Notify recipient (if staff replied, notify customer; if customer replied, notify assigned staff)
    if message.sender == dispute.user:
        # Notify assigned staff or admin
        recipient = dispute.assigned_to
        if not recipient:
            recipient = User.objects.filter(is_superuser=True).first()
        if not recipient:
            return None
        title = f"Customer Reply on Dispute #{dispute.dispute_id}"
        msg = f"Customer {dispute.user.username} replied on dispute #{dispute.dispute_id}: {message.message[:120]}"
    else:
        # Staff replied -> notify customer
        recipient = dispute.user
        title = f"New Update on Dispute #{dispute.dispute_id}"
        msg = f"Support team replied on your dispute: {message.message[:120]}"

    return create_notification(
        user=recipient,
        title=title,
        message=msg,
        category=Notification.CATEGORY_DISPUTE,
        notification_type=Notification.TYPE_INFO,
        link="/refunds",
        dedup_key=f"dispute-reply-{message.pk}",
        metadata={"dispute_id": dispute.dispute_id, "message_id": message.pk},
        send_email=True,
    )


def notify_dispute_resolved(dispute):
    """Triggered when payment dispute is resolved."""
    return create_notification(
        user=dispute.user,
        title=f"Dispute Resolved: #{dispute.dispute_id}",
        message=(
            f"Your payment dispute #{dispute.dispute_id} has been marked as Resolved. "
            f"Summary: {dispute.resolution_summary or 'The issue has been settled.'}"
        ),
        category=Notification.CATEGORY_DISPUTE,
        notification_type=Notification.TYPE_SUCCESS,
        link="/refunds",
        dedup_key=f"dispute-resolved-{dispute.dispute_id}",
        metadata={"dispute_id": dispute.dispute_id},
        send_email=True,
    )


