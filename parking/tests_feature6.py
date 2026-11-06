import uuid
from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from parking.models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle,
    Notification, AdminAnnouncement, MembershipPlan,
    CustomerMembership, MonthlyPass, LoyaltyAccount, LoyaltyTransaction
)
from parking.notification_service import (
    create_notification,
    send_email_alert,
    notify_booking_confirmed,
    notify_booking_cancelled,
    notify_payment_success,
    notify_payment_failed,
    notify_hold_expired,
    notify_qr_checkin,
    notify_qr_checkout,
    notify_membership_activated,
    notify_membership_expired,
    notify_monthly_pass_activated,
    notify_monthly_pass_expired,
    notify_loyalty_transaction,
    notify_ticket_created,
    notify_ticket_status_change,
    notify_ticket_reply,
    broadcast_admin_announcement,
    run_expiry_checks,
)

User = get_user_model()


class Feature6NotificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer = User.objects.create_user(
            username='alice_customer',
            email='alice@example.com',
            password='Password123!',
            first_name='Alice'
        )
        self.customer2 = User.objects.create_user(
            username='bob_customer',
            email='bob@example.com',
            password='Password123!',
            first_name='Bob'
        )
        self.staff_user = User.objects.create_user(
            username='staff_dan',
            email='staff@example.com',
            password='Password123!',
            is_staff=True
        )
        self.admin_user = User.objects.create_superuser(
            username='super_admin',
            email='admin@example.com',
            password='Password123!'
        )

        # Parking Lot and Slot
        self.lot = ParkingLot.objects.create(
            name='Central Metro Bay',
            location='Central Station',
            price_per_hour=Decimal('40.00'),
            is_active=True
        )
        self.slot = ParkingSlot.objects.create(
            lot=self.lot,
            slot_number='M01',
            slot_type='car',
            is_active=True
        )

        # Vehicle
        self.vehicle = Vehicle.objects.create(
            user=self.customer,
            license_plate='TN09AB1234',
            vehicle_type='car',
            is_default=True
        )

    # --------------------------------------------------------------------------
    # 1. Booking Confirmation & Cancellation Triggers
    # --------------------------------------------------------------------------
    def test_booking_confirmation_and_cancellation_notifications(self):
        start = timezone.now() + timedelta(hours=1)
        end = start + timedelta(hours=2)

        booking = Booking.objects.create(
            user=self.customer,
            slot=self.slot,
            vehicle_number='TN09AB1234',
            start_time=start,
            end_time=end,
            amount=Decimal('80.00'),
            status=Booking.STATUS_CONFIRMED
        )

        # Trigger confirmation
        notif = notify_booking_confirmed(booking)
        self.assertIsNotNone(notif)
        self.assertEqual(notif.user, self.customer)
        self.assertEqual(notif.category, Notification.CATEGORY_BOOKING)
        self.assertEqual(notif.notification_type, Notification.TYPE_SUCCESS)
        self.assertIn('Confirmed', notif.title)
        self.assertIn('M01', notif.message)

        # Trigger cancellation
        booking.status = Booking.STATUS_CANCELLED
        booking.save(update_fields=['status'])
        cancel_notif = notify_booking_cancelled(booking, reason='Driver request')
        self.assertIsNotNone(cancel_notif)
        self.assertEqual(cancel_notif.category, Notification.CATEGORY_BOOKING)
        self.assertEqual(cancel_notif.notification_type, Notification.TYPE_WARNING)
        self.assertIn('Cancelled', cancel_notif.title)

    # --------------------------------------------------------------------------
    # 2. Payment Success & Failure Triggers
    # --------------------------------------------------------------------------
    def test_payment_success_and_failure_notifications(self):
        start = timezone.now() + timedelta(hours=1)
        end = start + timedelta(hours=2)
        booking = Booking.objects.create(
            user=self.customer,
            slot=self.slot,
            vehicle_number='TN09AB1234',
            start_time=start,
            end_time=end,
            amount=Decimal('80.00'),
            status=Booking.STATUS_CONFIRMED
        )
        payment = Payment.objects.create(
            booking=booking,
            amount=Decimal('80.00'),
            method='upi',
            status='success',
            transaction_id='TXNTEST12345678'
        )

        pay_notif = notify_payment_success(payment)
        self.assertEqual(pay_notif.user, self.customer)
        self.assertEqual(pay_notif.category, Notification.CATEGORY_PAYMENT)
        self.assertIn('₹80.00', pay_notif.title)
        self.assertIn('TXNTEST12345678', pay_notif.message)

        fail_notif = notify_payment_failed(
            user=self.customer,
            amount=Decimal('80.00'),
            method='card',
            reason='Insufficient funds',
            booking=booking
        )
        self.assertEqual(fail_notif.category, Notification.CATEGORY_PAYMENT)
        self.assertEqual(fail_notif.notification_type, Notification.TYPE_DANGER)
        self.assertIn('Failed', fail_notif.title)

    # --------------------------------------------------------------------------
    # 3. Reservation Hold Expiry & Automatic Cleanup
    # --------------------------------------------------------------------------
    def test_reservation_hold_expiry_and_cleanup(self):
        # Create a pending booking older than 10 minutes
        expired_time = timezone.now() - timedelta(minutes=20)
        start = timezone.now() + timedelta(hours=1)
        end = start + timedelta(hours=2)

        booking = Booking.objects.create(
            user=self.customer,
            slot=self.slot,
            vehicle_number='TN09AB1234',
            start_time=start,
            end_time=end,
            amount=Decimal('80.00'),
            status=Booking.STATUS_PENDING
        )
        Booking.objects.filter(pk=booking.pk).update(created_at=expired_time)

        # Run maintenance check
        results = run_expiry_checks()
        self.assertGreaterEqual(results['expired_bookings_cancelled'], 1)

        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.STATUS_CANCELLED)

        # Verify hold expiry notification was sent
        hold_notif = Notification.objects.filter(
            user=self.customer,
            category=Notification.CATEGORY_HOLD_EXPIRY
        ).first()
        self.assertIsNotNone(hold_notif)
        self.assertIn('Expired', hold_notif.title)

    # --------------------------------------------------------------------------
    # 4. QR Gate Pass Check-In & Check-Out Triggers
    # --------------------------------------------------------------------------
    def test_qr_gate_pass_checkin_and_checkout(self):
        start = timezone.now() - timedelta(minutes=10)
        end = start + timedelta(hours=2)
        booking = Booking.objects.create(
            user=self.customer,
            slot=self.slot,
            vehicle_number='TN09AB1234',
            start_time=start,
            end_time=end,
            amount=Decimal('80.00'),
            status=Booking.STATUS_CONFIRMED
        )

        self.client.force_authenticate(user=self.staff_user)

        # Gate Check-In
        res_in = self.client.post('/api/staff/gate-action/', {
            'booking_id': str(booking.booking_id),
            'action': 'in'
        })
        self.assertEqual(res_in.status_code, status.HTTP_200_OK)

        in_notif = Notification.objects.filter(
            user=self.customer,
            category=Notification.CATEGORY_GATE_PASS,
            title__icontains='Check-In'
        ).first()
        self.assertIsNotNone(in_notif)
        self.assertIn('TN09AB1234', in_notif.message)

        # Gate Check-Out
        res_out = self.client.post('/api/staff/gate-action/', {
            'booking_id': str(booking.booking_id),
            'action': 'out'
        })
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)

        out_notif = Notification.objects.filter(
            user=self.customer,
            category=Notification.CATEGORY_GATE_PASS,
            title__icontains='Check-Out'
        ).first()
        self.assertIsNotNone(out_notif)
        self.assertIn('complete', out_notif.message.lower())

    # --------------------------------------------------------------------------
    # 5. Memberships & Monthly Passes Activation & Expiry
    # --------------------------------------------------------------------------
    def test_membership_and_monthly_pass_notifications(self):
        plan = MembershipPlan.objects.create(
            name='Gold Commuter',
            price=Decimal('500.00'),
            duration_days=30
        )
        now = timezone.now()
        membership = CustomerMembership.objects.create(
            user=self.customer,
            plan=plan,
            status=CustomerMembership.STATUS_ACTIVE,
            start_date=now,
            end_date=now + timedelta(days=30),
            amount_paid=Decimal('500.00')
        )

        act_notif = notify_membership_activated(membership)
        self.assertEqual(act_notif.category, Notification.CATEGORY_MEMBERSHIP)
        self.assertIn('Gold Commuter', act_notif.title)

        # Expire membership
        CustomerMembership.objects.filter(pk=membership.pk).update(end_date=now - timedelta(days=1))
        results = run_expiry_checks()
        self.assertGreaterEqual(results['expired_memberships'], 1)

        exp_notif = Notification.objects.filter(
            user=self.customer,
            category=Notification.CATEGORY_MEMBERSHIP,
            title__icontains='Expired'
        ).first()
        self.assertIsNotNone(exp_notif)

        # Monthly pass activation & expiry
        pass_obj = MonthlyPass.objects.create(
            user=self.customer,
            vehicle=self.vehicle,
            vehicle_license_plate='TN09AB1234',
            start_date=now,
            end_date=now + timedelta(days=30),
            status=MonthlyPass.STATUS_ACTIVE
        )
        pass_notif = notify_monthly_pass_activated(pass_obj)
        self.assertEqual(pass_notif.category, Notification.CATEGORY_MONTHLY_PASS)
        self.assertIn(pass_obj.pass_code, pass_notif.title)

    # --------------------------------------------------------------------------
    # 6. Loyalty Points Earned, Redeemed & Reversed
    # --------------------------------------------------------------------------
    def test_loyalty_transaction_notifications(self):
        account = LoyaltyAccount.objects.create(
            user=self.customer,
            points_balance=250,
            tier='Bronze'
        )
        txn = LoyaltyTransaction.objects.create(
            account=account,
            transaction_type=LoyaltyTransaction.TYPE_EARNED,
            points=50,
            balance_after=300,
            reference_id='TEST-EARN-01',
            description='Earned 50 pts for reservation'
        )

        loyalty_notif = notify_loyalty_transaction(account, txn)
        self.assertEqual(loyalty_notif.category, Notification.CATEGORY_LOYALTY)
        self.assertIn('+50 Points', loyalty_notif.title)
        self.assertIn('300 points', loyalty_notif.message)

    # --------------------------------------------------------------------------
    # 7. Support Ticket Replies & Status Changes
    # --------------------------------------------------------------------------
    def test_support_ticket_notifications(self):
        from parking.models import SupportTicket, TicketMessage

        ticket = SupportTicket.objects.create(
            user=self.customer,
            category=SupportTicket.CATEGORY_PAYMENT,
            priority=SupportTicket.PRIORITY_MEDIUM,
            subject='Double UPI debit test',
            description='I was debited twice for booking #123'
        )

        notify_ticket_created(ticket)
        cust_notif = Notification.objects.filter(
            user=self.customer,
            category=Notification.CATEGORY_SUPPORT,
            title__icontains='Opened'
        ).first()
        self.assertIsNotNone(cust_notif)

        # Staff reply
        msg = TicketMessage.objects.create(
            ticket=ticket,
            sender=self.staff_user,
            message='We verified your refund and it has been credited.'
        )
        reply_notif = notify_ticket_reply(msg)
        self.assertIsNotNone(reply_notif)
        self.assertEqual(reply_notif.user, self.customer)
        self.assertIn('Staff Replied', reply_notif.title)

        # Status update
        ticket.status = SupportTicket.STATUS_RESOLVED
        ticket.save()
        status_notif = notify_ticket_status_change(ticket, 'open', 'resolved', self.staff_user)
        self.assertEqual(status_notif.notification_type, Notification.TYPE_SUCCESS)
        self.assertIn('Resolved', status_notif.title)

    # --------------------------------------------------------------------------
    # 8. Notification Center API Operations (Read / Unread / Filters)
    # --------------------------------------------------------------------------
    def test_notification_center_api_operations(self):
        # Create 3 notifications for customer
        n1 = create_notification(self.customer, "N1", "Msg 1", category=Notification.CATEGORY_BOOKING)
        n2 = create_notification(self.customer, "N2", "Msg 2", category=Notification.CATEGORY_PAYMENT)
        n3 = create_notification(self.customer, "N3", "Msg 3", category=Notification.CATEGORY_ANNOUNCEMENT)

        self.client.force_authenticate(user=self.customer)

        # 1. Unread count endpoint
        res_count = self.client.get('/api/notifications/unread-count/')
        self.assertEqual(res_count.status_code, status.HTTP_200_OK)
        self.assertEqual(res_count.data['unread_count'], 3)
        self.assertIn('booking', res_count.data['unread_by_category'])

        # 2. Mark single as read
        res_read = self.client.post(f'/api/notifications/{n1.id}/read/')
        self.assertEqual(res_read.status_code, status.HTTP_200_OK)
        n1.refresh_from_db()
        self.assertTrue(n1.is_read)
        self.assertIsNotNone(n1.read_at)

        # 3. Filter by category
        res_filter = self.client.get('/api/notifications/?category=payment')
        self.assertEqual(res_filter.status_code, status.HTTP_200_OK)
        results = res_filter.data.get('results', res_filter.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], n2.id)

        # 4. Mark all as read
        res_mark_all = self.client.post('/api/notifications/mark-all-read/')
        self.assertEqual(res_mark_all.status_code, status.HTTP_200_OK)
        self.assertEqual(res_mark_all.data['marked_count'], 2)

        # Verify unread count is now 0
        res_count_after = self.client.get('/api/notifications/unread-count/')
        self.assertEqual(res_count_after.data['unread_count'], 0)

    # --------------------------------------------------------------------------
    # 9. User Isolation & Security
    # --------------------------------------------------------------------------
    def test_user_isolation_security(self):
        n_bob = create_notification(self.customer2, "Bob Private", "Bob only")

        # Alice authenticates and attempts to read / mark / delete Bob's notification
        self.client.force_authenticate(user=self.customer)

        # List should not include Bob's notification
        res_list = self.client.get('/api/notifications/')
        results = res_list.data.get('results', res_list.data)
        self.assertNotIn(n_bob.id, [item['id'] for item in results])

        # Alice tries to mark Bob's notification read -> 404
        res_mark = self.client.post(f'/api/notifications/{n_bob.id}/read/')
        self.assertEqual(res_mark.status_code, status.HTTP_404_NOT_FOUND)

        # Alice tries to delete Bob's notification -> 404
        res_del = self.client.delete(f'/api/notifications/{n_bob.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_404_NOT_FOUND)

    # --------------------------------------------------------------------------
    # 10. Duplicate Event Prevention (Idempotency)
    # --------------------------------------------------------------------------
    def test_duplicate_event_prevention(self):
        dedup_key = 'booking-101-confirmed-unique'

        notif1 = create_notification(
            user=self.customer,
            title="Confirmed",
            message="Unique message",
            dedup_key=dedup_key
        )

        # Attempt to create duplicate event
        notif2 = create_notification(
            user=self.customer,
            title="Confirmed Again",
            message="Duplicate attempt",
            dedup_key=dedup_key
        )

        self.assertEqual(notif1.id, notif2.id)
        # Verify strictly 1 row in database
        self.assertEqual(Notification.objects.filter(user=self.customer, dedup_key=dedup_key).count(), 1)

    # --------------------------------------------------------------------------
    # 11. Email Alerts & Graceful Failure Handling
    # --------------------------------------------------------------------------
    def test_email_alerts_and_failure_handling(self):
        # 1. When SMTP not configured (EMAIL_HOST empty)
        with self.settings(EMAIL_HOST=''):
            success, err = send_email_alert(self.customer, "Test", "Message body")
            self.assertFalse(success)
            self.assertIn("SMTP is not configured", err)

        # 2. When SMTP host is configured but fails/throws error
        with self.settings(EMAIL_HOST='smtp.testserver.local', EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
            with patch('parking.notification_service.send_mail', side_effect=Exception("SMTP Connection timed out")):
                success, err = send_email_alert(self.customer, "Test Subject", "Message body")
                self.assertFalse(success)
                self.assertIn("Connection timed out", err)

                # Ensure notification creation still succeeds and records failure gracefully
                notif = create_notification(
                    self.customer,
                    "Resilient Notification",
                    "Body text",
                    send_email=True
                )
                self.assertIsNotNone(notif.pk)
                self.assertFalse(notif.email_sent)
                self.assertIn("Connection timed out", notif.email_error)

        # 3. Email status endpoint
        self.client.force_authenticate(user=self.customer)
        res_status = self.client.get('/api/notifications/email-status/')
        self.assertEqual(res_status.status_code, status.HTTP_200_OK)
        self.assertIn('is_configured', res_status.data)

    # --------------------------------------------------------------------------
    # 12. Admin Announcements & Authorization Controls
    # --------------------------------------------------------------------------
    def test_admin_announcements_and_permissions(self):
        # Regular customer cannot broadcast announcements
        self.client.force_authenticate(user=self.customer)
        res_unauth = self.client.post('/api/notifications/announce/', {
            'title': 'Hack attempt',
            'message': 'Should be rejected',
            'target_role': 'all'
        })
        self.assertEqual(res_unauth.status_code, status.HTTP_403_FORBIDDEN)

        # Admin user broadcasts announcement
        self.client.force_authenticate(user=self.admin_user)
        res_admin = self.client.post('/api/notifications/announce/', {
            'title': 'Holiday Parking Hours',
            'message': 'All lots open 24/7 during festive season.',
            'target_role': 'all',
            'send_email': False
        })
        self.assertEqual(res_admin.status_code, status.HTTP_201_CREATED)
        self.assertGreaterEqual(res_admin.data['delivery_stats']['total_recipients'], 2)

        # Verify customer received the announcement
        cust_announcement = Notification.objects.filter(
            user=self.customer,
            category=Notification.CATEGORY_ANNOUNCEMENT
        ).first()
        self.assertIsNotNone(cust_announcement)
        self.assertIn('Holiday Parking Hours', cust_announcement.title)

        # List announcements
        res_list = self.client.get('/api/notifications/admin-announcements/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        data = res_list.data.get('results', res_list.data)
        self.assertGreaterEqual(len(data), 1)

    # --------------------------------------------------------------------------
    # 13. Archive, Delete and Clear Operations
    # --------------------------------------------------------------------------
    def test_archive_and_delete_operations(self):
        n = create_notification(self.customer, "To Archive", "Content")
        self.client.force_authenticate(user=self.customer)

        # Archive
        res_arc = self.client.post(f'/api/notifications/{n.id}/archive/')
        self.assertEqual(res_arc.status_code, status.HTTP_200_OK)
        n.refresh_from_db()
        self.assertTrue(n.is_archived)

        # Delete
        res_del = self.client.delete(f'/api/notifications/{n.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_200_OK)
        self.assertFalse(Notification.objects.filter(pk=n.pk).exists())

