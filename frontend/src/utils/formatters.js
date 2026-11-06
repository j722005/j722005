/**
 * Formats a number or numeric string as Indian Rupees currency.
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Formats ISO date string to a human-readable representation.
 */
export function formatDateTime(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateString;
  }
}

/**
 * Returns badge styling attributes for booking status.
 */
export function getBookingStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return { bg: 'bg-success-subtle text-success border border-success-subtle', label: 'Confirmed / Upcoming' };
    case 'active':
      return { bg: 'bg-primary-subtle text-primary border border-primary-subtle', label: 'Active (Parked Now)' };
    case 'pending':
      return { bg: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle', label: 'Pending Payment' };
    case 'completed':
      return { bg: 'bg-secondary-subtle text-secondary border border-secondary-subtle', label: 'Completed' };
    case 'cancelled':
      return { bg: 'bg-danger-subtle text-danger border border-danger-subtle', label: 'Cancelled' };
    case 'expired':
      return { bg: 'bg-dark-subtle text-dark border border-dark-subtle', label: 'Hold Expired' };
    default:
      return { bg: 'bg-light text-dark border', label: status || 'Unknown' };
  }
}

/**
 * Returns color classes and label for slot status.
 */
export function getSlotStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'available':
      return { bg: 'bg-emerald text-white', label: 'Available', dot: 'bg-success' };
    case 'reserved':
      return { bg: 'bg-amber text-dark', label: 'Reserved', dot: 'bg-warning' };
    case 'occupied':
      return { bg: 'bg-rose text-white', label: 'Occupied', dot: 'bg-danger' };
    case 'maintenance':
    case 'inactive':
      return { bg: 'bg-slate text-white', label: 'Maintenance', dot: 'bg-secondary' };
    default:
      return { bg: 'bg-secondary text-white', label: 'Unknown', dot: 'bg-secondary' };
  }
}

/**
 * Returns badge styling and label for support ticket status.
 */
export function getTicketStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'open':
      return { bg: 'bg-primary-subtle text-primary border border-primary-subtle', label: 'Open' };
    case 'assigned':
      return { bg: 'bg-indigo-subtle text-indigo-emphasis border border-indigo-subtle', label: 'Assigned' };
    case 'in_progress':
      return { bg: 'bg-info-subtle text-info-emphasis border border-info-subtle', label: 'In Progress' };
    case 'waiting_user':
      return { bg: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle', label: 'Waiting for User' };
    case 'resolved':
      return { bg: 'bg-success-subtle text-success border border-success-subtle', label: 'Resolved' };
    case 'closed':
      return { bg: 'bg-secondary-subtle text-secondary border border-secondary-subtle', label: 'Closed' };
    default:
      return { bg: 'bg-light text-dark border', label: status || 'Unknown' };
  }
}

/**
 * Returns badge styling and label for support ticket priority.
 */
export function getTicketPriorityBadge(priority) {
  switch (priority?.toLowerCase()) {
    case 'high':
      return { bg: 'bg-danger text-white', label: 'High Priority', dot: 'bg-danger' };
    case 'medium':
      return { bg: 'bg-warning-subtle text-warning-emphasis border border-warning-subtle', label: 'Medium Priority', dot: 'bg-warning' };
    case 'low':
      return { bg: 'bg-light text-muted border', label: 'Low Priority', dot: 'bg-secondary' };
    default:
      return { bg: 'bg-light text-dark border', label: priority || 'Medium Priority', dot: 'bg-secondary' };
  }
}

/**
 * Human-friendly category label mapping.
 */
export function getTicketCategoryLabel(category) {
  const map = {
    booking_issue: 'Booking Issue',
    payment_issue: 'Payment Issue',
    slot_availability: 'Slot Availability',
    qr_ticket: 'QR Ticket',
    refund_request: 'Refund Request',
    account_issue: 'Account Issue',
    other: 'Other Inquiry',
  };
  return map[category] || category || 'General';
}

