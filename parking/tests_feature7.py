import io
import uuid
from decimal import Decimal
from datetime import timedelta, date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from parking.models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle,
    CustomerMembership, MonthlyPass, MembershipPlan,
    LoyaltyAccount, LoyaltyTransaction
)
from parking.analytics_service import (
    parse_date_range_filters,
    calculate_bi_analytics,
    generate_csv_report,
    generate_excel_report,
    generate_pdf_report,
)

User = get_user_model()


class Feature7AnalyticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.customer = User.objects.create_user(
            username='carl_customer',
            email='carl@example.com',
            password='Password123!',
            first_name='Carl'
        )
        self.staff_user = User.objects.create_user(
            username='staff_eva',
            email='eva@example.com',
            password='Password123!',
            is_staff=True
        )
        self.admin_user = User.objects.create_superuser(
            username='admin_bi',
            email='bi_admin@example.com',
            password='Password123!'
        )

        # Parking Lots
        self.lot_a = ParkingLot.objects.create(
            name='Alpha Airport Bay',
            location='Airport Terminal 1',
            price_per_hour=Decimal('50.00'),
            is_active=True
        )
        self.lot_b = ParkingLot.objects.create(
            name='Beta Harbor Bay',
            location='Harbor Port',
            price_per_hour=Decimal('30.00'),
            is_active=True
        )

        # Slots
        self.slot_a1 = ParkingSlot.objects.create(lot=self.lot_a, slot_number='A01', slot_type='car', is_active=True)
        self.slot_a2 = ParkingSlot.objects.create(lot=self.lot_a, slot_number='A02', slot_type='car', is_active=True)
        self.slot_b1 = ParkingSlot.objects.create(lot=self.lot_b, slot_number='B01', slot_type='car', is_active=True)
        self.slot_b2 = ParkingSlot.objects.create(lot=self.lot_b, slot_number='B02', slot_type='car', is_active=False)  # Maintenance

        # Vehicles
        self.vehicle = Vehicle.objects.create(
            user=self.customer,
            license_plate='KA01AB9999',
            vehicle_type='car',
            is_default=True
        )

        # Base Test Data (Active Booking & Payment)
        now = timezone.now()
        start = now - timedelta(hours=1)
        end = now + timedelta(hours=2)

        self.booking_1 = Booking.objects.create(
            user=self.customer,
            slot=self.slot_a1,
            vehicle_number='KA01AB9999',
            start_time=start,
            end_time=end,
            amount=Decimal('150.00'),
            status=Booking.STATUS_ACTIVE
        )
        self.payment_1 = Payment.objects.create(
            booking=self.booking_1,
            amount=Decimal('150.00'),
            method='upi',
            status='success',
            transaction_id='TXNBI10001'
        )

        # Booking 2 at Lot B
        self.booking_2 = Booking.objects.create(
            user=self.customer,
            slot=self.slot_b1,
            vehicle_number='KA01AB9999',
            start_time=now - timedelta(days=2),
            end_time=now - timedelta(days=2) + timedelta(hours=3),
            amount=Decimal('90.00'),
            status=Booking.STATUS_COMPLETED
        )
        self.payment_2 = Payment.objects.create(
            booking=self.booking_2,
            amount=Decimal('90.00'),
            method='card',
            status='success',
            transaction_id='TXNBI10002'
        )

    # --------------------------------------------------------------------------
    # 1. Revenue Calculations & Previous-Period Comparison
    # --------------------------------------------------------------------------
    def test_revenue_calculations_and_growth(self):
        analytics = calculate_bi_analytics({'range': 'last_30_days'})
        rev = analytics['revenue']

        self.assertGreaterEqual(rev['total_revenue'], 240.0)
        self.assertEqual(rev['successful_count'], 2)
        self.assertIn('trend', rev)
        self.assertGreater(len(rev['trend']['labels']), 0)
        self.assertEqual(len(rev['by_lot']), 2)

        # Check growth percentage calculation
        self.assertIn('growth_percent', rev)
        self.assertIsInstance(rev['growth_percent'], float)

    # --------------------------------------------------------------------------
    # 2. Date-Range Filters (Presets & Custom)
    # --------------------------------------------------------------------------
    def test_date_range_presets_and_custom(self):
        # Presets
        for p in ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'previous_month', 'this_year']:
            s_dt, e_dt, ps_dt, pe_dt, label = parse_date_range_filters(p)
            self.assertIsNotNone(s_dt)
            self.assertIsNotNone(e_dt)
            self.assertGreater(e_dt, s_dt)
            self.assertGreater(pe_dt, ps_dt)
            self.assertTrue(len(label) > 0)

        # Custom date range
        s_dt, e_dt, ps_dt, pe_dt, label = parse_date_range_filters('custom', '2026-10-01', '2026-10-15')
        self.assertEqual(s_dt.date(), date(2026, 10, 1))
        self.assertEqual(e_dt.date(), date(2026, 10, 15))
        self.assertIn('01 Oct 2026', label)

        # Invalid date fallback
        s_dt, e_dt, _, _, label = parse_date_range_filters('custom', 'invalid-date', 'gibberish')
        self.assertEqual(label, 'Last 30 Days')

    # --------------------------------------------------------------------------
    # 3. Parking Occupancy Analytics
    # --------------------------------------------------------------------------
    def test_occupancy_analytics_sensor_free(self):
        analytics = calculate_bi_analytics({'range': 'last_7_days'})
        occ = analytics['occupancy']

        # Total bays across Lot A (2) + Lot B (2) = 4 slots
        self.assertEqual(occ['total_slots'], 4)
        # Active bays: 2 (Lot A) + 1 (Lot B) = 3 active bays
        self.assertEqual(occ['active_slots'], 3)
        # Slot A01 is currently occupied by booking_1
        self.assertGreaterEqual(occ['occupied_slots'], 1)
        self.assertGreater(occ['current_occupancy_percent'], 0.0)
        self.assertIsInstance(occ['historical_avg_occupancy_percent'], float)
        self.assertEqual(len(occ['by_lot']), 2)

    # --------------------------------------------------------------------------
    # 4. Peak-Hour Analytics & Demand Slicing
    # --------------------------------------------------------------------------
    def test_peak_hour_analytics(self):
        analytics = calculate_bi_analytics({'range': 'last_30_days'})
        peaks = analytics['peak_hours']

        self.assertEqual(len(peaks['hourly_distribution']), 24)
        self.assertIn('weekday_vs_weekend', peaks)
        self.assertIn('weekday_bookings', peaks['weekday_vs_weekend'])
        self.assertIn('weekend_bookings', peaks['weekday_vs_weekend'])
        self.assertEqual(len(peaks['days_of_week']), 7)
        self.assertGreater(peaks['avg_duration_hours'], 0.0)

    # --------------------------------------------------------------------------
    # 5. Parking Lot Comparisons & Performance
    # --------------------------------------------------------------------------
    def test_parking_lot_performance(self):
        analytics = calculate_bi_analytics({'range': 'last_30_days'})
        lots = analytics['lot_performance']

        self.assertEqual(len(lots['lots']), 2)
        # Lot A has ₹150 revenue, Lot B has ₹90 revenue
        self.assertEqual(lots['best_performing'], 'Alpha Airport Bay')
        self.assertEqual(lots['lowest_performing'], 'Beta Harbor Bay')

    # --------------------------------------------------------------------------
    # 6. Payment Method Statistics & Transparency
    # --------------------------------------------------------------------------
    def test_payment_method_statistics(self):
        analytics = calculate_bi_analytics({'range': 'last_30_days'})
        pm = analytics['payments']

        self.assertEqual(pm['total_transactions'], 2)
        self.assertEqual(pm['success_rate'], 100.0)
        self.assertTrue(pm['is_simulated_gateway'])
        self.assertIn('Simulated', pm['gateway_disclaimer'])

        # Verify method choices (UPI and Card were used)
        methods = {m['method']: m['count'] for m in pm['methods']}
        self.assertEqual(methods.get('upi'), 1)
        self.assertEqual(methods.get('card'), 1)

    # --------------------------------------------------------------------------
    # 7. Membership & Loyalty Analytics
    # --------------------------------------------------------------------------
    def test_membership_and_loyalty_analytics(self):
        plan = MembershipPlan.objects.create(
            name='Corporate VIP',
            price=Decimal('1000.00'),
            duration_days=30
        )
        now = timezone.now()
        CustomerMembership.objects.create(
            user=self.customer,
            plan=plan,
            status=CustomerMembership.STATUS_ACTIVE,
            start_date=now,
            end_date=now + timedelta(days=30),
            amount_paid=Decimal('1000.00')
        )

        # Loyalty Account
        account = LoyaltyAccount.objects.create(
            user=self.customer,
            points_balance=400,
            tier='Silver'
        )
        LoyaltyTransaction.objects.create(
            account=account,
            transaction_type=LoyaltyTransaction.TYPE_EARNED,
            points=100,
            balance_after=400,
            reference_id='REF-TEST-001',
            description='Test points'
        )

        analytics = calculate_bi_analytics({'range': 'last_30_days'})
        ml = analytics['membership_loyalty']

        self.assertEqual(ml['active_memberships'], 1)
        self.assertEqual(ml['membership_revenue'], 1000.0)
        self.assertEqual(ml['points_earned'], 100)
        self.assertEqual(ml['tier_distribution']['Silver'], 1)

    # --------------------------------------------------------------------------
    # 8. Report Export Engines: CSV, Excel & PDF
    # --------------------------------------------------------------------------
    def test_export_engines(self):
        analytics = calculate_bi_analytics({'range': 'last_30_days'})

        # 1. CSV
        csv_data = generate_csv_report(analytics)
        self.assertIn("SMART PARKING MANAGEMENT SYSTEM — BUSINESS INTELLIGENCE REPORT", csv_data)
        self.assertIn("Alpha Airport Bay", csv_data)
        self.assertIn("Total Revenue", csv_data)

        # 2. Excel (.xlsx)
        excel_bytes = generate_excel_report(analytics)
        self.assertIsInstance(excel_bytes, bytes)
        self.assertGreater(len(excel_bytes), 1000)
        # Check PK zip signature for XLSX
        self.assertTrue(excel_bytes.startswith(b'PK'))

        # 3. PDF (.pdf)
        pdf_bytes = generate_pdf_report(analytics)
        self.assertIsInstance(pdf_bytes, bytes)
        self.assertGreater(len(pdf_bytes), 1000)
        # Check PDF signature
        self.assertTrue(pdf_bytes.startswith(b'%PDF'))

    # --------------------------------------------------------------------------
    # 9. API Endpoints, Permissions & Role Isolation
    # --------------------------------------------------------------------------
    def test_bi_api_permissions(self):
        # 1. Unauthenticated request -> 401
        res_unauth = self.client.get('/api/analytics/bi/')
        self.assertEqual(res_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Customer user request -> 403 Forbidden
        self.client.force_authenticate(user=self.customer)
        res_cust = self.client.get('/api/analytics/bi/')
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

        res_cust_exp = self.client.get('/api/analytics/export/?format=csv')
        self.assertEqual(res_cust_exp.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Admin user request -> 200 OK
        self.client.force_authenticate(user=self.admin_user)
        res_admin = self.client.get('/api/analytics/bi/?range=last_7_days')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertIn('revenue', res_admin.data)
        self.assertIn('occupancy', res_admin.data)

        # 4. Export endpoints via API
        # CSV Export
        res_csv = self.client.get('/api/analytics/export/?format=csv')
        self.assertEqual(res_csv.status_code, status.HTTP_200_OK)
        self.assertIn('text/csv', res_csv['Content-Type'])
        self.assertIn('attachment', res_csv['Content-Disposition'])

        # Excel Export
        res_excel = self.client.get('/api/analytics/export/?format=excel')
        self.assertEqual(res_excel.status_code, status.HTTP_200_OK)
        self.assertIn('spreadsheetml', res_excel['Content-Type'])

        # PDF Export
        res_pdf = self.client.get('/api/analytics/export/?format=pdf')
        self.assertEqual(res_pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pdf['Content-Type'], 'application/pdf')

        # Backwards compatible endpoint /api/admin/export-csv/
        res_compat = self.client.get('/api/admin/export-csv/?range=last_30_days')
        self.assertEqual(res_compat.status_code, status.HTTP_200_OK)
        self.assertIn('text/csv', res_compat['Content-Type'])

    # --------------------------------------------------------------------------
    # 10. Empty Database & Edge Case Handling
    # --------------------------------------------------------------------------
    def test_empty_database_and_invalid_filters(self):
        # Clear all bookings and payments
        Payment.objects.all().delete()
        Booking.objects.all().delete()

        # Run BI analytics on empty dataset without division-by-zero or crashing
        analytics = calculate_bi_analytics({'range': 'last_30_days', 'lot_id': '999999'})
        self.assertEqual(analytics['revenue']['total_revenue'], 0.0)
        self.assertEqual(analytics['revenue']['growth_percent'], 0.0)
        self.assertEqual(analytics['customers']['active_in_period'], 0)
        self.assertEqual(analytics['customers']['avg_booking_value'], 0.0)

        # Verify export generation does not crash on empty dataset
        csv_data = generate_csv_report(analytics)
        self.assertIn("SMART PARKING MANAGEMENT SYSTEM", csv_data)
        excel_bytes = generate_excel_report(analytics)
        self.assertTrue(excel_bytes.startswith(b'PK'))
        pdf_bytes = generate_pdf_report(analytics)
        self.assertTrue(pdf_bytes.startswith(b'%PDF'))

