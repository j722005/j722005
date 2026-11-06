from rest_framework import permissions

class IsOwnerOrStaff(permissions.BasePermission):
    """
    Object-level permission to only allow owners of an object (or staff) to access/edit it.
    Never trust user IDs supplied from the client.
    """
    def has_object_permission(self, request, view, obj):
        if request.user.is_staff or request.user.is_superuser:
            return True
        return hasattr(obj, 'user') and obj.user == request.user


class IsStaffOrAdmin(permissions.BasePermission):
    """
    Permission check for staff operations and admin dashboard.
    """
    def has_permission(self, request, view):
        return bool(request.user and (request.user.is_staff or request.user.is_superuser))
