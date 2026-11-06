export const SLOT_STATUSES = {
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
};

export const BOOKING_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

export const VEHICLE_TYPES = [
  { value: 'car', label: 'Car / 4-Wheeler', icon: 'Car' },
  { value: 'bike', label: 'Bike / Two-Wheeler', icon: 'Bike' },
  { value: 'ev', label: 'EV Charging Vehicle', icon: 'Zap' },
];

export const PAYMENT_METHODS = [
  { id: 'upi', label: 'UPI / QR Code', icon: 'QrCode' },
  { id: 'card', label: 'Credit / Debit Card', icon: 'CreditCard' },
  { id: 'netbanking', label: 'Net Banking', icon: 'Building' },
  { id: 'wallet', label: 'Mobile Wallet', icon: 'Wallet' },
];

export const ROLES = {
  CUSTOMER: 'customer',
  STAFF: 'staff',
  ADMIN: 'admin',
};
