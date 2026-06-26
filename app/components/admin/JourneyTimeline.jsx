// Per-user event timeline. Each event gets a tone-coloured icon and a metadata row.
import ActivityIcon from '~/components/admin/ActivityIcon';
import styles from '~/styles/modules/admin/JourneyTimeline.module.css';

const EVENT_TONE = {
  pageview:              'signup',
  tool_start:            'admin_action',
  tool_success:          'signup',
  tool_error:            'error',
  auth_submit:           'admin_action',
  auth_otp_sent:         'admin_action',
  auth_otp_verified:     'signup',
  auth_signup_complete:  'signup',
  auth_welcome_credited: 'payment',
  package_select:        'payment',
  checkout_click:        'payment',
  gateway_redirect:      'payment',
  payment_pending:       'payment',
  payment_confirmed:     'payment',
  payment_failed:        'error',
  payment_abandoned:     'error',
};

function tone(eventType) {
  return EVENT_TONE[eventType] || 'admin_action';
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
}

export default function JourneyTimeline({ events }) {
  if (!events || events.length === 0) return null;

  return (
    <ol className={styles.timeline}>
      {events.map((e, i) => (
        <li key={i} className={styles.item}>
          <ActivityIcon kind={tone(e.event_type)} size={28} />
          <span className={styles.date}>{fmtDate(e.created_at)}</span>
          <span className={styles.event}>{e.event_type}</span>
          <span className={styles.path}>
            {e.path || '-'}
            {e.country && e.country !== 'XX' ? <span className={styles.country}>· {e.country}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
