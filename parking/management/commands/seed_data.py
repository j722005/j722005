from django.core.management.base import BaseCommand

from parking.models import ParkingLot, ParkingSlot


class Command(BaseCommand):
    help = 'Creates sample parking lots and slots for demo/testing.'

    def handle(self, *args, **options):
        demo_lots = [
            {'name': 'City Mall Parking', 'location': 'Anna Nagar, Chennai', 'price_per_hour': 20, 'slots': 12, 'lat': 13.085000, 'lng': 80.210100},
            {'name': 'Tech Park Parking', 'location': 'OMR, Chennai', 'price_per_hour': 30, 'slots': 20, 'lat': 12.971600, 'lng': 80.245200},
            {'name': 'Railway Station Parking', 'location': 'Egmore, Chennai', 'price_per_hour': 15, 'slots': 8, 'lat': 13.082700, 'lng': 80.260700},
        ]

        for data in demo_lots:
            lot, created = ParkingLot.objects.get_or_create(
                name=data['name'],
                defaults={
                    'location': data['location'],
                    'price_per_hour': data['price_per_hour'],
                    'latitude': data.get('lat'),
                    'longitude': data.get('lng'),
                },
            )
            if not created:
                lot.latitude = data.get('lat')
                lot.longitude = data.get('lng')
                lot.save()
            else:
                self.stdout.write(self.style.SUCCESS(f"Created lot: {lot.name}"))

            for i in range(1, data['slots'] + 1):
                slot_type = 'bike' if i % 5 == 0 else ('ev' if i % 7 == 0 else 'car')
                ParkingSlot.objects.get_or_create(
                    lot=lot,
                    slot_number=f"S{i:02d}",
                    defaults={'slot_type': slot_type},
                )

        self.stdout.write(self.style.SUCCESS('Seed data created successfully.'))
