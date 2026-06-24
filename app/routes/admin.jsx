// Admin layout - gates /admin/* via requireAdmin, renders shell chrome around Outlet.
import { useState, useEffect } from 'react';
import { Outlet, useLoaderData, useLocation } from 'react-router';
import { requireAdmin, adminSystemStatus } from '~/utils/admin.server';
import StatusRail from '~/components/admin/StatusRail';
import Sidebar from '~/components/admin/shell/Sidebar';
import Topbar from '~/components/admin/shell/Topbar';
import layout from '~/styles/modules/admin/shell/Layout.module.css';

export const meta = () => [
  { title: 'Admin | Trovarcis Reach' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  const user = await requireAdmin(request);
  const systemStatus = await adminSystemStatus();
  return { user, systemStatus };
}

export default function AdminLayout() {
  const { user, systemStatus } = useLoaderData();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile panel on route change.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Body scroll lock while mobile panel open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <div className={layout.shell}>
      <Topbar open={mobileOpen} onToggle={() => setMobileOpen((v) => !v)} />
      <Sidebar user={user} open={mobileOpen} />

      {mobileOpen ? (
        <button
          type="button"
          className={layout.backdrop}
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
      ) : null}

      <main className={layout.main}>
        <StatusRail status={systemStatus} />
        <Outlet />
      </main>
    </div>
  );
}
