import uuid
from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle, Notification,
    MembershipPlan, CustomerMembership, MonthlyPass,
    LoyaltyProgramConfig, LoyaltyAccount, LoyaltyTransaction
)
from .loyalty_membership_service import (
    calculate_booking_benefits,
    award_booking_loyalty_points,
    reverse_booking_loyalty_and_benefits,
    get_or_create_loyalty_account,
)

User = get_user_model()


class Feature4MembershipLoyaltyPassTests(APITestCase):
    def setUp(self):
        # Users
        self.customer = User.objects.create_user(username='cust_alex', email='alex@example.com', password='password123')
        self.other_customer = User.objects.create_user(username='cust_bob', email='bob@example.com', password='password123')
        self.admin = User.objects.create_superuser(username='admin_boss', email='boss@example.com', password='password123')

        # Parking lot & slot
        self.lot = ParkingLot.objects.create(
            name='Metro Hub Parking',
            location='Central Station',
            price_per_hour=Decimal('40.00'),
            is_active=True,
        )
        self.slot = ParkingSlot.objects.create(
            lot=self.lot,
            slot_number='M-101',
            slot_type='car',
            is_active=True,
        )

        # Vehicle
        self.vehicle = Vehicle.objects.create(
            user=self.customer,
            license_plate='KA01AB1234',
            vehicle_type='car',
            is_default=True,
        )

        # Baseline Loyalty Config
        self.loyalty_config = LoyaltyProgramConfig.get_config()
        self.loyalty_config.is_enabled = True
        self.loyalty_config.points_per_currency_unit = Decimal('0.1000')  # 1 pt per 10 INR
        self.loyalty_config.min_spending_to_earn = Decimal('20.00')
        self.loyalty_config.points_redemption_rate = Decimal('0.50')  # 1 pt = 0.50 INR
        self.loyalty_config.min_points_to_redeem = 20
        self.loyalty_config.max_redemption_percentage = Decimal('50.00')
        self.loyalty_config.save()

    # --------------------------------------------------------------------------
    # 1. MEMBERSHIP PLAN CREATION & VALIDATION
    # --------------------------------------------------------------------------
    def test_membership_plan_creation_admin_and_validation(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('api_membership_plans')

        # Valid plan creation
        payload = {
            'name': 'Gold Commuter Pass',
            'description': '20% off all parking reservations and priority support',
            'duration_type': 'monthly',
            'duration_days': 30,
            'price': '499.00',
            'currency': 'INR',
            'discount_type': 'percentage',
            'discount_value': '20.00',
            'max_discount_per_booking': '100.00',
            'min_booking_amount': '50.00',
            'eligible_vehicle_types': 'all',
            'max_discounted_bookings': 20,
            'is_active': True,
        }
        res = self.client.post(url, payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['name'], 'Gold Commuter Pass')

        # Invalid: discount percentage > 100%
        bad_payload = payload.copy()
        bad_payload['discount_value'] = '150.00'
        res_bad = self.client.post(url, bad_payload)
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

        # Invalid: negative price
        bad_payload2 = payload.copy()
        bad_payload2['price'] = '-10.00'
        res_bad2 = self.client.post(url, bad_payload2)
        self.assertEqual(res_bad2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_membership_plan_customer_cannot_create(self):
        self.client.force_authenticate(user=self.customer)
        url = reverse('api_membership_plans')
        res = self.client.post(url, {'name': 'Hacker Plan', 'price': '0.00'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # --------------------------------------------------------------------------
    # 2. CUSTOMER MEMBERSHIP PURCHASE & EXPIRY
    # --------------------------------------------------------------------------
    def test_customer_membership_purchase_and_auto_renewal(self):
        plan = MembershipPlan.objects.create(
            name='Silver Pass',
            duration_type='monthly',
            duration_days=30,
            price=Decimal('299.00'),
            discount_type='percentage',
            discount_value=Decimal('15.00'),
            is_active=True,
        )

        self.client.force_authenticate(user=self.customer)
        url = reverse('api_membership_purchase')

        res = self.client.post(url, {
            'plan_id': plan.id,
            'payment_method': 'upi',
            'auto_renew': True,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('membership', res.data)
        self.assertTrue(res.data['membership']['is_valid'])
        self.assertEqual(res.data['membership']['status'], 'active')
        self.assertTrue(res.data['membership']['auto_renew'])

        # Cancel auto-renewal
        membership_id = res.data['membership']['id']
        cancel_renew_url = reverse('api_membership_cancel_renewal', kwargs={'pk': membership_id})
        res_cancel = self.client.post(cancel_renew_url)
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)
        self.assertFalse(res_cancel.data['membership']['auto_renew'])

    # --------------------------------------------------------------------------
    # 3. MONTHLY PASS PURCHASE & ELIGIBILITY
    # --------------------------------------------------------------------------
    def test_monthly_pass_purchase_and_eligibility(self):
        self.client.force_authenticate(user=self.customer)
        url = reverse('api_pass_purchase')

        res = self.client.post(url, {
            'vehicle_id': self.vehicle.id,
            'lot_id': self.lot.id,
            'pass_type': 'full_coverage',
            'payment_method': 'card',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        pass_data = res.data['pass']
        self.assertTrue(pass_data['pass_code'].startswith('PASS-'))
        self.assertEqual(pass_data['status'], 'active')
        self.assertEqual(pass_data['vehicle_license_plate'], 'KA01AB1234')

        # Check eligibility method on model
        monthly_pass = MonthlyPass.objects.get(id=pass_data['id'])
        now = timezone.now()
        start = now + timedelta(hours=1)
        end = now + timedelta(hours=3)

        # Matching vehicle and lot -> Valid
        valid, msg = monthly_pass.is_valid_for_booking(self.lot, 'KA01AB1234', start, end)
        self.assertTrue(valid)

        # Mismatched vehicle -> Invalid
        valid_bad, msg_bad = monthly_pass.is_valid_for_booking(self.lot, 'MH02ZZ9999', start, end)
        self.assertFalse(valid_bad)
        self.assertIn('linked to vehicle', msg_bad)

    # --------------------------------------------------------------------------
    # 4. BOOKING WITH MONTHLY PASS (100% COVERAGE)
    # --------------------------------------------------------------------------
    def test_booking_covered_by_monthly_pass(self):
        now = timezone.now()
        start = now + timedelta(hours=2)
        end = now + timedelta(hours=4)

        # Issue active pass to customer
        m_pass = MonthlyPass.objects.create(
            user=self.customer,
            vehicle=self.vehicle,
            vehicle_license_plate=self.vehicle.license_plate,
            lot=self.lot,
            pass_name='All-Access',
            pass_type='full_coverage',
            discount_percent=Decimal('100.00'),
            price=Decimal('1499.00'),
            status='active',
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=29),
        )

        self.client.force_authenticate(user=self.customer)
        res = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.id,
            'slot_id': self.slot.id,
            'vehicle_number': self.vehicle.license_plate,
            'vehicle_type': 'car',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
            'pass_id': m_pass.id,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(res.data['amount'])), Decimal('0.00'))
        self.assertEqual(res.data['status'], Booking.STATUS_CONFIRMED)

        # Verify pass usage incremented
        m_pass.refresh_from_db()
        self.assertEqual(m_pass.usage_count, 1)

    # --------------------------------------------------------------------------
    # 5. BOOKING CONFLICT WITH PASS
    # --------------------------------------------------------------------------
    def test_conflicting_booking_with_same_pass_prevented(self):
        now = timezone.now()
        start1 = now + timedelta(hours=2)
        end1 = now + timedelta(hours=5)

        m_pass = MonthlyPass.objects.create(
            user=self.customer,
            vehicle=self.vehicle,
            vehicle_license_plate=self.vehicle.license_plate,
            lot=self.lot,
            pass_type='full_coverage',
            discount_percent=Decimal('100.00'),
            status='active',
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=29),
        )

        # Create slot 2 so slot overlap is not the issue
        slot2 = ParkingSlot.objects.create(lot=self.lot, slot_number='M-102', slot_type='car', is_active=True)

        # First booking uses pass
        b1 = Booking.objects.create(
            user=self.customer,
            slot=self.slot,
            vehicle_number=self.vehicle.license_plate,
            start_time=start1,
            end_time=end1,
            amount=Decimal('0.00'),
            monthly_pass=m_pass,
            status=Booking.STATUS_CONFIRMED,
        )

        # Second booking attempts to use same pass for overlapping time on slot2
        benefits_res = calculate_booking_benefits(
            user=self.customer,
            lot=self.lot,
            vehicle_number=self.vehicle.license_plate,
            vehicle_type='car',
            start_time=start1 + timedelta(hours=1),
            end_time=end1 + timedelta(hours=1),
            raw_dynamic_total=Decimal('100.00'),
            requested_pass_id=m_pass.id,
        )
        benefits_dict = benefits_res[1]
        self.assertFalse(benefits_dict['pass_status']['applied'])
        self.assertIn('Conflicting active booking', benefits_dict['pass_status']['reason'])

    # --------------------------------------------------------------------------
    # 6. BOOKING WITH MEMBERSHIP DISCOUNT
    # --------------------------------------------------------------------------
    def test_booking_with_membership_discount(self):
        plan = MembershipPlan.objects.create(
            name='25% Off Plan',
            duration_days=30,
            price=Decimal('199.00'),
            discount_type='percentage',
            discount_value=Decimal('25.00'),
            is_active=True,
        )
        now = timezone.now()
        CustomerMembership.objects.create(
            user=self.customer,
            plan=plan,
            status='active',
            start_date=now - timedelta(days=2),
            end_date=now + timedelta(days=28),
        )

        self.client.force_authenticate(user=self.customer)
        start = now + timedelta(hours=3)
        end = now + timedelta(hours=5)

        res = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.id,
            'slot_id': self.slot.id,
            'vehicle_number': self.vehicle.license_plate,
            'vehicle_type': 'car',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        snapshot = res.data['price_snapshot']
        self.assertIn('benefits', snapshot)
        self.assertTrue(snapshot['benefits']['membership_status']['applied'])
        self.assertGreater(snapshot['benefits']['membership_discount_amount'], 0)

    # --------------------------------------------------------------------------
    # 7. LOYALTY POINTS EARNING & DUPLICATE PREVENTION
    # --------------------------------------------------------------------------
    def test_loyalty_points_earning_and_idempotency(self):
        now = timezone.now()
        booking = Booking.objects.create(
            user=self.customer,
            slot=self.slot,
            vehicle_number=self.vehicle.license_plate,
            start_time=now + timedelta(hours=1),
            end_time=now + timedelta(hours=3),
            amount=Decimal('100.00'),
            status=Booking.STATUS_PENDING,
        )

        # 1. Earn points on payment
        earned = award_booking_loyalty_points(booking, Decimal('100.00'))
        self.assertEqual(earned, 10)  # 100 * 0.10

        acct = LoyaltyAccount.objects.get(user=self.customer)
        self.assertEqual(acct.points_balance, 10)
        self.assertEqual(acct.lifetime_earned, 10)

        # 2. Duplicate earning attempt (same booking) -> protected by idempotency
        duplicate_earned = award_booking_loyalty_points(booking, Decimal('100.00'))
        self.assertEqual(duplicate_earned, 0)
        acct.refresh_from_db()
        self.assertEqual(acct.points_balance, 10)

    # --------------------------------------------------------------------------
    # 8. LOYALTY POINTS REDEMPTION & BALANCE CHECKS
    # --------------------------------------------------------------------------
    def test_loyalty_points_redemption(self):
        acct = get_or_create_loyalty_account(self.customer)
        acct.points_balance = 100
        acct.lifetime_earned = 100
        acct.save()

        now = timezone.now()
        start = now + timedelta(hours=2)
        end = now + timedelta(hours=4)

        self.client.force_authenticate(user=self.customer)
        # Redeem 40 points on booking
        res = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.id,
            'slot_id': self.slot.id,
            'vehicle_number': self.vehicle.license_plate,
            'vehicle_type': 'car',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
            'redeem_points': 40,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['points_redeemed'], 40)
        self.assertEqual(Decimal(str(res.data['points_discount_amount'])), Decimal('20.00'))  # 40 * 0.50

        acct.refresh_from_db()
        self.assertEqual(acct.points_balance, 60)

    # --------------------------------------------------------------------------
    # 9. CANCELLATION REVERSES POINTS & RESTORES USAGE
    # --------------------------------------------------------------------------
    def test_cancellation_reverses_points_and_benefits(self):
        acct = get_or_create_loyalty_account(self.customer)
        acct.points_balance = 50
        acct.save()

        now = timezone.now()
        start = now + timedelta(hours=3)
        end = now + timedelta(hours=5)

        # Booking where customer redeemed 20 points and was awarded 10 points
        booking = Booking.objects.create(
            user=self.customer,
            slot=self.slot,
            vehicle_number=self.vehicle.license_plate,
            start_time=start,
            end_time=end,
            amount=Decimal('50.00'),
            points_redeemed=20,
            points_awarded=10,
            status=Booking.STATUS_CONFIRMED,
        )
        # Simulate that account received 10 awarded points earlier
        acct.points_balance += 10
        acct.save()

        self.client.force_authenticate(user=self.customer)
        cancel_url = reverse('api_booking_cancel', kwargs={'booking_id': str(booking.booking_id)})
        res = self.client.post(cancel_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        acct.refresh_from_db()
        # 50 initial + 10 awarded - 10 reversed + 20 refunded = 70
        self.assertEqual(acct.points_balance, 70)

        # Check ledger entries exist
        has_rev = LoyaltyTransaction.objects.filter(booking=booking, transaction_type='reversed').exists()
        has_ref = LoyaltyTransaction.objects.filter(booking=booking, transaction_type='refunded').exists()
        self.assertTrue(has_rev)
        self.assertTrue(has_ref)

    # --------------------------------------------------------------------------
    # 10. UNAUTHORIZED ACCESS ENFORCEMENT
    # --------------------------------------------------------------------------
    def test_unauthorized_access_protection(self):
        # Create membership for customer alex
        plan = MembershipPlan.objects.create(name='P1', duration_days=30, price=Decimal('100.00'))
        mem = CustomerMembership.objects.create(user=self.customer, plan=plan, status='active')

        # Customer bob tries to cancel customer alex's renewal
        self.client.force_authenticate(user=self.other_customer)
        url = reverse('api_membership_cancel_renewal', kwargs={'pk': mem.id})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Customer bob tries to adjust points as admin
        url_adj = reverse('api_loyalty_admin_adjust')
        res_adj = self.client.post(url_adj, {
            'user_id': self.other_customer.id,
            'points': 500,
            'adjustment_type': 'credit',
            'reason': 'self-credit',
        })
        self.assertEqual(res_adj.status_code, status.HTTP_403_FORBIDDEN)
