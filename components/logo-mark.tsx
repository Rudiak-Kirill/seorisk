import { cn } from '@/lib/utils';

type LogoMarkProps = {
  className?: string;
};

export default function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('inline-block', className)}
    >
      <path
        d="M16 4.5C9.65 4.5 4.5 9.65 4.5 16S9.65 27.5 16 27.5c4.77 0 8.86-2.9 10.61-7.04"
        stroke="#f97316"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M17.2 11.9l2.65 2.65 5.15-5.15"
        stroke="#f97316"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
