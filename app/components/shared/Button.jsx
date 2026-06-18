import styles from '~/styles/modules/shared/Button.module.css';

export default function Button({
  children,
  variant = "primary",
  href,
  type = "button",
  disabled = false,
  className = "",
  ...props
}) {
  const classes = `${styles.btn} ${styles[variant]} ${className}`.trim();

  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled} {...props}>
      {children}
    </button>
  );
}
