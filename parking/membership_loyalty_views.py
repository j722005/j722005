import uuid
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    ParkingLot, Vehicle, Notification,
    MembershipPlan, CustomerMembership, MonthlyPass,
    LoyaltyProgramConfig, LoyaltyAccount, LoyaltyTransaction
)
from .notification_service import (
    notify_membership_activated,
    notify_monthly_pass_activated,
)
from .permissions import IsOwnerOrStaff, IsStaffOrAdmin
from .serializers import (
    MembershipPlanSerializer,
    CustomerMembershipSerializer,
    CustomerMembershipPurchaseSerializer,
    MonthlyPassSerializer,
    MonthlyPassPurchaseSerializer,
    LoyaltyProgramConfigSerializer,
    LoyaltyAccountSerializer,
    LoyaltyTransactionSerializer,
    LoyaltyAdminAdjustSerializer,
)
from .loyalty_membership_service import (
    get_or_create_loyalty_account,
)


# ==============================================================================
# 1. MEMBERSHIP PLANS APIS
# ==============================================================================

class MembershipPlanListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = MembershipPlanSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsStaffOrAdmin()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        user = self.request.user
        qs = MembershipPlan.objects.prefetch_related('eligible_lots')
        if not (user and user.is_authenticated and (user.is_staff or user.is_superuser)):
            qs = qs.filter(is_active=True)
        return qs


class MembershipPlanDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = MembershipPlan.objects.all().prefetch_related('eligible_lots')
    serializer_class = MembershipPlanSerializer

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH', 'DELETE'):
            return [permissions.IsAuthenticated(), IsStaffOrAdmin()]
        return [permissions.AllowAny()]

    def perform_destroy(self, instance):
        # Soft-delete by marking inactive if subscriptions exist, else hard delete
        if instance.subscriptions.exists():
            instance.is_active = False
            instance.save(update_fields=['is_active', 'updated_at'])
        else:
            instance.delete()


# ==============================================================================
# 2. CUSTOMER MEMBERSHIPS APIS
# ==============================================================================

class MyMembershipsAPIView(generics.ListAPIView):
    serializer_class = CustomerMembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Automatically mark expired memberships
        now = timezone.now()
        CustomerMembership.objects.filter(
            user=user,
            status=CustomerMembership.STATUS_ACTIVE,
            end_date__lt=now
        ).update(status=CustomerMembership.STATUS_EXPIRED)

        return CustomerMembership.objects.filter(user=user).select_related('plan').order_by('-created_at')


class MembershipPurchaseAPIView(APIView):
    """
    Customer purchases a membership plan.
    Requires simulated payment confirmation before activation.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = CustomerMembershipPurchaseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        plan_id = serializer.validated_data['plan_id']
        payment_method = serializer.validated_data['payment_method']
        auto_renew = serializer.validated_data['auto_renew']

        plan = get_object_or_404(MembershipPlan, pk=plan_id)
        if not plan.is_active:
            return Response({'message': 'This membership plan is no longer active.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        with transaction.atomic():
            # Check existing active membership for this plan to handle extension
            existing = CustomerMembership.objects.filter(
                user=request.user,
                plan=plan,
                status=CustomerMembership.STATUS_ACTIVE,
                end_date__gt=now
            ).order_by('-end_date').first()

            if existing:
                start_date = existing.end_date
            else:
                start_date = now

            end_date = start_date + timedelta(days=plan.duration_days)
            txn_id = f"MEM-SIM-{uuid.uuid4().hex[:12].upper()}"

            membership = CustomerMembership.objects.create(
                user=request.user,
                plan=plan,
                status=CustomerMembership.STATUS_ACTIVE,
                start_date=start_date,
                end_date=end_date,
                auto_renew=auto_renew,
                usage_count=0,
                payment_method=payment_method,
                amount_paid=plan.price,
                transaction_id=txn_id,
                is_simulated_payment=True,
            )

            notify_membership_activated(membership)

        return Response({
            'message': f"Membership '{plan.name}' purchased and activated successfully!",
            'membership': CustomerMembershipSerializer(membership).data,
            'simulated_payment': {
                'status': 'success',
                'transaction_id': txn_id,
                'amount': float(plan.price),
                'method': payment_method,
                'note': 'Demonstration simulated payment confirmed.'
            }
        }, status=status.HTTP_201_CREATED)


class MembershipCancelRenewalAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        membership = get_object_or_404(CustomerMembership, pk=pk, user=request.user)
        membership.auto_renew = False
        membership.save(update_fields=['auto_renew', 'updated_at'])
        return Response({
            'message': 'Auto-renewal has been cancelled for this membership.',
            'membership': CustomerMembershipSerializer(membership).data
        })


class MembershipRenewAPIView(APIView):
    """
    Manually renew an active or expired membership.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        membership = get_object_or_404(CustomerMembership, pk=pk, user=request.user)
        plan = membership.plan
        if not plan.is_active:
            return Response({'message': 'This plan is discontinued and cannot be renewed.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        with transaction.atomic():
            start_date = membership.end_date if (membership.end_date and membership.end_date > now) else now
            end_date = start_date + timedelta(days=plan.duration_days)
            txn_id = f"MEM-REN-{uuid.uuid4().hex[:12].upper()}"

            renewed = CustomerMembership.objects.create(
                user=request.user,
                plan=plan,
                status=CustomerMembership.STATUS_ACTIVE,
                start_date=start_date,
                end_date=end_date,
                auto_renew=membership.auto_renew,
                usage_count=0,
                payment_method=membership.payment_method or 'upi',
                amount_paid=plan.price,
                transaction_id=txn_id,
                is_simulated_payment=True,
            )

            notify_membership_activated(renewed)

        return Response({
            'message': 'Membership renewed successfully!',
            'membership': CustomerMembershipSerializer(renewed).data
        })


# ==============================================================================
# 3. MONTHLY PARKING PASSES APIS
# ==============================================================================

class MyMonthlyPassesAPIView(generics.ListAPIView):
    serializer_class = MonthlyPassSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        now = timezone.now()
        # Update expired passes
        MonthlyPass.objects.filter(
            user=user,
            status=MonthlyPass.STATUS_ACTIVE,
            end_date__lt=now
        ).update(status=MonthlyPass.STATUS_EXPIRED)

        return MonthlyPass.objects.filter(user=user).select_related('vehicle', 'lot').order_by('-created_at')


class MonthlyPassPurchaseAPIView(APIView):
    """
    Customer purchases a Monthly Parking Pass for their registered vehicle.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = MonthlyPassPurchaseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        vehicle_id = serializer.validated_data['vehicle_id']
        lot_id = serializer.validated_data.get('lot_id')
        pass_type = serializer.validated_data.get('pass_type', MonthlyPass.PASS_TYPE_FULL)
        payment_method = serializer.validated_data.get('payment_method', 'upi')

        vehicle = get_object_or_404(Vehicle, pk=vehicle_id, user=request.user)

        lot = None
        if lot_id:
            lot = get_object_or_404(ParkingLot, pk=lot_id)
            if not lot.is_active:
                return Response({'message': 'Selected parking location is inactive.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        start_date = now
        end_date = now + timedelta(days=30)

        # Configured pass pricing: Full coverage = ₹1499, Discounted 50% = ₹799
        if pass_type == MonthlyPass.PASS_TYPE_FULL:
            price = Decimal('1499.00')
            discount_pct = Decimal('100.00')
            pass_name = f"All-Access Monthly Pass - {vehicle.license_plate}"
        else:
            price = Decimal('799.00')
            discount_pct = Decimal('50.00')
            pass_name = f"50% Off Monthly Saver - {vehicle.license_plate}"

        txn_id = f"PASS-SIM-{uuid.uuid4().hex[:12].upper()}"

        with transaction.atomic():
            monthly_pass = MonthlyPass.objects.create(
                user=request.user,
                vehicle=vehicle,
                vehicle_license_plate=vehicle.license_plate,
                lot=lot,
                pass_name=pass_name,
                pass_type=pass_type,
                discount_percent=discount_pct,
                price=price,
                status=MonthlyPass.STATUS_ACTIVE,
                start_date=start_date,
                end_date=end_date,
                max_bookings=0,  # Unlimited within month
                usage_count=0,
                payment_method=payment_method,
                amount_paid=price,
                transaction_id=txn_id,
                is_simulated_payment=True,
            )

            notify_monthly_pass_activated(monthly_pass)

        return Response({
            'message': 'Monthly parking pass purchased and issued successfully!',
            'pass': MonthlyPassSerializer(monthly_pass).data,
            'simulated_payment': {
                'status': 'success',
                'transaction_id': txn_id,
                'amount': float(price),
                'method': payment_method,
                'note': 'Demonstration simulated payment confirmed.'
            }
        }, status=status.HTTP_201_CREATED)


class MonthlyPassDetailAPIView(generics.RetrieveAPIView):
    serializer_class = MonthlyPassSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrStaff]
    queryset = MonthlyPass.objects.all().select_related('vehicle', 'lot')


class MonthlyPassCancelAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        monthly_pass = get_object_or_404(MonthlyPass, pk=pk, user=request.user)
        if monthly_pass.status in (MonthlyPass.STATUS_EXPIRED, MonthlyPass.STATUS_CANCELLED):
            return Response({'message': 'Pass is already expired or cancelled.'}, status=status.HTTP_400_BAD_REQUEST)

        monthly_pass.status = MonthlyPass.STATUS_CANCELLED
        monthly_pass.save(update_fields=['status', 'updated_at'])

        return Response({
            'message': 'Monthly pass has been cancelled.',
            'pass': MonthlyPassSerializer(monthly_pass).data
        })


# ==============================================================================
# 4. LOYALTY REWARDS & POINTS APIS
# ==============================================================================

class LoyaltyAccountAPIView(APIView):
    """
    Returns current authenticated customer's loyalty balance, tier, and program configuration.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        account = get_or_create_loyalty_account(request.user)
        config = LoyaltyProgramConfig.get_config()

        data = LoyaltyAccountSerializer(account).data
        data['program_config'] = LoyaltyProgramConfigSerializer(config).data
        return Response(data)


class LoyaltyTransactionHistoryAPIView(generics.ListAPIView):
    """
    Returns chronological ledger of customer's loyalty point transactions.
    """
    serializer_class = LoyaltyTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        account = get_or_create_loyalty_account(self.request.user)
        return LoyaltyTransaction.objects.filter(account=account).select_related('account__user', 'booking').order_by('-created_at')


class LoyaltyConfigAPIView(APIView):
    """
    GET: View global loyalty program configuration.
    PUT/PATCH: Update configuration (Staff/Admin only).
    """
    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [permissions.IsAuthenticated(), IsStaffOrAdmin()]
        return [permissions.AllowAny()]

    def get(self, request):
        config = LoyaltyProgramConfig.get_config()
        return Response(LoyaltyProgramConfigSerializer(config).data)

    def patch(self, request):
        config = LoyaltyProgramConfig.get_config()
        serializer = LoyaltyProgramConfigSerializer(config, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(updated_by=request.user)
            return Response({
                'message': 'Loyalty program configuration updated successfully.',
                'config': serializer.data
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoyaltyAdminAdjustAPIView(APIView):
    """
    Admin manual point adjustment (credit or debit) with strict ledger recording.
    """
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

    def post(self, request):
        serializer = LoyaltyAdminAdjustSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth import get_user_model
        User = get_user_model()

        user_id = serializer.validated_data['user_id']
        pts = serializer.validated_data['points']
        adj_type = serializer.validated_data['adjustment_type']
        reason = serializer.validated_data['reason']

        target_user = get_object_or_404(User, pk=user_id)

        with transaction.atomic():
            account = LoyaltyAccount.objects.select_for_update().get_or_create(
                user=target_user,
                defaults={'points_balance': 0, 'lifetime_earned': 0, 'lifetime_redeemed': 0, 'tier': 'Bronze'}
            )[0]

            if adj_type == 'debit':
                if account.points_balance < pts:
                    return Response({
                        'message': f"Cannot debit {pts} points; user only has {account.points_balance} points."
                    }, status=status.HTTP_400_BAD_REQUEST)
                delta = -pts
                account.points_balance -= pts
            else:
                delta = pts
                account.points_balance += pts
                account.lifetime_earned += pts

            account.recalculate_tier()
            account.save(update_fields=['points_balance', 'lifetime_earned', 'tier', 'updated_at'])

            ref_id = f"ADJ-{uuid.uuid4().hex[:12].upper()}"
            tx = LoyaltyTransaction.objects.create(
                account=account,
                transaction_type=LoyaltyTransaction.TYPE_ADJUSTED,
                points=delta,
                balance_after=account.points_balance,
                reference_id=ref_id,
                description=f"Admin {adj_type}: {reason}",
                performed_by=request.user,
            )

            Notification.objects.create(
                user=target_user,
                title="Loyalty Points Adjustment",
                message=f"Your points balance was adjusted by {delta:+d} points by administrator ({reason}). Current balance: {account.points_balance} pts.",
                notification_type="info"
            )

        return Response({
            'message': f"Successfully {adj_type}ed {pts} points for {target_user.username}.",
            'transaction': LoyaltyTransactionSerializer(tx).data,
            'account': LoyaltyAccountSerializer(account).data
        })


class LoyaltyAdminAccountsListAPIView(generics.ListAPIView):
    """
    Staff / Admin view to list all customer loyalty balances and tiers.
    """
    serializer_class = LoyaltyAccountSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

    def get_queryset(self):
        qs = LoyaltyAccount.objects.select_related('user').order_by('-points_balance')
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                models.Q(user__username__icontains=q) |
                models.Q(user__email__icontains=q) |
                models.Q(user__first_name__icontains=q)
            )
        tier = self.request.query_params.get('tier')
        if tier and tier != 'all':
            qs = qs.filter(tier=tier)
        return qs


class AdminMembershipRewardsOverviewAPIView(APIView):
    """
    Aggregated KPIs and management stats for Memberships, Passes, and Loyalty Rewards.
    """
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

    def get(self, request):
        now = timezone.now()

        # Memberships KPI
        active_memberships_count = CustomerMembership.objects.filter(
            status=CustomerMembership.STATUS_ACTIVE,
            end_date__gte=now
        ).count()
        total_membership_rev = CustomerMembership.objects.aggregate(
            total=models.Sum('amount_paid')
        )['total'] or Decimal('0.00')

        # Passes KPI
        active_passes_count = MonthlyPass.objects.filter(
            status=MonthlyPass.STATUS_ACTIVE,
            end_date__gte=now
        ).count()
        total_pass_rev = MonthlyPass.objects.aggregate(
            total=models.Sum('amount_paid')
        )['total'] or Decimal('0.00')

        # Loyalty KPI
        total_points_balance = LoyaltyAccount.objects.aggregate(
            total=models.Sum('points_balance')
        )['total'] or 0
        total_lifetime_earned = LoyaltyAccount.objects.aggregate(
            total=models.Sum('lifetime_earned')
        )['total'] or 0
        total_lifetime_redeemed = LoyaltyAccount.objects.aggregate(
            total=models.Sum('lifetime_redeemed')
        )['total'] or 0

        # Tier breakdown
        tiers = {
            'Bronze': LoyaltyAccount.objects.filter(tier='Bronze').count(),
            'Silver': LoyaltyAccount.objects.filter(tier='Silver').count(),
            'Gold': LoyaltyAccount.objects.filter(tier='Gold').count(),
            'Platinum': LoyaltyAccount.objects.filter(tier='Platinum').count(),
        }

        # Plan popularity breakdown
        plan_breakdown = []
        for plan in MembershipPlan.objects.all():
            plan_breakdown.append({
                'id': plan.id,
                'name': plan.name,
                'price': float(plan.price),
                'active_subscribers': plan.subscriptions.filter(status=CustomerMembership.STATUS_ACTIVE, end_date__gte=now).count(),
                'total_subscribers': plan.subscriptions.count(),
                'is_active': plan.is_active,
            })

        return Response({
            'kpis': {
                'active_memberships': active_memberships_count,
                'membership_revenue': float(total_membership_rev),
                'active_monthly_passes': active_passes_count,
                'monthly_pass_revenue': float(total_pass_rev),
                'total_active_points_circulation': total_points_balance,
                'total_points_redeemed_lifetime': total_lifetime_redeemed,
                'total_points_issued_lifetime': total_lifetime_earned,
            },
            'tier_distribution': tiers,
            'plan_breakdown': plan_breakdown,
        })
