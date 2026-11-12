import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Resets an existing superuser password from environment variables.'

    def handle(self, *args, **options):
        password = os.environ.get('DJANGO_ADMIN_RESET_PASSWORD')
        if not password:
            raise CommandError('Set DJANGO_ADMIN_RESET_PASSWORD before running this command.')

        users = get_user_model().objects.filter(is_superuser=True)
        username = os.environ.get('DJANGO_ADMIN_RESET_USERNAME')
        if username:
            users = users.filter(username=username)

        matching_users = list(users[:2])
        if len(matching_users) != 1:
            if username:
                raise CommandError('No matching superuser found for DJANGO_ADMIN_RESET_USERNAME.')
            raise CommandError(
                'Expected exactly one superuser. Set DJANGO_ADMIN_RESET_USERNAME to select the account.'
            )

        user = matching_users[0]
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError('; '.join(error.messages)) from error

        user.set_password(password)
        user.save(update_fields=['password'])
        self.stdout.write(self.style.SUCCESS(f'Password reset for superuser "{user.username}".'))
