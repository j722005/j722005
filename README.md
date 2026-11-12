# Smart Parking Management System (Django) — Sensor-Free

An MSc AI & Data Science mini project: a **software-only** smart parking
system. No IoT hardware/sensors are used — slot availability is computed
in real time purely from booking records (start_time / end_time), which
is the "smart" part of the system and a good viva talking point:
*"instead of costly sensor hardware in every slot, we detect occupancy
by comparing the current time against active bookings in the database."*

## Features
- User signup/login (Django auth)
- Browse parking lots, see **live** available/occupied slots (colour-coded grid)
- Book a slot for a custom time window, with overlap checking
- Simulated payment gateway (UPI/Card/Netbanking/Wallet) — generates a transaction ID
- Booking confirmation page with booking ID
- "My Bookings" page — pay pending bookings, cancel upcoming ones
- Staff dashboard: revenue, total bookings, today's bookings, per-lot occupancy %, recent bookings table
- Django admin panel to manage lots, slots, bookings, payments
- Clean, professional Bootstrap 5 UI (no external image dependency, CDN only)

## Project Structure
```
smart_parking_system/
├── manage.py
├── requirements.txt
├── smart_parking/          # project settings
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py / asgi.py
├── parking/                 # main app
│   ├── models.py            # ParkingLot, ParkingSlot, Booking, Payment
│   ├── views.py
│   ├── urls.py
│   ├── forms.py
│   ├── admin.py
│   ├── management/commands/seed_data.py   # demo data generator
│   └── templates/parking/   # all HTML pages
├── static/css/style.css
├── static/js/script.js
└── media/                   # uploaded lot images (optional)
```

## Setup (run these on your own machine / college lab PC)

```bash
# 1. Create & activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create the database tables
python manage.py makemigrations
python manage.py migrate

# 4. Create an admin (staff) account
python manage.py createsuperuser

# 5. (Optional but recommended) Add demo parking lots & slots
python manage.py seed_data

# 6. Run the server
python manage.py runserver
```

Then open **http://127.0.0.1:8000/**

- Normal site: signup, browse lots at `/lots/`, book a slot, pay, view `/my-bookings/`
- Staff dashboard: log in with the superuser account → `/dashboard/`
- Django admin (add/edit lots & slots manually): `/admin/`

The Render backend runs `seed_data` after migrations on every start. This idempotently adds the demo parking lots and slots if they are missing.

To reset the Render admin password on the free plan, set `DJANGO_ADMIN_RESET_PASSWORD` in the backend service's Environment settings and redeploy. If there is exactly one superuser, it is reset; if there are multiple, the deploy logs list their usernames without changing any password, then set `DJANGO_ADMIN_RESET_USERNAME` to the intended account and redeploy. After the logs confirm the reset, remove both reset variables and redeploy so the password is not kept in the service environment.

## How "smart" detection works without sensors
`ParkingSlot.is_available()` in `parking/models.py` checks whether any
`CONFIRMED`/`ACTIVE` booking's `start_time`–`end_time` window contains
the current time. If none does, the slot is shown green (available);
otherwise red (occupied). This is recalculated on every page load, so
the grid is always live — the same end result an IoT sensor grid would
give you, at zero hardware cost.

## Ideas to extend further (good for "future scope" slide)
- Auto-mark a booking `completed` once `end_time` passes (Celery/cron)
- QR-code check-in/check-out at gate
- SMS/email confirmation on booking
- Map view of lots using Google Maps API
- Dynamic pricing based on demand (peak-hour pricing)
