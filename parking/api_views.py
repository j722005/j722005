import uuid
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.db import models, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from django.http import HttpResponse
from rest_framework import generics, permissions, serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from django.core.exceptions import ValidationError
from .models import (
    ParkingLot, ParkingSlot, Booking, Payment, Vehicle, Notification, AdminAnnouncement,
    PricingRule, PricingRuleAuditLog, SupportTicket, TicketMessage, TicketAuditLog,
    validate_support_attachment,
    MembershipPlan, CustomerMembership, MonthlyPass, LoyaltyProgramConfig,
    LoyaltyAccount, LoyaltyTransaction
)
from .permissions import IsOwnerOrStaff, IsStaffOrAdmin
from .pricing_engine import calculate_dynamic_price, get_active_pricing_rule_for_lot
from .recommendation_engine import get_smart_parking_recommendations
from .analytics_service import (
    calculate_bi_analytics,
    generate_csv_report,
    generate_excel_report,
    generate_pdf_report,
)
from .loyalty_membership_service import (
    calculate_booking_benefits,
    award_booking_loyalty_points,
    reverse_booking_loyalty_and_benefits,
    get_or_create_loyalty_account,
)
from .notification_service import (
    create_notification,
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
from .membership_loyalty_views import (
    MembershipPlanListCreateAPIView,
    MembershipPlanDetailAPIView,
    MyMembershipsAPIView,
    MembershipPurchaseAPIView,
    MembershipCancelRenewalAPIView,
    MembershipRenewAPIView,
    MyMonthlyPassesAPIView,
    MonthlyPassPurchaseAPIView,
    MonthlyPassDetailAPIView,
    MonthlyPassCancelAPIView,
    LoyaltyAccountAPIView,
    LoyaltyTransactionHistoryAPIView,
    LoyaltyConfigAPIView,
    LoyaltyAdminAdjustAPIView,
    LoyaltyAdminAccountsListAPIView,
    AdminMembershipRewardsOverviewAPIView,
)
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    ParkingLotListSerializer,
    ParkingSlotSerializer,
    BookingSerializer,
    BookingCreateSerializer,
    VehicleSerializer,
    NotificationSerializer,
    AdminAnnouncementSerializer,
    PricingRuleSerializer,
    PricingRuleAuditLogSerializer,
    PriceCalculationRequestSerializer,
    SupportTicketListSerializer,
    SupportTicketDetailSerializer,
    SupportTicketCreateSerializer,
    TicketMessageSerializer,
    TicketAuditLogSerializer,
    TicketReplySerializer,
    TicketStatusUpdateSerializer,
    TicketAssignSerializer,
)

User = get_user_model()


# ==============================================================================
# AUTHENTICATION & PROFILE APIS
# ==============================================================================

class RegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            token, _ = Token.objects.get_or_create(user=user)
            return Response({
                'token': token.key,
                'user': UserSerializer(user).data,
                'message': 'Account registered successfully.'
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        if not username or not password:
            return Response({'message': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Allow logging in with username or email
        user = authenticate(request, username=username, password=password)
        if not user:
            # Try finding user by email
            try:
                user_obj = User.objects.get(email__iexact=username)
                user = authenticate(request, username=user_obj.username, password=password)
            except User.DoesNotExist:
                user = None

        if not user:
            return Response({'message': 'Invalid credentials. Please verify username and password.'}, status=status.HTTP_401_UNAUTHORIZED)

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserSerializer(user).data,
            'message': 'Logged in successfully.'
        }, status=status.HTTP_200_OK)


class UserProfileAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class LogoutAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({'message': 'Logged out successfully.'})


# ==============================================================================
# PARKING LOTS & SLOTS APIS
# ==============================================================================

class ParkingLotListAPIView(generics.ListAPIView):
    serializer_class = ParkingLotListSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        qs = ParkingLot.objects.filter(is_active=True)
        search = self.request.query_params.get('search')
        if search:
            search = search.strip()
            qs = qs.filter(models.Q(name__icontains=search) | models.Q(location__icontains=search))

        max_price = self.request.query_params.get('max_price')
        if max_price:
            try:
                qs = qs.filter(price_per_hour__lte=float(max_price))
            except ValueError:
                pass

        vehicle_type = self.request.query_params.get('vehicle_type')
        if vehicle_type and vehicle_type != 'all':
            qs = qs.filter(slots__slot_type=vehicle_type, slots__is_active=True).distinct()

        return qs


class SmartParkingRecommendationAPIView(APIView):
    """
    Search and recommend parking locations using a transparent scoring algorithm
    based on actual real-time availability, geodesic distance when coordinates exist,
    price, and user preferences.
    """
    permission_classes = [permissions.AllowAny]

    def _parse_time_param(self, date_str, time_str, default_tz):
        if not time_str:
            return None
        # Try full ISO datetime string
        dt = parse_datetime(str(time_str))
        if dt:
            if timezone.is_naive(dt):
                return timezone.make_aware(dt, default_tz)
            return dt

        # Try time format HH:MM with optional date_str
        if date_str:
            try:
                parsed_d = parse_date(str(date_str)) if isinstance(date_str, str) else date_str
                if parsed_d:
                    parts = str(time_str).strip().split(':')
                    h = int(parts[0])
                    m = int(parts[1]) if len(parts) > 1 else 0
                    naive = timezone.datetime(parsed_d.year, parsed_d.month, parsed_d.day, h, m)
                    return timezone.make_aware(naive, default_tz)
            except Exception:
                pass
        return None

    def _execute(self, data):
        tz = timezone.get_current_timezone()
        destination = str(data.get('destination', data.get('search', data.get('q', '')))).strip()
        vehicle_type = data.get('vehicle_type', 'car')
        date_str = data.get('date')
        start_time_raw = data.get('start_time')
        end_time_raw = data.get('end_time')
        duration_hours = data.get('duration_hours')
        preference = data.get('preference', 'balanced')
        price_min = data.get('price_min')
        price_max = data.get('price_max')
        user_lat = data.get('user_lat', data.get('lat'))
        user_lng = data.get('user_lng', data.get('lng'))

        start_time = self._parse_time_param(date_str, start_time_raw, tz)
        end_time = self._parse_time_param(date_str, end_time_raw, tz)

        if start_time and not end_time and duration_hours:
            try:
                end_time = start_time + timezone.timedelta(hours=float(duration_hours))
            except (ValueError, TypeError):
                pass

        try:
            result = get_smart_parking_recommendations(
                destination=destination,
                vehicle_type=vehicle_type,
                start_time=start_time,
                end_time=end_time,
                price_min=price_min,
                price_max=price_max,
                user_lat=user_lat,
                user_lng=user_lng,
                preference=preference,
            )
            return Response(result, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({'error': str(e), 'message': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': 'Recommendation processing error', 'message': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def get(self, request):
        return self._execute(request.query_params)

    def post(self, request):
        return self._execute(request.data)


class ParkingLotDetailAPIView(generics.RetrieveAPIView):
    queryset = ParkingLot.objects.all()
    serializer_class = ParkingLotListSerializer
    permission_classes = [permissions.AllowAny]


class ParkingLotSlotsAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        lot = get_object_or_404(ParkingLot, pk=pk)
        slots = lot.slots.all()

        slot_type = request.query_params.get('type')
        if slot_type and slot_type != 'all':
            slots = slots.filter(slot_type=slot_type)

        floor = request.query_params.get('floor')
        if floor and floor != 'all':
            slots = slots.filter(floor=floor)

        is_covered = request.query_params.get('is_covered')
        if is_covered is not None and is_covered != 'all':
            if str(is_covered).lower() in ('true', '1'):
                slots = slots.filter(is_covered=True)
            elif str(is_covered).lower() in ('false', '0'):
                slots = slots.filter(is_covered=False)

        serializer = ParkingSlotSerializer(slots, many=True, context={'request': request})
        slot_data = serializer.data

        status_filter = request.query_params.get('status')
        if status_filter and status_filter != 'all':
            slot_data = [s for s in slot_data if s['status'] == status_filter]

        return Response(slot_data)


class ParkingSlotStatusUpdateAPIView(APIView):
    permission_classes = [IsStaffOrAdmin]

    def patch(self, request, pk):
        slot = get_object_or_404(ParkingSlot, pk=pk)
        is_active = request.data.get('is_active')
        if is_active is not None:
            try:
                is_active = serializers.BooleanField().run_validation(is_active)
            except serializers.ValidationError as exc:
                return Response({'is_active': exc.detail}, status=status.HTTP_400_BAD_REQUEST)
            slot.is_active = is_active
            slot.save(update_fields=['is_active'])

        serializer = ParkingSlotSerializer(slot)
        return Response(serializer.data)


# ==============================================================================
# VEHICLE APIS
# ==============================================================================

class VehicleListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Vehicle.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # Default first vehicle to default
        count = Vehicle.objects.filter(user=self.request.user).count()
        is_default = serializer.validated_data.get('is_default', count == 0)
        serializer.save(user=self.request.user, is_default=is_default)


class VehicleDetailAPIView(generics.DestroyAPIView):
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrStaff]

    def get_queryset(self):
        return Vehicle.objects.filter(user=self.request.user)


class VehicleSetDefaultAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        vehicle = get_object_or_404(Vehicle, pk=pk, user=request.user)
        vehicle.is_default = True
        vehicle.save()
        return Response({'message': f'{vehicle.license_plate} set as default.'})


# ==============================================================================
# BOOKING & PAYMENT APIS
# ==============================================================================

class MyBookingsAPIView(generics.ListAPIView):
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Booking.objects.filter(user=self.request.user).select_related('slot', 'slot__lot', 'payment')
        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param)
        return qs


class BookingDetailAPIView(generics.RetrieveAPIView):
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrStaff]
    lookup_field = 'booking_id'

    def get_queryset(self):
        if self.request.user.is_staff or self.request.user.is_superuser:
            return Booking.objects.all().select_related('slot', 'slot__lot', 'payment')
        return Booking.objects.filter(user=self.request.user).select_related('slot', 'slot__lot', 'payment')


class BookingCreateAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = BookingCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        lot_id = serializer.validated_data['lot_id']
        slot_id = serializer.validated_data['slot_id']
        vehicle_number = serializer.validated_data['vehicle_number']
        start_time = serializer.validated_data['start_time']
        end_time = serializer.validated_data['end_time']
        pass_id = serializer.validated_data.get('pass_id')
        membership_id = serializer.validated_data.get('membership_id')
        redeem_points = serializer.validated_data.get('redeem_points', 0)

        lot = get_object_or_404(ParkingLot, pk=lot_id)
        if not lot.is_active:
            return Response({'message': 'This parking lot is currently inactive.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Safe database locking against concurrent requests
            try:
                slot = ParkingSlot.objects.select_for_update().get(pk=slot_id, lot=lot)
            except ParkingSlot.DoesNotExist:
                return Response({'message': 'Selected slot does not belong to this parking lot.'}, status=status.HTTP_400_BAD_REQUEST)

            if not slot.is_active:
                return Response({'message': 'This parking slot is under maintenance and cannot be booked.'}, status=status.HTTP_400_BAD_REQUEST)

            # Check interval overlap blocking rule
            if slot.is_interval_blocked(start_time, end_time):
                return Response({'message': 'This slot is already booked for an overlapping time interval.'}, status=status.HTTP_409_CONFLICT)

            # Server-calculated dynamic pricing with immutable snapshot
            vehicle_type = serializer.validated_data.get('vehicle_type')
            if not vehicle_type:
                matched_v = Vehicle.objects.filter(user=request.user, license_plate=vehicle_number).first()
                vehicle_type = matched_v.vehicle_type if matched_v else slot.slot_type

            try:
                final_total, breakdown = calculate_dynamic_price(
                    lot=lot,
                    start_time=start_time,
                    end_time=end_time,
                    vehicle_type=vehicle_type,
                )
            except ValidationError as e:
                err_dict = e.message_dict if hasattr(e, 'message_dict') else {'message': str(e)}
                return Response(err_dict, status=status.HTTP_400_BAD_REQUEST)

            rule_id = breakdown.get('rule_id')
            applied_rule = PricingRule.objects.filter(id=rule_id).first() if rule_id else None

            # Calculate Feature 4 benefits (Monthly Pass, Membership, Loyalty Points)
            (
                payable_total,
                benefits_breakdown,
                applied_pass,
                applied_membership,
                validated_points,
                points_discount_amount
            ) = calculate_booking_benefits(
                user=request.user,
                lot=lot,
                vehicle_number=vehicle_number,
                vehicle_type=vehicle_type,
                start_time=start_time,
                end_time=end_time,
                raw_dynamic_total=final_total,
                requested_pass_id=pass_id,
                requested_membership_id=membership_id,
                points_to_redeem=redeem_points,
            )

            breakdown['benefits'] = benefits_breakdown

            # Deduct points atomically if redeemed
            loyalty_acct = None
            if validated_points > 0:
                loyalty_acct, _ = LoyaltyAccount.objects.select_for_update().get_or_create(
                    user=request.user,
                    defaults={'points_balance': 0, 'lifetime_earned': 0, 'lifetime_redeemed': 0, 'tier': 'Bronze'}
                )
                if loyalty_acct.points_balance < validated_points:
                    return Response({'message': 'Insufficient loyalty points balance.'}, status=status.HTTP_400_BAD_REQUEST)
                loyalty_acct.points_balance -= validated_points
                loyalty_acct.lifetime_redeemed += validated_points
                loyalty_acct.save(update_fields=['points_balance', 'lifetime_redeemed', 'updated_at'])

            is_fully_covered = (payable_total == Decimal('0.00'))

            booking = Booking.objects.create(
                user=request.user,
                slot=slot,
                vehicle_number=vehicle_number,
                start_time=start_time,
                end_time=end_time,
                amount=payable_total,
                pricing_rule=applied_rule,
                membership=applied_membership,
                monthly_pass=applied_pass,
                points_redeemed=validated_points,
                points_discount_amount=points_discount_amount,
                price_snapshot=breakdown,
                status=Booking.STATUS_CONFIRMED if is_fully_covered else Booking.STATUS_PENDING,
            )

            # Record redeemed loyalty transaction now that booking exists
            if validated_points > 0 and loyalty_acct:
                redeem_ref = f"REDEEM-BOOKING-{booking.booking_id}"
                LoyaltyTransaction.objects.create(
                    account=loyalty_acct,
                    transaction_type=LoyaltyTransaction.TYPE_REDEEMED,
                    points=-validated_points,
                    balance_after=loyalty_acct.points_balance,
                    booking=booking,
                    reference_id=redeem_ref,
                    description=f"Redeemed {validated_points} points (₹{points_discount_amount} discount) on booking #{str(booking.booking_id)[:8]}",
                )

            # If fully covered by pass / points / membership (payable_total == 0)
            if is_fully_covered:
                method = 'monthly_pass' if applied_pass else ('loyalty_points' if validated_points > 0 else 'membership')
                if applied_pass:
                    applied_pass.usage_count += 1
                    applied_pass.save(update_fields=['usage_count'])
                if applied_membership:
                    applied_membership.usage_count += 1
                    applied_membership.save(update_fields=['usage_count'])

                Payment.objects.create(
                    booking=booking,
                    amount=Decimal('0.00'),
                    method=method,
                    status='success',
                    transaction_id=f"COV{uuid.uuid4().hex[:10].upper()}",
                )

                notify_booking_confirmed(booking)

        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)


class BookingCancelAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, booking_id):
        booking = get_object_or_404(Booking, booking_id=booking_id)

        # Enforce object authorization: only owner or staff can cancel
        if booking.user != request.user and not (request.user.is_staff or request.user.is_superuser):
            return Response({'message': 'You do not have permission to cancel this booking.'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            b = Booking.objects.select_for_update().get(pk=booking.pk)
            now = timezone.now()

            # Server eligibility check
            if b.status in (Booking.STATUS_PENDING, Booking.STATUS_CONFIRMED) and b.start_time > now:
                b.status = Booking.STATUS_CANCELLED
                b.save(update_fields=['status'])

                # Reversal / refund of benefits and loyalty points
                reverse_booking_loyalty_and_benefits(b)

                # Send real-time notification & email alert
                notify_booking_cancelled(b)

                return Response({'message': 'Booking cancelled successfully.', 'booking': BookingSerializer(b).data})
            else:
                return Response({'message': 'This booking can no longer be cancelled (already started, completed, or cancelled).'}, status=status.HTTP_400_BAD_REQUEST)


class BookingPaymentAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, booking_id):
        booking = get_object_or_404(Booking, booking_id=booking_id)

        # Enforce authorization
        if booking.user != request.user and not request.user.is_staff:
            return Response({'message': 'You are not authorized to pay for this booking.'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            b = Booking.objects.select_for_update().get(pk=booking.pk)

            if b.status != Booking.STATUS_PENDING:
                return Response({'message': 'This booking has already been processed or confirmed.'}, status=status.HTTP_400_BAD_REQUEST)

            # Prevent payment on expired hold
            if b.is_hold_expired:
                b.status = Booking.STATUS_CANCELLED
                b.save(update_fields=['status'])
                # Also restore any redeemed points or benefits
                reverse_booking_loyalty_and_benefits(b)
                notify_hold_expired(b)
                return Response({'message': 'Your 10-minute payment hold has expired. The slot has been released.'}, status=status.HTTP_410_GONE)

            # Re-verify slot & lot availability
            if not b.slot.is_active or not b.slot.lot.is_active:
                return Response({'message': 'This slot or parking lot is no longer active.'}, status=status.HTTP_400_BAD_REQUEST)

            # Defense-in-depth overlap re-check
            if b.slot.is_interval_blocked(b.start_time, b.end_time, exclude_booking_id=b.booking_id):
                return Response({'message': 'Conflicting booking detected on this slot.'}, status=status.HTTP_409_CONFLICT)

            method = request.data.get('method', 'upi')
            if method not in dict(Payment.METHOD_CHOICES):
                return Response({'method': ['Select a valid payment method.']}, status=status.HTTP_400_BAD_REQUEST)

            txn_id = f"TXN{uuid.uuid4().hex[:12].upper()}"

            payment = Payment.objects.create(
                booking=b,
                amount=b.amount,
                method=method,
                status='success',
                transaction_id=txn_id,
            )

            b.status = Booking.STATUS_CONFIRMED
            b.save(update_fields=['status'])

            # Increment pass / membership usage counts if linked
            if b.monthly_pass:
                b.monthly_pass.usage_count += 1
                b.monthly_pass.save(update_fields=['usage_count'])
            if b.membership:
                b.membership.usage_count += 1
                b.membership.save(update_fields=['usage_count'])

            # Award loyalty points for verified payment!
            points_awarded = award_booking_loyalty_points(b, payment.amount)

            # Feature 6: Send booking confirmed & payment success notifications
            notify_booking_confirmed(b)
            notify_payment_success(payment)

        return Response({
            'message': 'Payment confirmed! Slot reserved successfully.',
            'booking': BookingSerializer(b).data,
            'payment': {
                'transaction_id': txn_id,
                'method': method,
                'amount': float(b.amount),
                'points_earned': points_awarded,
            }
        }, status=status.HTTP_200_OK)


# ==============================================================================
# DASHBOARDS APIS (CUSTOMER, STAFF, ADMIN)
# ==============================================================================

class CustomerDashboardAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        bookings = Booking.objects.filter(user=user).select_related('slot', 'slot__lot', 'payment').order_by('-created_at')

        now = timezone.now()
        active_parked = bookings.filter(status=Booking.STATUS_ACTIVE).first()
        upcoming = bookings.filter(status=Booking.STATUS_CONFIRMED, start_time__gt=now).first()
        spotlight = active_parked or upcoming

        total_spent = bookings.filter(
            status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE, Booking.STATUS_COMPLETED]
        ).aggregate(total=models.Sum('amount'))['total'] or 0

        vehicles_count = Vehicle.objects.filter(user=user).count()

        return Response({
            'active_parked_count': bookings.filter(status=Booking.STATUS_ACTIVE).count(),
            'upcoming_count': bookings.filter(status=Booking.STATUS_CONFIRMED, start_time__gt=now).count(),
            'saved_vehicles_count': vehicles_count,
            'total_spent': float(total_spent),
            'spotlight_booking': BookingSerializer(spotlight).data if spotlight else None,
            'recent_bookings': BookingSerializer(bookings[:5], many=True).data,
        })


class StaffOverviewAPIView(APIView):
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        lot_id = request.query_params.get('lot_id')
        if not lot_id:
            lot = ParkingLot.objects.filter(is_active=True).first()
        else:
            lot = get_object_or_404(ParkingLot, pk=lot_id)

        now = timezone.now()
        hold_minutes = getattr(settings, 'BOOKING_HOLD_MINUTES', 10)
        valid_hold_threshold = now - timezone.timedelta(minutes=hold_minutes)

        slots = lot.slots.all()
        slot_data = ParkingSlotSerializer(slots, many=True).data

        available_count = sum(1 for s in slot_data if s['status'] == 'available')
        occupied_count = sum(1 for s in slot_data if s['status'] == 'occupied')
        reserved_count = sum(1 for s in slot_data if s['status'] == 'reserved')
        maintenance_count = sum(1 for s in slot_data if s['status'] == 'maintenance')

        return Response({
            'lot': ParkingLotListSerializer(lot).data,
            'counts': {
                'available': available_count,
                'occupied': occupied_count,
                'reserved': reserved_count,
                'maintenance': maintenance_count,
            },
            'slots': slot_data,
        })


class StaffVerifyPlateAPIView(APIView):
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        query = request.data.get('query', '').strip().upper()
        if not query:
            return Response({'message': 'Please provide a license plate or booking ID.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        # Find matching booking
        booking = Booking.objects.filter(
            models.Q(vehicle_number=query) | models.Q(booking_id__iexact=query),
            status__in=[Booking.STATUS_CONFIRMED, Booking.STATUS_ACTIVE]
        ).select_related('slot', 'slot__lot').first()

        if not booking:
            return Response({'found': False, 'message': f'No active or confirmed reservation found for {query}.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'found': True,
            'booking': BookingSerializer(booking).data,
            'slot_number': booking.slot.slot_number,
            'lot_name': booking.slot.lot.name,
        })


class StaffGateActionAPIView(APIView):
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        booking_id = request.data.get('booking_id')
        action = request.data.get('action')  # 'in' or 'out'

        booking = get_object_or_404(Booking, booking_id=booking_id)

        if action == 'in':
            if booking.status != Booking.STATUS_CONFIRMED:
                return Response({'message': 'Booking must be in confirmed status to enter.'}, status=status.HTTP_400_BAD_REQUEST)
            booking.status = Booking.STATUS_ACTIVE
            booking.save(update_fields=['status'])
            # Feature 6: Gate Check-In Notification & Alert
            notify_qr_checkin(booking)
            return Response({'message': 'Gate entry authorized. Vehicle marked as Active (Parked Now).', 'booking': BookingSerializer(booking).data})

        elif action == 'out':
            if booking.status != Booking.STATUS_ACTIVE:
                return Response({'message': 'Booking must be currently active to exit.'}, status=status.HTTP_400_BAD_REQUEST)
            booking.status = Booking.STATUS_COMPLETED
            booking.save(update_fields=['status'])
            # Feature 6: Gate Check-Out Notification & Alert
            notify_qr_checkout(booking)
            return Response({'message': 'Gate exit authorized. Vehicle checked out and slot released.', 'booking': BookingSerializer(booking).data})

        return Response({'message': "Invalid action. Use 'in' or 'out'."}, status=status.HTTP_400_BAD_REQUEST)


class AdminStatsAPIView(APIView):
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        lots = ParkingLot.objects.all()
        total_revenue = Payment.objects.filter(status='success').aggregate(tot=models.Sum('amount'))['tot'] or 0
        total_bookings = Booking.objects.exclude(status=Booking.STATUS_CANCELLED).count()
        today = timezone.now().date()
        todays_bookings = Booking.objects.filter(created_at__date=today).count()

        total_active_bays = ParkingSlot.objects.filter(is_active=True).count()
        total_occupied_now = sum(lot.occupied_slots_count for lot in lots)
        avg_occupancy = round((total_occupied_now / total_active_bays * 100), 1) if total_active_bays else 0

        # 7-day revenue trend
        labels = []
        rev_data = []
        for i in range(6, -1, -1):
            day = timezone.now().date() - timezone.timedelta(days=i)
            labels.append(day.strftime('%a'))
            day_rev = Payment.objects.filter(status='success', paid_at__date=day).aggregate(tot=models.Sum('amount'))['tot'] or 0
            rev_data.append(float(day_rev))

        # Overall bay distribution across all lots
        all_available = sum(lot.available_slots_count for lot in lots)
        all_occupied = sum(lot.occupied_slots_count for lot in lots)
        all_reserved = sum(lot.future_reserved_slots_count for lot in lots)
        all_maint = ParkingSlot.objects.filter(is_active=False).count()

        return Response({
            'total_revenue': float(total_revenue),
            'total_bookings': total_bookings,
            'todays_bookings': todays_bookings,
            'average_occupancy_rate': avg_occupancy,
            'revenue_trend': {
                'labels': labels,
                'datasets': [{'data': rev_data}],
            },
            'occupancy_breakdown': {
                'labels': ['Available', 'Occupied Now', 'Future Reserved', 'Maintenance'],
                'data': [all_available, all_occupied, all_reserved, all_maint],
            },
        })


# ==============================================================================
# FEATURE 7: BUSINESS INTELLIGENCE & ANALYTICS APIS
# ==============================================================================

class BusinessIntelligenceAPIView(APIView):
    """
    Advanced Business Intelligence & Analytics Endpoint.
    Aggregates Revenue, Occupancy, Peak Hours, Customer Insights, Lot Performance,
    Payment Distributions, and Membership/Loyalty metrics.
    Permission: Strictly restricted to Staff and Administrators.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        filters = {
            'range': request.query_params.get('range', 'last_30_days'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'lot_id': request.query_params.get('lot_id'),
            'payment_method': request.query_params.get('payment_method'),
        }
        data = calculate_bi_analytics(filters)
        return Response(data, status=status.HTTP_200_OK)


class AnalyticsExportAPIView(APIView):
    """
    Export Business Intelligence Reports in PDF, Excel (.xlsx), or CSV format.
    Permission: Strictly restricted to Staff and Administrators.
    """
    permission_classes = [IsStaffOrAdmin]

    def perform_content_negotiation(self, request, force=False):
        # Allow format query param (csv, excel, pdf) without triggering DRF Http404 format suffix check
        renderers = self.get_renderers()
        return (renderers[0], renderers[0].media_type)

    def get(self, request):
        export_format = request.query_params.get('format', 'csv').lower()
        filters = {
            'range': request.query_params.get('range', 'last_30_days'),
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'lot_id': request.query_params.get('lot_id'),
            'payment_method': request.query_params.get('payment_method'),
        }
        data = calculate_bi_analytics(filters)
        date_str = timezone.now().strftime('%Y%m%d')

        if export_format in ('excel', 'xlsx', 'xls'):
            file_bytes = generate_excel_report(data)
            response = HttpResponse(
                file_bytes,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="smart_parking_bi_{date_str}.xlsx"'
            return response

        elif export_format == 'pdf':
            file_bytes = generate_pdf_report(data)
            response = HttpResponse(file_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="smart_parking_bi_{date_str}.pdf"'
            return response

        else:  # Default: CSV
            csv_content = generate_csv_report(data)
            response = HttpResponse(csv_content, content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="smart_parking_bi_{date_str}.csv"'
            return response



# ==============================================================================
# NOTIFICATIONS & ALERT CENTER APIS (FEATURE 6)
# ==============================================================================

class NotificationListAPIView(generics.ListAPIView):
    """
    List user's notifications with filtering by category, read status, search, and archived status.
    Supports pagination and category-based filtering.
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Notification.objects.filter(user=user)

        # Archived filter: default is to exclude archived
        include_archived = self.request.query_params.get('archived', 'false').lower() in ('true', '1', 'yes')
        if not include_archived:
            qs = qs.filter(is_archived=False)

        # Category filter
        category = self.request.query_params.get('category', '').strip()
        if category and category.lower() != 'all':
            qs = qs.filter(category=category)

        # Read status filter
        is_read_param = self.request.query_params.get('is_read')
        if is_read_param is not None and is_read_param != '':
            if is_read_param.lower() in ('true', '1'):
                qs = qs.filter(is_read=True)
            elif is_read_param.lower() in ('false', '0'):
                qs = qs.filter(is_read=False)

        # Search query
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(models.Q(title__icontains=search) | models.Q(message__icontains=search))

        return qs.order_by('-created_at')


class NotificationUnreadCountAPIView(APIView):
    """
    Lightweight endpoint returning the unread notification count.
    Used for efficient real-time polling without transmitting full notification bodies.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        unread_qs = Notification.objects.filter(user=user, is_read=False, is_archived=False)
        unread_count = unread_qs.count()

        # Group counts by category
        by_category = {}
        for item in unread_qs.values('category').annotate(cnt=models.Count('id')):
            by_category[item['category']] = item['cnt']

        latest_notif = Notification.objects.filter(user=user).order_by('-created_at').first()

        return Response({
            'unread_count': unread_count,
            'unread_by_category': by_category,
            'latest_timestamp': latest_notif.created_at.isoformat() if latest_notif else None,
            'poll_interval_seconds': 12,
        })


class NotificationMarkReadAPIView(APIView):
    """Mark a single notification as read."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        notif = get_object_or_404(Notification, pk=pk, user=request.user)
        notif.mark_as_read()
        return Response({
            'message': 'Notification marked as read.',
            'notification': NotificationSerializer(notif).data
        })


class NotificationMarkAllReadAPIView(APIView):
    """Mark all unread notifications as read for current user, optionally filtered by category."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        category = request.data.get('category') or request.query_params.get('category')
        qs = Notification.objects.filter(user=request.user, is_read=False, is_archived=False)
        if category and category.lower() != 'all':
            qs = qs.filter(category=category)

        count = qs.count()
        now = timezone.now()
        qs.update(is_read=True, read_at=now)

        return Response({
            'message': f'Marked {count} notification(s) as read.',
            'marked_count': count
        })


class NotificationArchiveAPIView(APIView):
    """Archive a single notification for the user."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        notif = get_object_or_404(Notification, pk=pk, user=request.user)
        notif.is_archived = True
        notif.save(update_fields=['is_archived'])
        return Response({'message': 'Notification archived successfully.'})


class NotificationDeleteAPIView(APIView):
    """Permanently delete a notification owned by the current user."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        notif = get_object_or_404(Notification, pk=pk, user=request.user)
        notif.delete()
        return Response({'message': 'Notification deleted successfully.'}, status=status.HTTP_200_OK)


class NotificationClearAllAPIView(APIView):
    """Delete or archive all read notifications for current user."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        action = request.data.get('action', 'archive')  # 'archive' or 'delete'
        qs = Notification.objects.filter(user=request.user, is_read=True)

        count = qs.count()
        if action == 'delete':
            qs.delete()
            return Response({'message': f'Deleted {count} read notification(s).', 'count': count})
        else:
            qs.update(is_archived=True)
            return Response({'message': f'Archived {count} read notification(s).', 'count': count})


class AdminAnnouncementCreateAPIView(APIView):
    """
    Admin-only endpoint to broadcast announcements to users.
    Validates permissions, records announcement, dispatches notifications & optional emails.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        title = request.data.get('title', '').strip()
        message = request.data.get('message', '').strip()
        target_role = request.data.get('target_role', AdminAnnouncement.ROLE_ALL)
        send_email = request.data.get('send_email', False) in (True, 'true', '1')

        if not title:
            return Response({'title': ['Announcement title is required.']}, status=status.HTTP_400_BAD_REQUEST)
        if not message:
            return Response({'message': ['Announcement message body is required.']}, status=status.HTTP_400_BAD_REQUEST)
        if target_role not in [c[0] for c in AdminAnnouncement.ROLE_CHOICES]:
            return Response({'target_role': [f"Invalid target role. Choose from: {[c[0] for c in AdminAnnouncement.ROLE_CHOICES]}"]}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            announcement = AdminAnnouncement.objects.create(
                title=title,
                message=message,
                target_role=target_role,
                created_by=request.user,
                send_email=send_email,
            )

        # Broadcast
        delivery_stats = broadcast_admin_announcement(announcement, sender_user=request.user)

        return Response({
            'message': f"Announcement broadcasted to {delivery_stats['total_recipients']} recipient(s).",
            'announcement': AdminAnnouncementSerializer(announcement).data,
            'delivery_stats': delivery_stats
        }, status=status.HTTP_201_CREATED)


class AdminAnnouncementListAPIView(generics.ListAPIView):
    """Admin-only list of past broadcast announcements and delivery statistics."""
    serializer_class = AdminAnnouncementSerializer
    permission_classes = [IsStaffOrAdmin]
    queryset = AdminAnnouncement.objects.all().order_by('-created_at')


class NotificationEmailStatusAPIView(APIView):
    """Inspect the current SMTP email configuration status."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        host = getattr(settings, 'EMAIL_HOST', '')
        is_configured = bool(host and host.strip())
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', '')
        backend = getattr(settings, 'EMAIL_BACKEND', '')

        data = {
            'is_configured': is_configured,
            'backend': backend,
            'default_from_email': from_email,
            'status_message': (
                "SMTP email delivery is active and configured via environment variables."
                if is_configured else
                "SMTP is not configured (EMAIL_HOST empty). In-app notifications are functioning normally."
            )
        }
        if request.user.is_staff or request.user.is_superuser:
            data['host'] = host or '[Not configured]'
            data['port'] = getattr(settings, 'EMAIL_PORT', 587)
            data['use_tls'] = getattr(settings, 'EMAIL_USE_TLS', True)
        return Response(data)


class NotificationRunExpiryCheckAPIView(APIView):
    """Trigger maintenance check to expire overdue payment holds, passes, and memberships."""
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        results = run_expiry_checks()
        return Response({
            'message': 'Expiry maintenance check completed successfully.',
            'results': results
        })



# ==============================================================================
# DYNAMIC PRICING ENGINE APIS
# ==============================================================================

class PriceCalculateAPIView(APIView):
    """
    Public / Authenticated endpoint to quote dynamic pricing for a parking reservation.
    Accepts: lot_id, start_time, end_time, vehicle_type, optional rule_id.
    Returns: Server-calculated price breakdown with time slicing, demand analysis,
    duration discounts, bounds, and tax calculations.
    """
    permission_classes = [permissions.AllowAny]

    def _calculate(self, data, request=None):
        serializer = PriceCalculationRequestSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        lot_id = serializer.validated_data['lot_id']
        start_time = serializer.validated_data['start_time']
        end_time = serializer.validated_data['end_time']
        vehicle_type = serializer.validated_data.get('vehicle_type', 'car')
        vehicle_number = serializer.validated_data.get('vehicle_number', '')
        rule_id = serializer.validated_data.get('rule_id')
        pass_id = serializer.validated_data.get('pass_id')
        membership_id = serializer.validated_data.get('membership_id')
        redeem_points = serializer.validated_data.get('redeem_points', 0)

        lot = get_object_or_404(ParkingLot, pk=lot_id)
        if not lot.is_active:
            return Response({'message': 'Selected parking lot is currently inactive.'}, status=status.HTTP_400_BAD_REQUEST)

        rule = None
        if rule_id:
            rule = get_object_or_404(PricingRule, pk=rule_id)

        try:
            total_amount, breakdown = calculate_dynamic_price(
                lot=lot,
                start_time=start_time,
                end_time=end_time,
                vehicle_type=vehicle_type,
                rule=rule,
                enforce_future=True,
            )

            user = request.user if (request and hasattr(request, 'user') and request.user.is_authenticated) else None

            (
                final_payable,
                benefits_breakdown,
                applied_pass,
                applied_membership,
                validated_points,
                points_discount
            ) = calculate_booking_benefits(
                user=user,
                lot=lot,
                vehicle_number=vehicle_number,
                vehicle_type=vehicle_type,
                start_time=start_time,
                end_time=end_time,
                raw_dynamic_total=total_amount,
                requested_pass_id=pass_id,
                requested_membership_id=membership_id,
                points_to_redeem=redeem_points,
            )

            breakdown['benefits'] = benefits_breakdown

            return Response({
                'lot_id': lot.id,
                'lot_name': lot.name,
                'original_total': float(total_amount),
                'total_amount': float(final_payable),
                'breakdown': breakdown,
                'benefits': benefits_breakdown,
            })
        except ValidationError as e:
            err_dict = e.message_dict if hasattr(e, 'message_dict') else {'message': str(e)}
            return Response(err_dict, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'message': f'Pricing calculation error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request):
        return self._calculate(request.data, request)

    def get(self, request):
        return self._calculate(request.query_params, request)


class PricingRuleListCreateAPIView(APIView):
    """
    List pricing rules or create new rules.
    GET: Authenticated staff / admin can see all rules.
    POST: Authorized staff / admin creates a new dynamic pricing rule with audit logging.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        lot_id = request.query_params.get('lot_id')
        qs = PricingRule.objects.all().select_related('lot', 'created_by')
        if lot_id:
            qs = qs.filter(models.Q(lot_id=lot_id) | models.Q(lot__isnull=True))
        serializer = PricingRuleSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PricingRuleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            rule = serializer.save(created_by=request.user)
            # Create audit log
            PricingRuleAuditLog.objects.create(
                rule=rule,
                user=request.user,
                action='created',
                changes={k: str(v) for k, v in serializer.validated_data.items() if k != 'created_by'},
            )

        return Response(PricingRuleSerializer(rule).data, status=status.HTTP_201_CREATED)


class PricingRuleDetailAPIView(APIView):
    """
    Retrieve, update, or toggle a pricing rule.
    Logs all changes in PricingRuleAuditLog.
    """
    permission_classes = [IsStaffOrAdmin]

    def get_object(self, pk):
        return get_object_or_404(PricingRule, pk=pk)

    def get(self, request, pk):
        rule = self.get_object(pk)
        return Response(PricingRuleSerializer(rule).data)

    def patch(self, request, pk):
        rule = self.get_object(pk)
        serializer = PricingRuleSerializer(rule, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Track diff for audit logging
        changes = {}
        for key, new_val in serializer.validated_data.items():
            old_val = getattr(rule, key, None)
            if old_val != new_val:
                changes[key] = {'old': str(old_val), 'new': str(new_val)}

        with transaction.atomic():
            action = 'updated'
            if 'is_active' in changes and len(changes) == 1:
                action = 'enabled' if serializer.validated_data['is_active'] else 'disabled'

            updated_rule = serializer.save()

            if changes:
                PricingRuleAuditLog.objects.create(
                    rule=updated_rule,
                    user=request.user,
                    action=action,
                    changes=changes,
                )

        return Response(PricingRuleSerializer(updated_rule).data)

    def delete(self, request, pk):
        rule = self.get_object(pk)
        rule_name = rule.name
        with transaction.atomic():
            PricingRuleAuditLog.objects.create(
                rule=rule,
                user=request.user,
                action='disabled',
                changes={'status': 'Rule marked inactive instead of hard delete to preserve historical integrity'},
            )
            rule.is_active = False
            rule.save(update_fields=['is_active'])

        return Response({'message': f'Pricing rule "{rule_name}" deactivated successfully.'})


class PricingRuleAuditLogAPIView(APIView):
    """
    View pricing rule audit log history.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        rule_id = request.query_params.get('rule_id')
        qs = PricingRuleAuditLog.objects.all().select_related('rule', 'user')
        if rule_id:
            qs = qs.filter(rule_id=rule_id)
        serializer = PricingRuleAuditLogSerializer(qs[:100], many=True)
        return Response(serializer.data)


class PricingPreviewAPIView(APIView):
    """
    Allows admins to preview a pricing calculation with draft parameters
    BEFORE saving or publishing a rule to production.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request):
        data = request.data
        lot_id = data.get('lot_id')
        lot = get_object_or_404(ParkingLot, pk=lot_id) if lot_id else ParkingLot.objects.first()

        start_time_str = data.get('start_time')
        end_time_str = data.get('end_time')
        vehicle_type = data.get('vehicle_type', 'car')

        if not start_time_str or not end_time_str:
            now = timezone.now() + timedelta(hours=1)
            start_time = now
            end_time = now + timedelta(hours=3)
        else:
            start_time = parse_datetime(start_time_str)
            end_time = parse_datetime(end_time_str)
            if not start_time or not end_time:
                return Response({'message': 'Invalid start_time or end_time format.'}, status=status.HTTP_400_BAD_REQUEST)

        # Build in-memory draft rule from request parameters
        draft_rule = PricingRule(
            name=data.get('name', 'Draft Preview Rule'),
            lot=lot,
            is_active=True,
            base_hourly_rate=Decimal(str(data.get('base_hourly_rate', lot.price_per_hour if lot else 20))),
            car_multiplier=Decimal(str(data.get('car_multiplier', 1.00))),
            bike_multiplier=Decimal(str(data.get('bike_multiplier', 0.60))),
            ev_multiplier=Decimal(str(data.get('ev_multiplier', 1.20))),
            peak_start_hour_1=int(data.get('peak_start_hour_1', 9)),
            peak_end_hour_1=int(data.get('peak_end_hour_1', 12)),
            peak_start_hour_2=int(data.get('peak_start_hour_2', 17)),
            peak_end_hour_2=int(data.get('peak_end_hour_2', 21)),
            peak_multiplier=Decimal(str(data.get('peak_multiplier', 1.25))),
            off_peak_multiplier=Decimal(str(data.get('off_peak_multiplier', 1.00))),
            weekend_multiplier=Decimal(str(data.get('weekend_multiplier', 1.15))),
            duration_discount_threshold_hours=Decimal(str(data.get('duration_discount_threshold_hours', 4.0))),
            duration_discount_percent=Decimal(str(data.get('duration_discount_percent', 10.0))),
            enable_demand_pricing=bool(data.get('enable_demand_pricing', True)),
            demand_surge_threshold_percent=Decimal(str(data.get('demand_surge_threshold_percent', 70.0))),
            demand_surge_multiplier=Decimal(str(data.get('demand_surge_multiplier', 1.20))),
            demand_discount_threshold_percent=Decimal(str(data.get('demand_discount_threshold_percent', 30.0))),
            demand_discount_multiplier=Decimal(str(data.get('demand_discount_multiplier', 0.90))),
            min_historical_bookings_threshold=int(data.get('min_historical_bookings_threshold', 3)),
            min_hourly_rate=Decimal(str(data.get('min_hourly_rate', 10.0))),
            max_hourly_rate=Decimal(str(data.get('max_hourly_rate', 150.0))),
            tax_percent=Decimal(str(data.get('tax_percent', 18.0))),
        )

        try:
            total_amount, breakdown = calculate_dynamic_price(
                lot=lot,
                start_time=start_time,
                end_time=end_time,
                vehicle_type=vehicle_type,
                rule=draft_rule,
                enforce_future=False,  # Allow historical or simulated preview
            )
            return Response({
                'is_preview': True,
                'total_amount': float(total_amount),
                'breakdown': breakdown,
            })
        except ValidationError as e:
            err_dict = e.message_dict if hasattr(e, 'message_dict') else {'message': str(e)}
            return Response(err_dict, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'message': f'Preview calculation error: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# COMPLAINT & SUPPORT TICKET API VIEWS
# ==============================================================================

class SupportTicketListCreateAPIView(APIView):
    """
    List user or staff support tickets, or create a new support ticket.
    - Regular customers: View only their own tickets.
    - Staff / Admin: View all tickets with filtering and search.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        is_staff_or_admin = user.is_staff or user.is_superuser

        if is_staff_or_admin:
            qs = SupportTicket.objects.select_related('user', 'assigned_to', 'booking__slot__lot').prefetch_related('messages')
        else:
            qs = SupportTicket.objects.filter(user=user).select_related('user', 'assigned_to', 'booking__slot__lot').prefetch_related('messages')

        # Filters
        status_param = request.query_params.get('status')
        if status_param and status_param != 'all':
            if status_param == 'active':
                qs = qs.filter(status__in=[SupportTicket.STATUS_OPEN, SupportTicket.STATUS_ASSIGNED, SupportTicket.STATUS_IN_PROGRESS, SupportTicket.STATUS_WAITING_USER])
            elif status_param in dict(SupportTicket.STATUS_CHOICES):
                qs = qs.filter(status=status_param)

        priority_param = request.query_params.get('priority')
        if priority_param and priority_param != 'all' and priority_param in dict(SupportTicket.PRIORITY_CHOICES):
            qs = qs.filter(priority=priority_param)

        category_param = request.query_params.get('category')
        if category_param and category_param != 'all' and category_param in dict(SupportTicket.CATEGORY_CHOICES):
            qs = qs.filter(category=category_param)

        # Assignment filtering for Staff
        assigned_param = request.query_params.get('assigned_to')
        if assigned_param:
            if assigned_param == 'me':
                qs = qs.filter(assigned_to=user)
            elif assigned_param == 'unassigned':
                qs = qs.filter(assigned_to__isnull=True)
            elif assigned_param.isdigit():
                qs = qs.filter(assigned_to_id=int(assigned_param))

        # Search query
        search_query = request.query_params.get('search', '').strip()
        if search_query:
            qs = qs.filter(
                models.Q(ticket_id__icontains=search_query) |
                models.Q(subject__icontains=search_query) |
                models.Q(description__icontains=search_query) |
                models.Q(booking__booking_id__icontains=search_query) |
                models.Q(user__username__icontains=search_query)
            )

        serializer = SupportTicketListSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = SupportTicketCreateSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        ticket = serializer.save()

        # Send confirmation notification to ticket creator
        Notification.objects.create(
            user=request.user,
            title=f"Support Ticket #{ticket.ticket_id} Created",
            message=f"We have received your ticket regarding '{ticket.subject}'. Our support team will review it shortly.",
            notification_type='info'
        )

        # Notify active staff members of the new ticket
        staff_users = User.objects.filter(is_active=True, is_staff=True).exclude(pk=request.user.pk)[:10]
        for staff_member in staff_users:
            Notification.objects.create(
                user=staff_member,
                title=f"New Ticket: #{ticket.ticket_id}",
                message=f"Customer @{request.user.username} submitted ticket '{ticket.subject}' [{ticket.get_priority_display()} Priority].",
                notification_type='info'
            )

        return Response(
            SupportTicketDetailSerializer(ticket, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )


class SupportTicketDetailAPIView(APIView):
    """
    Retrieve full details and message history for a specific ticket.
    Security: Customers may only view their own tickets. Internal notes are hidden from customers.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, ticket_id):
        ticket = get_object_or_404(
            SupportTicket.objects.select_related('user', 'assigned_to', 'booking__slot__lot'),
            ticket_id__iexact=ticket_id
        )

        # Enforce authorization
        if ticket.user != request.user and not (request.user.is_staff or request.user.is_superuser):
            return Response({'message': 'You do not have permission to view this ticket.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = SupportTicketDetailSerializer(ticket, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class TicketReplyAPIView(APIView):
    """
    Add a message reply or internal staff note to a support ticket.
    - Regular users can reply to their own open tickets.
    - Staff / Admin can reply or post internal staff notes (hidden from customers).
    - Status updates can be applied alongside staff replies.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, ticket_id__iexact=ticket_id)
        user = request.user
        is_staff_or_admin = user.is_staff or user.is_superuser

        # Enforce object access
        if ticket.user != user and not is_staff_or_admin:
            return Response({'message': 'You do not have permission to reply to this ticket.'}, status=status.HTTP_403_FORBIDDEN)

        # Prevent replies on closed tickets
        if ticket.status == SupportTicket.STATUS_CLOSED:
            return Response({
                'message': 'This ticket is closed and no longer accepting replies. You may reopen it if applicable or create a new ticket.'
            }, status=status.HTTP_400_BAD_REQUEST)

        message_text = request.data.get('message', '').strip()
        if not message_text:
            return Response({'message': 'Message text is required.'}, status=status.HTTP_400_BAD_REQUEST)

        attachment = request.FILES.get('attachment')
        if attachment:
            try:
                validate_support_attachment(attachment)
            except ValidationError as e:
                return Response({'attachment': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Handle internal note security
        raw_internal = request.data.get('is_internal_note', False)
        is_internal_note = str(raw_internal).lower() in ('true', '1') if is_staff_or_admin else False

        # Create message
        msg = TicketMessage.objects.create(
            ticket=ticket,
            sender=user,
            message=message_text,
            attachment=attachment,
            is_internal_note=is_internal_note
        )

        # Automatic lifecycle state transitions
        new_status = request.data.get('status')
        old_status = ticket.status

        if not is_staff_or_admin:
            # Customer replied: If ticket was waiting for user, transition back to in_progress
            if ticket.status == SupportTicket.STATUS_WAITING_USER:
                ticket.status = SupportTicket.STATUS_IN_PROGRESS
                ticket.save(update_fields=['status', 'updated_at'])
                TicketAuditLog.objects.create(
                    ticket=ticket,
                    performed_by=user,
                    action='status_updated',
                    old_value=old_status,
                    new_value=ticket.status,
                    notes='Customer replied, ticket moved back to In Progress.'
                )
            else:
                ticket.save(update_fields=['updated_at'])

            # Notify assigned staff or general staff
            recipient = ticket.assigned_to
            if recipient:
                Notification.objects.create(
                    user=recipient,
                    title=f"Customer Reply: #{ticket.ticket_id}",
                    message=f"@{user.username} replied on ticket '{ticket.subject}': {message_text[:80]}",
                    notification_type='info'
                )
        else:
            # Staff replied: If staff specified a new status (e.g. waiting_user, resolved)
            if new_status and new_status in dict(SupportTicket.STATUS_CHOICES) and new_status != old_status:
                ticket.status = new_status
                if new_status == SupportTicket.STATUS_RESOLVED:
                    ticket.resolved_at = timezone.now()
                    ticket.resolution_notes = request.data.get('resolution_notes', '') or message_text
                ticket.save()
                TicketAuditLog.objects.create(
                    ticket=ticket,
                    performed_by=user,
                    action='status_updated',
                    old_value=old_status,
                    new_value=new_status,
                    notes=f"Status updated during staff reply to '{ticket.get_status_display()}'."
                )
            else:
                # If staff replied to an open or assigned ticket without explicitly changing status, advance to in_progress
                if ticket.status in (SupportTicket.STATUS_OPEN, SupportTicket.STATUS_ASSIGNED) and not is_internal_note:
                    ticket.status = SupportTicket.STATUS_IN_PROGRESS
                    ticket.save(update_fields=['status', 'updated_at'])
                    TicketAuditLog.objects.create(
                        ticket=ticket,
                        performed_by=user,
                        action='status_updated',
                        old_value=old_status,
                        new_value=ticket.status,
                        notes='Staff sent response, ticket moved to In Progress.'
                    )
                else:
                    ticket.save(update_fields=['updated_at'])

            # Notify the customer (ONLY if not an internal note)
            if not is_internal_note:
                Notification.objects.create(
                    user=ticket.user,
                    title=f"Support Response: #{ticket.ticket_id}",
                    message=f"Staff member @{user.username} replied to your ticket: '{message_text[:80]}'",
                    notification_type='info'
                )

        return Response({
            'message': 'Reply sent successfully.',
            'ticket': SupportTicketDetailSerializer(ticket, context={'request': request}).data,
            'new_message': TicketMessageSerializer(msg, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)


class TicketStatusUpdateAPIView(APIView):
    """
    Update ticket status and record resolution details.
    - Staff / Admin can transition to any valid status.
    - Customers can close their own ticket once resolved or cancel when open.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, ticket_id__iexact=ticket_id)
        user = request.user
        is_staff_or_admin = user.is_staff or user.is_superuser

        new_status = request.data.get('status')
        resolution_notes = request.data.get('resolution_notes', '').strip()

        if not new_status or new_status not in dict(SupportTicket.STATUS_CHOICES):
            return Response({'message': 'A valid status is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Enforce role-based status transition rules
        if not is_staff_or_admin:
            if ticket.user != user:
                return Response({'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
            # Regular user can only mark as closed
            if new_status != SupportTicket.STATUS_CLOSED:
                return Response({'message': 'Users may only close resolved or open tickets.'}, status=status.HTTP_403_FORBIDDEN)

        old_status = ticket.status
        if old_status == new_status:
            return Response({'message': f'Ticket is already in {ticket.get_status_display()} status.'}, status=status.HTTP_200_OK)

        ticket.status = new_status
        if new_status == SupportTicket.STATUS_RESOLVED:
            ticket.resolved_at = timezone.now()
            if resolution_notes:
                ticket.resolution_notes = resolution_notes
        elif new_status == SupportTicket.STATUS_CLOSED:
            ticket.closed_at = timezone.now()
            if resolution_notes and not ticket.resolution_notes:
                ticket.resolution_notes = resolution_notes

        ticket.save()

        # Audit log
        TicketAuditLog.objects.create(
            ticket=ticket,
            performed_by=user,
            action='status_updated',
            old_value=old_status,
            new_value=new_status,
            notes=resolution_notes or f"Status changed from {old_status} to {new_status}."
        )

        # Notify ticket owner
        if user != ticket.user:
            notif_msg = f"Status updated to {ticket.get_status_display()}."
            if resolution_notes:
                notif_msg += f" Resolution notes: {resolution_notes}"
            Notification.objects.create(
                user=ticket.user,
                title=f"Ticket #{ticket.ticket_id} Status Updated",
                message=notif_msg,
                notification_type='success' if new_status in (SupportTicket.STATUS_RESOLVED, SupportTicket.STATUS_CLOSED) else 'info'
            )

        return Response({
            'message': f'Ticket status updated to {ticket.get_status_display()}.',
            'ticket': SupportTicketDetailSerializer(ticket, context={'request': request}).data
        }, status=status.HTTP_200_OK)


class TicketAssignAPIView(APIView):
    """
    Assign or reassign a support ticket to a staff member.
    Permission: Staff or Admin.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, ticket_id__iexact=ticket_id)
        assigned_to_id = request.data.get('assigned_to_id')
        old_assignee = ticket.assigned_to.username if ticket.assigned_to else 'Unassigned'

        if assigned_to_id:
            assignee = get_object_or_404(User, pk=assigned_to_id, is_active=True)
            ticket.assigned_to = assignee
            new_assignee_name = assignee.username
            # Automatically advance Open tickets to Assigned
            if ticket.status == SupportTicket.STATUS_OPEN:
                ticket.status = SupportTicket.STATUS_ASSIGNED
            ticket.save()

            # Notify assigned staff
            if assignee != request.user:
                Notification.objects.create(
                    user=assignee,
                    title=f"Ticket Assigned: #{ticket.ticket_id}",
                    message=f"You have been assigned ticket '{ticket.subject}' [{ticket.get_priority_display()} Priority].",
                    notification_type='info'
                )
        else:
            ticket.assigned_to = None
            new_assignee_name = 'Unassigned'
            ticket.save()

        TicketAuditLog.objects.create(
            ticket=ticket,
            performed_by=request.user,
            action='assigned',
            old_value=old_assignee,
            new_value=new_assignee_name,
            notes=f"Ticket assigned to {new_assignee_name}."
        )

        return Response({
            'message': f'Ticket assigned to {new_assignee_name}.',
            'ticket': SupportTicketDetailSerializer(ticket, context={'request': request}).data
        }, status=status.HTTP_200_OK)


class TicketPriorityUpdateAPIView(APIView):
    """
    Update ticket priority (Low, Medium, High).
    Permission: Staff or Admin.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, ticket_id__iexact=ticket_id)
        new_priority = request.data.get('priority')

        if not new_priority or new_priority not in dict(SupportTicket.PRIORITY_CHOICES):
            return Response({'message': 'Invalid priority provided.'}, status=status.HTTP_400_BAD_REQUEST)

        old_priority = ticket.priority
        ticket.priority = new_priority
        ticket.save(update_fields=['priority', 'updated_at'])

        TicketAuditLog.objects.create(
            ticket=ticket,
            performed_by=request.user,
            action='priority_updated',
            old_value=old_priority,
            new_value=new_priority,
            notes=f"Priority adjusted from {old_priority} to {new_priority}."
        )

        return Response({
            'message': f'Priority updated to {ticket.get_priority_display()}.',
            'ticket': SupportTicketDetailSerializer(ticket, context={'request': request}).data
        }, status=status.HTTP_200_OK)


class TicketReopenAPIView(APIView):
    """
    Reopen an eligible resolved ticket.
    Rule: Only tickets in 'resolved' status can be reopened.
    Closed tickets cannot be reopened by customer.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, ticket_id__iexact=ticket_id)
        user = request.user
        is_staff_or_admin = user.is_staff or user.is_superuser

        if ticket.user != user and not is_staff_or_admin:
            return Response({'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        if ticket.status == SupportTicket.STATUS_CLOSED and not is_staff_or_admin:
            return Response({
                'message': 'Closed tickets cannot be reopened. Please create a new support ticket.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if ticket.status != SupportTicket.STATUS_RESOLVED and not is_staff_or_admin:
            return Response({
                'message': f'Cannot reopen ticket currently in {ticket.get_status_display()} status.'
            }, status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason', '').strip() or 'Customer indicated the issue was not fully resolved.'
        old_status = ticket.status

        ticket.status = SupportTicket.STATUS_IN_PROGRESS
        ticket.resolved_at = None
        ticket.save()

        TicketAuditLog.objects.create(
            ticket=ticket,
            performed_by=user,
            action='reopened',
            old_value=old_status,
            new_value=ticket.status,
            notes=reason
        )

        # Notify staff / assigned agent
        if ticket.assigned_to:
            Notification.objects.create(
                user=ticket.assigned_to,
                title=f"Ticket Reopened: #{ticket.ticket_id}",
                message=f"Customer @{ticket.user.username} reopened ticket '{ticket.subject}'. Reason: {reason}",
                notification_type='warning'
            )

        return Response({
            'message': 'Ticket has been reopened and returned to In Progress.',
            'ticket': SupportTicketDetailSerializer(ticket, context={'request': request}).data
        }, status=status.HTTP_200_OK)


class TicketCloseAPIView(APIView):
    """
    Close ticket permanently.
    Permission: Ticket owner or Staff/Admin.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, ticket_id):
        ticket = get_object_or_404(SupportTicket, ticket_id__iexact=ticket_id)
        user = request.user
        is_staff_or_admin = user.is_staff or user.is_superuser

        if ticket.user != user and not is_staff_or_admin:
            return Response({'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        old_status = ticket.status
        ticket.status = SupportTicket.STATUS_CLOSED
        ticket.closed_at = timezone.now()
        ticket.save()

        TicketAuditLog.objects.create(
            ticket=ticket,
            performed_by=user,
            action='closed',
            old_value=old_status,
            new_value=ticket.status,
            notes='Ticket closed.'
        )

        return Response({
            'message': 'Ticket has been closed.',
            'ticket': SupportTicketDetailSerializer(ticket, context={'request': request}).data
        }, status=status.HTTP_200_OK)


class SupportAnalyticsAPIView(APIView):
    """
    Support system metrics and analytics for Staff & Admin.
    Computes ticket counts, resolution metrics, category breakdowns, and 14-day trends.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        now = timezone.now()
        total_tickets = SupportTicket.objects.count()
        open_tickets = SupportTicket.objects.filter(status=SupportTicket.STATUS_OPEN).count()
        assigned_tickets = SupportTicket.objects.filter(status=SupportTicket.STATUS_ASSIGNED).count()
        in_progress_tickets = SupportTicket.objects.filter(status=SupportTicket.STATUS_IN_PROGRESS).count()
        waiting_user_tickets = SupportTicket.objects.filter(status=SupportTicket.STATUS_WAITING_USER).count()
        resolved_tickets = SupportTicket.objects.filter(status=SupportTicket.STATUS_RESOLVED).count()
        closed_tickets = SupportTicket.objects.filter(status=SupportTicket.STATUS_CLOSED).count()
        unassigned_tickets = SupportTicket.objects.filter(
            assigned_to__isnull=True
        ).exclude(status__in=[SupportTicket.STATUS_RESOLVED, SupportTicket.STATUS_CLOSED]).count()

        # Resolution rate %
        resolved_total = resolved_tickets + closed_tickets
        resolution_rate = round((resolved_total / total_tickets * 100), 1) if total_tickets > 0 else 0.0

        # Average resolution time in hours
        resolved_qs = SupportTicket.objects.filter(
            resolved_at__isnull=False
        ).only('created_at', 'resolved_at')

        res_hours_list = []
        for t in resolved_qs:
            if t.resolved_at and t.created_at:
                diff_hours = (t.resolved_at - t.created_at).total_seconds() / 3600.0
                if diff_hours >= 0:
                    res_hours_list.append(diff_hours)

        avg_resolution_hours = round(sum(res_hours_list) / len(res_hours_list), 1) if res_hours_list else 0.0

        # Breakdown by category
        category_counts = {}
        for cat_key, cat_label in SupportTicket.CATEGORY_CHOICES:
            category_counts[cat_key] = {
                'label': cat_label,
                'count': SupportTicket.objects.filter(category=cat_key).count()
            }

        # Breakdown by priority
        priority_counts = {
            'low': SupportTicket.objects.filter(priority='low').count(),
            'medium': SupportTicket.objects.filter(priority='medium').count(),
            'high': SupportTicket.objects.filter(priority='high').count(),
        }

        # 14-day daily volume trends
        days_trend = []
        for i in range(13, -1, -1):
            day_date = (now - timezone.timedelta(days=i)).date()
            c_count = SupportTicket.objects.filter(created_at__date=day_date).count()
            r_count = SupportTicket.objects.filter(resolved_at__date=day_date).count()
            days_trend.append({
                'date': day_date.strftime('%d %b'),
                'created': c_count,
                'resolved': r_count,
            })

        return Response({
            'overview': {
                'total_tickets': total_tickets,
                'open_tickets': open_tickets,
                'assigned_tickets': assigned_tickets,
                'in_progress_tickets': in_progress_tickets,
                'waiting_user_tickets': waiting_user_tickets,
                'resolved_tickets': resolved_tickets,
                'closed_tickets': closed_tickets,
                'unassigned_tickets': unassigned_tickets,
                'resolution_rate': resolution_rate,
                'avg_resolution_hours': avg_resolution_hours,
            },
            'categories': category_counts,
            'priorities': priority_counts,
            'trends': days_trend,
        }, status=status.HTTP_200_OK)


class SupportStaffListAPIView(APIView):
    """
    List of active staff members for ticket assignment.
    Permission: Staff or Admin.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        staff_qs = User.objects.filter(is_active=True).filter(
            models.Q(is_staff=True) | models.Q(is_superuser=True)
        ).order_by('username')

        data = []
        for s in staff_qs:
            full_name = f"{s.first_name} {s.last_name}".strip()
            data.append({
                'id': s.id,
                'username': s.username,
                'name': full_name or s.username,
                'email': s.email,
                'role': 'admin' if s.is_superuser else 'staff',
            })
        return Response(data, status=status.HTTP_200_OK)


class UserEligibleBookingsAPIView(APIView):
    """
    List of recent bookings for the authenticated customer to optionally associate with a support ticket.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        bookings = Booking.objects.filter(user=request.user).select_related('slot__lot').order_by('-created_at')[:25]
        data = []
        for b in bookings:
            data.append({
                'booking_id': str(b.booking_id),
                'lot_name': b.slot.lot.name if b.slot and b.slot.lot else 'Unknown Lot',
                'slot_number': b.slot.slot_number if b.slot else '',
                'vehicle_number': b.vehicle_number,
                'start_time': b.start_time.isoformat() if b.start_time else '',
                'end_time': b.end_time.isoformat() if b.end_time else '',
                'amount': float(b.amount),
                'status': b.status,
            })
        return Response(data, status=status.HTTP_200_OK)


