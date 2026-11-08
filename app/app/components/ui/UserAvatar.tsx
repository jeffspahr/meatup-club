import { useEffect, useState } from "react";

type AvatarSize = "sm" | "lg";

interface UserAvatarProps {
  src: string | null | undefined;
  name: string | null | undefined;
  email?: string;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: "w-8 h-8 text-xs",
  lg: "w-12 h-12 text-sm",
};

function getInitials(name: string | null | undefined, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

/**
 * User avatar that shows initials until the page loads or when no image is available.
 * @example <UserAvatar src={user.picture} name={user.name} email={user.email} />
 */
export function UserAvatar({
  src,
  name,
  email,
  size = "sm",
  className = "",
}: UserAvatarProps) {
  const sz = sizeClasses[size];
  const [pageLoaded, setPageLoaded] = useState(false);

  // External sync: Safari can keep the document loading for an in-view lazy
  // image. Show initials until load completes, then request optional photos.
  useEffect(() => {
    const onLoad = () => setPageLoaded(true);
    if (document.readyState === "complete") {
      onLoad();
      return;
    }
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  if (src && pageLoaded) {
    return (
      <img
        src={src}
        alt={name || email || "User"}
        width={size === "lg" ? 48 : 32}
        height={size === "lg" ? 48 : 32}
        loading="lazy"
        decoding="async"
        className={`${sz} rounded-full object-cover ${className}`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={`${sz} rounded-full bg-accent/20 text-accent font-semibold flex items-center justify-center ${className}`}
    >
      {getInitials(name, email)}
    </div>
  );
}
