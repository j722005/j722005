from django.contrib.auth import views as auth_views
from django.urls import path

from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('lots/', views.lot_list, name='lot_list'),
    path('lots/<int:pk>/', views.lot_detail, name='lot_detail'),
    path('lots/<int:lot_id>/book/<int:slot_id>/', views.book_slot, name='book_slot'),
    path('payment/<uuid:booking_id>/', views.payment, name='payment'),
    path('booking/<uuid:booking_id>/success/', views.booking_success, name='booking_success'),
    path('my-bookings/', views.my_bookings, name='my_bookings'),
    path('booking/<uuid:booking_id>/cancel/', views.cancel_booking, name='cancel_booking'),
    path('dashboard/', views.admin_dashboard, name='admin_dashboard'),

    path('signup/', views.signup, name='signup'),
    path('login/', auth_views.LoginView.as_view(template_name='parking/login.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
]
