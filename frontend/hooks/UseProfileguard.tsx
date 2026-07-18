"use client";

import { useEffect, useState } from "react";
import { userApi } from "@/lib/api";

/**
 * Returns whether the user's profile is complete enough to use the chat.
 * Required: phone. Service location is collected in the booking flow.
 */
export function useProfileGuard() {
  const [isComplete, setIsComplete] = useState<boolean | null>(null); // null = loading
  const [missingFields, setMissingFields] = useState<string[]>([]);

  useEffect(() => {
    userApi.getProfile().then((profile) => {
      const missing: string[] = [];
      if (!profile.phone?.trim()) missing.push("phone number");
      setMissingFields(missing);
      setIsComplete(missing.length === 0);
    }).catch(() => {
      setIsComplete(true); // don't block if profile fetch fails
    });
  }, []);

  return { isComplete, missingFields };
}
