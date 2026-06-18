/* ═══════════════════════════════════════════════════════════════════════════
   blacklistCheck.server.js

   DNSBL querying infrastructure.

   A DNSBL ("DNS-based Block List") is queried by taking the subject (either
   a reversed IP or a domain) and appending the blacklist's zone, then doing
   an A-record lookup. A resolved answer means the subject is listed; NXDOMAIN
   means it is clean.

   Example:
     To check whether 192.0.2.1 is listed on zen.spamhaus.org:
       query: 1.2.0.192.zen.spamhaus.org
       if resolves -> listed
       if NXDOMAIN -> clean

   This module curates a small set of reputable, publicly queryable
   blacklists. Some DNSBLs (Barracuda, Spamhaus via public resolvers at
   volume) require registration or DQS keys for production use; the list
   below is limited to zones that return reliable answers for low-volume
   queries without authentication.

   ───── Notes on coverage ─────
   - Spamhaus ZEN is a combined zone covering SBL (policy/spam sources),
     XBL (exploits), and PBL (policy/not-for-direct-sending). Coverage is
     wider than any single other list.
   - Public queries to Spamhaus free tier are rate-limited. High-volume
     callers should switch to the paid DQS service by changing the zone
     to the customer-specific DQS hostname.
   - Barracuda requires registration of the querying resolver's IP. If
     yours is not registered, you will get a "not allowed" response; we
     treat that as an error (not a clean result) so it surfaces honestly.

   Future work:
   - Add a cache (Redis or in-memory TTL) so repeated scans of the same
     domain within a few minutes do not re-query every zone.
   - Add WRBL (for spamtraps) and URIBL if volume permits.
   ═══════════════════════════════════════════════════════════════════════════ */

import { resolve4, reverseIpv4 } from './dnsLookup.server.js';

const PER_ZONE_TIMEOUT_MS = 3000;

/**
 * IP-based blacklists. Queried by reversing the IP and appending the zone.
 *
 * Each entry:
 *   id        stable identifier used in results
 *   name      display name
 *   zone      the DNSBL zone to append
 *   type      'combined' (SBL+XBL+PBL style) or 'specific'
 *   delistUrl link to the zone's removal/lookup tool
 *   notes     caveats about the zone
 */
export const IP_BLACKLISTS = [
  {
    id: 'spamhaus-zen',
    name: 'Spamhaus ZEN',
    zone: 'zen.spamhaus.org',
    type: 'combined',
    delistUrl: 'https://check.spamhaus.org/',
    notes: 'Combined SBL + XBL + PBL. Most widely used by mailbox providers.',
  },
  {
    id: 'spamcop',
    name: 'SpamCop',
    zone: 'bl.spamcop.net',
    type: 'specific',
    delistUrl: 'https://www.spamcop.net/bl.shtml',
    notes: 'Report-based; highly reactive to complaints.',
  },
  {
    id: 'sorbs',
    name: 'SORBS',
    zone: 'dnsbl.sorbs.net',
    type: 'combined',
    delistUrl: 'http://www.sorbs.net/lookup.shtml',
    notes: 'Aggregate of multiple SORBS sub-zones.',
  },
  {
    id: 'psbl',
    name: 'PSBL',
    zone: 'psbl.surriel.com',
    type: 'specific',
    delistUrl: 'https://psbl.org/remove',
    notes: 'Passive Spam Block List. Automated listing and delisting.',
  },
  {
    id: 'barracuda',
    name: 'Barracuda',
    zone: 'b.barracudacentral.org',
    type: 'specific',
    delistUrl: 'https://www.barracudacentral.org/rbl/removal-request',
    notes: 'Requires registering the querying resolver at barracudacentral.org.',
  },
];

/**
 * Domain-based blacklists. Queried with the bare domain (no reversal)
 * appended to the zone. Used for reputation scoring of the sender domain
 * rather than the sending IP.
 */
export const DOMAIN_BLACKLISTS = [
  {
    id: 'spamhaus-dbl',
    name: 'Spamhaus DBL',
    zone: 'dbl.spamhaus.org',
    type: 'domain',
    delistUrl: 'https://check.spamhaus.org/',
    notes: 'Domain block list for spammed URLs and malicious domains.',
  },
  {
    id: 'surbl',
    name: 'SURBL',
    zone: 'multi.surbl.org',
    type: 'domain',
    delistUrl: 'https://www.surbl.org/surbl-analysis',
    notes: 'Combined SURBL zones; covers phish, malware, and abuse.',
  },
];

/**
 * Query a single blacklist zone for a subject. Returns the result shape:
 *
 *   {
 *     zone:       configured entry,
 *     listed:     boolean | null  (null means query errored, not a clean)
 *     responses:  string[]        IPs returned when listed (encodes reason)
 *     error:      string | null   present when listed === null
 *   }
 *
 * "listed: null" vs "listed: false" matters. A queryError should not be
 * reported to the user as "clean", because we do not actually know.
 */
async function queryZone(query, zoneEntry) {
  const fqdn = `${query}.${zoneEntry.zone}`;
  const result = await resolve4(fqdn, PER_ZONE_TIMEOUT_MS);
  if (result.ok) {
    return {
      zone: zoneEntry,
      listed: true,
      responses: result.value,
      error: null,
    };
  }
  // NXDOMAIN / ENOTFOUND / ENODATA means the subject is not listed on
  // this zone. That is the clean case.
  if (result.isNoRecord) {
    return { zone: zoneEntry, listed: false, responses: [], error: null };
  }
  // Any other failure (timeout, SERVFAIL, refused) is a genuine error.
  return { zone: zoneEntry, listed: null, responses: [], error: result.error };
}

/**
 * Check an IP address against every configured IP blacklist, in parallel.
 *
 * Returns:
 *   {
 *     ip,
 *     totalChecked, totalListed, totalErrors, totalClean,
 *     results: [QueryResult, ...],
 *     listedOn: QueryResult[]   (shortcut to just the hits)
 *   }
 */
export async function checkIpBlacklists(ip, zones = IP_BLACKLISTS) {
  const reversed = reverseIpv4(ip);
  if (!reversed) {
    return {
      ip,
      totalChecked: 0,
      totalListed: 0,
      totalErrors: 0,
      totalClean: 0,
      results: [],
      listedOn: [],
      invalidIp: true,
    };
  }

  const results = await Promise.all(zones.map((z) => queryZone(reversed, z)));
  return summarise(ip, results);
}

/**
 * Check a domain name against every configured domain blacklist, in parallel.
 */
export async function checkDomainBlacklists(domain, zones = DOMAIN_BLACKLISTS) {
  const results = await Promise.all(zones.map((z) => queryZone(domain, z)));
  return summarise(domain, results);
}

function summarise(subject, results) {
  const listedOn = results.filter((r) => r.listed === true);
  const errors = results.filter((r) => r.listed === null);
  const clean = results.filter((r) => r.listed === false);
  return {
    subject,
    totalChecked: results.length,
    totalListed: listedOn.length,
    totalErrors: errors.length,
    totalClean: clean.length,
    results,
    listedOn,
  };
}
