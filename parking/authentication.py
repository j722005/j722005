from rest_framework.authentication import TokenAuthentication
from rest_framework import exceptions

class BearerOrTokenAuthentication(TokenAuthentication):
    """
    Extends TokenAuthentication to accept both 'Token <key>' and 'Bearer <key>'
    in the Authorization header.
    """
    keyword = 'Bearer'

    def authenticate(self, request):
        auth = request.headers.get('Authorization', '')
        if not auth:
            return None

        pieces = auth.split()
        if len(pieces) == 2 and pieces[0].lower() in ('bearer', 'token'):
            return self.authenticate_credentials(pieces[1])

        return None
