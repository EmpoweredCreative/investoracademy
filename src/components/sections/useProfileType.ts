"use client";

import { useEffect, useState } from "react";
import { PROFILE_EVENT } from "@/components/foundation/useFoundation";

export type ProfileType = "EMPLOYEE" | "BUSINESS_OWNER" | "BOTH" | null;

/** The signed-in person's Foundation profile; refreshes when it changes anywhere in the app. */
export function useProfileType(): ProfileType | undefined {
  const [profile, setProfile] = useState<ProfileType | undefined>(undefined);
  useEffect(() => {
    const load = () =>
      fetch("/api/user/preferences")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setProfile(j ? (j.profileType ?? null) : null))
        .catch(() => setProfile(null));
    load();
    window.addEventListener(PROFILE_EVENT, load);
    return () => window.removeEventListener(PROFILE_EVENT, load);
  }, []);
  return profile;
}

export const hasBusinessProfile = (p: ProfileType | undefined) => p === "BUSINESS_OWNER" || p === "BOTH";
