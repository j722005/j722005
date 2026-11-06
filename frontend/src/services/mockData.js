/**
 * DEVELOPMENT-ONLY MOCK DATA
 * NOTE: This file provides mock data for frontend development and UI demonstration
 * when the Django REST API is not yet running or during initial setup.
 * All functions in service layers attempt real API requests first, falling back here.
 */

export const MOCK_USER = {
  id: 1,
  username: 'rahul_driver',
  email: 'rahul@example.com',
  name: 'Rahul Sharma',
  role: 'customer', // 'customer' | 'staff' | 'admin'
  phone: '+91 98765 43210',
};

export const MOCK_STAFF_USER = {
  id: 2,
  username: 'staff_karthik',
  email: 'staff@smartparking.io',
  name: 'Karthik Raja',
  role: 'staff',
  phone: '+91 91234 56789',
};

export const MOCK_ADMIN_USER = {
  id: 3,
  username: 'admin_priya',
  email: 'admin@smartparking.io',
  name: 'Priya Sundaram',
  role: 'admin',
  phone: '+91 90000 11111',
};

export const MOCK_PARKING_LOTS = [
  {
    id: 1,
    name: 'City Mall Parking',
    location: 'Anna Nagar West, Chennai',
    description: 'Multi-level covered parking adjacent to Phoenix City Mall. Features dedicated EV rapid charging stations and 24/7 security.',
    price_per_hour: 25.0,
    is_active: true,
    image_url: 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=800&q=80',
    total_slots: 24,
    active_slots_count: 22,
    available_slots_count: 14,
    occupied_slots_count: 6,
    future_reserved_slots_count: 2,
    maintenance_slots_count: 2,
    occupancy_percent: 27,
  },
  {
    id: 2,
    name: 'Tech Park Cyber Gateway',
    location: 'OMR IT Corridor, Chennai',
    description: 'High-tech parking with automated number plate recognition and fast payment lanes. Covered bays with shaded solar roofing.',
    price_per_hour: 35.0,
    is_active: true,
    image_url: 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?auto=format&fit=crop&w=800&q=80',
    total_slots: 36,
    active_slots_count: 36,
    available_slots_count: 18,
    occupied_slots_count: 14,
    future_reserved_slots_count: 4,
    maintenance_slots_count: 0,
    occupancy_percent: 39,
  },
  {
    id: 3,
    name: 'Central Railway Station Parking',
    location: 'Park Town, Chennai',
    description: 'Convenient 24-hour transit parking right opposite Platform 1 entry. Low hourly rates for long-term train travelers.',
    price_per_hour: 20.0,
    is_active: true,
    image_url: 'https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&w=800&q=80',
    total_slots: 30,
    active_slots_count: 28,
    available_slots_count: 8,
    occupied_slots_count: 16,
    future_reserved_slots_count: 4,
    maintenance_slots_count: 2,
    occupancy_percent: 57,
  },
  {
    id: 4,
    name: 'Metro Terminal Hub Parking',
    location: 'Guindy Junction, Chennai',
    description: 'Modern park-and-ride facility directly connected to Guindy Metro concourse. High volume commuter parking.',
    price_per_hour: 15.0,
    is_active: true,
    image_url: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=800&q=80',
    total_slots: 40,
    active_slots_count: 40,
    available_slots_count: 25,
    occupied_slots_count: 11,
    future_reserved_slots_count: 4,
    maintenance_slots_count: 0,
    occupancy_percent: 28,
  },
];

// Helper to generate slots for a lot
export function getMockSlotsForLot(lotId) {
  const lot = MOCK_PARKING_LOTS.find((l) => l.id === Number(lotId)) || MOCK_PARKING_LOTS[0];
  const total = lot.total_slots;
  const slots = [];

  for (let i = 1; i <= total; i++) {
    const slotNumber = `S-${String(i).padStart(2, '0')}`;
    const slotType = i % 6 === 0 ? 'ev' : i % 4 === 0 ? 'bike' : 'car';
    
    // Status distribution
    let status = 'available';
    let isActive = true;

    if (i === 4 || i === 11) {
      status = 'maintenance';
      isActive = false;
    } else if (i === 1 || i === 7 || i === 15) {
      status = 'reserved';
    } else if (i === 2 || i === 3 || i === 9 || i === 14) {
      status = 'occupied';
    }

    const floors = ['Ground', 'Floor 1', 'B1', 'Floor 2'];
    const floor = floors[i % floors.length];
    const isCovered = !(floor === 'Floor 2' && i % 2 === 0);

    slots.push({
      id: lotId * 100 + i,
      lot_id: lot.id,
      lot_name: lot.name,
      slot_number: slotNumber,
      slot_type: slotType,
      floor: floor,
      is_covered: isCovered,
      is_active: isActive,
      status: status, // 'available' | 'reserved' | 'occupied' | 'maintenance'
      current_booking: status === 'occupied' ? {
        vehicle_number: 'TN 07 BQ 9821',
        end_time: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      } : null,
    });
  }
  return slots;
}

export const MOCK_VEHICLES = [
  {
    id: 1,
    license_plate: 'TN 07 AB 4321',
    vehicle_type: 'car',
    nickname: 'Rahul’s Honda City',
    is_default: true,
  },
  {
    id: 2,
    license_plate: 'TN 09 CK 8812',
    vehicle_type: 'bike',
    nickname: 'Daily Commute Royal Enfield',
    is_default: false,
  },
  {
    id: 3,
    license_plate: 'TN 14 EV 0045',
    vehicle_type: 'ev',
    nickname: 'Tata Nexon EV',
    is_default: false,
  },
];

export const MOCK_BOOKINGS = [
  {
    id: 1,
    booking_id: 'bk_9f43ab82-1c02-4a7b',
    lot_id: 1,
    lot_name: 'City Mall Parking',
    slot_id: 102,
    slot_number: 'S-02',
    slot_type: 'car',
    vehicle_number: 'TN 07 AB 4321',
    start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    status: 'active',
    amount: 50.0,
    created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    payment: {
      transaction_id: 'TXN8A71F92B3C',
      method: 'upi',
      status: 'success',
      paid_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 2,
    booking_id: 'bk_2a88ef11-7b99-4c11',
    lot_id: 2,
    lot_name: 'Tech Park Cyber Gateway',
    slot_id: 205,
    slot_number: 'S-05',
    slot_type: 'car',
    vehicle_number: 'TN 07 AB 4321',
    start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString(),
    status: 'confirmed',
    amount: 140.0,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    payment: {
      transaction_id: 'TXN3B99EE7742',
      method: 'card',
      status: 'success',
      paid_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 3,
    booking_id: 'bk_55cc9988-dd33-4f22',
    lot_id: 3,
    lot_name: 'Central Railway Station Parking',
    slot_id: 308,
    slot_number: 'S-08',
    slot_type: 'bike',
    vehicle_number: 'TN 09 CK 8812',
    start_time: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() - 44 * 60 * 60 * 1000).toISOString(),
    status: 'completed',
    amount: 80.0,
    created_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    payment: {
      transaction_id: 'TXN91AA832FF1',
      method: 'wallet',
      status: 'success',
      paid_at: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 4,
    booking_id: 'bk_77ee2211-aa44-4899',
    lot_id: 1,
    lot_name: 'City Mall Parking',
    slot_id: 104,
    slot_number: 'S-04',
    slot_type: 'ev',
    vehicle_number: 'TN 14 EV 0045',
    start_time: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString(),
    status: 'cancelled',
    amount: 50.0,
    created_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    payment: null,
  },
];

export const MOCK_ADMIN_STATS = {
  total_revenue: 145820.0,
  total_bookings: 1842,
  todays_bookings: 38,
  active_parked_now: 47,
  total_lots: 4,
  total_managed_slots: 130,
  average_occupancy_rate: 38.5,
  revenue_trend: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Revenue (₹)',
        data: [18400, 22100, 19800, 24500, 31200, 38900, 28500],
      },
    ],
  },
  occupancy_breakdown: {
    labels: ['Available', 'Occupied Now', 'Future Reserved', 'Maintenance'],
    data: [65, 47, 14, 4],
  },
};
