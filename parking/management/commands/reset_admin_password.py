import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Creates or resets a superuser using environment variables.'

    def handle(self, *args, **options):
        password = os.environ.get('DJANGO_ADMIN_RESET_PASSWORD')
        if not password:
            raise CommandError('Set DJANGO_ADMIN_RESET_PASSWORD before running this command.')

        user_model = get_user_model()
        all_superusers = user_model.objects.filter(is_superuser=True)
        username = os.environ.get('DJANGO_ADMIN_RESET_USERNAME')

        matching_users = list(all_superusers.filter(username=username)[:2]) if username else list(all_superusers[:2])
        if len(matching_users) != 1:
            if not matching_users and not all_superusers.exists():
                if not username:
                    raise CommandError(
                        'No superusers exist. Set DJANGO_ADMIN_RESET_USERNAME to create the first superuser.'
                    )
                if user_model.objects.filter(username=username).exists():
                    raise CommandError(
                        f'Username "{username}" already exists as a non-superuser; choose another username.'
                    )

                user = user_model(username=username)
                try:
                    validate_password(password, user)
                except ValidationError as error:
                    raise CommandError('; '.join(error.messages)) from error

                user_model.objects.create_superuser(username=username, password=password)
                self.stdout.write(self.style.SUCCESS(f'Created superuser "{username}".'))
                return

            if username and not matching_users:
                raise CommandError('No matching superuser found for DJANGO_ADMIN_RESET_USERNAME.')
            if username:
                raise CommandError('DJANGO_ADMIN_RESET_USERNAME must match exactly one superuser.')

            if matching_users:
                usernames = ', '.join(
                    all_superusers
                    .order_by('username')
                    .values_list('username', flat=True)
                )
                self.stdout.write(
                    self.style.WARNING(
                        f'Multiple superusers found ({usernames}); no password was changed. '
                        'Set DJANGO_ADMIN_RESET_USERNAME to select the account.'
                    )
                )
                return

        user = matching_users[0]
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError('; '.join(error.messages)) from error

        user.set_password(password)
        user.save(update_fields=['password'])
        self.stdout.write(self.style.SUCCESS(f'Password reset for superuser "{user.username}".'))
