from django.core.management.base import BaseCommand
from parking.notification_service import run_expiry_checks


class Command(BaseCommand):
    help = 'Checks and processes expired booking holds, customer memberships, and monthly parking passes, sending notifications.'

    def handle(self, *args, **options):
        results = run_expiry_checks()
        self.stdout.write(self.style.SUCCESS(
            f"Expiry check completed: "
            f"{results['expired_bookings_cancelled']} holds released, "
            f"{results['expired_memberships']} memberships expired, "
            f"{results['expired_passes']} passes expired."
        ))

