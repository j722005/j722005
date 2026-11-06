from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django.utils import timezone

from .models import Booking


class SignUpForm(UserCreationForm):
    email = forms.EmailField(required=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password1', 'password2')


class BookingForm(forms.ModelForm):
    class Meta:
        model = Booking
        fields = ['vehicle_number', 'start_time', 'end_time']
        widgets = {
            'start_time': forms.DateTimeInput(attrs={'type': 'datetime-local', 'class': 'form-control'}),
            'end_time': forms.DateTimeInput(attrs={'type': 'datetime-local', 'class': 'form-control'}),
            'vehicle_number': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g. TN 07 AB 1234'}),
        }

    def clean(self):
        cleaned = super().clean()
        start = cleaned.get('start_time')
        end = cleaned.get('end_time')
        if start and end:
            if end <= start:
                raise forms.ValidationError('End time must be after start time.')
            if start < timezone.now() - timezone.timedelta(minutes=5):
                raise forms.ValidationError('Start time cannot be in the past.')
            if (end - start) > timezone.timedelta(hours=24):
                raise forms.ValidationError('A single booking cannot exceed 24 hours.')
        return cleaned


class PaymentForm(forms.Form):
    method = forms.ChoiceField(choices=[
        ('upi', 'UPI'),
        ('card', 'Debit / Credit Card'),
        ('netbanking', 'Net Banking'),
        ('wallet', 'Wallet'),
    ], widget=forms.RadioSelect)
