import { useEffect, useState } from "react";

const PHONE_MEDIA_QUERY = "(max-width: 767px)";

export function useIsPhoneLayout() {
  const [isPhoneLayout, setIsPhoneLayout] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(PHONE_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(PHONE_MEDIA_QUERY);
    const updateLayout = () => setIsPhoneLayout(mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);

    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  return isPhoneLayout;
}
