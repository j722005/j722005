from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from parking.models import (
    ParkingLot, ParkingSlot, Booking, Payment, Notification,
    RefundRequest, RefundTransaction, RefundAuditLog,
    PaymentDispute, DisputeMessage, DisputeAuditLog
)
from parking.refund_service import (
    get_remaining_refundable_amount,
    get_eligible_bookings_for_refund,
    create_refund_request,
    update_refund_status,
    process_refund_execution,
    customer_provide_additional_info,
    customer_cancel_refund_request,
    create_payment_dispute,
    add_dispute_message,
    update_dispute_status,
)

User = get_user_model()


class Feature8RefundDisputeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer1 = User.objects.create_user(
            username='alice', email='alice@example.com', password='password123', first_name='Alice', last_name='Smith'
        )
        self.customer2 = User.objects.create_user(
            username='bob', email='bob@example.com', password='password123', first_name='Bob', last_name='Jones'
        )
        self.staff_user = User.objects.create_user(
            username='staff_member', email='staff@example.com', password='password123', is_staff=True
        )
        self.admin_user = User.objects.create_superuser(
            username='admin_boss', email='admin@example.com', password='password123'
        )

        # Parking lot & slot
        self.lot = ParkingLot.objects.create(
            name='Central Metro Plaza', location='Downtown', price_per_hour=Decimal('50.00'), is_active=True
        )
        self.slot1 = ParkingSlot.objects.create(lot=self.lot, slot_number='A-01', slot_type='car', is_active=True)
        self.slot2 = ParkingSlot.objects.create(lot=self.lot, slot_number='A-02', slot_type='car', is_active=True)

        # Booking 1: Customer 1 Confirmed & Paid
        now = timezone.now()
        self.booking1 = Booking.objects.create(
            user=self.customer1,
            slot=self.slot1,
            vehicle_number='KA-01-AB-1234',
            start_time=now + timezone.timedelta(hours=2),
            end_time=now + timezone.timedelta(hours=4),
            status=Booking.STATUS_CONFIRMED,
            amount=Decimal('100.00')
        )
        self.payment1 = Payment.objects.create(
            booking=self.booking1,
            amount=Decimal('100.00'),
            method='upi',
            status='success',
            transaction_id='TXN1000000001'
        )

        # Booking 2: Customer 1 Cancelled & Paid
        self.booking2 = Booking.objects.create(
            user=self.customer1,
            slot=self.slot2,
            vehicle_number='KA-01-AB-1234',
            start_time=now + timezone.timedelta(hours=5),
            end_time=now + timezone.timedelta(hours=7),
            status=Booking.STATUS_CANCELLED,
            amount=Decimal('150.00')
        )
        self.payment2 = Payment.objects.create(
            booking=self.booking2,
            amount=Decimal('150.00'),
            method='card',
            status='success',
            transaction_id='TXN1000000002'
        )

        # Booking 3: Customer 2 Pending / Unpaid
        self.booking3_unpaid = Booking.objects.create(
            user=self.customer2,
            slot=self.slot1,
            vehicle_number='DL-05-XY-9999',
            start_time=now + timezone.timedelta(days=1),
            end_time=now + timezone.timedelta(days=1, hours=2),
            status=Booking.STATUS_PENDING,
            amount=Decimal('80.00')
        )

    # --------------------------------------------------------------------------
    # 1. Customer creates an eligible refund request
    # --------------------------------------------------------------------------
    def test_customer_creates_eligible_refund_request(self):
        self.client.force_authenticate(user=self.customer1)
        response = self.client.post('/api/refunds/request/', {
            'booking_id': str(self.booking2.booking_id),
            'amount': '150.00',
            'reason': RefundRequest.REASON_BOOKING_CANCELLED,
            'explanation': 'Cancelled trip ahead of schedule, requesting refund.'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'requested')
        self.assertEqual(Decimal(str(response.data['amount'])), Decimal('150.00'))

        # Check DB
        req = RefundRequest.objects.get(refund_id=response.data['refund_id'])
        self.assertEqual(req.user, self.customer1)
        self.assertEqual(req.booking, self.booking2)
        self.assertEqual(req.status, RefundRequest.STATUS_REQUESTED)

        # Check notification was dispatched
        n = Notification.objects.filter(user=self.customer1, category=Notification.CATEGORY_REFUND).first()
        self.assertIsNotNone(n)
        self.assertIn(req.refund_id, n.title)

    # --------------------------------------------------------------------------
    # 2. Customer cannot refund an ineligible booking
    # --------------------------------------------------------------------------
    def test_customer_cannot_refund_ineligible_booking(self):
        # Case A: Booking belongs to someone else
        self.client.force_authenticate(user=self.customer1)
        res_other = self.client.post('/api/refunds/request/', {
            'booking_id': str(self.booking3_unpaid.booking_id),
            'amount': '80.00',
            'reason': RefundRequest.REASON_OTHER,
        })
        self.assertEqual(res_other.status_code, status.HTTP_400_BAD_REQUEST)

        # Case B: Booking has no paid payment
        self.client.force_authenticate(user=self.customer2)
        res_unpaid = self.client.post('/api/refunds/request/', {
            'booking_id': str(self.booking3_unpaid.booking_id),
            'amount': '80.00',
            'reason': RefundRequest.REASON_OTHER,
        })
        self.assertEqual(res_unpaid.status_code, status.HTTP_400_BAD_REQUEST)

    # --------------------------------------------------------------------------
    # 3. Duplicate refund requests are prevented
    # --------------------------------------------------------------------------
    def test_duplicate_refund_requests_prevented(self):
        # Customer 1 submits full refund for booking 1
        create_refund_request(
            user=self.customer1,
            booking_id=self.booking1.booking_id,
            amount=Decimal('100.00'),
            reason=RefundRequest.REASON_TECHNICAL_ISSUE,
            explanation='Service not delivered'
        )

        # Attempting second refund request on same booking
        with self.assertRaises(ValidationError) as ctx:
            create_refund_request(
                user=self.customer1,
                booking_id=self.booking1.booking_id,
                amount=Decimal('50.00'),
                reason=RefundRequest.REASON_OTHER,
            )
        self.assertIn('already been fully refunded or has a pending refund request', str(ctx.exception))

    # --------------------------------------------------------------------------
    # 4. Customer cannot access another customer's refund (403 Forbidden)
    # --------------------------------------------------------------------------
    def test_customer_isolation_and_idor_prevention(self):
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking2.booking_id,
            amount=Decimal('150.00'),
            reason=RefundRequest.REASON_BOOKING_CANCELLED
        )

        # Bob (Customer 2) tries to access Alice's refund details
        self.client.force_authenticate(user=self.customer2)
        response = self.client.get(f'/api/refunds/{req.refund_id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Bob tries to cancel Alice's refund
        res_cancel = self.client.post(f'/api/refunds/{req.refund_id}/cancel/')
        self.assertEqual(res_cancel.status_code, status.HTTP_403_FORBIDDEN)

    # --------------------------------------------------------------------------
    # 5. Customer cannot approve their own refund
    # --------------------------------------------------------------------------
    def test_customer_cannot_approve_own_refund(self):
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking1.booking_id,
            amount=Decimal('100.00'),
            reason=RefundRequest.REASON_TECHNICAL_ISSUE
        )

        # Customer tries to call admin action endpoint -> 403 Forbidden
        self.client.force_authenticate(user=self.customer1)
        res_action = self.client.post(f'/api/admin/refunds/{req.refund_id}/action/', {
            'action': 'approve'
        })
        self.assertEqual(res_action.status_code, status.HTTP_403_FORBIDDEN)

        # Direct service transition check: Customer user cannot transition to approved
        with self.assertRaises(ValidationError):
            update_refund_status(req, RefundRequest.STATUS_APPROVED, performed_by=self.customer1)

    # --------------------------------------------------------------------------
    # 6. Staff / admin can approve authorized requests
    # --------------------------------------------------------------------------
    def test_staff_admin_can_approve_requests(self):
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking2.booking_id,
            amount=Decimal('150.00'),
            reason=RefundRequest.REASON_BOOKING_CANCELLED
        )

        self.client.force_authenticate(user=self.staff_user)
        response = self.client.post(f'/api/admin/refunds/{req.refund_id}/action/', {
            'action': 'approve',
            'notes': 'Verified cancellation prior to scheduled arrival.'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'approved')
        self.assertEqual(Decimal(str(response.data['approved_amount'])), Decimal('150.00'))

    # --------------------------------------------------------------------------
    # 7. Rejection requires a mandatory reason
    # --------------------------------------------------------------------------
    def test_rejection_requires_mandatory_reason(self):
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking1.booking_id,
            amount=Decimal('100.00'),
            reason=RefundRequest.REASON_SERVICE_UNAVAILABLE
        )

        self.client.force_authenticate(user=self.admin_user)
        # Attempt rejection without reason
        res_empty = self.client.post(f'/api/admin/refunds/{req.refund_id}/action/', {
            'action': 'reject',
            'rejection_reason': '   '
        })
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('rejection reason is required', str(res_empty.data))

        # Rejection with valid reason
        res_valid = self.client.post(f'/api/admin/refunds/{req.refund_id}/action/', {
            'action': 'reject',
            'rejection_reason': 'Vehicle was successfully parked for the entire scheduled period.'
        })
        self.assertEqual(res_valid.status_code, status.HTTP_200_OK)
        self.assertEqual(res_valid.data['status'], 'rejected')

    # --------------------------------------------------------------------------
    # 8. Refund amount cannot exceed eligible payment amount
    # --------------------------------------------------------------------------
    def test_refund_amount_cannot_exceed_paid_amount(self):
        # Booking 1 paid amount is 100.00. Customer asks for 150.00
        with self.assertRaises(ValidationError) as ctx:
            create_refund_request(
                user=self.customer1,
                booking_id=self.booking1.booking_id,
                amount=Decimal('150.00'),
                reason=RefundRequest.REASON_INCORRECT_AMOUNT
            )
        self.assertIn('exceeds maximum eligible amount', str(ctx.exception))

    # --------------------------------------------------------------------------
    # 9. Duplicate refund processing is prevented (Idempotency)
    # --------------------------------------------------------------------------
    def test_duplicate_refund_processing_prevented(self):
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking1.booking_id,
            amount=Decimal('100.00'),
            reason=RefundRequest.REASON_TECHNICAL_ISSUE
        )
        update_refund_status(req, RefundRequest.STATUS_APPROVED, performed_by=self.admin_user)

        # First execution
        txn1 = process_refund_execution(req, performed_by=self.admin_user)
        self.assertIsNotNone(txn1)
        self.assertEqual(txn1.status, RefundTransaction.STATUS_COMPLETED)

        # Second execution attempt should return existing transaction idempotently
        txn2 = process_refund_execution(req, performed_by=self.admin_user)
        self.assertEqual(txn1.pk, txn2.pk)
        self.assertEqual(txn1.transaction_reference, txn2.transaction_reference)
        # Ensure only 1 transaction record exists in DB
        self.assertEqual(RefundTransaction.objects.filter(refund_request=req).count(), 1)

    # --------------------------------------------------------------------------
    # 10. Simulated refunds are clearly identified
    # --------------------------------------------------------------------------
    def test_simulated_refunds_clearly_identified(self):
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking2.booking_id,
            amount=Decimal('150.00'),
            reason=RefundRequest.REASON_BOOKING_CANCELLED
        )
        update_refund_status(req, RefundRequest.STATUS_APPROVED, performed_by=self.staff_user)
        txn = process_refund_execution(req, performed_by=self.staff_user)

        # Verify simulation flags
        self.assertTrue(txn.is_simulation)
        self.assertIn('Simulated', txn.gateway_provider)
        self.assertTrue(txn.transaction_reference.startswith('REF-SIM-'))
        self.assertIn('is_simulation', txn.gateway_response)
        self.assertTrue(txn.gateway_response['is_simulation'])
        self.assertIn('sandbox', txn.gateway_response['message'].lower())

    # --------------------------------------------------------------------------
    # 11. Invalid status transitions are rejected
    # --------------------------------------------------------------------------
    def test_invalid_status_transitions_rejected(self):
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking1.booking_id,
            amount=Decimal('100.00'),
            reason=RefundRequest.REASON_TECHNICAL_ISSUE
        )
        # Cannot jump straight from requested to completed without approval/processing
        with self.assertRaises(ValidationError):
            update_refund_status(req, RefundRequest.STATUS_COMPLETED, performed_by=self.admin_user)

        # Move to rejected (terminal)
        update_refund_status(
            req, RefundRequest.STATUS_REJECTED, performed_by=self.admin_user, rejection_reason='Invalid request'
        )
        # Terminal state cannot transition to approved
        with self.assertRaises(ValidationError):
            update_refund_status(req, RefundRequest.STATUS_APPROVED, performed_by=self.admin_user)

    # --------------------------------------------------------------------------
    # 12. Customers cannot access internal dispute notes
    # --------------------------------------------------------------------------
    def test_internal_dispute_notes_hidden_from_customer(self):
        dispute = create_payment_dispute(
            user=self.customer1,
            category=PaymentDispute.CAT_DUPLICATE_PAYMENT,
            subject='Double billed for slot A-01',
            description='I was billed twice on UPI for one booking.',
            booking_id=self.booking1.booking_id
        )

        # Staff posts public reply
        add_dispute_message(
            dispute=dispute,
            sender=self.staff_user,
            message='We are reviewing bank transaction logs.',
            is_internal_note=False
        )

        # Staff posts private internal note
        add_dispute_message(
            dispute=dispute,
            sender=self.staff_user,
            message='Internal note: Gateway log shows only 1 charge. Check simulation provider.',
            is_internal_note=True
        )

        # Customer fetches dispute details
        self.client.force_authenticate(user=self.customer1)
        res_cust = self.client.get(f'/api/disputes/{dispute.dispute_id}/')
        self.assertEqual(res_cust.status_code, status.HTTP_200_OK)
        cust_messages = res_cust.data['messages']
        self.assertEqual(len(cust_messages), 1)
        self.assertEqual(cust_messages[0]['message'], 'We are reviewing bank transaction logs.')

        # Staff fetches dispute details -> both messages visible
        self.client.force_authenticate(user=self.staff_user)
        res_staff = self.client.get(f'/api/disputes/{dispute.dispute_id}/')
        self.assertEqual(res_staff.status_code, status.HTTP_200_OK)
        staff_messages = res_staff.data['messages']
        self.assertEqual(len(staff_messages), 2)

    # --------------------------------------------------------------------------
    # 13. Dispute replies and evidence uploads work
    # --------------------------------------------------------------------------
    def test_dispute_replies_and_evidence_upload(self):
        dispute = create_payment_dispute(
            user=self.customer1,
            category=PaymentDispute.CAT_INCORRECT_AMOUNT,
            subject='Incorrect amount deducted',
            description='Charged extra fee',
            disputed_amount=Decimal('50.00')
        )

        dummy_file = SimpleUploadedFile("receipt.pdf", b"%PDF-1.4 test receipt dummy content", content_type="application/pdf")

        self.client.force_authenticate(user=self.customer1)
        res_reply = self.client.post(f'/api/disputes/{dispute.dispute_id}/reply/', {
            'message': 'Attaching bank payment statement screenshot.',
            'attachment': dummy_file
        }, format='multipart')

        self.assertEqual(res_reply.status_code, status.HTTP_201_CREATED)
        self.assertEqual(dispute.messages.count(), 1)
        last_msg = dispute.messages.first()
        self.assertTrue(bool(last_msg.attachment))
        self.assertIn('receipt', last_msg.attachment.name)

    # --------------------------------------------------------------------------
    # 14. Notification integration works
    # --------------------------------------------------------------------------
    def test_notification_integration_triggers(self):
        initial_count = Notification.objects.filter(user=self.customer1).count()

        # Step A: Request refund
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking2.booking_id,
            amount=Decimal('150.00'),
            reason=RefundRequest.REASON_BOOKING_CANCELLED
        )
        self.assertEqual(
            Notification.objects.filter(user=self.customer1, category=Notification.CATEGORY_REFUND).count(),
            1
        )

        # Step B: Approve refund
        update_refund_status(req, RefundRequest.STATUS_APPROVED, performed_by=self.admin_user)
        self.assertEqual(
            Notification.objects.filter(user=self.customer1, category=Notification.CATEGORY_REFUND).count(),
            2
        )

        # Step C: Execute refund
        txn = process_refund_execution(req, performed_by=self.admin_user)
        self.assertEqual(
            Notification.objects.filter(user=self.customer1, category=Notification.CATEGORY_REFUND).count(),
            3
        )

    # --------------------------------------------------------------------------
    # 15. Audit history is recorded correctly
    # --------------------------------------------------------------------------
    def test_audit_history_recorded(self):
        req = create_refund_request(
            user=self.customer1,
            booking_id=self.booking1.booking_id,
            amount=Decimal('100.00'),
            reason=RefundRequest.REASON_TECHNICAL_ISSUE
        )
        update_refund_status(req, RefundRequest.STATUS_UNDER_REVIEW, performed_by=self.staff_user)
        update_refund_status(req, RefundRequest.STATUS_APPROVED, performed_by=self.staff_user)
        process_refund_execution(req, performed_by=self.staff_user)

        logs = RefundAuditLog.objects.filter(refund_request=req).order_by('created_at')
        # Expected: created, status_updated (under_review), status_updated (approved), completed
        self.assertEqual(logs.count(), 4)
        actions = [log.action for log in logs]
        self.assertEqual(actions, ['created', 'status_updated', 'status_updated', 'completed'])

    # --------------------------------------------------------------------------
    # 16. Partial refund calculations work properly
    # --------------------------------------------------------------------------
    def test_partial_refund_calculations(self):
        # Booking 2 paid amount: 150.00
        # Customer requests partial refund of 60.00
        req1 = create_refund_request(
            user=self.customer1,
            booking_id=self.booking2.booking_id,
            amount=Decimal('60.00'),
            reason=RefundRequest.REASON_TECHNICAL_ISSUE
        )
        update_refund_status(req1, RefundRequest.STATUS_APPROVED, performed_by=self.admin_user)
        process_refund_execution(req1, performed_by=self.admin_user)

        # Remaining should now be 150 - 60 = 90
        remaining = get_remaining_refundable_amount(self.booking2)
        self.assertEqual(remaining, Decimal('90.00'))

        # Customer requests second partial refund of 90.00
        req2 = create_refund_request(
            user=self.customer1,
            booking_id=self.booking2.booking_id,
            amount=Decimal('90.00'),
            reason=RefundRequest.REASON_OTHER
        )
        self.assertIsNotNone(req2)
        remaining2 = get_remaining_refundable_amount(self.booking2)
        self.assertEqual(remaining2, Decimal('0.00'))
