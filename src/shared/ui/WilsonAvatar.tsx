import { MessageSquare } from "lucide-react";

export default function WilsonAvatar({
  className = "",
  fallbackSize = 20
}: {
  className?: string;
  imageClassName?: string;
  fallbackSize?: number;
  imageStyle?: React.CSSProperties;
}) {
  return (
    <div
      className={`flex items-center justify-center bg-violet-50 text-violet-700 ${className}`}
      style={{
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)"
      }}
    >
      <MessageSquare size={fallbackSize} />
    </div>
  );
}
