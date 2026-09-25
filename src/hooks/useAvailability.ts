import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

/**
 * Returns a set of public room type IDs that are fully booked
 * for the given date range (no physical room of that type available).
 *
 * Only runs when both checkIn and checkOut are non-empty strings.
 */
export function useAvailability(checkIn: string, checkOut: string) {
  const [unavailableTypes, setUnavailableTypes] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!checkIn || !checkOut || checkIn >= checkOut) {
      setUnavailableTypes(new Set());
      return;
    }

    let cancelled = false;

    async function check() {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_available_room_types", {
        p_check_in: checkIn,
        p_check_out: checkOut,
      });

      if (cancelled) return;
      if (error || !data) {
        // On error, show all rooms as available (graceful degradation)
        setUnavailableTypes(new Set());
        setLoading(false);
        return;
      }

      // A room type is unavailable only when available === 0
      const unavailable = new Set<string>(
        (data as { room_type: string; total: number; available: number }[])
          .filter((row) => row.available === 0)
          .map((row) => row.room_type)
      );
      setUnavailableTypes(unavailable);
      setLoading(false);
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut]);

  return { unavailableTypes, availabilityLoading: loading };
}
