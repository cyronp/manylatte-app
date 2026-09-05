import type { CSSProperties } from 'react';

export type UserIconProps = {
  size?: number | string;
  backgroundColor?: string;
  iconColor?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

const glyphPath = `M 14.2568 0.0664 C 14.4902 -0.01 14.7407 -0.0209 14.9795 0.0361 C 15.2184 0.0932 15.4367 0.2159 15.6104 0.3896 C 15.784 0.5633 15.9068 0.7816 15.9639 1.0205 C 16.0209 1.2593 16.01 1.5098 15.9336 1.7431 L 11.5781 15.083 C 11.4961 15.3403 11.3367 15.5665 11.1221 15.7304 C 10.9073 15.8944 10.6469 15.9886 10.377 15.9999 L 10.3125 15.9999 C 10.0535 16.0008 9.7995 15.9253 9.583 15.7831 C 9.3667 15.6411 9.1969 15.4388 9.0947 15.2011 L 9.084 15.1728 L 7.6094 11.333 L 3.333 15.6093 C 3.2092 15.733 3.0621 15.8314 2.9004 15.8984 C 2.7388 15.9653 2.5655 15.9999 2.3906 15.9999 C 2.2155 15.9999 2.0417 15.9654 1.8799 15.8984 C 1.7181 15.8314 1.5711 15.7331 1.4473 15.6093 L 0.3906 14.5527 C 0.2668 14.4289 0.1686 14.2817 0.1016 14.1201 C 0.0345 13.9583 0 13.7844 0 13.6093 C 0 13.4344 0.0347 13.2612 0.1016 13.0996 C 0.1685 12.9379 0.2669 12.7907 0.3906 12.6669 L 4.667 8.3906 L 0.8262 6.916 L 0.7988 6.9052 C 0.5531 6.7962 0.3463 6.6154 0.2051 6.3867 C 0.0639 6.1579 -0.0049 5.8915 0.0078 5.623 C 0.0206 5.3546 0.1143 5.0961 0.2764 4.8818 C 0.4386 4.6675 0.6621 4.5071 0.917 4.4218 L 14.2568 0.0664 Z M 9 3.9999 C 8.4477 3.9999 8 4.4477 8 4.9999 L 8 6.9999 C 8 7.5522 8.4477 7.9999 9 7.9999 C 9.5523 7.9999 10 7.5522 10 6.9999 L 10 4.9999 C 10 4.4477 9.5523 3.9999 9 3.9999 Z M 12 3.9999 C 11.4477 3.9999 11 4.4477 11 4.9999 L 11 6.9999 C 11 7.5522 11.4477 7.9999 12 7.9999 C 12.5523 7.9999 13 7.5522 13 6.9999 L 13 4.9999 C 13 4.4477 12.5523 3.9999 12 3.9999 Z`;

export function LatteUserIcon({
  size = 24,
  backgroundColor = '#193CB8',
  iconColor = '#FFFFFF',
  className,
  style,
  title,
}: UserIconProps) {
  const cssSize = typeof size === 'number' ? `${size}px` : size;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        width: cssSize,
        height: cssSize,
        minWidth: cssSize,
        minHeight: cssSize,

        display: 'block',
        flexShrink: 0,
        ...style,
      }}
      preserveAspectRatio="xMidYMid meet"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}

      <circle cx="12" cy="12" r="12" fill={backgroundColor} />

      <path
        d={glyphPath}
        transform="translate(3 6) scale(0.92)"
        fill={iconColor}
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
