import uuid
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from .models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle, Notification,
    SupportTicket, TicketMessage, TicketAuditLog
)

User = get_user_model()


class SmartParkingAPITests(APITestCase):
    def setUp(self):
        # Users
        self.user_a = User.objects.create_user(username='customer_a', email='a@example.com', password='password123')
        self.user_b = User.objects.create_user(username='customer_b', email='b@example.com', password='password123')
        self.staff_user = User.objects.create_user(username='staff_user', email='staff@example.com', password='password123', is_staff=True)
        self.admin_user = User.objects.create_superuser(username='admin_user', email='admin@example.com', password='password123')

        # Parking lot
        self.lot = ParkingLot.objects.create(
            name='Central Plaza Parking',
            location='Main Street, Chennai',
            price_per_hour=Decimal('20.00'),
            is_active=True,
        )

        # Slots
        self.slot_1 = ParkingSlot.objects.create(lot=self.lot, slot_number='P-01', slot_type='car', is_active=True)
        self.slot_2 = ParkingSlot.objects.create(lot=self.lot, slot_number='P-02', slot_type='car', is_active=True)
        self.slot_3 = ParkingSlot.objects.create(lot=self.lot, slot_number='P-03', slot_type='bike', is_active=True)
        self.slot_inactive = ParkingSlot.objects.create(lot=self.lot, slot_number='P-04', slot_type='car', is_active=False)

    # --------------------------------------------------------------------------
    # 1. AUTHENTICATION TESTS
    # --------------------------------------------------------------------------
    def test_register_and_login_flow(self):
        # Register
        reg_response = self.client.post(reverse('api_register'), {
            'username': 'new_driver',
            'email': 'driver@example.com',
            'password': 'securepassword123',
            'first_name': 'New Driver',
        })
        self.assertEqual(reg_response.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', reg_response.data)

        # Login
        login_response = self.client.post(reverse('api_login'), {
            'username': 'new_driver',
            'password': 'securepassword123',
        })
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        token = login_response.data['token']

        # Profile with token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        profile_response = self.client.get(reverse('api_user_profile'))
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_response.data['username'], 'new_driver')
        self.assertEqual(profile_response.data['role'], 'customer')

    def test_login_invalid_credentials(self):
        response = self.client.post(reverse('api_login'), {
            'username': 'customer_a',
            'password': 'wrongpassword',
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # --------------------------------------------------------------------------
    # 2. PARKING LOTS & LIVE SLOTS
    # --------------------------------------------------------------------------
    def test_parking_lot_listing_and_slots(self):
        response = self.client.get(reverse('api_lot_list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)

        slots_resp = self.client.get(reverse('api_lot_slots', kwargs={'pk': self.lot.pk}))
        self.assertEqual(slots_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(slots_resp.data), 4)

    def test_staff_slot_update_parses_false_string_as_false(self):
        self.client.force_authenticate(user=self.staff_user)

        response = self.client.patch(
            reverse('api_slot_status_update', kwargs={'pk': self.slot_1.pk}),
            {'is_active': 'false'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.slot_1.refresh_from_db()
        self.assertFalse(self.slot_1.is_active)

    def test_customer_cannot_trigger_expiry_maintenance(self):
        self.client.force_authenticate(user=self.user_a)

        response = self.client.post(reverse('api_notifications_run_expiry_check'))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --------------------------------------------------------------------------
    # 3. VALID BOOKING CREATION & SERVER PRICING
    # --------------------------------------------------------------------------
    def test_valid_booking_creation_and_payment(self):
        self.client.force_authenticate(user=self.user_a)
        start = timezone.now() + timezone.timedelta(hours=2)
        end = start + timezone.timedelta(hours=3)

        payload = {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 07 AB 1234',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        }

        resp = self.client.post(reverse('api_booking_create'), payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        booking_data = resp.data
        self.assertEqual(booking_data['status'], 'pending')
        # Amount calculated dynamically based on base rate + peak/tax engine
        self.assertGreater(Decimal(str(booking_data['amount'])), Decimal('0.00'))
        self.assertEqual(Decimal(str(booking_data['amount'])), Decimal(str(booking_data['price_snapshot']['total_amount'])))

        # Complete Payment
        booking_id = booking_data['booking_id']
        pay_resp = self.client.post(reverse('api_booking_payment', kwargs={'booking_id': booking_id}), {
            'method': 'upi',
        })
        self.assertEqual(pay_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(pay_resp.data['booking']['status'], 'confirmed')
        self.assertTrue(Payment.objects.filter(booking__booking_id=booking_id, status='success').exists())

    def test_payment_rejects_unknown_method(self):
        start = timezone.now() + timezone.timedelta(hours=2)
        booking = Booking.objects.create(
            user=self.user_a,
            slot=self.slot_1,
            vehicle_number='TN 07 AB 1234',
            start_time=start,
            end_time=start + timezone.timedelta(hours=2),
            amount=Decimal('40.00'),
            status=Booking.STATUS_PENDING,
        )
        self.client.force_authenticate(user=self.user_a)

        response = self.client.post(
            reverse('api_booking_payment', kwargs={'booking_id': booking.booking_id}),
            {'method': 'invalid'},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Payment.objects.filter(booking=booking).exists())
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.STATUS_PENDING)

    def test_template_booking_allows_future_slot_when_occupied_now(self):
        now = timezone.now()
        Booking.objects.create(
            user=self.user_b,
            slot=self.slot_1,
            vehicle_number='TN 09 XX 9999',
            start_time=now - timezone.timedelta(minutes=30),
            end_time=now + timezone.timedelta(hours=1),
            amount=Decimal('40.00'),
            status=Booking.STATUS_ACTIVE,
        )
        start = now + timezone.timedelta(days=1)
        self.client.force_login(self.user_a)

        response = self.client.post(
            reverse('book_slot', kwargs={'lot_id': self.lot.pk, 'slot_id': self.slot_1.pk}),
            {
                'vehicle_number': 'TN 07 AB 1234',
                'start_time': start.strftime('%Y-%m-%dT%H:%M'),
                'end_time': (start + timezone.timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M'),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(Booking.objects.filter(user=self.user_a, slot=self.slot_1).count(), 1)

    def test_template_booking_rejects_overlapping_pending_hold(self):
        start = timezone.now() + timezone.timedelta(days=1)
        Booking.objects.create(
            user=self.user_b,
            slot=self.slot_1,
            vehicle_number='TN 09 XX 9999',
            start_time=start,
            end_time=start + timezone.timedelta(hours=2),
            amount=Decimal('40.00'),
            status=Booking.STATUS_PENDING,
        )
        self.client.force_login(self.user_a)
        local_start = timezone.localtime(start)

        response = self.client.post(
            reverse('book_slot', kwargs={'lot_id': self.lot.pk, 'slot_id': self.slot_1.pk}),
            {
                'vehicle_number': 'TN 07 AB 1234',
                'start_time': local_start.strftime('%Y-%m-%dT%H:%M'),
                'end_time': (local_start + timezone.timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M'),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(Booking.objects.filter(slot=self.slot_1).count(), 1)

    # --------------------------------------------------------------------------
    # 4. TIME VALIDATIONS (Past Start, Invalid Range, CheckConstraint)
    # --------------------------------------------------------------------------
    def test_past_start_time_rejected(self):
        self.client.force_authenticate(user=self.user_a)
        past_start = timezone.now() - timezone.timedelta(hours=1)
        end = timezone.now() + timezone.timedelta(hours=1)

        resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 07 AB 1234',
            'start_time': past_start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('start_time', str(resp.data))

    def test_invalid_time_range_end_before_start(self):
        self.client.force_authenticate(user=self.user_a)
        start = timezone.now() + timezone.timedelta(hours=2)
        end = start - timezone.timedelta(hours=1)

        resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 07 AB 1234',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --------------------------------------------------------------------------
    # 5. FUTURE BOOKING WHILE SLOT IS OCCUPIED NOW (Task 2 Fix)
    # --------------------------------------------------------------------------
    def test_future_booking_allowed_when_slot_occupied_now(self):
        # Create an ongoing booking occupied right now
        now = timezone.now()
        Booking.objects.create(
            user=self.user_b,
            slot=self.slot_1,
            vehicle_number='TN 09 XX 9999',
            start_time=now - timezone.timedelta(minutes=30),
            end_time=now + timezone.timedelta(hours=1),
            amount=Decimal('40.00'),
            status=Booking.STATUS_ACTIVE,
        )

        # Slot is occupied right now
        self.assertFalse(self.slot_1.is_available(now))

        # User A reserves the same slot for tomorrow
        self.client.force_authenticate(user=self.user_a)
        tomorrow_start = now + timezone.timedelta(days=1)
        tomorrow_end = tomorrow_start + timezone.timedelta(hours=2)

        resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 07 AB 1234',
            'start_time': tomorrow_start.isoformat(),
            'end_time': tomorrow_end.isoformat(),
        })
        # Must be accepted! (Future reservation not blocked by current occupancy)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    # --------------------------------------------------------------------------
    # 6. OVERLAPPING BOOKINGS PREVENTED (Task 3 Rule)
    # --------------------------------------------------------------------------
    def test_overlapping_bookings_rejected(self):
        self.client.force_authenticate(user=self.user_a)
        base_start = timezone.now() + timezone.timedelta(days=1, hours=10)
        base_end = base_start + timezone.timedelta(hours=2) # 10:00 to 12:00

        # Create confirmed booking
        Booking.objects.create(
            user=self.user_a,
            slot=self.slot_1,
            vehicle_number='TN 07 AB 1234',
            start_time=base_start,
            end_time=base_end,
            amount=Decimal('40.00'),
            status=Booking.STATUS_CONFIRMED,
        )

        # User B attempts overlapping intervals:
        # 1. 09:30 to 11:00 (overlaps start)
        resp1 = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 09 CD 5678',
            'start_time': (base_start - timezone.timedelta(minutes=30)).isoformat(),
            'end_time': (base_start + timezone.timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(resp1.status_code, status.HTTP_409_CONFLICT)

        # 2. 11:00 to 13:00 (overlaps end)
        resp2 = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 09 CD 5678',
            'start_time': (base_start + timezone.timedelta(hours=1)).isoformat(),
            'end_time': (base_end + timezone.timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(resp2.status_code, status.HTTP_409_CONFLICT)

        # 3. 09:00 to 13:00 (engulfing)
        resp3 = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 09 CD 5678',
            'start_time': (base_start - timezone.timedelta(hours=1)).isoformat(),
            'end_time': (base_end + timezone.timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(resp3.status_code, status.HTTP_409_CONFLICT)

    # --------------------------------------------------------------------------
    # 7. ADJACENT NON-OVERLAPPING BOOKINGS ALLOWED
    # --------------------------------------------------------------------------
    def test_adjacent_non_overlapping_bookings_allowed(self):
        self.client.force_authenticate(user=self.user_a)
        base_start = timezone.now() + timezone.timedelta(days=1, hours=10)
        base_end = base_start + timezone.timedelta(hours=2) # 10:00 to 12:00

        Booking.objects.create(
            user=self.user_a,
            slot=self.slot_1,
            vehicle_number='TN 07 AB 1234',
            start_time=base_start,
            end_time=base_end,
            amount=Decimal('40.00'),
            status=Booking.STATUS_CONFIRMED,
        )

        # Adjacent before: 08:00 to 10:00
        resp_before = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 07 AB 1234',
            'start_time': (base_start - timezone.timedelta(hours=2)).isoformat(),
            'end_time': base_start.isoformat(),
        })
        self.assertEqual(resp_before.status_code, status.HTTP_201_CREATED)

        # Adjacent after: 12:00 to 14:00
        resp_after = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 07 AB 1234',
            'start_time': base_end.isoformat(),
            'end_time': (base_end + timezone.timedelta(hours=2)).isoformat(),
        })
        self.assertEqual(resp_after.status_code, status.HTTP_201_CREATED)

    # --------------------------------------------------------------------------
    # 8. INACTIVE SLOT REJECTION
    # --------------------------------------------------------------------------
    def test_inactive_maintenance_slot_cannot_be_booked(self):
        self.client.force_authenticate(user=self.user_a)
        start = timezone.now() + timezone.timedelta(hours=1)
        end = start + timezone.timedelta(hours=2)

        resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_inactive.pk, # is_active = False
            'vehicle_number': 'TN 07 AB 1234',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --------------------------------------------------------------------------
    # 9. EXPIRED PAYMENT HOLD STOPS BLOCKING AND CANNOT BE PAID
    # --------------------------------------------------------------------------
    def test_expired_hold_releases_slot_and_rejects_payment(self):
        start = timezone.now() + timezone.timedelta(days=1, hours=2)
        end = start + timezone.timedelta(hours=2)

        # Create booking that was created 15 minutes ago (hold window is 10 min)
        booking = Booking.objects.create(
            user=self.user_a,
            slot=self.slot_1,
            vehicle_number='TN 07 AB 1234',
            start_time=start,
            end_time=end,
            amount=Decimal('40.00'),
            status=Booking.STATUS_PENDING,
        )
        # Manually backdate created_at
        Booking.objects.filter(pk=booking.pk).update(
            created_at=timezone.now() - timezone.timedelta(minutes=15)
        )
        booking.refresh_from_db()
        self.assertTrue(booking.is_hold_expired)

        # Check if slot is blocked by this expired hold
        self.assertFalse(self.slot_1.is_interval_blocked(start, end))

        # Attempting to pay for expired booking must be rejected
        self.client.force_authenticate(user=self.user_a)
        pay_resp = self.client.post(reverse('api_booking_payment', kwargs={'booking_id': booking.booking_id}), {
            'method': 'upi',
        })
        self.assertEqual(pay_resp.status_code, status.HTTP_410_GONE)

    # --------------------------------------------------------------------------
    # 10. UNAUTHORIZED ACCESS & CANCELLATION PERMISSIONS (403 Forbidden)
    # --------------------------------------------------------------------------
    def test_unauthorized_user_cannot_cancel_or_pay_another_users_booking(self):
        start = timezone.now() + timezone.timedelta(days=1, hours=2)
        end = start + timezone.timedelta(hours=2)

        booking = Booking.objects.create(
            user=self.user_a,
            slot=self.slot_1,
            vehicle_number='TN 07 AB 1234',
            start_time=start,
            end_time=end,
            amount=Decimal('40.00'),
            status=Booking.STATUS_CONFIRMED,
        )

        # User B attempts to access/cancel User A's booking
        self.client.force_authenticate(user=self.user_b)
        cancel_resp = self.client.post(reverse('api_booking_cancel', kwargs={'booking_id': booking.booking_id}))
        self.assertEqual(cancel_resp.status_code, status.HTTP_403_FORBIDDEN)

        # User A cancels their own booking -> 200 OK
        self.client.force_authenticate(user=self.user_a)
        cancel_resp_a = self.client.post(reverse('api_booking_cancel', kwargs={'booking_id': booking.booking_id}))
        self.assertEqual(cancel_resp_a.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.STATUS_CANCELLED)

    # --------------------------------------------------------------------------
    # 11. CORRECT OCCUPANCY COUNTS (Task 7 Fix)
    # --------------------------------------------------------------------------
    def test_correct_occupancy_counts_exclude_inactive_slots(self):
        now = timezone.now()
        # self.lot has:
        # slot_1: active, not booked
        # slot_2: active, booked now
        # slot_3: active, reserved tomorrow
        # slot_inactive: inactive (maintenance)

        # Make slot_2 occupied right now
        Booking.objects.create(
            user=self.user_a,
            slot=self.slot_2,
            vehicle_number='TN 07 AB 1234',
            start_time=now - timezone.timedelta(minutes=30),
            end_time=now + timezone.timedelta(hours=1),
            amount=Decimal('30.00'),
            status=Booking.STATUS_ACTIVE,
        )

        # Make slot_3 reserved for tomorrow
        Booking.objects.create(
            user=self.user_b,
            slot=self.slot_3,
            vehicle_number='TN 09 BB 2222',
            start_time=now + timezone.timedelta(days=1),
            end_time=now + timezone.timedelta(days=1, hours=2),
            amount=Decimal('40.00'),
            status=Booking.STATUS_CONFIRMED,
        )

        self.lot.refresh_from_db()
        self.assertEqual(self.lot.total_slots, 4)
        self.assertEqual(self.lot.active_slots_count, 3)
        self.assertEqual(self.lot.inactive_slots_count, 1)

        # Available now: slot_1 (free) + slot_3 (reserved tomorrow, so free right now) = 2
        self.assertEqual(self.lot.available_slots_count, 2)

        # Occupied now: only slot_2 = 1. (slot_inactive is NOT counted as occupied!)
        self.assertEqual(self.lot.occupied_slots_count, 1)

        # Future reserved: slot_3 = 1
        self.assertEqual(self.lot.future_reserved_slots_count, 1)

        # Occupancy percent: 1 occupied / 3 active slots = 33% (NOT 2/4 = 50%)
        self.assertEqual(self.lot.occupancy_percent, 33)

    # --------------------------------------------------------------------------
    # 12. VEHICLE CRUD APIS
    # --------------------------------------------------------------------------
    def test_vehicle_crud(self):
        self.client.force_authenticate(user=self.user_a)

        # Add vehicle
        create_resp = self.client.post(reverse('api_vehicles'), {
            'license_plate': 'TN 07 QW 1122',
            'vehicle_type': 'car',
            'nickname': "Rahul's SUV",
            'is_default': True,
        })
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        vehicle_id = create_resp.data['id']

        # List vehicles
        list_resp = self.client.get(reverse('api_vehicles'))
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp.data), 1)

        # Delete vehicle
        del_resp = self.client.delete(reverse('api_vehicle_detail', kwargs={'pk': vehicle_id}))
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Vehicle.objects.filter(user=self.user_a).count(), 0)

    # --------------------------------------------------------------------------
    # 13. STAFF DASHBOARD & GATE SCANNER
    # --------------------------------------------------------------------------
    def test_staff_plate_verify_and_gate_actions(self):
        # Create confirmed booking for User A
        start = timezone.now() + timezone.timedelta(hours=1)
        end = start + timezone.timedelta(hours=2)
        b = Booking.objects.create(
            user=self.user_a,
            slot=self.slot_1,
            vehicle_number='TN 07 GATE 1',
            start_time=start,
            end_time=end,
            amount=Decimal('40.00'),
            status=Booking.STATUS_CONFIRMED,
        )

        self.client.force_authenticate(user=self.staff_user)

        # Verify plate
        verify_resp = self.client.post(reverse('api_staff_verify_plate'), {'query': 'TN 07 GATE 1'})
        self.assertEqual(verify_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(verify_resp.data['found'])

        # Gate IN action
        in_resp = self.client.post(reverse('api_staff_gate_action'), {
            'booking_id': str(b.booking_id),
            'action': 'in',
        })
        self.assertEqual(in_resp.status_code, status.HTTP_200_OK)
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_ACTIVE)

        # Gate OUT action
        out_resp = self.client.post(reverse('api_staff_gate_action'), {
            'booking_id': str(b.booking_id),
            'action': 'out',
        })
        self.assertEqual(out_resp.status_code, status.HTTP_200_OK)
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_COMPLETED)

    # --------------------------------------------------------------------------
    # 14. ADMIN STATS API
    # --------------------------------------------------------------------------
    def test_admin_stats_endpoint(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse('api_admin_stats'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('total_revenue', resp.data)
        self.assertIn('revenue_trend', resp.data)
        self.assertIn('occupancy_breakdown', resp.data)

    # --------------------------------------------------------------------------
    # 15. PHASE 3 RESERVATION & FILTERING TESTS
    # --------------------------------------------------------------------------
    def test_parking_lot_search_by_name_and_address(self):
        # Search by name
        resp = self.client.get(reverse('api_lot_list'), {'search': 'Central'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['name'], 'Central Plaza Parking')

        # Search by address / location
        resp2 = self.client.get(reverse('api_lot_list'), {'search': 'Chennai'})
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp2.data), 1)

        # Search non-matching
        resp3 = self.client.get(reverse('api_lot_list'), {'search': 'NonExistentHub'})
        self.assertEqual(resp3.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp3.data), 0)

    def test_parking_lot_filters_price_and_vehicle_type(self):
        # Filter price <= 10 (should be empty since lot is 20)
        resp_cheap = self.client.get(reverse('api_lot_list'), {'max_price': '10'})
        self.assertEqual(len(resp_cheap.data), 0)

        # Filter price <= 25 (matches)
        resp_ok = self.client.get(reverse('api_lot_list'), {'max_price': '25'})
        self.assertEqual(len(resp_ok.data), 1)

        # Filter vehicle type
        resp_car = self.client.get(reverse('api_lot_list'), {'vehicle_type': 'car'})
        self.assertEqual(len(resp_car.data), 1)

    def test_slot_interval_availability_refetch(self):
        # Create a confirmed booking tomorrow 10:00 - 12:00 on slot_1
        tomorrow = timezone.now() + timezone.timedelta(days=1)
        start = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0)
        end = tomorrow.replace(hour=12, minute=0, second=0, microsecond=0)

        Booking.objects.create(
            user=self.user_a,
            slot=self.slot_1,
            vehicle_number='TN 07 TEST 1',
            start_time=start,
            end_time=end,
            amount=Decimal('40.00'),
            status=Booking.STATUS_CONFIRMED,
        )

        # Check slots for non-overlapping window tomorrow 14:00 - 16:00
        non_overlap_start = tomorrow.replace(hour=14, minute=0, second=0, microsecond=0)
        non_overlap_end = tomorrow.replace(hour=16, minute=0, second=0, microsecond=0)
        resp_free = self.client.get(reverse('api_lot_slots', kwargs={'pk': self.lot.pk}), {
            'start_time': non_overlap_start.isoformat(),
            'end_time': non_overlap_end.isoformat(),
        })
        self.assertEqual(resp_free.status_code, status.HTTP_200_OK)
        slot_1_data = next(s for s in resp_free.data if s['id'] == self.slot_1.id)
        self.assertEqual(slot_1_data['status'], 'available')

        # Check slots for overlapping window tomorrow 11:00 - 13:00 -> should be occupied!
        overlap_start = tomorrow.replace(hour=11, minute=0, second=0, microsecond=0)
        overlap_end = tomorrow.replace(hour=13, minute=0, second=0, microsecond=0)
        resp_blocked = self.client.get(reverse('api_lot_slots', kwargs={'pk': self.lot.pk}), {
            'start_time': overlap_start.isoformat(),
            'end_time': overlap_end.isoformat(),
        })
        self.assertEqual(resp_blocked.status_code, status.HTTP_200_OK)
        slot_1_blocked = next(s for s in resp_blocked.data if s['id'] == self.slot_1.id)
        self.assertEqual(slot_1_blocked['status'], 'occupied')

    def test_conflicting_booking_rejection(self):
        self.client.force_authenticate(user=self.user_a)
        start = timezone.now() + timezone.timedelta(hours=2)
        end = start + timezone.timedelta(hours=2)

        # First booking succeeds
        resp1 = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 01 A 1111',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        # Second booking by user B for overlapping time is rejected with 409 CONFLICT
        self.client.force_authenticate(user=self.user_b)
        resp2 = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_1.pk,
            'vehicle_number': 'TN 02 B 2222',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp2.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('already booked', resp2.data['message'])

    def test_phase3_all_scenarios_validation(self):
        """
        Verify all 6 Phase 3 test scenarios:
        1. Successful booking
        2. Unavailable slot (maintenance)
        3. Conflicting booking (409 Conflict)
        4. Invalid time range (end <= start, < 30m, > 24h, past start)
        5. Expired session / unauthenticated request (401 Unauthorized)
        6. API failure (e.g. inactive lot, non-existent slot)
        """
        # 1. Successful booking
        self.client.force_authenticate(user=self.user_a)
        start = timezone.now() + timezone.timedelta(hours=3)
        end = start + timezone.timedelta(hours=2)
        resp_success = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_2.pk,
            'vehicle_number': 'TN 07 SUCCESS',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp_success.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_success.data['status'], 'pending')

        # 2. Unavailable slot (maintenance is_active=False)
        resp_unavail = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_inactive.pk,
            'vehicle_number': 'TN 07 MAINT',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp_unavail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('maintenance', resp_unavail.data['message'].lower())

        # 3. Conflicting booking (same slot, overlapping window)
        self.client.force_authenticate(user=self.user_b)
        resp_conflict = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_2.pk,
            'vehicle_number': 'TN 07 CONFLICT',
            'start_time': (start + timezone.timedelta(minutes=30)).isoformat(),
            'end_time': (end + timezone.timedelta(minutes=30)).isoformat(),
        })
        self.assertEqual(resp_conflict.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('already booked', resp_conflict.data['message'])

        # 4. Invalid time ranges
        self.client.force_authenticate(user=self.user_a)
        # 4a. Past start
        past_resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_3.pk,
            'vehicle_number': 'TN 07 PAST',
            'start_time': (timezone.now() - timezone.timedelta(hours=1)).isoformat(),
            'end_time': (timezone.now() + timezone.timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(past_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 4b. End before start
        end_before_resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_3.pk,
            'vehicle_number': 'TN 07 REVERSE',
            'start_time': (timezone.now() + timezone.timedelta(hours=2)).isoformat(),
            'end_time': (timezone.now() + timezone.timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(end_before_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 4c. Duration < 30 minutes
        short_resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_3.pk,
            'vehicle_number': 'TN 07 SHORT',
            'start_time': (timezone.now() + timezone.timedelta(hours=2)).isoformat(),
            'end_time': (timezone.now() + timezone.timedelta(hours=2, minutes=10)).isoformat(),
        })
        self.assertEqual(short_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Expired session / unauthenticated request
        self.client.logout()
        unauth_resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_3.pk,
            'vehicle_number': 'TN 07 UNAUTH',
            'start_time': (timezone.now() + timezone.timedelta(hours=2)).isoformat(),
            'end_time': (timezone.now() + timezone.timedelta(hours=4)).isoformat(),
        })
        self.assertEqual(unauth_resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # 6. API failure / Inactive lot
        self.lot.is_active = False
        self.lot.save()
        self.client.force_authenticate(user=self.user_a)
        inactive_resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': self.lot.pk,
            'slot_id': self.slot_3.pk,
            'vehicle_number': 'TN 07 INACTIVE',
            'start_time': (timezone.now() + timezone.timedelta(hours=2)).isoformat(),
            'end_time': (timezone.now() + timezone.timedelta(hours=4)).isoformat(),
        })
        self.assertEqual(inactive_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('inactive', inactive_resp.data['message'])

    # --------------------------------------------------------------------------
    # 16. SMART PARKING RECOMMENDATION TESTS
    # --------------------------------------------------------------------------
    def test_recommendation_search_by_destination_and_area(self):
        # Create second lot in another area
        lot_b = ParkingLot.objects.create(
            name='OMR Tech Hub',
            location='OMR Road, Chennai',
            price_per_hour=Decimal('35.00'),
            latitude=Decimal('12.971600'),
            longitude=Decimal('80.245200'),
            is_active=True,
        )
        ParkingSlot.objects.create(lot=lot_b, slot_number='T-01', slot_type='car', is_active=True)

        # Search for "Central"
        resp = self.client.get(reverse('api_lot_recommend'), {'destination': 'Central'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['total_matching_lots'], 1)
        self.assertEqual(resp.data['recommendations'][0]['lot_name'], 'Central Plaza Parking')

        # Search for "OMR"
        resp_omr = self.client.get(reverse('api_lot_recommend'), {'destination': 'OMR'})
        self.assertEqual(resp_omr.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_omr.data['total_matching_lots'], 1)
        self.assertEqual(resp_omr.data['recommendations'][0]['lot_name'], 'OMR Tech Hub')

        # Search for non-matching area
        resp_none = self.client.get(reverse('api_lot_recommend'), {'destination': 'Bangalore'})
        self.assertEqual(resp_none.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_none.data['total_matching_lots'], 0)

    def test_recommendation_filtering_by_price_and_vehicle_type(self):
        # Lot A: price 20, slots: 2 car, 1 bike
        # Lot B: price 50, slots: 1 car
        lot_b = ParkingLot.objects.create(
            name='Luxury Bay',
            location='Airport, Chennai',
            price_per_hour=Decimal('50.00'),
            is_active=True,
        )
        ParkingSlot.objects.create(lot=lot_b, slot_number='L-01', slot_type='car', is_active=True)

        # Filter price_max=25 -> should only return Lot A
        resp_cheap = self.client.get(reverse('api_lot_recommend'), {'price_max': '25'})
        self.assertEqual(resp_cheap.status_code, status.HTTP_200_OK)
        names = [r['lot_name'] for r in resp_cheap.data['recommendations']]
        self.assertIn('Central Plaza Parking', names)
        self.assertNotIn('Luxury Bay', names)

        # Filter vehicle_type='bike' -> should only return Lot A (Lot B has only car)
        resp_bike = self.client.get(reverse('api_lot_recommend'), {'vehicle_type': 'bike'})
        self.assertEqual(resp_bike.status_code, status.HTTP_200_OK)
        names_bike = [r['lot_name'] for r in resp_bike.data['recommendations']]
        self.assertIn('Central Plaza Parking', names_bike)
        self.assertNotIn('Luxury Bay', names_bike)

    def test_recommendation_distance_scoring_when_coordinates_exist_and_omission(self):
        # Lot with coordinates
        self.lot.latitude = Decimal('13.085000')
        self.lot.longitude = Decimal('80.210100')
        self.lot.save()

        start = timezone.now() + timezone.timedelta(hours=2)
        end = start + timezone.timedelta(hours=2)

        # Case 1: Coordinates provided
        resp_with_coords = self.client.get(reverse('api_lot_recommend'), {
            'user_lat': '13.082700',
            'user_lng': '80.260700',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp_with_coords.status_code, status.HTTP_200_OK)
        self.assertTrue(resp_with_coords.data['distance_scoring_enabled'])
        rec = resp_with_coords.data['recommendations'][0]
        self.assertIsNotNone(rec['distance_km'])
        self.assertIsNotNone(rec['scoring_breakdown']['distance_score'])

        # Case 2: Coordinates NOT provided (Omission requirement 6)
        resp_no_coords = self.client.get(reverse('api_lot_recommend'), {
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp_no_coords.status_code, status.HTTP_200_OK)
        self.assertFalse(resp_no_coords.data['distance_scoring_enabled'])
        self.assertIsNotNone(resp_no_coords.data['distance_limitation_notice'])
        rec_no_coords = resp_no_coords.data['recommendations'][0]
        self.assertIsNone(rec_no_coords['distance_km'])
        self.assertIsNone(rec_no_coords['scoring_breakdown']['distance_score'])
        self.assertIn('omitted', rec_no_coords['scoring_breakdown']['distance_reason'].lower())

    def test_recommendation_ranking_preferences_and_availability(self):
        # Create Lot B: higher price (₹40), but 10 available slots
        lot_high_avail = ParkingLot.objects.create(
            name='Mega Hub',
            location='Central, Chennai',
            price_per_hour=Decimal('40.00'),
            is_active=True,
        )
        for i in range(10):
            ParkingSlot.objects.create(lot=lot_high_avail, slot_number=f'M-{i:02d}', slot_type='car', is_active=True)

        start = timezone.now() + timezone.timedelta(hours=3)
        end = start + timezone.timedelta(hours=2)

        # Preference: cheapest -> Central Plaza (₹20) should rank #1
        resp_cheap = self.client.get(reverse('api_lot_recommend'), {
            'preference': 'cheapest',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp_cheap.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_cheap.data['recommendations'][0]['lot_name'], 'Central Plaza Parking')

        # Preference: availability -> Mega Hub (10 free slots) should rank #1
        resp_avail = self.client.get(reverse('api_lot_recommend'), {
            'preference': 'availability',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp_avail.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_avail.data['recommendations'][0]['lot_name'], 'Mega Hub')

    def test_recommendation_time_validation_errors(self):
        # Past start time
        past_start = timezone.now() - timezone.timedelta(hours=1)
        end = timezone.now() + timezone.timedelta(hours=1)
        resp_past = self.client.get(reverse('api_lot_recommend'), {
            'start_time': past_start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp_past.status_code, status.HTTP_400_BAD_REQUEST)

        # End time before start time
        start = timezone.now() + timezone.timedelta(hours=2)
        end_inv = start - timezone.timedelta(hours=1)
        resp_inv = self.client.get(reverse('api_lot_recommend'), {
            'start_time': start.isoformat(),
            'end_time': end_inv.isoformat(),
        })
        self.assertEqual(resp_inv.status_code, status.HTTP_400_BAD_REQUEST)

    def test_recommendation_booking_integration_and_conflict_prevention(self):
        # 1. Get recommendation
        start = timezone.now() + timezone.timedelta(hours=2)
        end = start + timezone.timedelta(hours=2)
        resp = self.client.get(reverse('api_lot_recommend'), {
            'destination': 'Central',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rec = resp.data['recommendations'][0]
        recommended_slot = rec['recommended_slot']
        self.assertIsNotNone(recommended_slot)

        # 2. Book the recommended slot with authenticated user
        self.client.force_authenticate(user=self.user_a)
        book_resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': rec['lot_id'],
            'slot_id': recommended_slot['id'],
            'vehicle_number': 'TN 07 REC 1234',
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
        })
        self.assertEqual(book_resp.status_code, status.HTTP_201_CREATED)

        # 3. Attempting to book the same slot for overlapping window must be rejected (Req 7)
        self.client.force_authenticate(user=self.user_b)
        conflict_resp = self.client.post(reverse('api_booking_create'), {
            'lot_id': rec['lot_id'],
            'slot_id': recommended_slot['id'],
            'vehicle_number': 'TN 07 CONFLICT',
            'start_time': (start + timezone.timedelta(minutes=30)).isoformat(),
            'end_time': (end + timezone.timedelta(minutes=30)).isoformat(),
        })
        self.assertEqual(conflict_resp.status_code, status.HTTP_409_CONFLICT)


# ==============================================================================
# FEATURE 3: SUPPORT TICKET & COMPLAINT SYSTEM TESTS
# ==============================================================================

class SupportTicketAPITests(APITestCase):
    def setUp(self):
        self.user_a = User.objects.create_user(username='cust_alex', email='alex@example.com', password='password123', first_name='Alex')
        self.user_b = User.objects.create_user(username='cust_bob', email='bob@example.com', password='password123', first_name='Bob')
        self.staff_user = User.objects.create_user(username='staff_sarah', email='sarah@example.com', password='password123', is_staff=True, first_name='Sarah')
        self.admin_user = User.objects.create_superuser(username='admin_boss', email='boss@example.com', password='password123', first_name='Boss')

        self.lot = ParkingLot.objects.create(name='City Center Bay', location='Commercial Road', price_per_hour=Decimal('30.00'))
        self.slot = ParkingSlot.objects.create(lot=self.lot, slot_number='CC-01', slot_type='car')

        start = timezone.now() + timezone.timedelta(hours=2)
        end = start + timezone.timedelta(hours=3)
        self.booking_a = Booking.objects.create(
            user=self.user_a,
            slot=self.slot,
            vehicle_number='TN 07 AA 9999',
            start_time=start,
            end_time=end,
            amount=Decimal('90.00'),
            status='confirmed'
        )

    def test_ticket_creation_and_unique_id(self):
        self.client.force_authenticate(user=self.user_a)
        resp = self.client.post(reverse('api_support_tickets'), {
            'category': 'booking_issue',
            'priority': 'high',
            'subject': 'Unable to access assigned slot',
            'description': 'Arrived at the location but gate barrier sensor was blocked.',
            'booking_id': str(self.booking_a.booking_id),
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.data
        self.assertTrue(data['ticket_id'].startswith('TKT-'))
        self.assertEqual(data['status'], 'open')
        self.assertEqual(data['priority'], 'high')
        self.assertEqual(data['category'], 'booking_issue')
        self.assertEqual(data['booking_details']['booking_id'], str(self.booking_a.booking_id))

        # Confirmation notification created for customer
        self.assertTrue(Notification.objects.filter(user=self.user_a, title__icontains='Created').exists())
        # Audit log created
        self.assertTrue(TicketAuditLog.objects.filter(ticket__ticket_id=data['ticket_id'], action='created').exists())

    def test_ticket_creation_with_valid_attachment(self):
        self.client.force_authenticate(user=self.user_a)
        sample_file = SimpleUploadedFile('receipt.png', b'fake_image_content', content_type='image/png')
        resp = self.client.post(reverse('api_support_tickets'), {
            'category': 'payment_issue',
            'priority': 'medium',
            'subject': 'Double deduction on UPI',
            'description': 'Amount deducted twice from my bank account.',
            'attachment': sample_file,
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIsNotNone(resp.data['attachment_url'])

    def test_ticket_creation_rejects_executable_upload(self):
        self.client.force_authenticate(user=self.user_a)
        malicious_file = SimpleUploadedFile('exploit.exe', b'MZ\x90\x00', content_type='application/octet-stream')
        resp = self.client.post(reverse('api_support_tickets'), {
            'category': 'other',
            'priority': 'low',
            'subject': 'Attachment test',
            'description': 'Testing executable file rejection.',
            'attachment': malicious_file,
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue('Executable' in str(resp.data) or 'prohibited' in str(resp.data))

    def test_cannot_link_other_users_booking(self):
        # User B tries to link User A's booking
        self.client.force_authenticate(user=self.user_b)
        resp = self.client.post(reverse('api_support_tickets'), {
            'category': 'refund_request',
            'subject': 'Claiming refund for someone else',
            'description': 'Attempting unauthorized booking association.',
            'booking_id': str(self.booking_a.booking_id),
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('booking_id', resp.data)

    def test_user_can_only_access_own_tickets(self):
        ticket = SupportTicket.objects.create(
            user=self.user_a,
            category='account_issue',
            subject='Alex personal ticket',
            description='Private account question.'
        )

        # User B cannot view Alex's ticket
        self.client.force_authenticate(user=self.user_b)
        resp_b = self.client.get(reverse('api_support_ticket_detail', kwargs={'ticket_id': ticket.ticket_id}))
        self.assertEqual(resp_b.status_code, status.HTTP_403_FORBIDDEN)

        # User B listing tickets does not include Alex's ticket
        list_b = self.client.get(reverse('api_support_tickets'))
        self.assertEqual(len(list_b.data), 0)

        # Staff can view Alex's ticket
        self.client.force_authenticate(user=self.staff_user)
        resp_staff = self.client.get(reverse('api_support_ticket_detail', kwargs={'ticket_id': ticket.ticket_id}))
        self.assertEqual(resp_staff.status_code, status.HTTP_200_OK)

    def test_internal_notes_hidden_from_customer(self):
        ticket = SupportTicket.objects.create(
            user=self.user_a,
            category='slot_availability',
            subject='Slot occupied',
            description='Slot has someone else parked.'
        )

        # Staff posts public reply and internal note
        self.client.force_authenticate(user=self.staff_user)
        self.client.post(reverse('api_support_ticket_reply', kwargs={'ticket_id': ticket.ticket_id}), {
            'message': 'We are dispatching an operator to inspect the slot.',
            'is_internal_note': False,
        })
        self.client.post(reverse('api_support_ticket_reply', kwargs={'ticket_id': ticket.ticket_id}), {
            'message': 'INTERNAL NOTE: ANPR camera flagged vehicle plate TN 02 XY 5555 illegally parked.',
            'is_internal_note': True,
        })

        # When Customer views ticket, internal note MUST be hidden
        self.client.force_authenticate(user=self.user_a)
        cust_view = self.client.get(reverse('api_support_ticket_detail', kwargs={'ticket_id': ticket.ticket_id}))
        self.assertEqual(len(cust_view.data['messages']), 1)
        self.assertNotIn('INTERNAL NOTE', cust_view.data['messages'][0]['message'])

        # When Staff views ticket, both messages are visible
        self.client.force_authenticate(user=self.staff_user)
        staff_view = self.client.get(reverse('api_support_ticket_detail', kwargs={'ticket_id': ticket.ticket_id}))
        self.assertEqual(len(staff_view.data['messages']), 2)

        # Customer attempting to submit internal note has flag forced to False
        self.client.force_authenticate(user=self.user_a)
        cust_reply = self.client.post(reverse('api_support_ticket_reply', kwargs={'ticket_id': ticket.ticket_id}), {
            'message': 'Customer response.',
            'is_internal_note': True,
        })
        self.assertEqual(cust_reply.status_code, status.HTTP_201_CREATED)
        self.assertFalse(cust_reply.data['new_message']['is_internal_note'])

    def test_customer_reply_moves_waiting_user_to_in_progress(self):
        ticket = SupportTicket.objects.create(
            user=self.user_a,
            category='qr_ticket',
            subject='QR not scanning',
            description='Scanner gave error.',
            status='waiting_user'
        )

        self.client.force_authenticate(user=self.user_a)
        self.client.post(reverse('api_support_ticket_reply', kwargs={'ticket_id': ticket.ticket_id}), {
            'message': 'I have refreshed the screen and brightness is at max.',
        })

        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'in_progress')

    def test_ticket_reopen_and_close_lifecycle(self):
        ticket = SupportTicket.objects.create(
            user=self.user_a,
            category='booking_issue',
            subject='Wrong duration',
            description='Booking time window was incorrect.',
            status='resolved',
            resolved_at=timezone.now(),
            resolution_notes='Adjusted slot timing.'
        )

        self.client.force_authenticate(user=self.user_a)
        reopen_resp = self.client.post(reverse('api_support_ticket_reopen', kwargs={'ticket_id': ticket.ticket_id}), {
            'reason': 'The slot is still showing the old time.',
        })
        self.assertEqual(reopen_resp.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'in_progress')
        self.assertIsNone(ticket.resolved_at)

        # Now close ticket
        close_resp = self.client.post(reverse('api_support_ticket_close', kwargs={'ticket_id': ticket.ticket_id}))
        self.assertEqual(close_resp.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'closed')
        self.assertIsNotNone(ticket.closed_at)

        # Closed ticket cannot be reopened by customer
        reopen_closed = self.client.post(reverse('api_support_ticket_reopen', kwargs={'ticket_id': ticket.ticket_id}))
        self.assertEqual(reopen_closed.status_code, status.HTTP_400_BAD_REQUEST)

    def test_staff_assignment_and_priority_update(self):
        ticket = SupportTicket.objects.create(
            user=self.user_a,
            category='other',
            subject='Question about EV charging',
            description='What kw rating does slot GC-01 provide?'
        )

        self.client.force_authenticate(user=self.staff_user)
        # Assign to Sarah
        assign_resp = self.client.post(reverse('api_support_ticket_assign', kwargs={'ticket_id': ticket.ticket_id}), {
            'assigned_to_id': self.staff_user.id
        })
        self.assertEqual(assign_resp.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.assigned_to, self.staff_user)
        self.assertEqual(ticket.status, 'assigned')

        # Update priority to High
        prio_resp = self.client.post(reverse('api_support_ticket_priority', kwargs={'ticket_id': ticket.ticket_id}), {
            'priority': 'high'
        })
        self.assertEqual(prio_resp.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.priority, 'high')

    def test_support_analytics_and_eligible_bookings(self):
        # Create a ticket
        SupportTicket.objects.create(
            user=self.user_a,
            category='refund_request',
            priority='high',
            subject='Refund request',
            description='Test description',
            status='open'
        )

        # Customer cannot view staff analytics
        self.client.force_authenticate(user=self.user_a)
        analytics_cust = self.client.get(reverse('api_support_analytics'))
        self.assertEqual(analytics_cust.status_code, status.HTTP_403_FORBIDDEN)

        # Staff can view analytics
        self.client.force_authenticate(user=self.staff_user)
        analytics_staff = self.client.get(reverse('api_support_analytics'))
        self.assertEqual(analytics_staff.status_code, status.HTTP_200_OK)
        self.assertIn('overview', analytics_staff.data)
        self.assertIn('categories', analytics_staff.data)
        self.assertIn('priorities', analytics_staff.data)
        self.assertIn('trends', analytics_staff.data)
        self.assertGreaterEqual(analytics_staff.data['overview']['total_tickets'], 1)

        # Staff list
        staff_list_resp = self.client.get(reverse('api_support_staff_list'))
        self.assertEqual(staff_list_resp.status_code, status.HTTP_200_OK)
        usernames = [s['username'] for s in staff_list_resp.data]
        self.assertIn('staff_sarah', usernames)
        self.assertIn('admin_boss', usernames)

        # Eligible bookings for user A
        self.client.force_authenticate(user=self.user_a)
        bookings_resp = self.client.get(reverse('api_support_eligible_bookings'))
        self.assertEqual(bookings_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(bookings_resp.data), 1)
        self.assertEqual(bookings_resp.data[0]['booking_id'], str(self.booking_a.booking_id))


