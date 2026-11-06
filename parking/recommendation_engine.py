import math
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from django.db import models

from .models import ParkingLot, ParkingSlot, Booking


def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate geodesic distance between two coordinate pairs in kilometers
    using the Haversine formula.
    """
    try:
        lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    except (TypeError, ValueError):
        return None

    # Radius of earth in kilometers
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)


def get_smart_parking_recommendations(
    destination='',
    vehicle_type='car',
    start_time=None,
    end_time=None,
    price_min=None,
    price_max=None,
    user_lat=None,
    user_lng=None,
    preference='balanced'
):
    """
    Advanced transparent recommendation engine based strictly on live database state,
    computed time interval slot availability, real pricing, and geographical distance when available.
    Never invents mock availability, coordinates, or prices.
    """
    now = timezone.now()

    # Default time window: next 15 minutes to 2 hours 15 minutes if not specified
    if not start_time:
        start_time = now + timezone.timedelta(minutes=15)
    if not end_time:
        end_time = start_time + timezone.timedelta(hours=2)

    # Validate interval logic
    if end_time <= start_time:
        raise ValueError("End time must be strictly after start time.")

    # Grace period: allow starts within 5 mins of now to accommodate form submission latency
    if start_time < now - timezone.timedelta(minutes=5):
        raise ValueError("Start time cannot be in the past.")

    duration_seconds = (end_time - start_time).total_seconds()
    duration_hours = round(duration_seconds / 3600.0, 2)

    min_hours = getattr(settings, 'PARKING_MIN_BOOKING_HOURS', 0.5)
    max_hours = getattr(settings, 'PARKING_MAX_BOOKING_HOURS', 24.0)
    if duration_hours < min_hours:
        raise ValueError(f"Booking duration must be at least {min_hours} hours (30 minutes).")
    if duration_hours > max_hours:
        raise ValueError(f"Booking duration cannot exceed {max_hours} hours.")

    # 1. Base Queryset: Active lots
    lots_qs = ParkingLot.objects.filter(is_active=True).prefetch_related('slots')

    # Filter by destination or area (case-insensitive substring)
    if destination and destination.strip():
        q_term = destination.strip()
        lots_qs = lots_qs.filter(
            models.Q(name__icontains=q_term) |
            models.Q(location__icontains=q_term) |
            models.Q(description__icontains=q_term)
        )

    # Filter by price range
    if price_min is not None:
        try:
            lots_qs = lots_qs.filter(price_per_hour__gte=Decimal(str(price_min)))
        except (ValueError, TypeError):
            pass
    if price_max is not None:
        try:
            lots_qs = lots_qs.filter(price_per_hour__lte=Decimal(str(price_max)))
        except (ValueError, TypeError):
            pass

    # Filter lots that possess matching slots for this vehicle type (if not 'all')
    if vehicle_type and vehicle_type != 'all':
        lots_qs = lots_qs.filter(slots__slot_type=vehicle_type, slots__is_active=True).distinct()

    lots = list(lots_qs)
    if not lots:
        return {
            'search_params': {
                'destination': destination,
                'vehicle_type': vehicle_type,
                'start_time': start_time.isoformat(),
                'end_time': end_time.isoformat(),
                'duration_hours': duration_hours,
                'preference': preference,
                'user_coordinates': {'lat': user_lat, 'lng': user_lng} if user_lat and user_lng else None,
            },
            'total_matching_lots': 0,
            'recommendations': [],
            'distance_scoring_enabled': bool(user_lat and user_lng),
            'distance_limitation_notice': "No parking lots found matching your filter criteria."
        }

    # 2. Extract price min and max across all candidates to normalize price score
    prices = [float(lot.price_per_hour) for lot in lots]
    min_candidate_price = min(prices)
    max_candidate_price = max(prices)

    # 3. Process candidate lot metrics
    candidate_data = []
    has_valid_coordinates_for_any = False

    for lot in lots:
        # Slots matching vehicle_type
        if vehicle_type and vehicle_type != 'all':
            slot_qs = lot.slots.filter(is_active=True, slot_type=vehicle_type)
        else:
            slot_qs = lot.slots.filter(is_active=True)

        total_matching = slot_qs.count()
        available_slots = []
        for slot in slot_qs:
            # Rigorous check: no confirmed or valid pending booking intersects [start_time, end_time]
            if not slot.is_interval_blocked(start_time, end_time):
                available_slots.append(slot)

        avail_count = len(available_slots)
        occupancy_ratio = 1.0 - (avail_count / total_matching) if total_matching > 0 else 1.0
        occupancy_pct = round(occupancy_ratio * 100, 1)

        # Optimal slot selection (Ground floor first, then covered)
        recommended_slot = None
        if available_slots:
            available_slots.sort(
                key=lambda s: (
                    0 if (s.floor or '').lower() in ['ground', 'g', 'b1'] else 1,
                    0 if s.is_covered else 1,
                    s.slot_number
                )
            )
            top_slot = available_slots[0]
            recommended_slot = {
                'id': top_slot.id,
                'slot_number': top_slot.slot_number,
                'slot_type': top_slot.slot_type,
                'floor': top_slot.floor,
                'is_covered': top_slot.is_covered,
            }

        # Pricing metric
        rate = float(lot.price_per_hour)
        estimated_total_cost = round(rate * duration_hours, 2)

        # Distance metric (Haversine)
        distance_km = None
        if user_lat is not None and user_lng is not None and lot.latitude is not None and lot.longitude is not None:
            dist = calculate_haversine_distance(user_lat, user_lng, lot.latitude, lot.longitude)
            if dist is not None:
                distance_km = dist
                has_valid_coordinates_for_any = True

        candidate_data.append({
            'lot': lot,
            'total_matching': total_matching,
            'avail_count': avail_count,
            'occupancy_pct': occupancy_pct,
            'recommended_slot': recommended_slot,
            'rate': rate,
            'estimated_total_cost': estimated_total_cost,
            'distance_km': distance_km,
        })

    # 4. Transparent Scoring Algorithm
    evaluated_recommendations = []

    for item in candidate_data:
        lot = item['lot']
        avail_count = item['avail_count']
        total_matching = item['total_matching']
        rate = item['rate']
        distance_km = item['distance_km']

        # --- A. Availability Score (0 - 100) ---
        if total_matching == 0 or avail_count == 0:
            avail_score = 0.0
            avail_reason = f"0 available {vehicle_type} slots for the requested window."
        else:
            ratio = avail_count / total_matching
            base = ratio * 70.0
            # Buffer bonus: rewards lots with multiple open bays to prevent race conditions
            buffer_bonus = min(30.0, avail_count * 3.0)
            avail_score = round(min(100.0, base + buffer_bonus), 1)
            avail_reason = f"{avail_count} of {total_matching} {vehicle_type} bays free ({item['occupancy_pct']}% booked)."

        # --- B. Price Score (0 - 100) ---
        if max_candidate_price == min_candidate_price:
            price_score = 100.0
            price_reason = f"Fixed competitive rate: ₹{rate:.2f}/hr across matching lots."
        else:
            # Cheaper = Higher Score
            diff = max_candidate_price - min_candidate_price
            price_score = round(100.0 - (((rate - min_candidate_price) / diff) * 60.0), 1)
            if rate == min_candidate_price:
                price_reason = f"Lowest price option in search at ₹{rate:.2f}/hr."
            else:
                price_reason = f"₹{rate:.2f}/hr (Est. total ₹{item['estimated_total_cost']:.2f} for {duration_hours} hrs)."

        # --- C. Distance Score (0 - 100) or Omitted ---
        distance_score = None
        distance_reason = None
        if distance_km is not None:
            # Decreases linearly with distance: 100 at 0km, 50 at 5km, 0 at >=10km
            distance_score = max(0.0, round(100.0 - (distance_km * 10.0), 1))
            distance_reason = f"{distance_km:.2f} km from your specified search location."
        else:
            if user_lat is None or user_lng is None:
                distance_reason = "Distance scoring omitted: Destination search coordinates were not provided."
            else:
                distance_reason = "Distance scoring omitted: Geographic coordinates are not configured for this parking lot."

        # --- D. Dynamic Weights Configuration based on Preference & Coordinates ---
        if distance_score is not None:
            # 3-Factor Model: Availability, Price, Distance
            if preference == 'cheapest':
                weights = {'availability': 0.25, 'price': 0.60, 'distance': 0.15}
            elif preference == 'availability':
                weights = {'availability': 0.60, 'price': 0.20, 'distance': 0.20}
            elif preference == 'distance':
                weights = {'availability': 0.25, 'price': 0.15, 'distance': 0.60}
            else: # 'balanced'
                weights = {'availability': 0.40, 'price': 0.35, 'distance': 0.25}

            total_score = round(
                (avail_score * weights['availability']) +
                (price_score * weights['price']) +
                (distance_score * weights['distance']),
                1
            )
        else:
            # 2-Factor Model: Availability, Price (Transparently rebalanced to sum to 1.0)
            if preference == 'cheapest':
                weights = {'availability': 0.30, 'price': 0.70, 'distance': 0.0}
            elif preference == 'availability':
                weights = {'availability': 0.75, 'price': 0.25, 'distance': 0.0}
            else: # 'balanced' or 'distance' (fallback)
                weights = {'availability': 0.55, 'price': 0.45, 'distance': 0.0}

            total_score = round(
                (avail_score * weights['availability']) +
                (price_score * weights['price']),
                1
            )

        # If zero slots available, heavily penalize total score so it does not rank above bookable lots
        if avail_count == 0:
            total_score = min(total_score, 15.0)

        # --- E. Transparent Recommendation Reasons ---
        reasons = []
        if avail_count > 0:
            if avail_count >= 5:
                reasons.append(f"High Availability: {avail_count} slots open — immediate guarantee without wait times.")
            else:
                reasons.append(f"Available: {avail_count} slots open for your exact {duration_hours}h duration.")

        if rate == min_candidate_price:
            reasons.append(f"Best Value: Lowest hourly rate at ₹{rate:.2f}/hr (Est. total: ₹{item['estimated_total_cost']:.2f}).")
        else:
            reasons.append(f"Standard pricing: ₹{rate:.2f}/hr (Est. total: ₹{item['estimated_total_cost']:.2f}).")

        if distance_km is not None:
            if distance_km <= 2.0:
                reasons.append(f"Prime Proximity: Just {distance_km:.2f} km from your destination.")
            else:
                reasons.append(f"Located {distance_km:.2f} km from your destination coordinates.")
        else:
            reasons.append("Distance note: GPS coordinates not active for this lot; ranked purely on live availability & price.")

        if item['recommended_slot']:
            cov = "Covered" if item['recommended_slot']['is_covered'] else "Open-air"
            reasons.append(f"Recommended Bay: {item['recommended_slot']['slot_number']} ({item['recommended_slot']['floor']} floor, {cov}).")

        evaluated_recommendations.append({
            'lot_id': lot.id,
            'lot_name': lot.name,
            'location': lot.location,
            'description': lot.description,
            'latitude': float(lot.latitude) if lot.latitude is not None else None,
            'longitude': float(lot.longitude) if lot.longitude is not None else None,
            'price_per_hour': float(lot.price_per_hour),
            'estimated_total_cost': item['estimated_total_cost'],
            'vehicle_type': vehicle_type,
            'available_matching_slots': avail_count,
            'total_matching_slots': total_matching,
            'occupancy_percent_for_window': item['occupancy_pct'],
            'recommended_slot': item['recommended_slot'],
            'distance_km': distance_km,
            'total_score': total_score,
            'scoring_breakdown': {
                'availability_score': avail_score,
                'availability_reason': avail_reason,
                'price_score': price_score,
                'price_reason': price_reason,
                'distance_score': distance_score,
                'distance_reason': distance_reason,
                'weights': weights,
            },
            'recommendation_reasons': reasons,
            'is_bookable': avail_count > 0,
        })

    # Sort descending by total_score
    evaluated_recommendations.sort(key=lambda x: x['total_score'], reverse=True)

    # Limitation notice when distance omitted
    limitation_notice = None
    if not (user_lat and user_lng):
        limitation_notice = "Destination coordinates not provided. Distance-based scoring is omitted, and rankings prioritize real-time slot availability and cost."
    elif not has_valid_coordinates_for_any:
        limitation_notice = "Matching parking locations do not have GPS coordinates mapped in the database. Distance scoring has been omitted for fairness."

    return {
        'search_params': {
            'destination': destination,
            'vehicle_type': vehicle_type,
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat(),
            'duration_hours': duration_hours,
            'preference': preference,
            'price_min': float(price_min) if price_min is not None else None,
            'price_max': float(price_max) if price_max is not None else None,
            'user_coordinates': {'lat': float(user_lat), 'lng': float(user_lng)} if user_lat and user_lng else None,
        },
        'total_matching_lots': len(evaluated_recommendations),
        'recommendations': evaluated_recommendations,
        'distance_scoring_enabled': bool(has_valid_coordinates_for_any and user_lat and user_lng),
        'distance_limitation_notice': limitation_notice,
    }
