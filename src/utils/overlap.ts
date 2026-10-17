export interface TimeSlot {
  start_at: string | Date;
  end_at: string | Date;
}

export interface BookingWithEquipments {
  bookingId: number;
  status: 'draft' | 'confirmed' | 'active' | 'returned' | 'cancelled';
  start_at: string | Date;
  end_at: string | Date;
  equipmentIds: number[];
}

/**
 * Checks if two date-time ranges overlap.
 * Time range A [startA, endA] and B [startB, endB] overlap if startA < endB and endA > startB.
 */
export function isTimeRangeOverlapping(
  startA: string | Date,
  endA: string | Date,
  startB: string | Date,
  endB: string | Date
): boolean {
  const tA_start = new Date(startA).getTime();
  const tA_end = new Date(endA).getTime();
  const tB_start = new Date(startB).getTime();
  const tB_end = new Date(endB).getTime();

  if (isNaN(tA_start) || isNaN(tA_end) || isNaN(tB_start) || isNaN(tB_end)) {
    return false;
  }

  return tA_start < tB_end && tA_end > tB_start;
}

/**
 * Checks whether assigning a set of equipmentIds to a given time range
 * would conflict with any existing Confirmed or Active booking.
 *
 * @returns Array of equipment IDs that have conflicts, empty if no conflict.
 */
export function findConflictingEquipment(
  targetStart: string | Date,
  targetEnd: string | Date,
  targetEquipmentIds: number[],
  existingBookings: BookingWithEquipments[],
  excludeBookingId?: number
): { equipmentId: number; conflictingBookingId: number; status: string }[] {
  const activeStatuses = new Set(['confirmed', 'active']);
  const conflicts: { equipmentId: number; conflictingBookingId: number; status: string }[] = [];

  const targetEquipSet = new Set(targetEquipmentIds);

  for (const b of existingBookings) {
    if (excludeBookingId !== undefined && b.bookingId === excludeBookingId) {
      continue;
    }
    if (!activeStatuses.has(b.status)) {
      continue;
    }

    if (isTimeRangeOverlapping(targetStart, targetEnd, b.start_at, b.end_at)) {
      for (const eqId of b.equipmentIds) {
        if (targetEquipSet.has(eqId)) {
          conflicts.push({
            equipmentId: eqId,
            conflictingBookingId: b.bookingId,
            status: b.status,
          });
        }
      }
    }
  }

  return conflicts;
}
