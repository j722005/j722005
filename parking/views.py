import uuid

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required, user_passes_test
from django.db.models import Count
from django.db import transaction
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone

from .forms import SignUpForm, BookingForm, PaymentForm
from .models import ParkingLot, ParkingSlot, Booking, Payment


def home(request):
    lots = ParkingLot.objects.filter(is_active=True)
    context = {
        'lots': lots,
        'total_lots': lots.count(),
        'total_slots': ParkingSlot.objects.filter(lot__in=lots).count(),
    }
    return render(request, 'parking/home.html', context)


def lot_list(request):
    lots = ParkingLot.objects.filter(is_active=True)
    return render(request, 'parking/lot_list.html', {'lots': lots})


def lot_detail(request, pk):
    lot = get_object_or_404(ParkingLot, pk=pk, is_active=True)
    slots = lot.slots.filter(is_active=True)
    slot_data = [{'slot': s, 'available': s.is_available()} for s in slots]
    return render(request, 'parking/lot_detail.html', {'lot': lot, 'slot_data': slot_data})


@login_required
def book_slot(request, lot_id, slot_id):
    lot = get_object_or_404(ParkingLot, pk=lot_id)
    slot = get_object_or_404(ParkingSlot, pk=slot_id, lot=lot)

    if not lot.is_active or not slot.is_active:
        messages.error(request, 'This parking lot or slot is currently unavailable.')
        return redirect('lot_detail', pk=lot.pk)

    if request.method == 'POST':
        form = BookingForm(request.POST)
        if form.is_valid():
            booking = form.save(commit=False)
            booking.user = request.user
            with transaction.atomic():
                slot = get_object_or_404(
                    ParkingSlot.objects.select_for_update(),
                    pk=slot_id,
                    lot=lot,
                    is_active=True,
                )
                if not lot.is_active or slot.is_interval_blocked(booking.start_time, booking.end_time):
                    messages.error(request, 'This slot is already booked for an overlapping time window.')
                    return redirect('lot_detail', pk=lot.pk)

                booking.slot = slot
                hours = (booking.end_time - booking.start_time).total_seconds() / 3600
                booking.amount = round(float(lot.price_per_hour) * hours, 2)
                booking.status = Booking.STATUS_PENDING
                booking.save()
            return redirect('payment', booking_id=booking.booking_id)
    else:
        form = BookingForm()

    return render(request, 'parking/book_slot.html', {'form': form, 'lot': lot, 'slot': slot})


@login_required
def payment(request, booking_id):
    booking = get_object_or_404(Booking, booking_id=booking_id, user=request.user)

    if booking.status != Booking.STATUS_PENDING:
        return redirect('booking_success', booking_id=booking.booking_id)

    if request.method == 'POST':
        form = PaymentForm(request.POST)
        if form.is_valid():
            txn_id = f"TXN{uuid.uuid4().hex[:12].upper()}"
            Payment.objects.create(
                booking=booking,
                amount=booking.amount,
                method=form.cleaned_data['method'],
                status='success',
                transaction_id=txn_id,
            )
            booking.status = Booking.STATUS_CONFIRMED
            booking.save()
            messages.success(request, 'Payment successful! Your slot is confirmed.')
            return redirect('booking_success', booking_id=booking.booking_id)
    else:
        form = PaymentForm()

    return render(request, 'parking/payment.html', {'form': form, 'booking': booking})


@login_required
def booking_success(request, booking_id):
    booking = get_object_or_404(Booking, booking_id=booking_id, user=request.user)
    return render(request, 'parking/booking_success.html', {'booking': booking})


@login_required
def my_bookings(request):
    bookings = request.user.bookings.all().select_related('slot', 'slot__lot')
    return render(request, 'parking/my_bookings.html', {'bookings': bookings})


@login_required
def cancel_booking(request, booking_id):
    booking = get_object_or_404(Booking, booking_id=booking_id, user=request.user)
    if booking.status in (Booking.STATUS_PENDING, Booking.STATUS_CONFIRMED) and booking.start_time > timezone.now():
        booking.status = Booking.STATUS_CANCELLED
        booking.save()
        messages.success(request, 'Booking cancelled.')
    else:
        messages.error(request, 'This booking can no longer be cancelled.')
    return redirect('my_bookings')


def signup(request):
    if request.method == 'POST':
        form = SignUpForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, 'Account created! Welcome to Smart Parking.')
            return redirect('home')
    else:
        form = SignUpForm()
    return render(request, 'parking/signup.html', {'form': form})


def is_staff_user(user):
    return user.is_staff


@user_passes_test(is_staff_user)
def admin_dashboard(request):
    lots = ParkingLot.objects.all()
    total_bookings = Booking.objects.exclude(status=Booking.STATUS_CANCELLED).count()
    total_revenue = sum(p.amount for p in Payment.objects.filter(status='success'))
    todays_bookings = Booking.objects.filter(created_at__date=timezone.now().date()).count()

    lot_stats = [
        {
            'lot': lot,
            'available': lot.available_slots_count,
            'occupied': lot.occupied_slots_count,
            'occupancy_percent': lot.occupancy_percent,
        }
        for lot in lots
    ]

    context = {
        'lot_stats': lot_stats,
        'total_bookings': total_bookings,
        'total_revenue': total_revenue,
        'todays_bookings': todays_bookings,
        'recent_bookings': Booking.objects.select_related('user', 'slot', 'slot__lot').order_by('-created_at')[:10],
    }
    return render(request, 'parking/admin_dashboard.html', context)
