// One Sender license on the admin user page: identity, seats, key, live devices, revoke.
import { KeyIcon, DevicesIcon } from '~/components/icons';
import ConfirmAction from './ConfirmAction';
import CopyKey from './CopyKey';
import styles from '~/styles/modules/admin/licenses/License.module.css';

const SEAT_CELLS_MAX = 10;

function formatWhen(input) {
  if (!input) return '-';
  return new Date(input).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function formatDay(input) {
  if (!input) return '-';
  return new Date(input).toISOString().slice(0, 10);
}

function errorFor(licenseError, intent, target) {
  if (!licenseError) return null;
  return licenseError.intent === intent && licenseError.target === target ? licenseError.message : null;
}

function Seats({ used, allowed }) {
  if (allowed > SEAT_CELLS_MAX) return null;
  return (
    <span className={styles.seats} aria-hidden="true">
      {Array.from({ length: allowed }, (_, i) => (
        <span key={i} className={i < used ? styles.seatUsed : styles.seat} />
      ))}
    </span>
  );
}

export default function LicenseCard({ license, fresh = false, busy = false, licenseError = null }) {
  const id = String(license.id).toUpperCase();
  const revoked = license.status === 'revoked';
  const used = license.live_devices;

  return (
    <article
      className={`${styles.card} ${revoked ? styles.cardRevoked : ''} ${fresh ? styles.cardFresh : ''}`}
      id={`license-${license.id}`}
    >
      <header className={styles.cardHead}>
        <span className={styles.tile} aria-hidden="true"><KeyIcon size={18} /></span>
        <div className={styles.ident}>
          <p className={styles.kicker}>Sender license</p>
          <p className={styles.licenseId} title={id}>
            <span className={styles.idLead}>{id.slice(0, 8)}</span>
            <span className={styles.idRest}>{id.slice(8)}</span>
          </p>
        </div>
        {revoked
          ? <span className={styles.statusRevoked}>Revoked</span>
          : <span className={styles.statusActive}>Active</span>}
      </header>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>Devices</dt>
          <dd className={styles.factValue}>
            <Seats used={used} allowed={license.max_devices} />
            <span>{used} of {license.max_devices}</span>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>Issued</dt>
          <dd className={styles.factValue}>{formatDay(license.issued_at)}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>Issued by</dt>
          <dd className={styles.factValue}>{license.issued_by_email || 'System'}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>Payment</dt>
          <dd className={styles.factValue}>{license.payment_reference || 'None recorded'}</dd>
        </div>
      </dl>

      {revoked ? (
        <p className={styles.revokedNote}>
          Revoked {formatWhen(license.revoked_at)}
          {license.revoked_reason ? `: ${license.revoked_reason}` : ''}
        </p>
      ) : (
        <CopyKey value={license.license_key} />
      )}

      {!revoked && (
        <section className={styles.devices} aria-label="Live devices">
          <h3 className={styles.devicesTitle}>
            <DevicesIcon size={14} />
            <span>Live devices</span>
          </h3>
          {license.devices.length === 0 ? (
            <p className={styles.devicesEmpty}>
              No device has activated this key yet.
            </p>
          ) : (
            <ul className={styles.deviceList}>
              {license.devices.map((d) => (
                <li key={d.id} className={styles.device}>
                  <div className={styles.deviceMain}>
                    <p className={styles.deviceName}>{d.device_label || 'Unnamed device'}</p>
                    <p className={styles.deviceMeta}>
                      {[d.platform, d.app_version && `v${d.app_version}`, `last seen ${formatWhen(d.last_seen_at)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <ConfirmAction
                    intent="license_release"
                    fields={{ licenseId: license.id, activationId: d.id }}
                    label="Release"
                    confirmLabel="Release device"
                    prompt="Frees this seat. The app on that machine must activate again."
                    busy={busy}
                    error={errorFor(licenseError, 'license_release', d.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!revoked && (
        <footer className={styles.cardFoot}>
          <ConfirmAction
            intent="license_revoke"
            fields={{ licenseId: license.id }}
            label="Revoke license"
            confirmLabel="Revoke for good"
            prompt="Every device on this key locks at its next check-in. This cannot be undone."
            danger
            busy={busy}
            error={errorFor(licenseError, 'license_revoke', license.id)}
          />
        </footer>
      )}
    </article>
  );
}
