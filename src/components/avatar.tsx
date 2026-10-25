import { initials } from "@/lib/labels";
import { cx } from "./ui";

export function Avatar({
  person,
  url,
  size = 40,
  className,
}: {
  person: { first_name: string; last_name: string };
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className={cx("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif font-semibold text-accent",
        className,
      )}
    >
      {initials(person)}
    </span>
  );
}
