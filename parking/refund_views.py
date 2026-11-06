import logging
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q, Count, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    RefundRequest, RefundTransaction, PaymentDispute, DisputeMessage
)
from .permissions import IsStaffOrAdmin
from .serializers import (
    RefundRequestListSerializer,
    RefundRequestDetailSerializer,
    RefundRequestCreateSerializer,
    RefundActionSerializer,
    PaymentDisputeListSerializer,
    PaymentDisputeDetailSerializer,
    PaymentDisputeCreateSerializer,
    DisputeReplySerializer,
    DisputeStatusUpdateSerializer,
    DisputeAssignSerializer,
)
from .refund_service import (
    get_eligible_bookings_for_refund,
    create_refund_request,
    update_refund_status,
    customer_provide_additional_info,
    customer_cancel_refund_request,
    process_refund_execution,
    create_payment_dispute,
    add_dispute_message,
    update_dispute_status,
    assign_dispute_staff,
)

logger = logging.getLogger(__name__)
User = get_user_model()


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 15
    page_size_query_param = 'page_size'
    max_page_size = 100


# ==============================================================================
# CUSTOMER REFUND VIEWS
# ==============================================================================

class EligibleRefundBookingsAPIView(APIView):
    """
    List bookings owned by the authenticated customer that have successful
    payments and positive remaining refundable balances.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        eligible = get_eligible_bookings_for_refund(request.user)
        return Response(eligible, status=status.HTTP_200_OK)


class RefundRequestCreateAPIView(APIView):
    """
    Create a new customer refund request.
    Validates booking ownership, paid amount, remaining balance, and idempotency.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = RefundRequestCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            refund_req = create_refund_request(
                user=request.user,
                booking_id=data['booking_id'],
                amount=data['amount'],
                reason=data['reason'],
                explanation=data.get('explanation', ''),
                attachment=request.FILES.get('attachment') or data.get('attachment'),
            )
            return Response(
                RefundRequestDetailSerializer(refund_req, context={'request': request}).data,
                status=status.HTTP_201_CREATED
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'message': msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Error creating refund request")
            return Response({'message': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class MyRefundsListAPIView(generics.ListAPIView):
    """
    List refund requests belonging to the authenticated customer.
    Supports filtering by status and search by refund_id or reason.
    """
    serializer_class = RefundRequestListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = RefundRequest.objects.filter(user=self.request.user).select_related(
            'booking__slot__lot', 'payment', 'transaction'
        ).order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.lower())

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(refund_id__icontains=search) |
                Q(booking__booking_id__icontains=search) |
                Q(payment__transaction_id__icontains=search) |
                Q(reason__icontains=search)
            )

        return qs


class RefundDetailAPIView(APIView):
    """
    Retrieve details of a refund request.
    Strictly isolated: Customers can only view their own requests.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, refund_id):
        refund_req = get_object_or_404(
            RefundRequest.objects.select_related('booking__slot__lot', 'payment', 'transaction', 'reviewed_by').prefetch_related('audit_logs__performed_by'),
            refund_id__iexact=refund_id
        )

        is_staff = request.user.is_staff or request.user.is_superuser
        if refund_req.user != request.user and not is_staff:
            return Response({'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = RefundRequestDetailSerializer(refund_req, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class RefundProvideInfoAPIView(APIView):
    """
    Customer provides additional information requested by staff.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, refund_id):
        refund_req = get_object_or_404(RefundRequest, refund_id__iexact=refund_id)
        if refund_req.user != request.user:
            return Response({'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        notes = request.data.get('notes', '').strip()
        attachment = request.FILES.get('attachment')

        try:
            req = customer_provide_additional_info(
                refund_req=refund_req,
                customer_user=request.user,
                notes=notes,
                attachment=attachment
            )
            return Response(
                RefundRequestDetailSerializer(req, context={'request': request}).data,
                status=status.HTTP_200_OK
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'message': msg}, status=status.HTTP_400_BAD_REQUEST)


class RefundCancelAPIView(APIView):
    """
    Customer cancels their pending refund request.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, refund_id):
        refund_req = get_object_or_404(RefundRequest, refund_id__iexact=refund_id)
        is_staff = request.user.is_staff or request.user.is_superuser

        if refund_req.user != request.user and not is_staff:
            return Response({'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        reason = request.data.get('reason', '')
        try:
            req = customer_cancel_refund_request(refund_req, request.user, reason)
            return Response(
                RefundRequestDetailSerializer(req, context={'request': request}).data,
                status=status.HTTP_200_OK
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'message': msg}, status=status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# ADMIN / STAFF REFUND VIEWS
# ==============================================================================

class AdminRefundListAPIView(generics.ListAPIView):
    """
    Staff / Admin view to search, filter, and inspect all refund requests.
    Permission: Strictly restricted to Staff and Administrators.
    """
    serializer_class = RefundRequestListSerializer
    permission_classes = [IsStaffOrAdmin]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = RefundRequest.objects.all().select_related(
            'user', 'booking__slot__lot', 'payment', 'transaction'
        ).order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param.lower())

        reason_param = self.request.query_params.get('reason')
        if reason_param and reason_param != 'all':
            qs = qs.filter(reason=reason_param.lower())

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(refund_id__icontains=search) |
                Q(user__username__icontains=search) |
                Q(user__email__icontains=search) |
                Q(booking__booking_id__icontains=search) |
                Q(payment__transaction_id__icontains=search)
            )

        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(created_at__date__gte=start_date)

        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(created_at__date__lte=end_date)

        return qs


class AdminRefundSummaryAPIView(APIView):
    """
    Staff / Admin counter metrics for refund status badges and dashboard KPIs.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        qs = RefundRequest.objects.all()

        total = qs.count()
        requested = qs.filter(status=RefundRequest.STATUS_REQUESTED).count()
        under_review = qs.filter(status=RefundRequest.STATUS_UNDER_REVIEW).count()
        info_required = qs.filter(status=RefundRequest.STATUS_INFO_REQUIRED).count()
        approved = qs.filter(status=RefundRequest.STATUS_APPROVED).count()
        processing = qs.filter(status=RefundRequest.STATUS_PROCESSING).count()
        completed = qs.filter(status=RefundRequest.STATUS_COMPLETED).count()
        rejected = qs.filter(status=RefundRequest.STATUS_REJECTED).count()
        failed = qs.filter(status=RefundRequest.STATUS_FAILED).count()
        cancelled = qs.filter(status=RefundRequest.STATUS_CANCELLED).count()

        total_refunded = RefundTransaction.objects.filter(
            status=RefundTransaction.STATUS_COMPLETED
        ).aggregate(total=Sum('amount'))['total'] or 0

        pending_approval = requested + under_review + info_required

        return Response({
            'total': total,
            'pending_approval': pending_approval,
            'requested': requested,
            'under_review': under_review,
            'info_required': info_required,
            'approved': approved,
            'processing': processing,
            'completed': completed,
            'rejected': rejected,
            'failed': failed,
            'cancelled': cancelled,
            'total_refunded_amount': float(total_refunded),
        }, status=status.HTTP_200_OK)


class AdminRefundActionAPIView(APIView):
    """
    Perform administrative action on a refund request:
    - review: Move to under_review
    - request_info: Move to info_required (with explanation notes)
    - approve: Move to approved (optional approved_amount)
    - reject: Move to rejected (mandatory rejection_reason)
    - process: Move to processing and execute simulation refund
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request, refund_id):
        refund_req = get_object_or_404(RefundRequest, refund_id__iexact=refund_id)
        serializer = RefundActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action = serializer.validated_data['action']
        notes = serializer.validated_data.get('notes', '')
        rejection_reason = serializer.validated_data.get('rejection_reason', '')
        approved_amount = serializer.validated_data.get('approved_amount')

        target_status_map = {
            'review': RefundRequest.STATUS_UNDER_REVIEW,
            'request_info': RefundRequest.STATUS_INFO_REQUIRED,
            'approve': RefundRequest.STATUS_APPROVED,
            'reject': RefundRequest.STATUS_REJECTED,
            'process': RefundRequest.STATUS_PROCESSING,
        }

        target_status = target_status_map.get(action)

        try:
            req = update_refund_status(
                refund_req=refund_req,
                new_status=target_status,
                performed_by=request.user,
                notes=notes,
                rejection_reason=rejection_reason,
                approved_amount=approved_amount,
            )
            return Response(
                RefundRequestDetailSerializer(req, context={'request': request}).data,
                status=status.HTTP_200_OK
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'message': msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Error executing admin refund action")
            return Response({'message': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


# ==============================================================================
# PAYMENT DISPUTE VIEWS
# ==============================================================================

class PaymentDisputeCreateAPIView(APIView):
    """
    Customer raises a payment dispute.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PaymentDisputeCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            dispute = create_payment_dispute(
                user=request.user,
                category=data['category'],
                subject=data['subject'],
                description=data['description'],
                booking_id=data.get('booking_id'),
                payment_reference=data.get('payment_reference', ''),
                disputed_amount=data.get('disputed_amount'),
                attachment=request.FILES.get('attachment') or data.get('attachment'),
            )
            return Response(
                PaymentDisputeDetailSerializer(dispute, context={'request': request}).data,
                status=status.HTTP_201_CREATED
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'message': msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Error creating dispute")
            return Response({'message': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class MyDisputesListAPIView(generics.ListAPIView):
    """
    List payment disputes raised by the authenticated customer.
    """
    serializer_class = PaymentDisputeListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = PaymentDispute.objects.filter(user=self.request.user).select_related(
            'booking', 'payment', 'assigned_to'
        ).prefetch_related('messages').order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.lower())

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(dispute_id__icontains=search) |
                Q(subject__icontains=search) |
                Q(payment_reference__icontains=search)
            )

        return qs


class PaymentDisputeDetailAPIView(APIView):
    """
    Retrieve full dispute conversation and timeline.
    Security: Customers can only access their own dispute; internal staff notes are omitted.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, dispute_id):
        dispute = get_object_or_404(
            PaymentDispute.objects.select_related('user', 'booking__slot__lot', 'payment', 'refund_request', 'assigned_to'),
            dispute_id__iexact=dispute_id
        )

        is_staff = request.user.is_staff or request.user.is_superuser
        if dispute.user != request.user and not is_staff:
            return Response({'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = PaymentDisputeDetailSerializer(dispute, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PaymentDisputeReplyAPIView(APIView):
    """
    Add a message/reply to a dispute thread.
    Customers can only send public replies.
    Staff can optionally send internal notes (`is_internal_note=True`).
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, dispute_id):
        dispute = get_object_or_404(PaymentDispute, dispute_id__iexact=dispute_id)
        is_staff = request.user.is_staff or request.user.is_superuser

        if dispute.user != request.user and not is_staff:
            return Response({'message': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = DisputeReplySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        is_internal_note = data.get('is_internal_note', False) if is_staff else False
        attachment = request.FILES.get('attachment') or data.get('attachment')

        try:
            msg = add_dispute_message(
                dispute=dispute,
                sender=request.user,
                message=data['message'],
                attachment=attachment,
                is_internal_note=is_internal_note
            )
            # Return updated dispute detail
            return Response(
                PaymentDisputeDetailSerializer(dispute, context={'request': request}).data,
                status=status.HTTP_201_CREATED
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'message': msg}, status=status.HTTP_400_BAD_REQUEST)


class AdminDisputeListAPIView(generics.ListAPIView):
    """
    Staff / Admin view to list, search, and manage all payment disputes.
    """
    serializer_class = PaymentDisputeListSerializer
    permission_classes = [IsStaffOrAdmin]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        qs = PaymentDispute.objects.all().select_related(
            'user', 'booking', 'assigned_to'
        ).prefetch_related('messages').order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param.lower())

        category_param = self.request.query_params.get('category')
        if category_param and category_param != 'all':
            qs = qs.filter(category=category_param.lower())

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(dispute_id__icontains=search) |
                Q(user__username__icontains=search) |
                Q(user__email__icontains=search) |
                Q(subject__icontains=search) |
                Q(payment_reference__icontains=search)
            )

        assigned_to = self.request.query_params.get('assigned_to')
        if assigned_to:
            if assigned_to == 'unassigned':
                qs = qs.filter(assigned_to__isnull=True)
            elif assigned_to == 'me':
                qs = qs.filter(assigned_to=self.request.user)
            elif assigned_to.isdigit():
                qs = qs.filter(assigned_to_id=int(assigned_to))

        return qs


class AdminDisputeSummaryAPIView(APIView):
    """
    Dispute counter metrics for admin dashboard.
    """
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        qs = PaymentDispute.objects.all()

        total = qs.count()
        opened = qs.filter(status=PaymentDispute.STATUS_OPENED).count()
        under_investigation = qs.filter(status=PaymentDispute.STATUS_UNDER_INVESTIGATION).count()
        info_requested = qs.filter(status=PaymentDispute.STATUS_INFO_REQUESTED).count()
        resolved = qs.filter(status=PaymentDispute.STATUS_RESOLVED).count()
        rejected = qs.filter(status=PaymentDispute.STATUS_REJECTED).count()
        closed = qs.filter(status=PaymentDispute.STATUS_CLOSED).count()
        unassigned = qs.filter(assigned_to__isnull=True).count()

        return Response({
            'total': total,
            'opened': opened,
            'under_investigation': under_investigation,
            'info_requested': info_requested,
            'resolved': resolved,
            'rejected': rejected,
            'closed': closed,
            'unassigned': unassigned,
        }, status=status.HTTP_200_OK)


class AdminDisputeStatusAPIView(APIView):
    """
    Staff / Admin updates the lifecycle status of a payment dispute.
    Optionally includes resolution summary and links an existing refund.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request, dispute_id):
        dispute = get_object_or_404(PaymentDispute, dispute_id__iexact=dispute_id)
        serializer = DisputeStatusUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        try:
            disp = update_dispute_status(
                dispute=dispute,
                new_status=data['status'],
                performed_by=request.user,
                resolution_summary=data.get('resolution_summary', ''),
                linked_refund_id=data.get('linked_refund_id')
            )
            return Response(
                PaymentDisputeDetailSerializer(disp, context={'request': request}).data,
                status=status.HTTP_200_OK
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'message': msg}, status=status.HTTP_400_BAD_REQUEST)


class AdminDisputeAssignAPIView(APIView):
    """
    Staff / Admin assigns a dispute to a staff member.
    """
    permission_classes = [IsStaffOrAdmin]

    def post(self, request, dispute_id):
        dispute = get_object_or_404(PaymentDispute, dispute_id__iexact=dispute_id)
        serializer = DisputeAssignSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        staff_id = serializer.validated_data.get('staff_user_id')
        staff_user = None
        if staff_id:
            staff_user = get_object_or_404(User, id=staff_id)
            if not (staff_user.is_staff or staff_user.is_superuser):
                return Response({'message': 'Selected user is not a staff member.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            disp = assign_dispute_staff(dispute, staff_user, request.user)
            return Response(
                PaymentDisputeDetailSerializer(disp, context={'request': request}).data,
                status=status.HTTP_200_OK
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'message': msg}, status=status.HTTP_400_BAD_REQUEST)

