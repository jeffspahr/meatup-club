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

export function UserAvatar({
  src,
  name,
  email,
  size = "sm",
  className = "",
}: UserAvatarProps) {
  const sz = sizeClasses[size];

  if (src) {
    return (
      <img
        src={src}
        alt={name || email || "User"}
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
